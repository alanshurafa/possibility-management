#!/bin/bash
# Run this to open the PM Bubble Map on Linux:  ./start-linux.sh
# It just starts the local server (serve.py) using your installed Python 3.
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
    exec python3 serve.py
else
    echo "Python 3 is required but was not found. Install it with your package manager"
    echo "(e.g. 'sudo apt install python3') and run this again."
    exit 1
fi
