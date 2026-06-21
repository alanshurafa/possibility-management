# Full Map Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the obsolete nested bubble-map archive on the cleanup branch with the verified full 3D Bubble Map archive, preserve the current Expand the Box training updates, and prepare a reviewed merge to `main`.

**Architecture:** Start from `origin/main` on branch `codex/full-map-cleanup`, remove the old `bubble-map/` tree, and copy the verified full archive layers from `C:\Users\alan\Project\pm-fullmap-deploy`. The resulting site publishes the repo root, redirects `/` and `/bubble-map/` to `/3d-bubble-map/`, serves archived sites from top-level folders such as `/4feelings/` and `/radicalresponsibility/`, and keeps the current Expand the Box course, infographic, and thoughtmap updates from the active local worktree.

**Tech Stack:** Static HTML/CSS/JavaScript, Three.js bundled under `3d-bubble-map/assets/vendor`, Python 3 for `scripts/update_map_data.py`, Netlify static redirects.

---

### Task 1: Confirm Source And Target State

**Files:**
- Read: `C:\Users\alan\Project\pm-fullmap-deploy\3d-bubble-map\index.html`
- Read: `C:\Users\alan\Project\pm-fullmap-deploy\data\registry.json`
- Read: `C:\Users\alan\Project\pm-fullmap-deploy\data\archive-manifest.json`
- Read: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\3d-bubble-map\index.html`
- Read: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\bubble-map\data\archive-manifest.json`

- [ ] **Step 1: Verify cleanup branch starts from current GitHub main**

Run:

```powershell
git -C "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup" status -sb
git -C "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup" rev-parse HEAD
git -C "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup" rev-parse origin/main
```

Expected: branch is `codex/full-map-cleanup`, status is clean except for this plan file once created, and `HEAD` matches `origin/main` before archive replacement.

- [ ] **Step 2: Verify full-map source has the expected features**

Run:

```powershell
Select-String -Path "C:\Users\alan\Project\pm-fullmap-deploy\3d-bubble-map\index.html" -Pattern "title-link|orbit-speed|<a id=""card"""
Select-String -Path "C:\Users\alan\Project\pm-fullmap-deploy\3d-bubble-map\app.js" -Pattern "DATA_ROOT = ""../""|orbitSpeedScale|cardLink.href"
```

Expected: output includes clickable header title links, the `orbit-speed` slider, a clickable `<a id="card">`, `DATA_ROOT = "../"`, `orbitSpeedScale`, and `cardLink.href`.

- [ ] **Step 3: Verify old target map is the stale nested archive**

Run:

```powershell
Select-String -Path "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\3d-bubble-map\app.js" -Pattern "DATA_ROOT"
Select-String -Path "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\3d-bubble-map\index.html" -Pattern "Orbit speed|title-link|archive-link"
```

Expected: target currently uses `DATA_ROOT = "../bubble-map/"`, lacks `Orbit speed` and `title-link`, and contains the old `archive-link`.

---

### Task 2: Replace Archive Layers

