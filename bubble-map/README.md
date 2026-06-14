# PM Bubble Map

An interactive map of the StartOver.xyz / Possibility Management network of ~600
`*.mystrikingly.com` sites, plus a self-hosted archive of each site. Every site
is a circular image bubble; the lines between bubbles are the links the sites make
to each other. Double-click a bubble to open that site's archived copy.

Alongside the map is a static archive: a readable copy of each site (content +
images + cross-links), with a screenshot of how the original looked. The map keeps
working even though the live mystrikingly sites are unreliable.

This file explains how the whole thing works. For current build state and how to
resume an in-progress capture, see [PROGRESS.md](PROGRESS.md).

## Layout

```
bubble-map/
├── index.html, app.js            the map (sigma.js v3 + graphology, WebGL)
├── assets/vendor/                vendored sigma + graphology (no build step)
├── assets/bubbles/{slug}.webp    256px bubble thumbnails
├── data/                         registry, edges, layout, manifest, status, logs
├── archive/                      the static site archive (one dir per site)
│   ├── index.html                A–Z catalog + client-side search
│   ├── {slug}/index.html         one page per site
│   ├── assets/style.css
│   ├── assets/images/{sha}.webp  downloaded inline images
│   └── assets/shots/{slug}.jpg   full-page "original appearance" screenshots
├── extract_registry.py  extract_graph.py  fetch_images.py   (map data)
├── fetch_missing.py  capture_visuals.py  build_archive.py   (archive)
└── publish_loop.py                                          (incremental deploy)
```

## Data provenance and constraints

Everything starts from one read-only Apify crawl captured 2025-08-10
(`source.json`, kept on Google Drive, not in this repo). It holds markdown and
text per page, not raw HTML — so the archive preserves content and the link graph,
not Strikingly's visual design. `spaceport.mystrikingly.com` is the master
catalog; the pipeline parses it for the site registry and scans all crawled pages
for the link graph.

Two constraints shaped the design:

- **The live sites rate-limit bots.** Hitting many URLs quickly trips a "Human
  Verification" CAPTCHA. It is *rate-triggered, not permanent*: accessed gently
  (one at a time, with pacing) the live sites render fine. So re-fetching is slow
  and deliberate, with the Wayback Machine as a fallback when a site challenges.
- **No paid APIs, no LLM calls** in the pipeline. The only network use is image
  fetches from the original CDN, gentle live re-fetches, and Wayback.

## Pipeline

All scripts are `py -3.13`, idempotent, and resumable. Source path is hard-coded
to the Drive location; override with `PM_SOURCE_JSON`.

**Map data:**
```
py -3.13 extract_registry.py --all   # data/registry.json (604) + registry.full.json + parse-failures.log
py -3.13 extract_graph.py            # data/edges.json + layout.json (precomputed positions)
py -3.13 fetch_images.py             # assets/bubbles/{slug}.webp (256px, placeholder on failure)
```

**Archive:**
```
py -3.13 fetch_missing.py            # recover catalog sites the crawl missed -> data/supplemental_records.json
py -3.13 capture_visuals.py          # full-page screenshots -> archive/assets/shots/{slug}.jpg
py -3.13 build_archive.py            # render archive/, merge recovered sites, embed screenshots
```

**Incremental deploy (optional):**
```
py -3.13 publish_loop.py             # rebuild + push to main on an interval while a capture runs
```

`extract_registry.py --sample N` writes an N-site subset (used for the original
review sample).

### What each archive script does

- **`fetch_missing.py`** — ~100 catalog sites were never in the crawl (offline at
  crawl time). This re-fetches them: live first, Wayback snapshot fallback,
  content extracted to markdown with `trafilatura`. Writes records in
  `source.json`'s shape to `data/supplemental_records.json`. Resumable; tracks
  permanently-absent sites in `data/_no_snapshot.json`.
- **`capture_visuals.py`** — renders each site headless (Playwright), auto-scrolls
  so Strikingly's scroll-triggered content/images paint, and saves a downscaled
  full-page JPEG. Live first; on CAPTCHA it backs off and falls back to the
  closest Wayback snapshot. Resumable (skips slugs that already have a shot).
