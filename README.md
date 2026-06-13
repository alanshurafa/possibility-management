# Thoughtmap Atlas

The home for Possibility Management thoughtmaps. Every map in one place: find it by name, see its picture, and open its own one-page module to study the map, walk its distinctions, run a recall deck, and keep a private reflection.

**Live site: https://thoughtmap-atlas.vercel.app**

It starts with the 40 maps of the Expand the Box course, in course order, and is built to grow.

## What's inside

- An index of every map, grouped by course module and day.
- A one-page interactive module for each map: the picture, its distinctions, a recall deck, and a reflection saved only in your own browser. Nothing leaves your device.
- Self-hosted fonts and images, so it runs offline and depends on no third-party services.

## Run it locally

It's a plain static site with no build step and no dependencies.

```sh
git clone https://github.com/alanshurafa/possibility-management.git
cd possibility-management
python -m http.server 8000
# then open http://localhost:8000
```

Or just open `index.html` in a browser.

## Host your own copy

Fork the repo and deploy your fork. Your copy stays yours, and this one stays untouched.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Falanshurafa%2Fpossibility-management)

It also runs on any static host: GitHub Pages, Netlify, Cloudflare Pages, or an object store. A `.nojekyll` file is included so GitHub Pages serves the `_assets` folder correctly.

## Layout

```
index.html        the atlas: every map in one list
atlas/            one HTML page per map
Maps/             the map images
_assets/fonts/    self-hosted fonts
Days/             the course-day notes each map is taught in
```

## License

World Copyleft. Released under [CC BY-SA 4.0](LICENSE), the same terms Possibility Management uses for its maps and Sparks. Share it, adapt it, use it commercially; keep the attribution and release adaptations under the same license. A plain-language summary is in [LICENSE.md](LICENSE.md).

This re-presents Possibility Management thoughtware originated by [Clinton Callahan](https://possibilitymanagement.org/) and the Possibility Management community. It follows the spirit of World Copyleft and is not an official Possibility Management product.

Powered by Possibility Management — https://possibilitymanagement.org
