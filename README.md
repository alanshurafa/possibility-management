# Possibility Management — the open web home

The open home for Possibility Management thoughtware on the web: maps, courses, and interactive teaching tools. Everything here is free to use, fork, and adapt under World Copyleft (CC BY-SA 4.0).

**Hub: https://thoughtmap-atlas.vercel.app** *(the Atlas; the hub front door deploys separately — see below)*

Each property is a self-contained static site in its own folder and deploys as its own Vercel project, so any of them can grow or move without disturbing the others.

## Properties

| Property | What it is | Status |
|----------|------------|--------|
| [Thoughtmap Atlas](thoughtmaps/) | Every PM thoughtmap in one place, each with its own interactive one-page module. | **Live** — https://thoughtmap-atlas.vercel.app |
| [Expand the Box](courses/expand-the-box/) | The full ten-day course site: daily modules, tools, and the in-course map atlas. | In progress |
| [Teaching Tools](tools/) | Standalone interactive tools (feeling locator, drama spotters, map recall). | In progress |

## Layout

```
index.html              the PM web home (hub) that links to every property
_shared/                the common design kit: fonts, tokens, base styles
thoughtmaps/            the Thoughtmap Atlas (its own deployable site)
courses/
  expand-the-box/       the Expand the Box course site
tools/                  standalone interactive teaching tools
README · LICENSE        repo docs and the full CC BY-SA 4.0 license
```

Only published web artifacts live here. Raw media (video, audio) and working source stay out of the repo; the sites link to hosted media where needed.

## Run it locally

Plain static sites, no build step and no dependencies. Serve the repo root and browse the hub:

```sh
git clone https://github.com/alanshurafa/possibility-management.git
cd possibility-management
python -m http.server 8000
# hub:   http://localhost:8000
# atlas: http://localhost:8000/thoughtmaps/
```

Or open any property's `index.html` directly in a browser.

## Host your own copy

Click **Use this template** at the top of this repo to get your own copy, then deploy it. Your copy stays yours, and this one stays untouched. (Forking works too.)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Falanshurafa%2Fpossibility-management)

There's no build step, so each property runs on any static host: Vercel, GitHub Pages, Netlify, Cloudflare Pages, or an object store. A `.nojekyll` file is included so GitHub Pages serves the `_shared` and `_assets` folders correctly.

## License

World Copyleft. Released under [CC BY-SA 4.0](LICENSE), the same terms Possibility Management uses for its maps and Sparks. Share it, adapt it, use it commercially; keep the attribution and release adaptations under the same license.

This re-presents Possibility Management thoughtware originated by [Clinton Callahan](https://possibilitymanagement.org/) and the Possibility Management community. It follows the spirit of World Copyleft and is not an official Possibility Management product.

Powered by Possibility Management — https://possibilitymanagement.org
