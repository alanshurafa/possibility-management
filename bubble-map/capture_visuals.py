#!/usr/bin/env python3
"""
capture_visuals.py - Full-page screenshot of each site for the archive pages.

Each bubble's archive page gets a screenshot of how the original site actually
looked (hero, colors, background images, layout) - the content archive alone
can't reproduce Strikingly's visual design.

Source, per site:
  1. LIVE mystrikingly, rendered headless and auto-scrolled so Strikingly's
     scroll-triggered content/images actually paint. Live = the current design.
  2. If the live site throws the "Human Verification" CAPTCHA (it does under
     load), back off and fall back to the closest Wayback snapshot.

Accessed gently (sequential + pacing) to avoid tripping the bot wall. Output is a
downscaled JPEG (WebP can't hold these tall pages). RESUMABLE: skips slugs that
already have a screenshot, so re-run to finish after rate-limit cooldowns.

Output:  archive/assets/shots/{slug}.jpg
         data/shots-log.txt   (per-site source + size, or failure reason)

Usage:
    py -3.13 capture_visuals.py --limit 4          # smoke test
    py -3.13 capture_visuals.py                    # all remaining site roots
    py -3.13 capture_visuals.py --slugs learntodie 3zones
"""
from __future__ import annotations

import argparse
import io
import json
import re
import time
from pathlib import Path

import httpx
from PIL import Image
from playwright.sync_api import sync_playwright

Image.MAX_IMAGE_PIXELS = None
HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
SHOTS = HERE / "archive" / "assets" / "shots"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
CHALLENGE = re.compile(r"confirm you are human|Human Verification|security check", re.I)
WIDTH = 760
QUALITY = 72
CRAWL_ERA = "20250810"
PACE_S = 2.5          # politeness pause between sites
CAPTCHA_BACKOFF = 25  # seconds to wait after a CAPTCHA before falling back


def site_slugs() -> list[str]:
    return [r["slug"] for r in json.loads((DATA / "registry.json").read_text(encoding="utf-8"))]


def wayback_ts(client: httpx.Client, slug: str) -> str | None:
    try:
        a = client.get("http://archive.org/wayback/available",
                       params={"url": f"{slug}.mystrikingly.com", "timestamp": CRAWL_ERA},
                       timeout=30.0).json()
        snap = (a.get("archived_snapshots") or {}).get("closest")
        if snap and snap.get("available") and str(snap.get("status")) == "200":
            return snap["timestamp"]
    except Exception:
        pass
    return None


def autoscroll(pg) -> None:
    try:
        pg.evaluate("""async () => {
          await new Promise(r => { let y = 0;
            const t = setInterval(() => { window.scrollTo(0, y); y += 700;
              if (y >= document.body.scrollHeight) { clearInterval(t); r(); } }, 220); });
        }""")
        pg.wait_for_timeout(1000)
        pg.evaluate("window.scrollTo(0, 0)")
        pg.wait_for_timeout(600)
    except Exception:
        pass


def capture(pg, url: str):
    """Return (png_bytes, status). status in ok|captcha|empty."""
    pg.goto(url, wait_until="load", timeout=60000)
    pg.wait_for_timeout(2500)
    txt = pg.inner_text("body")[:400]
    if CHALLENGE.search(txt):
        return None, "captcha"
    if len(txt.strip()) < 50:
        return None, "empty"
    autoscroll(pg)
    return pg.screenshot(full_page=True), "ok"


def save_jpg(png: bytes, path: Path) -> int:
    im = Image.open(io.BytesIO(png)).convert("RGB")
    im.thumbnail((WIDTH, 99999), Image.LANCZOS)
    if im.height > 65000:                      # JPEG dimension ceiling
        im = im.crop((0, 0, im.width, 65000))
    im.save(path, "JPEG", quality=QUALITY, optimize=True)
    return path.stat().st_size


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--slugs", nargs="*")
    args = ap.parse_args()

    SHOTS.mkdir(parents=True, exist_ok=True)
    todo = args.slugs or [s for s in site_slugs() if not (SHOTS / f"{s}.jpg").exists()]
    if args.limit:
        todo = todo[:args.limit]
    existing = len(list(SHOTS.glob("*.jpg")))
    print(f"already captured: {existing} | to attempt this run: {len(todo)}")

    log: list[str] = []
    client = httpx.Client(follow_redirects=True, headers={"User-Agent": UA})
    captured = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for i, slug in enumerate(todo):
            out = SHOTS / f"{slug}.jpg"
            src = status = None
            pg = browser.new_page(viewport={"width": 1200, "height": 900}, user_agent=UA)
            try:
                png, status = capture(pg, f"https://{slug}.mystrikingly.com/")
                if status == "ok":
                    src = "live"
                elif status == "captcha":
                    time.sleep(CAPTCHA_BACKOFF)        # let the bot wall cool off
                    ts = wayback_ts(client, slug)
                    if ts:
                        png, status = capture(
                            pg, f"http://web.archive.org/web/{ts}if_/https://{slug}.mystrikingly.com/")
                        if status == "ok":
                            src = "wayback"
                if src:
                    kb = save_jpg(png, out) // 1024
                    log.append(f"{slug}\t{src}\t{kb}KB")
                    captured += 1
                else:
                    log.append(f"{slug}\tFAIL\t{status}")
            except Exception as e:  # noqa: BLE001
                log.append(f"{slug}\tERR\t{type(e).__name__}: {str(e)[:50]}")
            finally:
                pg.close()
            time.sleep(PACE_S)
            if (i + 1) % 20 == 0:
                (DATA / "shots-log.txt").write_text("\n".join(sorted(log)), encoding="utf-8")
                print(f"  ...{i + 1}/{len(todo)} done, {captured} captured")
        browser.close()
    client.close()

    # Merge with any prior log lines for a complete picture.
    prior = {}
    p_log = DATA / "shots-log.txt"
    if p_log.exists():
        for line in p_log.read_text(encoding="utf-8").splitlines():
            if "\t" in line:
                prior[line.split("\t")[0]] = line
    for line in log:
        prior[line.split("\t")[0]] = line
    p_log.write_text("\n".join(sorted(prior.values())), encoding="utf-8")

    total = len(list(SHOTS.glob("*.jpg")))
    print("=" * 60)
    print(f"capture_visuals.py: captured {captured} this run")
    print(f"  total screenshots on disk: {total} / {len(site_slugs())} sites")
    print("=" * 60)


if __name__ == "__main__":
    main()
