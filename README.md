# Possibility Management full offline map

A complete, self-contained copy of the StartOver.xyz / Possibility Management
web of 925 sites, saved in 2025. It includes an interactive 3D bubble map that
links the sites together and a saved copy of every captured page, with images,
fonts, and styles included.

This branch is the full, image-rich archive. The live static deploy serves the
3D map at `/3d-bubble-map/`, and the root `index.html` redirects there.

## Run it on your own computer

You need Python 3. On Windows, install it from https://www.python.org/downloads/
and tick "Add Python to PATH" during setup.

1. Get the files:

   ```sh
   git clone --single-branch -b full-map https://github.com/alanshurafa/possibility-management.git
   ```

2. Start the local server from inside the folder:

   ```sh
   python -m http.server 8102
   ```

3. Browse to:

   ```text
   http://localhost:8102/
   ```

The root page redirects to the 3D map. Double-click a bubble to open that
site's archived page.

Everything is served with relative paths, so the archive works from a local
server or any static host. Individual site pages can also be opened directly.

## What's in the folder

- `index.html` - redirect fallback for the 3D map
- `3d-bubble-map/` - the interactive 3D bubble map
- `data/` - the site registry, link graph, archive manifest, and map layout
- `assets/bubbles/` - bubble thumbnail textures for the 3D map
- `_assets/` - shared page assets, deduplicated across the archived sites
- one folder per site, each with its saved `index.html`
- `scripts/update_map_data.py` - regenerates map data and Netlify redirects

## Adding a site folder

Add a top-level folder with an `index.html`, then run:

```sh
python scripts/update_map_data.py
```

This updates the local map data, archive manifest, and Netlify-compatible
redirects. Netlify runs the same script during deploy, so a new folder is
published at `/<folder>/` and appears as a bubble on the map.

## About the content

This is an archival snapshot from 2025 of sites that were published at
`*.mystrikingly.com` and are no longer reliably online. The writing and images
belong to the Possibility Management community and its authors; the archive
exists to keep that material readable and linked.
