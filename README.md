# Possibility Management — open web toolkit

Open tools and sites for Possibility Management thoughtware: maps, courses, and interactive teaching tools. This repository is the source — fork it, adapt it, and host your own version anywhere. Everything is released under World Copyleft (CC BY-SA 4.0).

**Live demo: https://alanshurafa.github.io/possibility-management/**

Each property is a self-contained static site in its own folder, so you can take one on its own or run the whole set together.

## Properties

| Property | What it is | Live demo |
|----------|------------|-----------|
| [Thoughtmap Atlas](thoughtmaps/) | Every PM thoughtmap in one place, each with its own interactive one-page module. | [open](https://alanshurafa.github.io/possibility-management/thoughtmaps/) |
| [Infographic Atlas](infographics/) | Every map as an infographic, each linked by name to its interactive map and StartOver Spaceport site. | [open](https://alanshurafa.github.io/possibility-management/infographics/) |
| [SpacePort Bubble Map](bubble-map/) | The existing 2D network map of Possibility Management sites and archived copies. | [open](https://alanshurafa.github.io/possibility-management/bubble-map/) |
| [SpacePort 3D Bubble Map](3d-bubble-map/) | A Three.js sphere-map view of the same site network, with orbiting and draggable bubbles. | [open](https://alanshurafa.github.io/possibility-management/3d-bubble-map/) |
| [Expand the Box](courses/expand-the-box/) | The full course: modules, daily interactive tools, practice spines, and learner resources. | [open](https://alanshurafa.github.io/possibility-management/courses/expand-the-box/) |
| [Interactive Tools](courses/expand-the-box/Interactive%20Tools/) | Feeling locator, drama detector, EHP walker, ego-state locator, and more. | [open](https://alanshurafa.github.io/possibility-management/courses/expand-the-box/Interactive%20Tools/) |

## Layout

```
index.html              the hub that links to every property
_shared/                the common design kit: fonts, tokens, base styles
thoughtmaps/            the Thoughtmap Atlas
infographics/           the Infographic Atlas (gallery + per-map teaching pages)
bubble-map/             the existing 2D SpacePort site network map and archive
3d-bubble-map/          the Three.js 3D sphere view of the SpacePort network
courses/
  expand-the-box/       the Expand the Box course site
tools/                  room for standalone teaching tools
README · LICENSE        repo docs and the full CC BY-SA 4.0 license
```

Only published web artifacts live here. Raw media (video, audio) and working source stay out of the repo; the sites link to hosted media where needed.

## Run it locally

Plain static sites, no build step and no dependencies. Serve the repo root and browse the hub:

```sh
git clone https://github.com/alanshurafa/possibility-management.git
cd possibility-management
python -m http.server 8000
# hub:    http://localhost:8000
# atlas:  http://localhost:8000/thoughtmaps/
# course: http://localhost:8000/courses/expand-the-box/
```

Or open any property's `index.html` directly in a browser.

## Make your own version

Click **Use this template** at the top of this repo (or fork it) to get your own copy. Then publish it on whatever you like — no build step required:

- **GitHub Pages** — in your copy, go to Settings → Pages, set Source to "Deploy from a branch", branch `main`, folder `/ (root)`. A `.nojekyll` file is included so the `_shared` and `_assets` folders are served correctly.
- **Netlify / Cloudflare Pages** — point it at the repo with no build command and the publish directory set to the repo root (or a single property's folder).
- **Any static host** — copy the files to any web server or object store.

All links are relative, so the whole site works the same at a domain root or under a sub-path.

## License

World Copyleft. Released under [CC BY-SA 4.0](LICENSE), the same terms Possibility Management uses for its maps and Sparks. Share it, adapt it, use it commercially; keep the attribution and release adaptations under the same license.

This re-presents Possibility Management thoughtware originated by [Clinton Callahan](https://possibilitymanagement.org/) and the Possibility Management community. It follows the spirit of World Copyleft and is not an official Possibility Management product.

Powered by Possibility Management — https://possibilitymanagement.org
