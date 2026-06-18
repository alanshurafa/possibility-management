#!/usr/bin/env python3
"""Register archived site subdomains as Netlify domain aliases.

Cloudflare provides the wildcard DNS record. Netlify still needs to know about
each hostname unless wildcard subdomains are enabled for the site, so this helper
adds concrete aliases for newly added archive folders.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request


DOMAIN = os.environ.get("PM_DOMAIN", "possibilitymanagement.xyz")
SITE_ID = os.environ.get("NETLIFY_SITE_ID", "ecde882e-bd83-4d05-a0e9-0eaba83e311f")
TOKEN = os.environ.get("NETLIFY_AUTH_TOKEN")
API_BASE = "https://api.netlify.com/api/v1"
SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")


def request(method: str, path: str, body: dict | None = None) -> dict:
    if not TOKEN:
        raise SystemExit("NETLIFY_AUTH_TOKEN is required to sync subdomain aliases")

    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(
        f"{API_BASE}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "pm-fullmap-subdomain-sync",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        message = error.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Netlify API {method} {path} failed: {error.code} {message}") from error


def aliases_for(slugs: list[str]) -> list[str]:
    aliases = []
    for slug in slugs:
        slug = slug.strip().lower()
        if not slug or not SLUG_RE.fullmatch(slug):
            print(f"Skipping invalid DNS slug: {slug}", file=sys.stderr)
            continue
        aliases.append(f"{slug}.{DOMAIN}")
    return aliases


def main(argv: list[str]) -> None:
    desired = aliases_for(argv)
    if not desired:
        print("No Netlify subdomain aliases to sync.")
        return

    site = request("GET", f"/sites/{SITE_ID}")
    current = list(site.get("domain_aliases") or [])
    current_set = set(current)
    missing = [alias for alias in desired if alias not in current_set]

    if not missing:
        print("Netlify subdomain aliases already present.")
        return

    updated_aliases = current + missing
    request("PATCH", f"/sites/{SITE_ID}", {"domain_aliases": updated_aliases})
    print("Added Netlify subdomain aliases:")
    for alias in missing:
        print(f"- {alias}")


if __name__ == "__main__":
    main(sys.argv[1:])
