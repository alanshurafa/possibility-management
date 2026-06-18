/* PM Bubble Map — sigma.js v3 constellation renderer.
 * Loads data/registry.json + data/edges.json + data/layout.json, builds a
 * graphology graph, and renders image-bubble nodes with hover highlighting,
 * search, an A–Z rail, and a curated/organic edge toggle. */
(function () {
  "use strict";

  const Graph = window.graphology.DirectedGraph;
  const SigmaCtor = window.Sigma; // UMD: the renderer class itself
  const { createNodeImageProgram } = window.Sigma.rendering;

  const CURATED = "rgba(110, 180, 220, 0.15)";
  const ORGANIC = "rgba(157, 140, 208, 0.08)";
  const HILITE = "rgba(125, 211, 252, 0.95)";
  const FADE_N = "#1b2238";

  const $ = (id) => document.getElementById(id);

  function letterOf(title) {
    const c = (title || "").trim().charAt(0).toUpperCase();
    return c >= "A" && c <= "Z" ? c : "#";
  }

  async function main() {
    let registry, edges, layout, archiveManifest;
    try {
      [registry, edges, layout, archiveManifest] = await Promise.all([
        fetch("data/registry.json").then((r) => r.json()),
        fetch("data/edges.json").then((r) => r.json()),
        fetch("data/layout.json").then((r) => r.json()),
        fetch("data/archive-manifest.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      ]);
    } catch (err) {
      $("loading").textContent = "Failed to load data: " + err.message;
      return;
    }

    const graph = new Graph();
    const byId = {};
    for (const site of registry) {
      byId[site.slug] = site;
      const pos = layout[site.slug] || [500, 500];
      graph.addNode(site.slug, {
        x: pos[0],
        y: pos[1],
        size: 6, // refined below by degree
        label: site.title,
        image: site.bubble_image || "assets/bubbles/" + site.slug + ".webp",
        type: "image",
        color: "#0b1430",
        url: archiveManifest[site.slug] || site.live_url || site.url,
        archived: !!archiveManifest[site.slug],
        tagline: site.tagline || "",
        letter: letterOf(site.title),
      });
    }

    let curatedCount = 0;
    let organicCount = 0;
    for (const e of edges) {
      if (!graph.hasNode(e.src) || !graph.hasNode(e.tgt)) continue;
      const curated = e.type === "curated";
      if (curated) curatedCount++; else organicCount++;
      graph.mergeEdge(e.src, e.tgt, {
        size: curated ? 1.1 : 0.7,
        color: curated ? CURATED : ORGANIC,
        etype: e.type,
      });
    }

    // Size nodes by degree within the sample graph.
    let maxDeg = 1;
    graph.forEachNode((n) => (maxDeg = Math.max(maxDeg, graph.degree(n))));
    graph.forEachNode((n) => {
      const d = graph.degree(n);
      graph.setNodeAttribute(n, "size", 7 + 15 * Math.sqrt(d / maxDeg));
    });

    $("counts").innerHTML =
      registry.length + " sites · " + curatedCount + " curated + " +
      organicCount + " organic links";

    // Live build progress (written by publish_loop.py on each deploy cycle).
    fetch("data/build-status.json").then((r) => (r.ok ? r.json() : null)).then((s) => {
      if (s && $("build-status"))
        $("build-status").textContent =
          "Backup: " + s.captured + "/" + s.total + " bubbles open a local copy";
    }).catch(() => {});

    // ---- Render ----
    let showOrganic = false;
    let hovered = null;
    let neighbors = new Set();
    let filter = null; // Set of slugs to keep visible, or null
    let pinned = null; // clicked node: isolate to only its connections
    let pinnedSet = new Set();

    const renderer = new SigmaCtor(graph, $("sigma-container"), {
      nodeProgramClasses: { image: createNodeImageProgram() },
      defaultEdgeColor: CURATED,
      labelColor: { color: "#cbd5e1" },
      labelFont: "'Inter', system-ui, 'Segoe UI', sans-serif",
      labelSize: 12,
      labelWeight: "600",
      labelRenderedSizeThreshold: 9,
      labelDensity: 0.5,
      labelGridCellSize: 70,
      minCameraRatio: 0.25,
      maxCameraRatio: 2.2,
      zIndex: true,
    });

    renderer.setSetting("nodeReducer", (node, data) => {
      const res = Object.assign({}, data);
      if (filter && !filter.has(node)) { res.hidden = true; return res; }
      if (pinned && !pinnedSet.has(node)) { res.hidden = true; return res; }
      if (pinned) {
        if (node === pinned) { res.size = data.size * 1.55; res.zIndex = 3; }
        else { res.zIndex = 2; }
      } else if (hovered) {
        if (node === hovered) { res.size = data.size * 1.55; res.zIndex = 3; }
        else if (neighbors.has(node)) { res.zIndex = 2; }
        else { res.size = data.size * 0.72; res.color = FADE_N; res.label = ""; res.zIndex = 0; }
      }
      return res;
    });

    renderer.setSetting("edgeReducer", (edge, data) => {
      const res = Object.assign({}, data);
      if (data.etype === "organic" && !showOrganic) { res.hidden = true; return res; }
      const [s, t] = graph.extremities(edge);
      if (filter && (!filter.has(s) || !filter.has(t))) { res.hidden = true; return res; }
      if (pinned) {
        if (s === pinned || t === pinned) {
          res.color = HILITE; res.size = (data.size || 1) + 0.6; res.zIndex = 2;
        } else { res.hidden = true; }
        return res;
      }
      if (hovered) {
        if (s === hovered || t === hovered) {
          res.color = HILITE; res.size = (data.size || 1) + 0.6; res.zIndex = 2;
        } else {
          res.color = "rgba(90, 100, 140, 0.05)";
        }
      }
      return res;
    });

    // Neighbors reachable via currently-visible edges (respects the organic toggle),
    // so isolating a hub doesn't pull in its hidden organic links.
    function neighborsVisible(node) {
      const set = new Set([node]);
      graph.forEachEdge(node, (e, a, s, t) => {
        if (a.etype === "organic" && !showOrganic) return;
        set.add(s === node ? t : s);
      });
      return set;
    }

    // ---- Hover card + neighborhood highlight ----
    const card = $("card");
    function showCard(node) {
      const s = byId[node];
      $("card-img").src = s.bubble_image || "assets/bubbles/" + node + ".webp";
      $("card-title").textContent = s.title;
      $("card-slug").textContent = s.display_host || hostForSite(s);
      $("card-tag").textContent = s.tagline || "";
      $("card-hint").textContent = graph.getNodeAttribute(node, "archived")
        ? "Double-click to open the local backup ↗"
        : "Double-click to open the live site ↗";
      card.classList.add("show");
    }
    renderer.on("enterNode", ({ node }) => {
      hovered = node;
      neighbors = neighborsVisible(node);
      showCard(node);
      renderer.refresh();
      document.body.style.cursor = "pointer";
    });
    renderer.on("leaveNode", () => {
      hovered = null; neighbors = new Set();
      card.classList.remove("show");
      renderer.refresh();
      document.body.style.cursor = "default";
    });

    function hostForSite(site) {
      try {
        return new URL(site.live_url || site.url).host;
      } catch (_) {
        return site.slug + ".possibilitymanagement.xyz";
      }
    }
    renderer.on("doubleClickNode", ({ node, event }) => {
      if (event && event.preventSigmaDefault) event.preventSigmaDefault();
      const url = graph.getNodeAttribute(node, "url");
      if (url) window.open(url, "_blank", "noopener");
    });

    // Single click isolates a node's connections; click empty space (or Reset) to clear.
    function setPinned(node) {
      pinned = node;
      pinnedSet = node ? neighborsVisible(node) : new Set();
      if (node) showCard(node); else card.classList.remove("show");
      renderer.refresh();
    }
    renderer.on("clickNode", ({ node }) => setPinned(node));
    renderer.on("clickStage", () => { if (pinned) setPinned(null); });

    // ---- Search ----
    function applySearch(q) {
      q = q.trim().toLowerCase();
      if (!q) { filter = null; }
      else {
        filter = new Set();
        graph.forEachNode((n) => {
          const s = byId[n];
          if (s.slug.toLowerCase().includes(q) || (s.title || "").toLowerCase().includes(q))
            filter.add(n);
        });
      }
      clearRailActive();
      renderer.refresh();
    }
    $("search").addEventListener("input", (e) => applySearch(e.target.value));

    // ---- A–Z rail ----
    const present = new Set();
    graph.forEachNode((n) => present.add(graph.getNodeAttribute(n, "letter")));
    const rail = $("rail");
    const letters = ["#"].concat("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));
    function clearRailActive() {
      rail.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    }
    for (const L of letters) {
      const b = document.createElement("button");
      b.textContent = L;
      const has = present.has(L);
      b.dataset.has = has ? "1" : "0";
      if (!has) b.disabled = true;
      b.addEventListener("click", () => {
        const isActive = b.classList.contains("active");
        clearRailActive();
        $("search").value = "";
        if (isActive) { filter = null; renderer.refresh(); return; }
        b.classList.add("active");
        filter = new Set();
        graph.forEachNode((n) => {
          if (graph.getNodeAttribute(n, "letter") === L) filter.add(n);
        });
        focusOn([...filter]);
        renderer.refresh();
      });
      rail.appendChild(b);
    }

    function focusOn(nodes) {
      // Center the camera on the centroid of the matching nodes (display space).
      let x = 0, y = 0, k = 0;
      for (const n of nodes) {
        const d = renderer.getNodeDisplayData(n);
        if (d) { x += d.x; y += d.y; k++; }
      }
      if (!k) return;
      renderer.getCamera().animate({ x: x / k, y: y / k, ratio: 0.55 }, { duration: 350 });
    }

    // ---- Controls ----
    $("toggle-organic").addEventListener("change", (e) => {
      showOrganic = e.target.checked;
      if (pinned) pinnedSet = neighborsVisible(pinned);
      if (hovered) neighbors = neighborsVisible(hovered);
      renderer.refresh();
    });
    $("reset").addEventListener("click", () => {
      filter = null;
      pinned = null; pinnedSet = new Set();
      card.classList.remove("show");
      $("search").value = "";
      clearRailActive();
      renderer.getCamera().animatedReset();
      renderer.refresh();
    });

    $("loading").style.display = "none";
    starfield();
  }

  // Decorative starfield (deterministic, seeded) drawn as SVG circles.
  function starfield() {
    const svg = document.getElementById("stars");
    const W = window.innerWidth, H = window.innerHeight;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    let seed = 1337;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let html = "";
    for (let i = 0; i < 180; i++) {
      const x = (rnd() * W).toFixed(1), y = (rnd() * H).toFixed(1);
      const r = (rnd() * 1.3 + 0.2).toFixed(2);
      const o = (rnd() * 0.6 + 0.15).toFixed(2);
      html += `<circle cx="${x}" cy="${y}" r="${r}" fill="#cfe0ff" opacity="${o}"/>`;
    }
    svg.innerHTML = html;
  }

  main().catch(function (err) {
    var el = document.getElementById("loading");
    if (el) { el.textContent = "ERROR: " + (err && err.message); el.style.color = "#ff8a8a"; }
    console.error("main() failed:", err);
  });
})();