**Files:**
- Remove: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\bubble-map\`
- Replace: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\3d-bubble-map\`
- Replace: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\README.md`
- Replace: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\index.html`
- Replace: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\netlify.toml`
- Create/replace: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\data\`
- Create/replace: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\assets\bubbles\`
- Create/replace: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\_assets\`
- Create/replace: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\scripts\`
- Create/replace: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\_redirects`
- Create/replace: 925 top-level site folders listed in `data\archive-manifest.json`
- Preserve: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\courses\`
- Preserve: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\infographics\`
- Preserve: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\thoughtmaps\`
- Preserve: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\LICENSE`
- Preserve: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\.nojekyll`

- [ ] **Step 1: Remove only the obsolete nested archive**

Run:

```powershell
$target = "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\bubble-map"
$resolved = (Resolve-Path -LiteralPath $target).Path
if ($resolved -ne $target) { throw "Resolved target mismatch: $resolved" }
Remove-Item -LiteralPath $target -Recurse -Force
```

Expected: `bubble-map\` is gone from the cleanup branch only.

- [ ] **Step 2: Replace full-map shell and data layers**

Run:

```powershell
$source = "C:\Users\alan\Project\pm-fullmap-deploy"
$target = "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup"
$items = @(
  "3d-bubble-map",
  "data",
  "assets",
  "_assets",
  "scripts",
  "_redirects",
  "README.md",
  "index.html",
  "netlify.toml",
  "serve.py",
  "start-linux.sh",
  "start-mac.command",
  "start-windows.bat"
)
foreach ($item in $items) {
  $src = Join-Path $source $item
  $dst = Join-Path $target $item
  if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Recurse -Force }
  Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
}
```

Expected: map shell, data, deduped assets, scripts, and deploy metadata match `pm-fullmap-deploy`.

- [ ] **Step 3: Copy all top-level archived site folders from the manifest**

Run:

```powershell
$source = "C:\Users\alan\Project\pm-fullmap-deploy"
$target = "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup"
$manifest = Get-Content -Raw -LiteralPath (Join-Path $source "data\archive-manifest.json") | ConvertFrom-Json
$manifest.PSObject.Properties | ForEach-Object {
  $folder = ($_.Value -split "/")[0]
  $src = Join-Path $source $folder
  $dst = Join-Path $target $folder
  if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Recurse -Force }
  Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
}
```

Expected: the cleanup branch has top-level folders such as `4feelings`, `radicalresponsibility`, `spaceholder`, `spaceholdertraining`, and `spaceport`, each with an `index.html`.

---

### Task 3: Regenerate And Validate Map Metadata

**Files:**
- Modify: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\scripts\update_map_data.py`
- Modify: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\data\archive-manifest.json`
- Modify: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\data\registry.json`
- Modify: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\_redirects`

- [ ] **Step 1: Exclude preserved mainline adjunct folders from archive metadata**

Patch `EXCLUDED_DIRS` in `scripts\update_map_data.py` so preserved folders like `infographics`, `thoughtmaps`, `courses`, `tools`, `_shared`, and `docs` are not mistaken for full-map archive sites.

Expected: preserved current-main content remains in the repo, but the 3D Bubble Map metadata stays aligned to the verified full archive.

- [ ] **Step 2: Run the metadata generator**

Run:

```powershell
python "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\scripts\update_map_data.py"
```

Expected: command exits `0` and regenerates `data\archive-manifest.json`, `data\registry.json`, and `_redirects`.

- [ ] **Step 3: Verify expected counts and sample paths**

Run:

```powershell
$root = "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup"
$manifest = Get-Content -Raw -LiteralPath (Join-Path $root "data\archive-manifest.json") | ConvertFrom-Json
$registry = Get-Content -Raw -LiteralPath (Join-Path $root "data\registry.json") | ConvertFrom-Json
$siteDirs = Get-ChildItem -LiteralPath $root -Directory -Force | Where-Object {
  (Test-Path -LiteralPath (Join-Path $_.FullName "index.html")) -and
  ($_.Name -ne "3d-bubble-map")
}
[pscustomobject]@{
  ManifestEntries = ($manifest.PSObject.Properties | Measure-Object).Count
  RegistryEntries = $registry.Count
  TopLevelSiteFolders = ($siteDirs | Measure-Object).Count
  Has4Feelings = Test-Path -LiteralPath (Join-Path $root "4feelings\index.html")
  HasRadicalResponsibility = Test-Path -LiteralPath (Join-Path $root "radicalresponsibility\index.html")
  HasSpaceholder = Test-Path -LiteralPath (Join-Path $root "spaceholder\index.html")
  HasOrbitSpeed = Select-String -Path (Join-Path $root "3d-bubble-map\index.html") -Pattern "orbit-speed" -Quiet
  HasClickableHeader = Select-String -Path (Join-Path $root "3d-bubble-map\index.html") -Pattern "title-link" -Quiet
}
```

Expected: manifest count is 925, registry count is at least 925, top-level site folders is at least 925, sample site paths are present, and both UI feature checks are `True`.

---

### Task 4: Local Runtime Verification

**Files:**
- Read: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\index.html`
- Read: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\3d-bubble-map\index.html`
- Read: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\4feelings\index.html`

- [ ] **Step 1: Start a local static server**

Run:

```powershell
$root = "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup"
$port = 8126
$proc = Start-Process -FilePath python -ArgumentList @("-m", "http.server", "$port", "--directory", $root) -PassThru -WindowStyle Hidden
$proc.Id | Set-Content -LiteralPath (Join-Path $root ".server.pid")
```

Expected: server process starts and `.server.pid` contains a process id.

