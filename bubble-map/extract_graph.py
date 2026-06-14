#!/usr/bin/env python3
"""
extract_graph.py - Build the site-to-site link graph from the full crawl.

Purpose:
    Every crawled page (1,232 HTTP-200 records) links to other sites in the
    network. This script scans all of them for *.mystrikingly.com hrefs and
    emits the directed edge list that drives the constellation map.

    Edge weight `count` = total link mentions src -> tgt across that source page.
    Edge `type`:
      - "curated"  : the pair appears in SpacePort's hand-written "Also see" list
                     (registry.full.json) - the human-drawn web.
      - "organic"  : it only shows up as a body link in the crawl.

Input  (read-only):  source.json
                     data/registry.full.json  (curated also-see relations)
                     data/registry.json       (the sample slugs to filter to)
Output (build):      data/edges.full.json  - every directed edge in the network
                     data/edges.json       - edges among the sample sites only
                     data/layout.json      - {slug: [x, y]} precomputed positions

Usage:
    py -3.13 extract_graph.py
    (run extract_registry.py first - this depends on its registry files)

Local-first: pure regex + networkx layout over local JSON. No network, no LLM.
"""
from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

import networkx as nx

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"

DEFAULT_SRC = (
    r"C:\Users\alan\My Drive\__shurafa@gmail.com"
    r"\_PM Possability Manangement\PMWebsites\source.json"
)
SRC = Path(os.environ.get("PM_SOURCE_JSON", DEFAULT_SRC))

SLUG_RE = re.compile(r"\b([a-z0-9][a-z0-9-]*)\.mystrikingly\.com", re.IGNORECASE)


def slug_of(url: str) -> str | None:
    m = SLUG_RE.search(url or "")
    return m.group(1).lower() if m else None


def main() -> None:
    if not SRC.exists():
        sys.exit(f"FATAL: source.json not found at {SRC}")
    reg_full_path = DATA / "registry.full.json"
    if not reg_full_path.exists():
        sys.exit("FATAL: data/registry.full.json missing - run extract_registry.py first")

    with open(SRC, encoding="utf-8") as f:
        records = json.load(f)
    registry_full = {r["slug"]: r for r in json.loads(reg_full_path.read_text(encoding="utf-8"))}

    # Curated relations come straight from SpacePort's "Also see" lists.
    curated_pairs: set[tuple[str, str]] = {
        (slug, tgt) for slug, rec in registry_full.items() for tgt in rec["also_see"]
    }

    # --- Scan every usable page for organic cross-site links ---
    organic: dict[tuple[str, str], int] = defaultdict(int)
    pages_scanned = 0
    mentions = 0
    for rec in records:
        if (rec.get("crawl") or {}).get("httpStatusCode") != 200:
            continue
        md = rec.get("markdown") or ""
        if not md:
            continue
        src = slug_of(rec.get("url") or "")
        if not src:
            continue
        pages_scanned += 1
        for m in SLUG_RE.finditer(md):
            tgt = m.group(1).lower()
            if tgt == src:
                continue
            organic[(src, tgt)] += 1
            mentions += 1

    # --- Merge organic + curated into the full edge list ---
    all_pairs = set(organic) | curated_pairs
    full_edges = []
    for (src, tgt) in sorted(all_pairs):
        full_edges.append({
            "src": src,
            "tgt": tgt,
            "count": organic.get((src, tgt), 0),
            "type": "curated" if (src, tgt) in curated_pairs else "organic",
        })

    nodes_in_graph = {p[0] for p in all_pairs} | {p[1] for p in all_pairs}
    ghosts = sorted(n for n in nodes_in_graph if n not in registry_full)
    curated_count = sum(1 for e in full_edges if e["type"] == "curated")

    (DATA / "edges.full.json").write_text(
        json.dumps(full_edges, ensure_ascii=False), encoding="utf-8")

    # --- Sample subset: edges among the ~30 sampled sites ---
    sample_path = DATA / "registry.json"
    sample_edges: list[dict] = []
    layout: dict[str, list[float]] = {}
    sample_note = "(no registry.json - skipped)"
    if sample_path.exists():
        sample = [r["slug"] for r in json.loads(sample_path.read_text(encoding="utf-8"))]
        S = set(sample)
        sample_edges = [e for e in full_edges if e["src"] in S and e["tgt"] in S]
        (DATA / "edges.json").write_text(
            json.dumps(sample_edges, ensure_ascii=False, indent=2), encoding="utf-8")

        # Precompute a stable layout so the page loads instantly (Phase 3 wants this).
        G = nx.DiGraph()
        G.add_nodes_from(sample)
        for e in sample_edges:
            G.add_edge(e["src"], e["tgt"], weight=1 + e["count"])
        pos = nx.spring_layout(G.to_undirected(), seed=42, k=1.2, iterations=200)
        # Scale to a 1000x1000 board (sigma camera auto-fits regardless).
        for slug, (x, y) in pos.items():
            layout[slug] = [round(500 + 460 * x, 2), round(500 + 460 * y, 2)]
        (DATA / "layout.json").write_text(
            json.dumps(layout, ensure_ascii=False, indent=2), encoding="utf-8")
        sample_note = f"{len(sample)} nodes / {len(sample_edges)} edges -> edges.json + layout.json"

    print("=" * 60)
    print("extract_graph.py")
    print(f"  pages scanned          : {pages_scanned}")
    print(f"  total link mentions    : {mentions}")
    print(f"  unique directed edges  : {len(full_edges)}")
    print(f"    curated (also-see)   : {curated_count}")
    print(f"    organic              : {len(full_edges) - curated_count}")
    print(f"  nodes referenced       : {len(nodes_in_graph)}")
    print(f"  ghost nodes (uncaptured): {len(ghosts)}  (linked but no catalog entry)")
    print(f"  sample                 : {sample_note}")
    print("=" * 60)


if __name__ == "__main__":
    main()
