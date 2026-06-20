#!/usr/bin/env python3
"""
build_archive.py - Static content archive of every captured site.

Builds a browsable, interlinked static mirror of the ~600 Possibility Management
sites from the 2025-08 crawl. Preserves content and the cross-site link graph,
NOT the original Strikingly visual design (the crawl has no raw HTML, only
markdown). The bubble map links each planet to its page here, so the map keeps
working even if the live mystrikingly sites go down.

Per record (HTTP 200 + non-empty markdown):
  - one page at archive/{slug}/index.html (subpages nest; non-strikingly under
    archive/_external/{host}/...)
  - markdown -> HTML, shared dark-readable stylesheet, archival footer
  - internal *.mystrikingly.com links rewritten to relative local pages;
    uncaptured ones become plain text "(archived - not captured)"; external
    links open in a new tab
  - images downloaded once to archive/assets/images/{sha1}.webp (downscaled,
    cached across runs), refs rewritten; failures get a placeholder + log

Also writes:
  - archive/index.html         A-Z catalog + client-side search
  - archive/assets/search-index.json
  - data/archive-manifest.json {slug: "archive/{slug}/"} for the bubble map

Usage:
    py -3.13 build_archive.py --limit 12     # smoke test: first 12 records
    py -3.13 build_archive.py                # full run

Local-first: one bulk image fetch from the same CDN; no re-crawl, no LLM.
"""
from __future__ import annotations

import argparse
import hashlib
import html as htmllib
import io
import json
import os
import posixpath
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

import httpx
import markdown as md_lib
from bs4 import BeautifulSoup
from PIL import Image

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
ARCHIVE = HERE / "archive"
IMG_DIR = ARCHIVE / "assets" / "images"
SHOTS = ARCHIVE / "assets" / "shots"

DRIVE = r"C:\Users\alan\My Drive\__shurafa@gmail.com\_PM Possability Manangement\PMWebsites"
SRC = Path(os.environ.get("PM_SOURCE_JSON", str(Path(DRIVE) / "source.json")))
KMAP = Path(DRIVE) / "optimized_knowledge_map.md"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
MAX_DIM = 1280
PLACEHOLDER = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' "
               "width='320' height='180'%3E%3Crect width='320' height='180' "
               "fill='%231a2138'/%3E%3Ctext x='160' y='96' fill='%237689b8' "
               "font-family='sans-serif' font-size='13' text-anchor='middle'%3E"
               "image unavailable%3C/text%3E%3C/svg%3E")

STRK_HOST = re.compile(r"^([a-z0-9][a-z0-9-]*)\.mystrikingly\.com$", re.I)
MD_IMG = re.compile(r"!\[[^\]]*\]\(\s*((?:https?:)?//[^\s)\">]+)")


# ----------------------------------------------------------------------------- helpers
def demojibake(s: str) -> str:
    return s.replace("�", " ")


def norm_url(u: str) -> str:
    """Canonical key: lowercase host + path, no scheme/query/fragment/trailing slash."""
    if "//" not in u:
        u = "http://" + u
    p = urlparse(u)
    return (p.netloc.lower() + p.path.rstrip("/")) or p.netloc.lower()


def local_for(u: str) -> str:
    """Relative path (from archive/ root) of the page for a URL."""
    if "//" not in u:
        u = "http://" + u
    p = urlparse(u)
    host = p.netloc.lower()
    path = p.path.strip("/")
    m = STRK_HOST.match(host)
    if m:
        slug = m.group(1)
        return f"{slug}/{path}/index.html" if path else f"{slug}/index.html"
    ext = f"_external/{host}"
    if path:
        ext += f"/{path}"
    return f"{ext}/index.html"


def slug_of(u: str) -> str | None:
    m = STRK_HOST.match(urlparse(u if "//" in u else "http://" + u).netloc.lower())
    return m.group(1) if m else None


def rel(from_local: str, to_local: str) -> str:
    return posixpath.relpath(to_local, posixpath.dirname(from_local))


def norm_img(src: str) -> str:
    return ("https:" + src) if src.startswith("//") else src


def img_name(url: str, ext: str) -> str:
    return hashlib.sha1(url.encode()).hexdigest()[:16] + ext


