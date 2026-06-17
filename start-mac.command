#!/bin/bash
# Double-click this file to open the PM Bubble Map on macOS.
# It just starts the local server (serve.py) using your installed Python 3.
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
    exec python3 serve.py
else
    echo
    echo "Python 3 is required but was not found."
    echo "Install it from https://www.python.org/downloads/ and double-click this again."
    echo
    read -r -n 1 -p "Press any key to close..."
fi
