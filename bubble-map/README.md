# PM SpacePort Data Package

This folder supports the default `../3d-bubble-map/` app.

The old 2D Sigma viewer has been retired. `index.html` is now a compatibility
redirect to the 3D Bubble Map, while the data, bubble images, archive pages, and
maintenance scripts remain here because the 3D map reads them directly.

## Layout

```text
bubble-map/
|-- index.html                     redirect to ../3d-bubble-map/
|-- assets/bubbles/{slug}.webp     bubble thumbnails used by the 3D map
|-- data/                          registry, edges, layout, manifest, status, logs
|-- archive/                       static site archive and A-Z catalog
|-- extract_registry.py            builds the site registry
|-- extract_graph.py               builds network edges and layout
|-- fetch_images.py                downloads bubble/source images
|-- fetch_missing.py               fills missing archive records
|-- capture_visuals.py             captures original-appearance screenshots
|-- build_archive.py               rebuilds archive pages
`-- publish_loop.py                incremental GitHub Pages deploy helper
```

## Data Files

| File | Produced by | Used by |
|------|-------------|---------|
| `registry.json` / `registry.full.json` | `extract_registry.py` | 3D map, archive titles |
| `edges.json`, `layout.json` | `extract_graph.py` | 3D map |
| `archive-manifest.json` | `build_archive.py` | 3D map archive links |
| `supplemental_records.json` | `fetch_missing.py` | archive builder |
| `build-status.json` | `publish_loop.py` | 3D map header progress line |
| `*-failures.log`, `*-log.txt` | various | diagnostics |
| `_*.json` | working/resume state | gitignored |

## How The 3D Map Uses This Folder

`../3d-bubble-map/app.js` loads `registry.json`, `edges.json`, `layout.json`, and
`archive-manifest.json` from this folder. Each registry entry becomes a textured
sphere using `assets/bubbles/{slug}.webp`; each edge becomes a curated, organic,
or Radical Responsibility orbit thread. Double-clicking a sphere opens its
archived page when available, falling back to the live site URL.

`layout.json` still matters. It provides stable home positions and cluster
structure for the 3D force/orbit simulation.

## Archive

Each archive page has a header linking back to the 3D map and archive index, the
"Original site appearance" screenshot, rendered content, and a footer with the
source URL and archive date. Pages interlink locally so the whole network is
browsable offline.

## Deploy

GitHub Pages serves the repository from `main:/`. The default map lives at:

```text
https://alanshurafa.github.io/possibility-management/3d-bubble-map/
```

The legacy 2D URL now redirects there:

```text
https://alanshurafa.github.io/possibility-management/bubble-map/
```

A root `.nojekyll` is required because the archive uses underscore-prefixed
directories that Jekyll would otherwise drop.

## Run Locally

```sh
py -3.13 -m http.server 8013
```

Then open:

```text
http://localhost:8013/3d-bubble-map/
```

Archive catalog:

```text
http://localhost:8013/bubble-map/archive/
```

## Coverage

- 604 catalog sites.
- 11,972 directed links in the network; the 3D map shows the catalog-to-catalog
  links and can toggle curated, organic, and Radical Responsibility orbit lines.
- 679 archive pages, about 4,000 inline images, and original-appearance
  screenshots filled in over time.
