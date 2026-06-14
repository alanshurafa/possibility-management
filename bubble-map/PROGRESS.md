# Build progress & resume guide

Paused 2026-06-14. The site is live and consistent at the state below.

Live: https://alanshurafa.github.io/possibility-management/bubble-map/

## Where things stand

- **Bubble map:** all 604 catalog sites, single-click isolates a site's links, organic-edge toggle, A–Z rail, search. Done.
- **Archive:** 679 site pages. **573 / 604** bubbles open to a local archived page; the other 31 fall back to the live mystrikingly URL (no live content captured *and* no Wayback snapshot).
- **Recovered sites:** 73 of the ~100 the 2025 crawl missed were re-fetched (live-first, Wayback fallback) and archived.
- **Screenshots ("Original site appearance"):** **66 / 604** captured and embedded so far. This is the unfinished part.

## Resume

Two scripts, both resumable (they skip what's already done). From `bubble-map/`:

```
# 1. keep capturing screenshots (live-first, Wayback fallback)
py -3.13 capture_visuals.py

# 2. publish as it goes (rebuild archive + push to main every ~20 min)
py -3.13 publish_loop.py
```

Run both in the background. The map header shows `Archive: N/604` live (from `data/build-status.json`). Stop anytime; re-running continues.

To recover more of the 31 missing pages (some, like `archangoodnews`, are live-reachable and just got rate-limited):

```
py -3.13 fetch_missing.py        # gentle, resumable; then rebuild
py -3.13 build_archive.py
```

## How it works

- `extract_registry.py --all` → `extract_graph.py` → `fetch_images.py` build the map data.
- `fetch_missing.py` recovers uncaptured catalog sites → `data/supplemental_records.json`.
- `capture_visuals.py` screenshots each site → `archive/assets/shots/{slug}.jpg`.
- `build_archive.py` renders the archive, merges recovered sites, and embeds screenshots.
- `publish_loop.py` rebuilds + commits + pushes to `main` on an interval (Pages redeploys).

Source of truth is the read-only 2025-08 crawl on Drive; live re-fetching is gentle to avoid Strikingly's rate-triggered CAPTCHA. No paid APIs, no LLM calls.

## Open items

- ~31 bubbles still on live fallback (no page). A gentle `fetch_missing.py` re-run should recover several.
- Commit history on `main` has many "Publish archive: N/604" commits — squash if you want a tidy history.
- For unattended/overnight completion independent of a session, the two loops can be wrapped as scheduled tasks.
