# PM Bubble Map

An interactive constellation of the StartOver.xyz / Possibility Management network
of ~600 `*.mystrikingly.com` sites. Each site is a circular image bubble; the
lines between them are the links the sites make to each other. Double-click a
bubble to open that site's archived copy (or the live site if it was never
captured).

Alongside the map is a full static archive: a readable copy of every captured
site, interlinked, so the map keeps working even when the live mystrikingly sites
go down.

## What's here

- `index.html` + `app.js` — the bubble map (sigma.js v3 + graphology, WebGL).
- `archive/` — the static site archive, one page per captured site, with its own
  A–Z index and search.
- `data/` — the registry, edge graph, layout, and the archive manifest the map
  reads to point each bubble at its local page.
- `assets/bubbles/` — 256px bubble thumbnails. `assets/vendor/` — the two
  vendored JS libraries (no build step, works offline).

## Data provenance

Everything derives from one read-only Apify crawl captured 2025-08-10
(`source.json`, not stored in this repo). The live sites 403 bots, so the crawl
is the single source of truth and is never re-fetched. The build is local: no
re-crawl, no paid APIs, no LLM calls. The only network use is a one-time image
pull from the same CDN that served the originals.

The crawl has markdown and text per page, not raw HTML, so the archive preserves
each site's content and cross-links — not Strikingly's original visual design.

`spaceport.mystrikingly.com` is the master catalog: it lists each site with a
bubble image, title, tagline, and a hand-curated "Also see" list. The pipeline
parses it for the registry and scans all crawled pages for the link graph.

## Pipeline

Run in order with `py -3.13`:

```
py -3.13 extract_registry.py --all     # data/registry.json (all 604) + registry.full.json
py -3.13 extract_graph.py              # data/edges.json + layout.json
py -3.13 fetch_images.py               # assets/bubbles/{slug}.webp (256px)
py -3.13 build_archive.py              # archive/ + data/archive-manifest.json
```

`extract_registry.py --sample N` writes an N-site subset instead (used for the
review sample). Source path is hard-coded to the Drive location; override with the
`PM_SOURCE_JSON` environment variable.

## How the bubble links resolve

Each registry record carries three URLs:

```json
{
  "slug": "archaneconomics",
  "url": "http://archaneconomics.mystrikingly.com/",
  "live_url": "http://archaneconomics.mystrikingly.com/",
  "archive_url": "https://web.archive.org/web/2025/http://archaneconomics.mystrikingly.com",
  "...": "title, tagline, image_url, also_see[]"
}
```

The map prefers the local archive page (`archive/{slug}/`) when one exists, and
falls back to `live_url` for the ~100 catalog sites the crawl never captured.
`archive_url` (Wayback) is the durable last resort. Retargeting is one line in
`app.js`.

## The map

The default view shows the curated "Also see" web; a toggle overlays the full
organic link graph. Dark space theme, hover info-card, title/slug search, and an
A–Z rail. Node positions are precomputed in Python so load is instant.

## Coverage

- 604 catalog sites parsed at 99.2% (6 logged failures in `data/parse-failures.log`).
- 11,972 directed links; 2,268 curated, the rest organic.
- 1,232 pages archived from 606 captured sites; ~1,540 images downloaded
  (failures in `data/image-archive-failures.txt`).

## Run it locally

```
py -3.13 -m http.server 8013
```

Open <http://localhost:8013/> for the map, `/archive/` for the catalog. Port 8013
is this project's registered port.

## Hosting

Served via GitHub Pages from the `possibility-management` repo. The map lives at
`/possibility-management/bubble-map/`; all links are relative, so the same files
work locally and on Pages.
