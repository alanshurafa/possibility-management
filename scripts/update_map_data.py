#!/usr/bin/env python3
"""Regenerate static map metadata from archived site folders.

The archive is intentionally static and portable. This script keeps the JSON
files and Netlify subdomain rewrites in sync with top-level folders that contain
an index.html file, without requiring any external packages or network access.
"""

from __future__ import annotations

import hashlib
import html
import json
import math
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
BUBBLES = ROOT / "assets" / "bubbles"
DOMAIN = "possibilitymanagement.xyz"
EXCLUDED_DIRS = {
    ".git",
    ".github",
    ".netlify",
    "_assets",
    "_shared",
    "3d-bubble-map",
    "assets",
    "courses",
    "data",
    "docs",
    "infographics",
    "netlify",
    "scripts",
    "thoughtmaps",
    "tools",
}
CUSTOM_SITES = {
    "maps-and-processes-from-expand-the-box": {
        "title": "Maps & Processes from Expand the Box",
        "tagline": "A self-paced study of the maps and processes used in Expand the Box, with modules, a map atlas, and interactive practice tools.",
        "url": "https://possibilitymanagement.xyz/courses/maps-and-processes-from-expand-the-box/",
        "live_url": "https://possibilitymanagement.xyz/courses/maps-and-processes-from-expand-the-box/",
        "archive_url": "https://possibilitymanagement.xyz/courses/maps-and-processes-from-expand-the-box/",
        "image_url": "",
        "bubble_image": "courses/maps-and-processes-from-expand-the-box/Maps/M01.webp",
        "also_see": [
            "expandthebox",
            "practiceexpandthebox",
            "pmprocesses",
            "pmthoughtmaps",
            "4feelings",
            "radicalresponsibility",
        ],
        "breadcrumb": [
            "Courses",
            "Expand the Box",
            "Maps & Processes",
        ],
        "path_label": "courses/maps-and-processes-from-expand-the-box/",
        "archive_path": "courses/maps-and-processes-from-expand-the-box/index.html",
        "layout": [484.8, 559.6],
    }
}
CUSTOM_EDGES = [
    {
        "src": "maps-and-processes-from-expand-the-box",
        "tgt": "expandthebox",
        "count": 0,
        "type": "curated",
    },
    {
        "src": "maps-and-processes-from-expand-the-box",
        "tgt": "practiceexpandthebox",
        "count": 0,
        "type": "curated",
    },
    {
        "src": "maps-and-processes-from-expand-the-box",
        "tgt": "pmprocesses",
        "count": 0,
        "type": "curated",
    },
    {
        "src": "maps-and-processes-from-expand-the-box",
        "tgt": "pmthoughtmaps",
        "count": 0,
        "type": "curated",
    },
    {
        "src": "maps-and-processes-from-expand-the-box",
        "tgt": "4feelings",
        "count": 0,
        "type": "curated",
    },
    {
        "src": "maps-and-processes-from-expand-the-box",
        "tgt": "radicalresponsibility",
        "count": 0,
        "type": "curated",
    },
]
GENERIC_TITLES = {
    "",
    "forwarding website",
    "website",
    "untitled",
}


def load_json(path: Path, fallback):
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value) -> None:
    text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


def site_dirs() -> list[Path]:
    dirs = []
    for path in ROOT.iterdir():
        if not path.is_dir() or path.name in EXCLUDED_DIRS or path.name.startswith("."):
            continue
        if (path / "index.html").is_file():
            dirs.append(path)
    return sorted(dirs, key=lambda p: p.name)


def custom_slugs() -> list[str]:
    slugs = []
    for slug, site in CUSTOM_SITES.items():
        archive_path = ROOT / site["archive_path"]
        if archive_path.is_file():
            slugs.append(slug)
    return sorted(slugs)


def humanize_slug(slug: str) -> str:
    parts = re.split(r"[-_]+", slug)
    words = []
    for part in parts:
        part = re.sub(r"(?<=\D)(?=\d)|(?<=\d)(?=\D)", " ", part)
        words.append(part)
    return " ".join(words).strip().title() or slug


def extract_title(slug: str, index_html: Path) -> str:
    text = index_html.read_text(encoding="utf-8", errors="ignore")
    match = re.search(r"<title[^>]*>(.*?)</title>", text, re.IGNORECASE | re.DOTALL)
    if not match:
        return humanize_slug(slug)

    title = html.unescape(match.group(1))
    title = re.sub(r"\s+", " ", title).strip()
    title = re.sub(r"\s+(?:on|by)\s+Strikingly\s*$", "", title, flags=re.IGNORECASE)
    title = re.sub(r"\s*[-|]\s*Strikingly\s*$", "", title, flags=re.IGNORECASE)
    if title.strip().lower() in GENERIC_TITLES:
        return humanize_slug(slug)
    return title or humanize_slug(slug)


