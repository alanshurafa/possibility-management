#!/usr/bin/env python3
"""
fetch_missing.py - Recover the ~100 catalog sites the 2025 Apify crawl missed.

These sites are bubbles on the map (listed in SpacePort's catalog) but were never
captured, so they had no archive page and fell back to the live URL. Live
mystrikingly now CAPTCHA-blocks bots, so the reliable source is the Wayback
Machine: the closest snapshot to the 2025 crawl, fetched in raw `id_` mode (keeps
original links + images). Live is tried only when there's no snapshot.

Wayback rate-limits aggressively, so this runs Wayback-first at low concurrency
with backoff retries, and is RESUMABLE: successful records are kept and re-runs
only fetch what's still missing. Run it in the background and re-run to fill gaps.

For each missing slug: closest Wayback snapshot -> trafilatura markdown -> a record
in source.json's shape appended to data/supplemental_records.json, which
build_archive.py merges so these sites become first-class archive pages.

Usage:
    py -3.13 fetch_missing.py            # process all not-yet-recovered slugs
    py -3.13 fetch_missing.py --limit 8

Local-first: user-authorized re-fetch of these specific sites. No paid APIs, no LLM.
"""
from __future__ import annotations

import argparse
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import httpx
import trafilatura

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
RECORDS = DATA / "supplemental_records.json"
NOSNAP = DATA / "_no_snapshot.json"        # slugs confirmed to have no Wayback snapshot
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
CRAWL_ERA = "20250810"
CHALLENGE = re.compile(r"confirm you are human|Human Verification|security check", re.I)
MIN_MD = 350
RETRY_DELAYS = [0, 6, 18, 40]              # backoff for Wayback throttling


def load_json(p: Path, default):
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def missing_slugs() -> list[str]:
    reg = json.loads((DATA / "registry.json").read_text(encoding="utf-8"))
    man = set(json.loads((DATA / "archive-manifest.json").read_text(encoding="utf-8")))
    return [r["slug"] for r in reg if r["slug"] not in man]


def reg_titles() -> dict[str, str]:
    return {e["slug"]: e["title"]
            for e in json.loads((DATA / "registry.full.json").read_text(encoding="utf-8"))}


def to_md(html: str) -> str:
    return trafilatura.extract(html, output_format="markdown", include_links=True,
                               include_images=True, favor_recall=True) or ""


def to_txt(html: str) -> str:
    return trafilatura.extract(html, output_format="txt", favor_recall=True) or ""


def title_of(html: str, slug: str, titles: dict[str, str]) -> str:
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    t = re.sub(r"\s+on Strikingly\s*$", "", (m.group(1).strip() if m else "")).strip()
    return t or titles.get(slug, slug)


def get_retry(client: httpx.Client, url: str, **kw):
    """GET with backoff on throttle/transient errors. None = give up (retry next run)."""
    for delay in RETRY_DELAYS:
        if delay:
            time.sleep(delay)
        try:
            r = client.get(url, headers={"User-Agent": UA}, **kw)
            if r.status_code in (429, 502, 503, 504):
                continue
            return r
        except Exception:
            continue
    return None


def fetch_wayback(client: httpx.Client, slug: str):
    """Return ('ok', html, md, ts) | ('nosnapshot', ...) | ('failed', ...)."""
    target = f"{slug}.mystrikingly.com"
    a = get_retry(client, "http://archive.org/wayback/available",
                  params={"url": target, "timestamp": CRAWL_ERA}, timeout=30.0)
    if a is None:
        return ("failed",)
    try:
        snap = (a.json().get("archived_snapshots") or {}).get("closest")
    except Exception:
        return ("failed",)
    if not snap or not snap.get("available"):
        return ("nosnapshot",)
    if str(snap.get("status")) not in ("200",):
        return ("nosnapshot",)
    ts = snap["timestamp"]
    raw = get_retry(client, f"http://web.archive.org/web/{ts}id_/https://{target}/",
                    timeout=60.0, follow_redirects=True)
    if raw is None or raw.status_code != 200:
        return ("failed",)
    md = to_md(raw.text)
    if len(md) < MIN_MD:
        return ("failed",)
    return ("ok", raw.text, md, ts)


