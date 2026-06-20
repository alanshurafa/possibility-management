# PM 3D Bubble Map

The default SpacePort network map for Possibility Management sites.

The 3D app reuses the shared SpacePort data package at the deploy root:

- `../data/registry.json`
- `../data/edges.json`
- `../data/layout.json`
- `../data/archive-manifest.json`
- `../assets/bubbles/*.webp`
- `../<site-slug>/index.html`

The deploy root redirects to this view. Site bubbles open the full root-level
archived pages through `data/archive-manifest.json`.

## Runtime

No build step. This page vendors Three.js r128 and OrbitControls under
`assets/vendor/`, matching the static-site pattern used across the repository.

Run from the repository root:

```sh
py -3.13 -m http.server 8013
```

Then open:

```text
http://localhost:8013/3d-bubble-map/
```

## Interaction Model

- Empty-space drag orbits the scene.
- Sphere drag pulls a site and stretches its connected links.
- Click a sphere to pin its visible neighborhood.
- Double-click a sphere to open its archived copy or live fallback.
- Search and A-Z filtering are built into the 3D view.
- Curated links, organic links, Radical Responsibility orbit, and size-by-links
  each have their own toggle.
- Zoom, tension, bubble size, and spacing are controlled by sliders.
- Fully visible, readable bubbles show their site name projected inside the
  sphere.
