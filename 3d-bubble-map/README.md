# PM 3D Bubble Map

An alternate three-dimensional view of the existing `bubble-map/` network.

The 3D map is intentionally a sibling app rather than a replacement. It reuses:

- `../bubble-map/data/registry.json`
- `../bubble-map/data/edges.json`
- `../bubble-map/data/layout.json`
- `../bubble-map/data/archive-manifest.json`
- `../bubble-map/assets/bubbles/*.webp`

That keeps the 2D sigma.js map unchanged while giving the same sites a Three.js
orbit view. Every site is rendered as a textured sphere. Pointer dragging pulls a
sphere through space, connected lines stretch with it, and the spring simulation
relaxes the constellation back toward the stable 2D-derived layout.

## Runtime

No build step. This page vendors Three.js r128 and OrbitControls under
`assets/vendor/`, matching the existing static-site pattern used by the 2D map.

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
- Search and A-Z filtering match the 2D map behavior.
- The organic-link toggle keeps organic edges out of the view and out of
  neighborhood calculations until enabled.
- Bubble size scales every sphere; `Size by links` switches between uniform
  bubbles and degree-weighted bubbles where highly connected sites are larger.
- The spacing slider spreads or compresses the constellation by changing each
  node's home position and link rest length.
- Fully visible, readable bubbles show their site name projected inside the
  sphere.