- [ ] **Step 2: Verify local pages respond**

Run:

```powershell
$port = 8126
$urls = @(
  "http://127.0.0.1:$port/",
  "http://127.0.0.1:$port/3d-bubble-map/",
  "http://127.0.0.1:$port/data/registry.json",
  "http://127.0.0.1:$port/4feelings/",
  "http://127.0.0.1:$port/radicalresponsibility/",
  "http://127.0.0.1:$port/spaceholder/",
  "http://127.0.0.1:$port/spaceport/"
)
foreach ($url in $urls) {
  $response = Invoke-WebRequest -Uri $url -UseBasicParsing -MaximumRedirection 0
  [pscustomobject]@{ Url = $url; Status = [int]$response.StatusCode; Bytes = $response.RawContentLength }
}
```

Expected: each URL returns HTTP `200` or the root returns its static redirect shell. Each page has nonzero byte length.

- [ ] **Step 3: Stop the local server**

Run:

```powershell
$root = "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup"
$pidPath = Join-Path $root ".server.pid"
if (Test-Path -LiteralPath $pidPath) {
  $serverPid = [int](Get-Content -LiteralPath $pidPath)
  Stop-Process -Id $serverPid -Force
  Remove-Item -LiteralPath $pidPath -Force
}
```

Expected: the server process is stopped and `.server.pid` is removed.

---

### Task 5: Review, Commit, And Push

**Files:**
- Review: all changed files in `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup`

- [ ] **Step 1: Review the git summary**

Run:

```powershell
git -C "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup" status -sb
git -C "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup" diff --stat -- . ":(exclude)_assets/**" ":(exclude)assets/bubbles/**"
```

Expected: large additions for top-level site folders and `_assets`, deletion of `bubble-map/`, updates to `3d-bubble-map/`, `data/`, `README.md`, `index.html`, `netlify.toml`, `_redirects`, and new scripts.

- [ ] **Step 2: Stage and commit**

Run:

```powershell
git -C "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup" add -A
git -C "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup" commit -m "Replace stale bubble archive with full 3D map"
```

Expected: commit succeeds on `codex/full-map-cleanup`.

- [ ] **Step 3: Push branch**

Run:

```powershell
git -C "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup" push -u origin codex/full-map-cleanup
```

Expected: branch pushes to GitHub. Do not merge into `main` in this step.

---

### Self-Review

- Spec coverage: This plan identifies the correct full-map source, removes only the obsolete nested archive, copies the verified full archive files into a branch based on current GitHub `main`, preserves the current Expand the Box training updates, regenerates metadata, verifies local runtime behavior, and prepares a pushed branch for review and merge.
- Placeholder scan: No TBD/TODO/fill-in placeholders are used.
- Scope control: The plan preserves `courses/`, `infographics/`, `thoughtmaps/`, `LICENSE`, and `.nojekyll` because the user asked to remove old bubble-map files, not unrelated mainline content.

---

### Task 6: Preserve Expand the Box Training Updates