# ----------------------------------------------------------------------------- images
def fetch_image(client: httpx.Client, url: str) -> tuple[str | None, str | None]:
    """Download + downscale -> (local filename, note). Cached by sha across runs."""
    is_svg = url.lower().split("?")[0].endswith(".svg")
    name = img_name(url, ".svg" if is_svg else ".webp")
    out = IMG_DIR / name
    if out.exists():
        return name, "cached"

    candidates = [url]
    if "strikinglycdn" in url and not is_svg:
        capped = re.sub(r"/upload/[^/]+/", "/upload/c_limit,w_1280,f_auto,q_auto/", url, count=1)
        candidates = [capped, url]

    last = "unknown"
    for cand in candidates:
        for _ in range(2):  # 1 retry
            try:
                r = client.get(cand, timeout=12.0, headers={
                    "User-Agent": UA, "Referer": "https://spaceport.mystrikingly.com/"})
                r.raise_for_status()
                if is_svg or "svg" in r.headers.get("content-type", ""):
                    out.write_bytes(r.content)
                    return img_name(url, ".svg"), "svg"
                im = Image.open(io.BytesIO(r.content))
                im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
                if max(im.size) > MAX_DIM:
                    im.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)
                im.save(out, "WEBP", quality=82, method=5)
                return name, "ok"
            except Exception as exc:  # noqa: BLE001
                last = f"{type(exc).__name__}: {exc}"
    return None, last


# ----------------------------------------------------------------------------- render
CSS = """\
:root{--bg:#0d1326;--panel:#141c38;--ink:#dde5f7;--dim:#93a0c8;--accent:#7dd3fc;--brd:#26304f}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
 font:16px/1.65 'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.arc-nav{position:sticky;top:0;background:rgba(13,19,38,.86);backdrop-filter:blur(8px);
 border-bottom:1px solid var(--brd);padding:11px 20px;font-size:14px}
.arc-nav .uncaptured{color:var(--dim)}
main{max-width:760px;margin:0 auto;padding:34px 22px 10px}
main img{max-width:100%;height:auto;border-radius:8px;margin:10px 0}
.orig-shot{margin:4px 0 26px;border:1px solid var(--brd);border-radius:10px;overflow:hidden;background:#0a1124}
.orig-shot .orig-label{padding:8px 12px;font-size:12.5px;color:var(--dim);border-bottom:1px solid var(--brd);display:flex;justify-content:space-between}
.orig-shot img{display:block;width:100%;height:auto;max-height:560px;object-fit:cover;object-position:top;border-radius:0;margin:0}
h1,h2,h3,h4{line-height:1.25;margin:1.4em 0 .5em}h1{font-size:1.8em}
hr{border:0;border-top:1px solid var(--brd);margin:2em 0}
blockquote{border-left:3px solid var(--accent);margin:1em 0;padding:.2em 1em;color:var(--dim)}
code{background:#0a1124;padding:.15em .4em;border-radius:4px;font-size:.92em}
.uncaptured-note{color:var(--dim);font-style:italic}
.arc-foot{max-width:760px;margin:30px auto;padding:18px 22px;border-top:1px solid var(--brd);
 color:var(--dim);font-size:13px}
/* index */
.idx-head{max-width:900px;margin:0 auto;padding:30px 22px 6px}
.idx-head h1{margin:.1em 0}.idx-head p{color:var(--dim)}
#q{width:100%;max-width:420px;padding:10px 13px;border-radius:9px;background:#0a1124;
 color:var(--ink);border:1px solid var(--brd);outline:none;font-size:15px;margin-top:8px}
#q:focus{border-color:var(--accent)}
.idx-wrap{max-width:900px;margin:0 auto;padding:10px 22px 60px}
.group{margin:22px 0 6px;color:var(--accent);font-weight:700;font-size:1.1em;
 border-bottom:1px solid var(--brd);padding-bottom:4px}
.idx-list{columns:2;column-gap:34px}.idx-list a{display:block;padding:3px 0;break-inside:avoid}
.idx-list .tag{color:var(--dim);font-size:.85em}
@media(max-width:640px){.idx-list{columns:1}}
"""

