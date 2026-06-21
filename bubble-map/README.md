# PM 3D Bubble Map

The default SpacePort network map for Possibility Management sites.

The 3D app and all public archive pages live together under `bubble-map/`.
The app reads the local data package from this folder:

- `data/registry.json`
- `data/edges.json`
- `data/layout.json`
- `data/archive-manifest.json`
- `assets/bubbles/*.webp`
- `<site-slug>/index.html`

The deploy root redirects to this view. Site bubbles open the full archived
pages through `data/archive-manifest.json`.

Keep the map rooted at `bubble-map/` with `DATA_ROOT = ""` so the app reads the
co-located archive, assets, and generated data. The old `/3d-bubble-map/` route
is only a compatibility redirect.

## Runtime

No build step. This page vendors Three.js r128 and OrbitControls under
`assets/vendor/`, matching the static-site pattern used across the repository.

Run from the repository root:

```sh
py -3.13 -m http.server 8013
```

Then open:

```text
http://localhost:8013/bubble-map/
```

## Interaction Model

- Empty-space drag orbits the scene.
- Sphere drag pulls a site and stretches its connected links.
- Click a sphere to pin its visible neighborhood.
- Double-click a sphere to open its archived copy or live fallback.
- Search and A-Z filtering are built into the 3D view.
- A single search result pins that bubble and opens its preview card.
- Curated links, organic links, Radical Responsibility orbit, and size-by-links
  each have their own toggle.
- Zoom, tension, bubble size, and spacing are controlled by sliders.
- Fully visible, readable bubbles show their site name projected inside the
  sphere.

## Custom Entries

The map normally scans archived site folders directly under `bubble-map/`.
Non-archive resources that should appear as bubbles, such as the Expand the Box
self-study course, belong in `CUSTOM_SITES` and `CUSTOM_EDGES` in
`scripts/update_map_data.py`.

After changing custom entries, run from the repository root:

```sh
python scripts/update_map_data.py
```

The current expected count is 925 archived site folders plus 1 custom entry.
