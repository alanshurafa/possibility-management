#!/usr/bin/env python3
"""
extract_registry.py - Parse the SpacePort catalog into a site registry.

Purpose:
    SpacePort (spaceport.mystrikingly.com) is the master A-Z catalog of the
    StartOver.xyz / Possibility Management network. Its crawled markdown carries
    one parseable block per site: a bubble image, title, canonical URL, tagline,
    and a curated "Also see" list. This script turns that one page into a clean
    registry of site records.

Input  (read-only):  source.json  (Apify crawl, 2025-08-10) - never written back.
Output (build):      data/registry.full.json  - every parsed site
                     data/registry.json       - SAMPLE subset (~30, most connected)
                     data/parse-failures.log  - every catalog block that failed

Sampling: for a fast eyeball pass we ship a dense, connected subgraph rather than
the first N alphabetical sites (which would render as a near-empty map). We build
an undirected graph from the curated "Also see" links and greedily grow the
densest connected cluster from the highest-degree hub.

Usage:
    py -3.13 extract_registry.py            # default sample = 30
    py -3.13 extract_registry.py --sample 50
    py -3.13 extract_registry.py --sample 0 # full registry only, no sample file

Local-first: pure regex over local JSON. No network, no LLM, no paid APIs.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

import networkx as nx

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"

# Read-only source on Google Drive; override with PM_SOURCE_JSON for portability.
DEFAULT_SRC = (
    r"C:\Users\alan\My Drive\__shurafa@gmail.com"
    r"\_PM Possability Manangement\PMWebsites\source.json"
)
SRC = Path(os.environ.get("PM_SOURCE_JSON", DEFAULT_SRC))

SPACEPORT_HOST = "spaceport.mystrikingly.com"

# An entry anchor: a markdown link whose text is a single CDN image, whose href is
# the site's mystrikingly URL.  [ ![alt](//cdn...jpeg "title") ]( http://slug... )
ENTRY_RE = re.compile(
    r"\[\s*!\[[^\]]*\]\(\s*(?P<img>//custom-images\.strikinglycdn\.com/[^\s)\"]+)"
    r'(?:\s+"[^"]*")?\s*\)\s*\]\(\s*'
    r"(?P<url>https?://(?P<slug>[a-z0-9][a-z0-9-]*)\.mystrikingly\.com)/?\s*\)",
    re.IGNORECASE | re.DOTALL,
)

# First bold run after an h3/h6 heading = the display title.
TITLE_RE = re.compile(r"#{3,6}[^\n]*\n\s*\*\*(?P<title>[^*\n][^*]*?)\*\*", re.DOTALL)

# "Also see:" / "See also:" marker that introduces the curated list.
ALSO_RE = re.compile(r"(?:Also see|See also)\s*:?", re.IGNORECASE)

SLUG_RE = re.compile(r"([a-z0-9][a-z0-9-]*)\.mystrikingly\.com", re.IGNORECASE)


def clean_text(s: str) -> str:
    """Strip mojibake, markdown emphasis, links, and collapse whitespace."""
    s = s.replace("�", " ")  # the `?` replacement-char mojibake
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", s)            # images
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)          # links -> text
    s = s.replace("**", "").replace("*", "")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{2,}", "\n", s)
    return s.strip()


def load_spaceport_markdown() -> str:
    if not SRC.exists():
        sys.exit(f"FATAL: source.json not found at {SRC}\n"
                 f"Set PM_SOURCE_JSON to override.")
    with open(SRC, encoding="utf-8") as f:
        data = json.load(f)
    for rec in data:
        if SPACEPORT_HOST in (rec.get("url") or ""):
            return rec.get("markdown") or ""
    sys.exit("FATAL: SpacePort record not found in source.json")


def parse_entries(md: str, failures: list[str]) -> dict[str, dict]:
    """Return {slug: record}.  Each entry body runs to the next entry anchor."""
    anchors = list(ENTRY_RE.finditer(md))
    if not anchors:
        sys.exit("FATAL: no catalog entry anchors matched - parser is broken.")

    entries: dict[str, dict] = {}
    for i, m in enumerate(anchors):
        slug = m.group("slug").lower()
        url = m.group("url")
        img = "https:" + m.group("img") if m.group("img").startswith("//") else m.group("img")
        body_start = m.end()
        body_end = anchors[i + 1].start() if i + 1 < len(anchors) else len(md)
        body = md[body_start:body_end]

        tm = TITLE_RE.search(body)
        title = clean_text(tm.group("title")) if tm else ""

        # Tagline = text after the canonical line, before "Also see".
        also_m = ALSO_RE.search(body)
        pre = body[: also_m.start()] if also_m else body
        # Drop everything up to and including the canonical "**[slug...](url)**" line.
        canon = re.search(r"\*\*\[?[a-z0-9-]+\.mystrikingly\.com[^\n]*\n", pre, re.IGNORECASE)
        tail = pre[canon.end():] if canon else pre
        tagline = clean_text(tail)
        # A title-only echo sometimes leaks into tagline; drop a leading title repeat.
        if title and tagline.startswith(title):
            tagline = tagline[len(title):].strip()

        also_see: list[str] = []
        if also_m:
            for s in SLUG_RE.findall(body[also_m.end():]):
                s = s.lower()
                if s != slug and s not in also_see:
                    also_see.append(s)

        if not title:
            failures.append(f"slug={slug} url={url} :: no title parsed")

        # Last writer wins; SpacePort lists each site once but nav can duplicate.
        entries[slug] = {
            "slug": slug,
            "title": title or slug,
            "tagline": tagline,
            "url": url + "/" if not url.endswith("/") else url,
            "live_url": url + "/" if not url.endswith("/") else url,
            "archive_url": f"https://web.archive.org/web/2025/{url}",
            "image_url": img,
            "also_see": also_see,
        }
    return entries


def pick_sample(entries: dict[str, dict], n: int) -> list[str]:
    """Greedy densest-connected cluster of size n over the curated 'Also see' graph."""
    slugset = set(entries)
    G = nx.Graph()
    G.add_nodes_from(slugset)
    for slug, rec in entries.items():
        for tgt in rec["also_see"]:
            if tgt in slugset and tgt != slug:
                G.add_edge(slug, tgt)

    if G.number_of_edges() == 0:  # fallback: first n by catalog order
        return list(entries)[:n]

    start = max(G.nodes, key=lambda x: (G.degree(x), x))
    sel = {start}
    while len(sel) < n:
        cand: dict[str, int] = {}
        for node in sel:
            for nb in G.neighbors(node):
                if nb not in sel:
                    cand[nb] = cand.get(nb, 0) + 1  # edges into current cluster
        if cand:
            nxt = max(cand, key=lambda x: (cand[x], G.degree(x), x))
        else:  # cluster's component exhausted - jump to next densest node
            rest = [x for x in G.nodes if x not in sel]
            if not rest:
                break
            nxt = max(rest, key=lambda x: (G.degree(x), x))
        sel.add(nxt)
    # Deterministic order: by descending in-cluster degree then slug.
    sub = G.subgraph(sel)
    return sorted(sel, key=lambda x: (-sub.degree(x), x))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sample", type=int, default=30,
                    help="sample size; 0 = full registry only (no sample file)")
    ap.add_argument("--all", action="store_true",
                    help="write the full registry to registry.json (full build)")
    args = ap.parse_args()

    DATA.mkdir(parents=True, exist_ok=True)
    md = load_spaceport_markdown()

    failures: list[str] = []
    entries = parse_entries(md, failures)

    total = len(entries)
    clean = sum(1 for e in entries.values() if e["tagline"] or e["also_see"])
    titled = sum(1 for e in entries.values() if e["title"] and e["title"] != e["slug"])
    parse_rate = 100 * titled / total if total else 0

    full = sorted(entries.values(), key=lambda e: e["slug"])
    (DATA / "registry.full.json").write_text(
        json.dumps(full, indent=2, ensure_ascii=False), encoding="utf-8")
    (DATA / "parse-failures.log").write_text(
        "\n".join(failures) or "(none)", encoding="utf-8")

    sample_note = "full only"
    if args.all:
        (DATA / "registry.json").write_text(
            json.dumps(full, indent=2, ensure_ascii=False), encoding="utf-8")
        sample_note = f"ALL {total} sites -> registry.json"
    elif args.sample and args.sample > 0:
        sample_slugs = pick_sample(entries, args.sample)
        sample = [entries[s] for s in sample_slugs]
        (DATA / "registry.json").write_text(
            json.dumps(sample, indent=2, ensure_ascii=False), encoding="utf-8")
        sample_note = f"{len(sample)} sites -> registry.json"

    print("=" * 60)
    print("extract_registry.py")
    print(f"  catalog entries parsed : {total}")
    print(f"  with title             : {titled}  ({parse_rate:.1f}% parse rate)")
    print(f"  with tagline or also-see: {clean}")
    print(f"  parse failures         : {len(failures)}  -> data/parse-failures.log")
    print(f"  sample                 : {sample_note}")
    print(f"  wrote data/registry.full.json ({total} sites)")
    print("=" * 60)


if __name__ == "__main__":
    main()
