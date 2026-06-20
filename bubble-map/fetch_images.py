#!/usr/bin/env python3
"""
fetch_images.py - Fetch and downscale bubble images for the registry.

Purpose:
    Each registry site has a Strikingly CDN image. This script pulls those
    images, crops them to a 256x256 square, and writes a small webp per site to
    assets/bubbles/{slug}.webp. Any site whose image can't be fetched gets a
    generated placeholder bubble (a deterministic color from the slug plus the
    site's initials), so the map always has a complete set of textures.

    The CDN is Cloudinary-backed, so we rewrite the transform in each URL to ask
    for a 256 square directly (less bandwidth than fetching the 9000px original);
    Pillow is the safety net that guarantees an exact 256x256 webp.

Input:   data/registry.json   (default; --registry to override)
Output:  assets/bubbles/{slug}.webp
         data/image-failures.txt

Usage:
    py -3.13 fetch_images.py
    py -3.13 fetch_images.py --registry data/registry.full.json

Local-first note: this is the one step that touches the network - a bulk image
fetch from the same CDN that served the original site. No paid APIs, no LLM.
"""
from __future__ import annotations

import argparse
import colorsys
import hashlib
import io
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import json
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
BUBBLES = HERE / "assets" / "bubbles"

SIZE = 256
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# Windows TrueType fonts for placeholder initials, in order of preference.
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\arial.ttf",
]


def small_url(url: str) -> str:
    """Rewrite a Cloudinary /upload/<transform>/ segment to a 256 square fill."""
    return re.sub(r"/upload/[^/]+/",
                  "/upload/c_fill,g_auto,h_256,w_256,f_auto,q_auto/",
                  url, count=1)


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def initials(rec: dict) -> str:
    words = [w for w in re.split(r"[\s/_-]+", rec.get("title") or rec["slug"]) if w]
    letters = [w[0] for w in words if w[0].isalnum()]
    if len(letters) >= 2:
        return (letters[0] + letters[1]).upper()
    base = re.sub(r"[^a-z0-9]", "", rec["slug"].lower())
    return (base[:2] or "??").upper()


def placeholder(rec: dict) -> Image.Image:
    h = int(hashlib.md5(rec["slug"].encode()).hexdigest(), 16)
    hue = (h % 360) / 360.0
    r, g, b = colorsys.hsv_to_rgb(hue, 0.55, 0.45)      # muted, dark-space friendly
    bg = (int(r * 255), int(g * 255), int(b * 255))
    img = Image.new("RGB", (SIZE, SIZE), bg)
    draw = ImageDraw.Draw(img)
    # Subtle planet ring.
    draw.ellipse([8, 8, SIZE - 8, SIZE - 8], outline=(255, 255, 255, 40), width=3)
    text = initials(rec)
    font = load_font(110)
    box = draw.textbbox((0, 0), text, font=font)
    tw, th = box[2] - box[0], box[3] - box[1]
    draw.text(((SIZE - tw) / 2 - box[0], (SIZE - th) / 2 - box[1]), text,
              fill=(245, 245, 245), font=font)
    return img


def square(img: Image.Image) -> Image.Image:
    img = img.convert("RGB")
    w, h = img.size
    m = min(w, h)
    left, top = (w - m) // 2, (h - m) // 2
    img = img.crop((left, top, left + m, top + m))
    return img.resize((SIZE, SIZE), Image.LANCZOS)


def fetch_one(client: httpx.Client, rec: dict) -> tuple[str, bool, str]:
    """Return (slug, ok, note). Always writes a webp (real image or placeholder)."""
    slug = rec["slug"]
    out = BUBBLES / f"{slug}.webp"
    url = rec.get("image_url") or ""
    if url:
        for candidate in (small_url(url), url):  # try the small variant, then original
            for attempt in range(2):             # 1 retry
                try:
                    resp = client.get(candidate, timeout=10.0,
                                      headers={"User-Agent": UA,
                                               "Referer": "https://spaceport.mystrikingly.com/"})
                    resp.raise_for_status()
                    img = square(Image.open(io.BytesIO(resp.content)))
                    img.save(out, "WEBP", quality=80, method=6)
                    return slug, True, "ok"
                except Exception as exc:  # noqa: BLE001 - any failure -> try next / placeholder
                    last = f"{type(exc).__name__}: {exc}"
    else:
        last = "no image_url"
    placeholder(rec).save(out, "WEBP", quality=80, method=6)
    return slug, False, last


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--registry", default=str(DATA / "registry.json"))
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    BUBBLES.mkdir(parents=True, exist_ok=True)
    records = json.loads(Path(args.registry).read_text(encoding="utf-8"))

    failures: list[str] = []
    ok = 0
    with httpx.Client(follow_redirects=True) as client:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for slug, good, note in pool.map(lambda r: fetch_one(client, r), records):
                if good:
                    ok += 1
                else:
                    failures.append(f"{slug}\t{note}")

    (DATA / "image-failures.txt").write_text(
        "\n".join(failures) or "(none)", encoding="utf-8")

    print("=" * 60)
    print("fetch_images.py")
    print(f"  sites           : {len(records)}")
    print(f"  fetched OK      : {ok}")
    print(f"  placeholders    : {len(failures)}  -> data/image-failures.txt")
    print(f"  output          : assets/bubbles/*.webp ({SIZE}px)")
    print("=" * 60)


if __name__ == "__main__":
    main()