**Files:**
- Replace from source worktree: `C:\Users\alan\.codex\worktrees\8e90\possibility-management\courses\maps-and-processes-from-expand-the-box\`
- Replace from source worktree: `C:\Users\alan\.codex\worktrees\8e90\possibility-management\infographics\`
- Replace from source worktree: `C:\Users\alan\.codex\worktrees\8e90\possibility-management\thoughtmaps\`
- Modify in cleanup branch: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\courses\maps-and-processes-from-expand-the-box\`
- Modify in cleanup branch: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\infographics\`
- Modify in cleanup branch: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\thoughtmaps\`

- [x] **Step 1: Copy only Expand the Box-related content from the dirty local worktree**

Run:

```powershell
$sourceRoot = "C:\Users\alan\.codex\worktrees\8e90\possibility-management"
$targetRoot = "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup"
$items = @(
  "courses\maps-and-processes-from-expand-the-box",
  "infographics",
  "thoughtmaps"
)
foreach ($item in $items) {
  $src = Join-Path $sourceRoot $item
  $dst = Join-Path $targetRoot $item
  if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Recurse -Force }
  Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
}
```

Expected: only the Expand the Box course, infographic, and thoughtmap updates are copied. Dirty changes to the old `bubble-map/`, stale `3d-bubble-map/`, root `index.html`, `.gitignore`, and perf tooling are not copied.

- [x] **Step 2: Verify the Expand the Box URLs locally**

Run against the local preview server:

```powershell
$port = 8127
$urls = @(
  "http://127.0.0.1:$port/courses/maps-and-processes-from-expand-the-box/",
  "http://127.0.0.1:$port/Course/module-00.html",
  "http://127.0.0.1:$port/Course/module-05.html",
  "http://127.0.0.1:$port/Interactive%20Tools/index.html",
  "http://127.0.0.1:$port/Interactive%20Tools/Day%2003/centering-practice.html",
  "http://127.0.0.1:$port/Interactive%20Tools/Day%2006/ehp-walker.html",
  "http://127.0.0.1:$port/Map%20Atlas/index.html",
  "http://127.0.0.1:$port/Map%20Atlas/M01%20-%20New%20Context%20(the%20chain).html",
  "http://127.0.0.1:$port/infographics/",
  "http://127.0.0.1:$port/infographics/teaching/4-listenings.html",
  "http://127.0.0.1:$port/thoughtmaps/",
  "http://127.0.0.1:$port/thoughtmaps/atlas/M01%20-%20New%20Context%20(the%20chain).html"
)
foreach ($url in $urls) {
  $response = Invoke-WebRequest -Uri $url -UseBasicParsing
  [pscustomobject]@{ Url = $url; Status = [int]$response.StatusCode; Bytes = $response.RawContentLength }
}
```

Expected: every URL returns HTTP `200`, nonzero bytes, and no local image request returns `404`.

- [x] **Step 3: Commit the Expand the Box update**

Run:

```powershell
git -C "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup" add courses/maps-and-processes-from-expand-the-box infographics thoughtmaps
git -C "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup" commit -m "Add Expand the Box training media updates"
```

Expected: commit succeeds and includes the current course, infographic, and thoughtmap media updates.

---

### Task 7: MoTest Review And Merge To Main

**Files:**
- Review: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\3d-bubble-map\index.html`
- Review: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\3d-bubble-map\app.js`
- Review: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\data\registry.json`
- Review: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\data\archive-manifest.json`
- Review: `C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup\courses\maps-and-processes-from-expand-the-box\index.html`

- [x] **Step 1: Push the complete branch to GitHub**

Run:

```powershell
git -C "C:\Users\alan\.codex\worktrees\8e90\full-map-cleanup" push -u origin codex/full-map-cleanup
gh pr view 5 --json number,isDraft,state,url,commits
```

Expected: PR #5 contains commits `d63f5e2c Replace stale bubble archive with full 3D map` and `6a4db23d Add Expand the Box training media updates`.

- [ ] **Step 2: Complete manual MoTest in the browser**

Open:

```text
http://127.0.0.1:8127/3d-bubble-map/
http://127.0.0.1:8127/courses/maps-and-processes-from-expand-the-box/
```

Expected on the 3D Bubble Map: the map renders, the orbit speed slider is visible and usable, the StartOver and Spaceport banner/title links are clickable, sample bubbles open pages such as `/4feelings/`, `/radicalresponsibility/`, `/spaceholder/`, and `/spaceport/`, and the page reports `925 sites`.

Expected on Expand the Box: the updated course shell, media, interactive tools, map atlas, infographics, and thoughtmaps load without missing-image placeholders.

- [ ] **Step 3: Mark the PR ready after manual MoTest passes**

Run:

```powershell
gh pr ready 5
```

Expected: PR #5 changes from draft to ready for review.

- [ ] **Step 4: Merge PR #5 into `main`**

Run:

```powershell
gh pr merge 5 --merge --delete-branch
```

Expected: GitHub merges `codex/full-map-cleanup` into `main` with the cleanup commits and deletes the remote branch after merge.

- [ ] **Step 5: Verify production after deploy**

Open:

```text
https://possibilitymanagement.xyz/3d-bubble-map/
https://possibilitymanagement.xyz/4feelings/
https://possibilitymanagement.xyz/radicalresponsibility/
https://possibilitymanagement.xyz/spaceholder/
https://possibilitymanagement.xyz/courses/maps-and-processes-from-expand-the-box/
```

Expected: production serves the new map, top-level archive pages, and Expand the Box training pages. `/bubble-map/` redirects to `/3d-bubble-map/` instead of serving stale nested archive content.