def fetch_live(client: httpx.Client, slug: str):
    try:
        r = client.get(f"https://{slug}.mystrikingly.com/", timeout=20.0,
                       headers={"User-Agent": UA})
    except Exception:
        return None
    if r.status_code != 200 or CHALLENGE.search(r.text[:4000]):
        return None
    md = to_md(r.text)
    return (r.text, md) if len(md) >= MIN_MD and not CHALLENGE.search(md) else None


def process(slug: str, titles: dict[str, str]) -> dict:
    with httpx.Client(follow_redirects=True) as client:
        wb = fetch_wayback(client, slug)
        if wb[0] == "ok":
            _, html, md, ts = wb
            return {"slug": slug, "status": "wayback",
                    "date": f"{ts[0:4]}-{ts[4:6]}-{ts[6:8]}",
                    "title": title_of(html, slug, titles), "md": md, "txt": to_txt(html)}
        if wb[0] == "nosnapshot":
            live = fetch_live(client, slug)         # last resort
            if live:
                html, md = live
                return {"slug": slug, "status": "live",
                        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                        "title": title_of(html, slug, titles), "md": md, "txt": to_txt(html)}
            return {"slug": slug, "status": "nosnapshot", "title": "", "md": "", "txt": "", "date": ""}
        return {"slug": slug, "status": "failed", "title": "", "md": "", "txt": "", "date": ""}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=2)
    args = ap.parse_args()

    titles = reg_titles()
    records = {r["url"]: r for r in load_json(RECORDS, [])}   # resume: keep successes
    done = {re.search(r"//([a-z0-9-]+)\.", u).group(1) for u in records}
    nosnap = set(load_json(NOSNAP, []))

    todo = [s for s in missing_slugs() if s not in done]
    if args.limit:
        todo = todo[:args.limit]
    print(f"already recovered: {len(done)} | to attempt: {len(todo)} "
          f"(known no-snapshot, still retried: {len(nosnap & set(todo))})")

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(lambda s: process(s, titles), todo))

    new_ok = 0
    for r in results:
        if r["status"] in ("wayback", "live"):
            records[f"https://{r['slug']}.mystrikingly.com/"] = {
                "url": f"https://{r['slug']}.mystrikingly.com/",
                "markdown": r["md"], "text": r["txt"],
                "crawl": {"httpStatusCode": 200, "loadedTime": r["date"] + "T00:00:00Z"},
                "metadata": {"title": r["title"]}, "_source": r["status"],
            }
            new_ok += 1
        elif r["status"] == "nosnapshot":
            nosnap.add(r["slug"])

    out = sorted(records.values(), key=lambda r: r["url"])
    RECORDS.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    NOSNAP.write_text(json.dumps(sorted(nosnap)), encoding="utf-8")

    from collections import Counter
    by = Counter(r["status"] for r in results)
    remaining = len([s for s in missing_slugs()
                     if f"https://{s}.mystrikingly.com/" not in records])
    print("=" * 60)
    print("fetch_missing.py")
    print(f"  attempted this run : {len(todo)}")
    print(f"  newly recovered    : {new_ok}  (wayback={by.get('wayback',0)} live={by.get('live',0)})")
    print(f"  transient failures : {by.get('failed',0)}  (rate-limited; re-run to retry)")
    print(f"  confirmed no copy  : {by.get('nosnapshot',0)}")
    print(f"  TOTAL recovered    : {len(records)} / {len(missing_slugs())} missing")
    print(f"  still to recover   : {remaining}")
    print("=" * 60)


if __name__ == "__main__":
    main()