- **`build_archive.py`** — renders markdown → HTML for every captured page,
  rewrites internal `*.mystrikingly.com` links to relative local pages (uncaptured
  links become "(archived — not captured)"), downloads inline images, merges the
  recovered sites from `supplemental_records.json`, embeds each screenshot as an
  "Original site appearance" block, and writes the A–Z index, search index, and
  `data/archive-manifest.json`.

## Data files (`data/`)

| File | Produced by | Used by |
|------|-------------|---------|
| `registry.json` / `registry.full.json` | extract_registry | map, archive titles |
| `edges.json`, `layout.json` | extract_graph | map |
| `archive-manifest.json` | build_archive | map (bubble → local page) |
| `supplemental_records.json` | fetch_missing | build_archive |
| `build-status.json` | publish_loop | map header progress line |
| `*-failures.log`, `*-log.txt` | various | diagnostics |
| `_*.json` | working/resume state | gitignored |

## How the map works (`app.js`)

- Stack: vendored **sigma@3.0.2** (`window.Sigma`, the renderer class;
  `window.Sigma.rendering.createNodeImageProgram` for image nodes) + vendored
  **graphology@0.25.4** (`window.graphology.DirectedGraph`). UMD, no build step.
- Loads `registry.json`, `edges.json`, `layout.json`, `archive-manifest.json`.
  Node attrs: `x/y` (precomputed layout), `size` (by degree), `type:"image"`,
  `image` (bubble webp), `url` (archive page if in manifest, else `live_url`).
- Default view shows curated "Also see" edges; a toggle overlays organic links.
  Node/edge **reducers** drive the dynamic styling.
- Interactions: hover → info card + neighborhood highlight; **single click →
  isolate that site's connections** (`neighborsVisible()` respects the organic
  toggle so hubs don't pull in hidden links); **double click → open** the archive
  page; title/slug search; A–Z rail with camera focus; empty space / Reset clears.

## The archive

Each page: a header (back to map + archive index), the "Original site appearance"
screenshot (capped preview, click for full size), the rendered content, and a
footer (`Archived from {url} on {date}`). Pages interlink locally, so the whole
network is browsable offline. The index lists every site root A–Z with search.

## Deploy

GitHub Pages, legacy build, served from `main:/` (no Actions/Vercel). The map
lives under `bubble-map/`, so it resolves at
`https://alanshurafa.github.io/possibility-management/bubble-map/`. **A root
`.nojekyll` is required** — the archive uses an `_external/` directory that Jekyll
would otherwise drop. All links are relative, so the same files work locally and
on Pages.

`publish_loop.py` enables "watch it build": while `capture_visuals.py` runs, the
loop rebuilds the archive and pushes to `main` every ~20 minutes (under Pages'
~10 builds/hour limit), and the map header shows `Archive: N/604` from
`build-status.json`. Each push triggers a Pages rebuild, during which the site is
briefly unavailable (occasional 503).

## Run locally

```
py -3.13 -m http.server 8013
```
Open <http://localhost:8013/> for the map, `/archive/` for the catalog. 8013 is
this project's registered port.

## Coverage (full build)

- 604 catalog sites, parsed at 99.2% (6 logged failures).
- 11,972 directed links in the network; the map shows the 10,649 among catalog
  sites (≈2,188 curated, the rest organic).
- 679 archive pages (606 crawled + 73 recovered). ~4,000 inline images.
- Screenshots and the last ~30 hard-to-reach sites are filled in over time; see
  PROGRESS.md for the live count.

## Key learnings / gotchas

- The CAPTCHA is rate-triggered. Gentle, paced access works; bursts get walled.
- WebP can't encode images taller than 16,383px, and these full-page screenshots
  are far taller — screenshots are **JPEG**, inline images are webp.
- sigma v3's UMD bundles the image-node program; no separate `@sigma/node-image`.
- Two local clones exist for historical reasons: the canonical repo is
  `Project/possibility-management`; the standalone `Project/pm-bubble-map` was the
  original build staging and is redundant.
- The live site's only deploy path is `main`, so incremental progress means
  repeated commits to `main` (squash later if a tidy history matters).
