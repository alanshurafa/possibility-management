# Possibility Management — full offline map

A complete, self-contained copy of the StartOver.xyz / Possibility Management web
of 925 sites, saved in 2025. It includes an interactive map that links the sites
together and a saved copy of every captured page, with all images, fonts, and
styles included. You can run the whole thing on your own computer, online or off.

This is the full, image-rich version. A lighter, text-only map is published
separately at https://alanshurafa.github.io/possibility-management/.

## Run it on your own computer

You'll need Python 3. macOS and Linux already have it; on Windows, install it from
https://www.python.org/downloads/ and tick "Add Python to PATH" during setup.

**1. Get the files**, either way:
- On this branch's GitHub page, click **Code → Download ZIP** and unzip it, or
- Clone just this branch:
  ```
  git clone --single-branch -b full-map https://github.com/alanshurafa/possibility-management.git
  ```

**2. Start the local server** from inside the folder:
- Windows: double-click `start-windows.bat`
- macOS: double-click `start-mac.command`
- Linux or anything else: run `python3 serve.py`

**3. Browse.** Your browser opens the map at http://localhost:8102/. Double-click
any bubble to open that site. Leave the window running while you browse; press
Ctrl+C to stop.

Everything is served from your own copy with relative paths, so it works offline
and keeps working from any folder or static host even if the original sites go
down.

### Why does it need a server?

The map reads its data from separate files, and browsers block that when you open
a page straight from disk. Serving the folder over http://localhost, which is all
`serve.py` does, gets around the restriction. Individual site pages don't need it;
you can open any `*/index.html` on its own. If you'd rather not use Python, any
static server works, for example `npx serve` with Node, or the Live Server
extension in VS Code.

## Seeing it online

GitHub's free CDNs serve files but deliberately don't render HTML as a webpage, so
the full map can't be opened straight from a jsDelivr or raw link (the page would
show as source text). Two ways to view it online instead:

- The lighter, text-only map is already published and opens in any browser:
  https://alanshurafa.github.io/possibility-management/
- To put this full version online, point a static host that serves HTML (Netlify's
  free tier, for example) at this repository. GitHub stays the source of truth; the
  host just mirrors it.

For the full, image-rich experience the simplest path is to run it locally (above),
which needs no host at all.

## What's in the folder

- `index.html`, `app.js`, `assets/vendor/` — the interactive bubble map (sigma.js
  and graphology)
- `data/` — the site registry, link graph, and map layout
- `_assets/` — every image, font, and stylesheet, deduplicated and shared across
  pages
- one folder per site (for example `centered/`, `4brains/`), each with its saved
  `index.html`
- `serve.py` and the `start-*` launchers — the local server

## Adding a site folder

Add a top-level folder with an `index.html`, then run:

```
python scripts/update_map_data.py
```

This updates the local map data, offline archive manifest, and Netlify subdomain
rewrites. On GitHub, the `Sync map data` workflow also runs on pushes to
`full-map` and commits the generated files when needed. Netlify runs the same
script during deploy, so a newly added folder is published at `/folder/` and
appears as a bubble on the map. The generated subdomain rewrites are ready for
Netlify wildcard-domain hosting, or for Cloudflare wildcard forwarding from
`https://folder.possibilitymanagement.xyz/` to `https://possibilitymanagement.xyz/folder/`.

## About the content

This is an archival snapshot from 2025 of sites that were published at
`*.mystrikingly.com` and are no longer reliably online. The writing and images
belong to the Possibility Management community and its authors; the archive exists
to keep that material readable and linked. It preserves each site's text, images,
and cross-links rather than the original page design.