PAGE = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>@@TITLE@@ — PM Archive</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='11' fill='%237dd3fc'/%3E%3C/svg%3E">
<link rel="stylesheet" href="@@CSS@@">
</head><body>
<nav class="arc-nav"><a href="@@MAP@@">← Bubble Map</a> &nbsp;·&nbsp; <a href="@@INDEX@@">Archive Index</a></nav>
<main>@@BODY@@</main>
<footer class="arc-foot">Archived from <a href="@@ORIG@@" target="_blank" rel="noopener">@@ORIG@@</a> on @@DATE@@.</footer>
</body></html>
"""


def render_links(soup: BeautifulSoup, page_local: str, url2local: set[str], localmap: dict[str, str]):
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.startswith("#") or href.startswith("mailto:"):
            continue
        host = urlparse(href if "//" in href else "http://" + href).netloc.lower()
        if STRK_HOST.match(host):
            key = norm_url(href)
            if key in localmap:                       # captured -> relative local link
                a["href"] = rel(page_local, localmap[key])
            else:                                      # uncaptured -> plain text + note
                txt = a.get_text() or host
                span = soup.new_tag("span")
                span["class"] = "uncaptured-note"
                span.string = f"{txt} (archived — not captured)"
                a.replace_with(span)
        elif href.startswith("http"):                  # external
            a["target"] = "_blank"
            a["rel"] = "noopener"


def render_images(soup: BeautifulSoup, page_local: str, imgmap: dict[str, str]):
    for img in soup.find_all("img"):
        src = norm_img(img.get("src", ""))
        local = imgmap.get(src)
        if local:
            img["src"] = rel(page_local, f"assets/images/{local}")
            img["loading"] = "lazy"
        else:
            img["src"] = PLACEHOLDER
            if img.get("alt"):
                img["title"] = f"image unavailable: {img['alt']}"


# ----------------------------------------------------------------------------- main
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limit", type=int, default=0, help="only process first N records (smoke test)")
    ap.add_argument("--workers", type=int, default=12)
    args = ap.parse_args()

    if not SRC.exists():
        sys.exit(f"FATAL: source.json not found at {SRC}")
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    (ARCHIVE / "assets").mkdir(parents=True, exist_ok=True)

    records = json.loads(SRC.read_text(encoding="utf-8"))
    records = [r for r in records
               if (r.get("crawl") or {}).get("httpStatusCode") == 200
               and (r.get("markdown") or "").strip()]

    # Merge in sites recovered by fetch_missing.py (the ~100 the 2025 crawl missed).
    supp_path = DATA / "supplemental_records.json"
    if supp_path.exists():
        seen = {norm_url(r["url"]) for r in records}
        added = 0
        for sr in json.loads(supp_path.read_text(encoding="utf-8")):
            if (sr.get("markdown") or "").strip() and norm_url(sr["url"]) not in seen:
                records.append(sr)
                added += 1
        print(f"  merged {added} recovered sites from supplemental_records.json")

    if args.limit:
        records = records[:args.limit]

    # Clean titles from the knowledge map (by normalized URL) + registry (by slug).
    kmap_titles: dict[str, str] = {}
    if KMAP.exists():
        for m in re.finditer(r"-\s+\*\*(.+?)\*\*\s+—\s+(\S+)", KMAP.read_text(encoding="utf-8")):
            kmap_titles[norm_url(m.group(2))] = m.group(1).strip()
    reg_titles: dict[str, str] = {}
    reg_path = DATA / "registry.full.json"
    if reg_path.exists():
        for e in json.loads(reg_path.read_text(encoding="utf-8")):
            reg_titles[e["slug"]] = e["title"]

    def title_for(r: dict) -> str:
        key = norm_url(r["url"])
        if key in kmap_titles:
            return kmap_titles[key]
        s = slug_of(r["url"])
        path = urlparse(r["url"]).path.strip("/")
        if s and not path and s in reg_titles:
            return reg_titles[s]
        mt = (r.get("metadata") or {}).get("title") or ""
        mt = re.sub(r"\s+on Strikingly\s*$", "", mt).strip()
        return demojibake(mt) or (s or "Untitled")

    # url -> local path map (for link rewriting), over ALL captured records.
    localmap = {norm_url(r["url"]): local_for(r["url"]) for r in records}

    # Collect unique image URLs across all rendered records.
    img_urls: set[str] = set()
    for r in records:
        for m in MD_IMG.findall(r["markdown"]):
            img_urls.add(norm_img(m.split(" ")[0]))

    # Fetch images (cached, concurrent).
    imgmap: dict[str, str] = {}
    failures: list[str] = []
    with httpx.Client(follow_redirects=True) as client:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for url, (name, note) in zip(
                    img_urls, pool.map(lambda u: fetch_image(client, u), img_urls)):
                if name:
                    imgmap[url] = name
                else:
                    failures.append(f"{url}\t{note}")
    (DATA / "image-archive-failures.txt").write_text(
        "\n".join(failures) or "(none)", encoding="utf-8")

    # Render every page.
    md = md_lib.Markdown(extensions=["extra", "sane_lists"])
    index_entries = []   # (title, slug, path_from_index, snippet)
    manifest: dict[str, str] = {}
    pages = 0
    for r in records:
        page_local = local_for(r["url"])
        out = ARCHIVE / page_local
        out.parent.mkdir(parents=True, exist_ok=True)

        md.reset()
        body_html = md.convert(demojibake(r["markdown"]))
        soup = BeautifulSoup(body_html, "html.parser")
        render_links(soup, page_local, set(localmap.values()), localmap)
        render_images(soup, page_local, imgmap)

        title = title_for(r)
        loaded = (r.get("crawl") or {}).get("loadedTime", "")[:10]
        s = slug_of(r["url"])
        path = urlparse(r["url"]).path.strip("/")

        shot_block = ""
        if s and not path and (SHOTS / f"{s}.jpg").exists():
            shot_rel = rel(page_local, f"assets/shots/{s}.jpg")
            shot_block = (
                f'<div class="orig-shot"><div class="orig-label"><span>Original site appearance</span>'
                f'<a href="{shot_rel}" target="_blank" rel="noopener">open full size ↗</a></div>'
                f'<a href="{shot_rel}" target="_blank" rel="noopener"><img src="{shot_rel}" '
                f'alt="Screenshot of {htmllib.escape(title)}" loading="lazy"></a></div>')

        html_out = (PAGE
                    .replace("@@TITLE@@", htmllib.escape(title))
                    .replace("@@CSS@@", rel(page_local, "assets/style.css"))
                    .replace("@@MAP@@", rel(page_local, "../index.html"))
                    .replace("@@INDEX@@", rel(page_local, "index.html"))
                    .replace("@@BODY@@", shot_block + str(soup))
                    .replace("@@ORIG@@", htmllib.escape(r["url"]))
                    .replace("@@DATE@@", loaded))
        out.write_text(html_out, encoding="utf-8")
        pages += 1

        if s and not path:  # a site root page -> index + map manifest
            snippet = re.sub(r"\s+", " ", demojibake(r.get("text") or ""))[:240]
            index_entries.append((title, s, f"{s}/", snippet))
            manifest[s] = f"archive/{s}/"

    # Archive index (A–Z) + search index.
    ARCHIVE.joinpath("assets", "style.css").write_text(CSS, encoding="utf-8")
    index_entries.sort(key=lambda t: t[0].lower())
    search = [{"title": t, "path": p, "snippet": sn} for (t, s, p, sn) in index_entries]
    ARCHIVE.joinpath("assets", "search-index.json").write_text(
        json.dumps(search, ensure_ascii=False), encoding="utf-8")
    (DATA / "archive-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    write_index(index_entries)

    print("=" * 60)
    print("build_archive.py")
    print(f"  records rendered  : {pages}")
    print(f"  site root pages   : {len(index_entries)} (in index + map manifest)")
    print(f"  unique images     : {len(img_urls)}")
    print(f"  images ok         : {len(imgmap)}")
    print(f"  image failures    : {len(failures)}  -> data/image-archive-failures.txt")
    print(f"  output            : archive/  (+ data/archive-manifest.json)")
    print("=" * 60)


def write_index(entries: list[tuple]) -> None:
    groups: dict[str, list[tuple]] = {}
    for t, s, p, sn in entries:
        c = t[0].upper()
        key = c if "A" <= c <= "Z" else "#"
        groups.setdefault(key, []).append((t, p))
    order = ["#"] + list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    blocks = []
    for k in order:
        if k not in groups:
            continue
        items = "".join(
            f'<a href="{htmllib.escape(p)}">{htmllib.escape(t)}</a>' for t, p in groups[k])
        blocks.append(f'<div class="group" id="g{k}">{k}</div><div class="idx-list">{items}</div>')
    body = "\n".join(blocks)
    html_out = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Possibility Management — Archive Index</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='11' fill='%237dd3fc'/%3E%3C/svg%3E">
<link rel="stylesheet" href="assets/style.css">
</head><body>
<nav class="arc-nav"><a href="../index.html">← Bubble Map</a></nav>
<div class="idx-head">
  <h1>Possibility Management — Site Archive</h1>
  <p>{len(entries)} archived sites from the StartOver.xyz network (2025 snapshot). Search or browse A–Z.</p>
  <input id="q" type="search" placeholder="Search titles and content…" autocomplete="off">
</div>
<div class="idx-wrap" id="browse">{body}</div>
<div class="idx-wrap" id="results" hidden></div>
<script>
let SI=[];
fetch('assets/search-index.json').then(r=>r.json()).then(d=>SI=d);
const q=document.getElementById('q'),br=document.getElementById('browse'),re=document.getElementById('results');
q.addEventListener('input',()=>{{
  const v=q.value.trim().toLowerCase();
  if(!v){{br.hidden=false;re.hidden=true;re.innerHTML='';return;}}
  br.hidden=true;re.hidden=false;
  const hits=SI.filter(x=>x.title.toLowerCase().includes(v)||(x.snippet||'').toLowerCase().includes(v)).slice(0,200);
  re.innerHTML='<div class="group">'+hits.length+' result'+(hits.length==1?'':'s')+'</div><div class="idx-list">'+
    hits.map(x=>'<a href="'+x.path+'">'+x.title+'</a>').join('')+'</div>';
}});
</script>
</body></html>
"""
    ARCHIVE.joinpath("index.html").write_text(html_out, encoding="utf-8")


if __name__ == "__main__":
    main()
