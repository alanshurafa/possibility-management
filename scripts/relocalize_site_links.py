"""Re-localize captured Strikingly-era site links in archived pages.

The archived pages still contain original in-page links like
``https://some-slug.mystrikingly.com``, typo variants seen in the archive such
as ``mystrkingly.com``, or ``https://some-slug.strikingly.com``. When
``some-slug`` exists as a captured local folder, rewrite the clickable
attributes to ``../some-slug/index.html``.

Clear legacy typos/renames are handled by ``LEGACY_ALIASES``. Unknown
uncaptured slugs stay external so we do not invent targets.
"""

from __future__ import annotations

import html
import pathlib
import re
from collections import Counter


ROOT = pathlib.Path(__file__).resolve().parents[1]
EXCLUDE_DIRS = {".git", ".netlify", "_assets", "assets", "data", "3d-bubble-map", "scripts"}
LINK_ATTR = re.compile(
    r"""\b(href|data-image-link|data-item-link|data-url)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)""",
    re.IGNORECASE,
)
STRIKINGLY_SITE_URL = re.compile(
    r"""^https?://([a-z0-9-]+)\.(?:mystrikingly|mystrkingly|strikingly)\.com(?:$|[/?#.])""",
    re.IGNORECASE,
)

# Legacy SpacePort links that have a clear captured replacement.
LEGACY_ALIASES = {
    "archanuniversity": "archanversity",
    "becomesubversie": "becomesubversive",
    "bridgehouseranchocampo": "ranchocampo",
    "gaianmensbridghouse": "gaianmensbridgehouse",
    "holdtransformationalspace": "holdspace",
    "negotiateintimcy": "negotiateintimacy",
    "playfullout": "livefullout",
}

# Dead legacy links with no captured local equivalent. Keep the visible text but
# remove the clickable external target.
DEAD_LEGACY_LINKS = {"heartgym-po"}


def captured_slugs() -> set[str]:
    return {
        item.name.lower()
        for item in ROOT.iterdir()
        if item.is_dir()
        and item.name not in EXCLUDE_DIRS
        and (item / "index.html").exists()
    }


def quote_value(raw: str) -> tuple[str, str]:
    if raw.startswith('"') and raw.endswith('"'):
        return '"', raw[1:-1]
    if raw.startswith("'") and raw.endswith("'"):
        return "'", raw[1:-1]
    return '"', raw


def rewrite_html(source: str, captured: set[str], stats: Counter[str]) -> str:
    def replace(match: re.Match[str]) -> str:
        attr = match.group(1)
        quote, value = quote_value(match.group(2))
        decoded = html.unescape(value.strip())
        url_match = STRIKINGLY_SITE_URL.match(decoded)
        if not url_match:
            return match.group(0)

        old_slug = url_match.group(1).lower()
        target_slug = old_slug if old_slug in captured else LEGACY_ALIASES.get(old_slug)
        if old_slug in DEAD_LEGACY_LINKS:
            stats["unlinked"] += 1
            return f'data-pm-missing-local-link={quote}{old_slug}{quote}'
        if not target_slug or target_slug not in captured:
            stats["uncaptured"] += 1
            return match.group(0)

        stats["alias" if target_slug != old_slug else "exact"] += 1
        return f'{attr}={quote}../{target_slug}/index.html{quote}'

    return LINK_ATTR.sub(replace, source)


def main() -> None:
    captured = captured_slugs()
    stats: Counter[str] = Counter()
    changed_pages = 0

    for folder in sorted(ROOT.iterdir()):
        if folder.name in EXCLUDE_DIRS or not folder.is_dir():
            continue
        page = folder / "index.html"
        if not page.exists():
            continue
        source = page.read_text(encoding="utf-8", errors="ignore")
        updated = rewrite_html(source, captured, stats)
        if updated != source:
            page.write_text(updated, encoding="utf-8")
            changed_pages += 1

    print(f"captured slugs: {len(captured)}")
    print(f"pages changed: {changed_pages}")
    print(f"exact rewrites: {stats['exact']}")
    print(f"alias rewrites: {stats['alias']}")
    print(f"dead links unlinked: {stats['unlinked']}")
    print(f"uncaptured left external: {stats['uncaptured']}")


if __name__ == "__main__":
    main()
