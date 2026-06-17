#!/usr/bin/env python3
"""
PM Bubble Map - local server launcher.

The interactive map loads its data from local files (registry, edges, layout).
Browsers block those loads when you open the page straight from disk (a security
rule called the file:// origin restriction), so the map needs to be served over
http://localhost. This script does that with nothing but a standard Python 3
install - no downloads, no internet, no third-party packages.

Usage:
    python serve.py            # serve this folder, open the map in your browser
    python serve.py 9000       # use a specific port instead of the default

Everything is served from your own copy of the files, so it works fully offline.
Press Ctrl+C to stop the server.
"""
import http.server
import socket
import sys
import webbrowser
from functools import partial
from pathlib import Path

DEFAULT_PORT = 8102
ROOT = Path(__file__).resolve().parent


def find_free_port(preferred):
    """Return `preferred` if it's free, otherwise the next open port above it."""
    for port in range(preferred, preferred + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            # connect_ex == 0 means something is already listening there.
            if probe.connect_ex(("127.0.0.1", port)) != 0:
                return port
    raise SystemExit(
        "No free port found between %d and %d. Pass one explicitly: "
        "python serve.py 9000" % (preferred, preferred + 49)
    )


def main():
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            raise SystemExit("Port must be a number, e.g. python serve.py 9000")

    port = find_free_port(port)

    # Make sure .webp images are served with the right type on every platform.
    # extensions_map is a class attribute, so set it on the class (not the partial).
    http.server.SimpleHTTPRequestHandler.extensions_map.setdefault(".webp", "image/webp")
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))

    url = "http://localhost:%d/" % port
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print("PM Bubble Map is running.")
        print("  Open this in your browser:  %s" % url)
        print("  (Individual sites live at   %s<site-name>/ )" % url)
        print("Serving your local copy - no internet needed. Press Ctrl+C to stop.")
        try:
            webbrowser.open(url)
        except Exception:
            pass  # Headless box or no default browser: the URL is printed above.
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
