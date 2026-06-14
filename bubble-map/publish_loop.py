#!/usr/bin/env python3
"""
publish_loop.py - Continuously rebuild and deploy the archive while screenshots
are still being captured, so the live site grows and you can watch progress.

Runs alongside capture_visuals.py. Each cycle it:
  1. rebuilds the archive (build_archive.py) - picks up new screenshots, the
     recovered sites, the manifest, and the index;
  2. writes data/build-status.json (shown live on the map header);
  3. commits and pushes to main, which redeploys GitHub Pages.

Stops when the screenshot count stops growing (capture finished) or after
--max-cycles. The cadence stays under Pages' ~10 builds/hour limit.

Monitor at: https://alanshurafa.github.io/possibility-management/bubble-map/

Usage: py -3.13 publish_loop.py [--cycle-seconds 1200] [--max-cycles 48]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
DATA = HERE / "data"
SHOTS = HERE / "archive" / "assets" / "shots"
TOTAL = len(json.loads((DATA / "registry.json").read_text(encoding="utf-8")))


def run(cmd, cwd):
    return subprocess.run(cmd, cwd=str(cwd), text=True, capture_output=True)


def shots() -> int:
    return len(list(SHOTS.glob("*.jpg"))) if SHOTS.exists() else 0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--cycle-seconds", type=int, default=1200)  # 20 min
    ap.add_argument("--max-cycles", type=int, default=48)
    args = ap.parse_args()

    last, stable = -1, 0
    for cycle in range(args.max_cycles):
        build = run(["py", "-3.13", "build_archive.py"], HERE)
        if build.returncode != 0:
            print(f"cycle {cycle}: build FAILED\n{build.stderr[-500:]}")
        n = shots()
        (DATA / "build-status.json").write_text(
            json.dumps({"captured": n, "total": TOTAL, "cycle": cycle}), encoding="utf-8")

        run(["git", "add", "bubble-map/archive", "bubble-map/data"], REPO)
        commit = run(["git", "commit", "-m",
                      f"Publish archive: {n}/{TOTAL} screenshots (cycle {cycle})"], REPO)
        if "nothing to commit" in (commit.stdout + commit.stderr):
            print(f"cycle {cycle}: {n}/{TOTAL} shots, no change")
        else:
            run(["git", "pull", "--rebase", "origin", "main"], REPO)
            push = run(["git", "push", "origin", "main"], REPO)
            ok = push.returncode == 0
            print(f"cycle {cycle}: {n}/{TOTAL} shots -> {'pushed' if ok else 'PUSH FAILED: ' + push.stderr[-200:]}")

        stable = stable + 1 if n == last else 0
        last = n
        if stable >= 2 and cycle >= 2:
            print(f"shots stable at {n}; capture appears finished. stopping.")
            break
        time.sleep(args.cycle_seconds)

    print(f"publish_loop finished: {shots()}/{TOTAL} screenshots live")


if __name__ == "__main__":
    main()