def fallback_position(slug: str) -> list[float]:
    digest = hashlib.sha256(slug.encode("utf-8")).digest()
    angle_seed = int.from_bytes(digest[:8], "big") / float(1 << 64)
    radius_seed = int.from_bytes(digest[8:16], "big") / float(1 << 64)
    angle = angle_seed * math.tau
    radius = 170 + radius_seed * 340
    x = max(55, min(945, 500 + math.cos(angle) * radius))
    y = max(55, min(945, 500 + math.sin(angle) * radius))
    return [round(x, 2), round(y, 2)]


def has_bubble(slug: str) -> bool:
    return (BUBBLES / f"{slug}.webp").is_file()


def sync_registry(slugs: list[str]) -> list[dict]:
    registry = load_json(DATA / "registry.json", [])
    by_slug = {entry.get("slug"): entry for entry in registry if entry.get("slug")}
    slug_set = set(slugs)

    for slug in slugs:
        custom_site = CUSTOM_SITES.get(slug)
        entry = by_slug.get(slug)
        if entry is None:
            entry = {
                "slug": slug,
                "title": custom_site["title"] if custom_site else extract_title(slug, ROOT / slug / "index.html"),
                "tagline": "",
                "url": f"https://{slug}.{DOMAIN}/",
                "live_url": f"https://{slug}.{DOMAIN}/",
                "archive_url": "",
                "image_url": "",
                "also_see": [],
            }
            registry.append(entry)
            by_slug[slug] = entry

        if custom_site:
            for key, value in custom_site.items():
                if key not in {"archive_path", "layout"}:
                    entry[key] = value
        elif has_bubble(slug):
            entry.pop("bubble_image", None)
        else:
            entry["bubble_image"] = "assets/bubbles/_fallback.svg"

    return [entry for entry in registry if entry.get("slug") in slug_set]


def sync_manifest(slugs: list[str]) -> dict[str, str]:
    return {
        slug: CUSTOM_SITES[slug]["archive_path"] if slug in CUSTOM_SITES else f"{slug}/index.html"
        for slug in slugs
    }


def sync_layout(slugs: list[str]) -> dict[str, list[float]]:
    layout = load_json(DATA / "layout.json", {})
    return {
        slug: layout.get(slug) or CUSTOM_SITES.get(slug, {}).get("layout") or fallback_position(slug)
        for slug in slugs
    }


def sync_edges(slugs: list[str]) -> list[dict]:
    slug_set = set(slugs)
    edges = load_json(DATA / "edges.json", [])
    custom_pairs = {(edge["src"], edge["tgt"], edge["type"]) for edge in CUSTOM_EDGES}
    synced = [
        edge
        for edge in edges
        if (edge.get("src"), edge.get("tgt"), edge.get("type")) not in custom_pairs
    ]
    synced.extend(
        edge
        for edge in CUSTOM_EDGES
        if edge["src"] in slug_set and edge["tgt"] in slug_set
    )
    return synced


def write_redirects(slugs: list[str]) -> None:
    lines = [
        "# Generated by scripts/update_map_data.py",
        f"https://www.{DOMAIN}/* https://{DOMAIN}/:splat 301!",
        f"http://www.{DOMAIN}/* https://{DOMAIN}/:splat 301!",
        "",
        "# Slug subdomains rewrite to the matching archived folder.",
    ]
    for slug in slugs:
        archive_path = CUSTOM_SITES.get(slug, {}).get("archive_path")
        if archive_path:
            target_base = "/" + archive_path.removesuffix("index.html")
        else:
            target_base = f"/{slug}/"
        lines.append(f"https://{slug}.{DOMAIN}/* {target_base}:splat 200!")
        lines.append(f"http://{slug}.{DOMAIN}/* {target_base}:splat 200!")
    lines.append("")
    with (ROOT / "_redirects").open("w", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(lines))


def main() -> None:
    site_slugs = [path.name for path in site_dirs()]
    slugs = sorted(site_slugs + custom_slugs())
    if not slugs:
        raise SystemExit("No site folders with index.html found")

    DATA.mkdir(exist_ok=True)
    write_json(DATA / "registry.json", sync_registry(slugs))
    write_json(DATA / "archive-manifest.json", sync_manifest(slugs))
    write_json(DATA / "layout.json", sync_layout(slugs))
    write_json(DATA / "edges.json", sync_edges(slugs))
    write_redirects(slugs)
    print(
        f"Map data synced for {len(site_slugs)} site folders "
        f"and {len(slugs) - len(site_slugs)} custom entries."
    )


if __name__ == "__main__":
    main()
