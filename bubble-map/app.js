/* PM 2D Bubble Map - sigma.js constellation renderer.
 * Loads the existing data files and renders textured site bubbles with
 * 3D-map-equivalent controls where the 2D engine supports them. */
(function () {
  "use strict";

  const Graph = window.graphology.MultiDirectedGraph || window.graphology.DirectedGraph;
  const SigmaCtor = window.Sigma;
  const { createNodeImageProgram } = window.Sigma.rendering;

  const CURATED = "#111827";
  const ORGANIC = "#0c111a";
  const RADICAL_ORBIT = "#172033";
  const HILITE = "rgba(255, 255, 255, 0.92)";
  const FADE_N = "#151b2d";
  const RADICAL_RESPONSIBILITY_SLUG = "radicalresponsibility";
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const DEFAULT_CAMERA_RATIO = 0.62;
  const MAX_MAP_RADIUS = 1550;

  const DEFAULT_SETTINGS = {
    showCurated: true,
    showOrganic: true,
    radicalOrbit: true,
    sizeByLinks: true,
    bubbleScale: 1,
    spreadScale: 1,
    zoom: "175",
    tension: "0",
    bubbleSize: "100",
    bubbleSpacing: "100"
  };

  const $ = (id) => document.getElementById(id);

  const state = {
    showCurated: DEFAULT_SETTINGS.showCurated,
    showOrganic: DEFAULT_SETTINGS.showOrganic,
    radicalOrbit: DEFAULT_SETTINGS.radicalOrbit,
    sizeByLinks: DEFAULT_SETTINGS.sizeByLinks,
    bubbleScale: DEFAULT_SETTINGS.bubbleScale,
    spreadScale: DEFAULT_SETTINGS.spreadScale,
    hovered: null,
    neighbors: new Set(),
    filter: null,
    pinned: null,
    pinnedSet: new Set()
  };

  const meta = new Map();
  let graph;
  let renderer;
  let camera;
  let byId = {};
  let maxDegree = 1;
  let animationStarted = false;

  function letterOf(title) {
    const c = (title || "").trim().charAt(0).toUpperCase();
    return c >= "A" && c <= "Z" ? c : "#";
  }

  function hashString(value) {
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function tensionFromSlider(value) {
    const raw = Number(value) / 100;
    if (raw <= 0) return 0;
    if (raw >= 0.68) return raw;
    return 0.68 * Math.pow(raw / 0.68, 3);
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

    buildGraph(registry, edges, layout, archiveManifest);
    updateCounts(registry.length);
    fetchBuildStatus();
    buildRenderer();
    buildRail();
    buildControls();
    applyInitialView();
    $("loading").style.display = "none";
    starfield();
    window.addEventListener("resize", starfield);
    startAnimation();
  }

  function buildGraph(registry, edges, layout, archiveManifest) {
    graph = new Graph();
    byId = {};
    meta.clear();

    const slugs = new Set(registry.map((site) => site.slug));
    const degree = new Map();
    const layoutValues = Object.keys(layout).map((slug) => layout[slug]);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    layoutValues.forEach((pos) => {
      minX = Math.min(minX, pos[0]);
      maxX = Math.max(maxX, pos[0]);
      minY = Math.min(minY, pos[1]);
      maxY = Math.max(maxY, pos[1]);
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    edges.forEach((edge) => {
      if (!slugs.has(edge.src) || !slugs.has(edge.tgt)) return;
      degree.set(edge.src, (degree.get(edge.src) || 0) + 1);
      degree.set(edge.tgt, (degree.get(edge.tgt) || 0) + 1);
    });

    maxDegree = 1;
    degree.forEach((value) => { maxDegree = Math.max(maxDegree, value); });

    registry.forEach((site) => {
      byId[site.slug] = site;
      const pos = layout[site.slug] || [centerX, centerY];
      const d = degree.get(site.slug) || 0;
      const degreeRatio = d / maxDegree;
      const linkSize = 4.5 + 28 * Math.pow(degreeRatio, 0.64);
      const uniformSize = 14;
      const baseX = pos[0] - centerX;
      const baseY = centerY - pos[1];
      const nodeMeta = {
        slug: site.slug,
        degree: d,
        baseX,
        baseY,
        homeX: baseX,
        homeY: baseY,
        x: baseX,
        y: baseY,
        vx: 0,
        vy: 0,
        linkSize,
        uniformSize,
        size: linkSize,
        orbitAngle: 0,
        orbitDistance: 520,
        orbitSpeed: 0.04,
        orbitPhase: 0
      };
      meta.set(site.slug, nodeMeta);

      graph.addNode(site.slug, {
        x: nodeMeta.x,
        y: nodeMeta.y,
        size: nodeMeta.size,
        label: site.title || site.slug,
        image: "assets/bubbles/" + site.slug + ".webp",
        type: "image",
        color: "#0b1430",
        url: archiveManifest[site.slug] || site.live_url || site.url,
        archived: !!archiveManifest[site.slug],
        tagline: site.tagline || "",
        letter: letterOf(site.title),
        realDegree: d
      });
    });

    let edgeIndex = 0;
    edges.forEach((edge) => {
      if (!graph.hasNode(edge.src) || !graph.hasNode(edge.tgt)) return;
      const curated = edge.type === "curated";
      graph.mergeEdge(edge.src, edge.tgt, {
        size: curated ? 0.12 : 0.08,
        color: curated ? CURATED : ORGANIC,
        etype: curated ? "curated" : "organic",
        real: true,
        originalIndex: edgeIndex++
      });
    });

    const hub = RADICAL_RESPONSIBILITY_SLUG;
    if (graph.hasNode(hub)) {
      graph.forEachNode((node) => {
        if (node === hub) return;
        const key = "radicalOrbit:" + node;
        if (graph.hasEdge(key)) return;
        graph.addDirectedEdgeWithKey(key, node, hub, {
          size: 0.1,
          color: RADICAL_ORBIT,
          etype: "radicalOrbit",
          real: false
        });
      });
    }

    updateNodeSizes();
    assignRadicalOrbitSlots();
  }

  function assignRadicalOrbitSlots() {
    const hub = meta.get(RADICAL_RESPONSIBILITY_SLUG);
    const orbitNodes = Array.from(meta.values())
      .filter((node) => node !== hub)
      .sort((a, b) => b.degree - a.degree || a.slug.localeCompare(b.slug));
    const count = Math.max(1, orbitNodes.length - 1);

    orbitNodes.forEach((node, index) => {
      const hash = hashString(node.slug);
      const shell = index % 5;
      const rank = index / count;
      const degreeRatio = node.degree / maxDegree;
      const angleJitter = (((hash >>> 8) % 1000) / 1000 - 0.5) * 0.42;
      const distanceJitter = ((hash >>> 19) % 110) - 55;

      node.orbitAngle = index * GOLDEN_ANGLE + angleJitter;
      node.orbitDistance =
        255 +
        shell * 92 +
        (1 - Math.pow(degreeRatio, 0.56)) * 145 +
        Math.sin(rank * Math.PI * 5.5) * 34 +
        distanceJitter +
        node.size * 2.4;
      node.orbitSpeed = 0.024 + ((hash >>> 11) % 100) / 4200;
      node.orbitPhase = ((hash >>> 17) % 6283) / 1000;
    });
  }

  function buildRenderer() {
    renderer = new SigmaCtor(graph, $("sigma-container"), {
      nodeProgramClasses: { image: createNodeImageProgram() },
      defaultEdgeColor: CURATED,
      labelColor: { color: "#f5fbff" },
      labelFont: "'Inter', system-ui, 'Segoe UI', sans-serif",
      labelSize: 12,
      labelWeight: "900",
      labelRenderedSizeThreshold: 7,
      labelDensity: 0.86,
      labelGridCellSize: 58,
      minCameraRatio: 0.12,
      maxCameraRatio: 5,
      zIndex: true,
    });

    camera = renderer.getCamera();
    renderer.setSetting("nodeReducer", nodeReducer);
    renderer.setSetting("edgeReducer", edgeReducer);
    wireNodeEvents();
  }

  function nodeReducer(node, data) {
    const res = Object.assign({}, data);
    if (!nodeAllowed(node)) {
      res.hidden = true;
      return res;
    }

    if (state.radicalOrbit && node === RADICAL_RESPONSIBILITY_SLUG) {
      res.size = Math.max(data.size * 2.25, 46 * state.bubbleScale);
      res.label = data.label;
      res.zIndex = 5;
      return res;
    }

    if (state.pinned) {
      if (node === state.pinned) {
        res.size = data.size * 1.55;
        res.zIndex = 4;
      } else {
        res.zIndex = 2;
      }
    } else if (state.hovered) {
      if (node === state.hovered) {
        res.size = data.size * 1.55;
        res.zIndex = 4;
      } else if (state.neighbors.has(node)) {
        res.zIndex = 2;
      } else {
        res.size = data.size * 0.72;
        res.color = FADE_N;
        res.label = "";
        res.zIndex = 0;
      }
    }

    return res;
  }

  function edgeReducer(edge, data) {
    const res = Object.assign({}, data);
    const [source, target] = graph.extremities(edge);

    if (data.etype === "curated" && !state.showCurated) {
      res.hidden = true;
      return res;
    }
    if (data.etype === "organic" && !state.showOrganic) {
      res.hidden = true;
      return res;
    }
    if (data.etype === "radicalOrbit" && !state.radicalOrbit) {
      res.hidden = true;
      return res;
    }
    if (!nodeAllowed(source) || !nodeAllowed(target)) {
      res.hidden = true;
      return res;
    }

    if (state.pinned) {
      if (source === state.pinned || target === state.pinned) {
        res.color = HILITE;
        res.size = (data.size || 1) + 0.5;
        res.zIndex = 3;
      } else {
        res.hidden = true;
      }
      return res;
    }

    if (state.hovered) {
      if (source === state.hovered || target === state.hovered) {
        res.color = HILITE;
        res.size = (data.size || 1) + 0.5;
        res.zIndex = 3;
      } else {
        res.color = "#090d14";
      }
    }

    return res;
  }

  function wireNodeEvents() {
    const card = $("card");
    renderer.on("enterNode", ({ node }) => {
      state.hovered = node;
      state.neighbors = neighborsVisible(node);
      showCard(node);
      renderer.refresh();
      document.body.style.cursor = "pointer";
    });
    renderer.on("leaveNode", () => {
      state.hovered = null;
      state.neighbors = new Set();
      card.classList.remove("show");
      renderer.refresh();
      document.body.style.cursor = "default";
    });
    renderer.on("doubleClickNode", ({ node, event }) => {
      if (event && event.preventSigmaDefault) event.preventSigmaDefault();
      const url = graph.getNodeAttribute(node, "url");
      if (url) window.open(url, "_blank", "noopener");
    });
    renderer.on("clickNode", ({ node }) => setPinned(node));
    renderer.on("clickStage", () => {
      if (state.pinned) setPinned(null);
    });
  }

  function showCard(node) {
    const site = byId[node];
    if (!site) return;
    $("card-img").src = "assets/bubbles/" + node + ".webp";
    $("card-title").textContent = site.title || node;
    $("card-slug").textContent = site.slug + ".mystrikingly.com";
    $("card-tag").textContent = site.tagline || "";
    $("card-hint").textContent = graph.getNodeAttribute(node, "archived")
      ? "Double-click to open the archived copy"
      : "Double-click to open the live site";
    $("card").classList.add("show");
  }

  function nodeAllowed(node) {
    if (state.radicalOrbit && node === RADICAL_RESPONSIBILITY_SLUG) return true;
    if (state.filter && !state.filter.has(node)) return false;
    if (state.pinned && !state.pinnedSet.has(node)) return false;
    return true;
  }

  function edgeVisibleForNeighbors(attrs) {
    if (attrs.etype === "curated" && !state.showCurated) return false;
    if (attrs.etype === "organic" && !state.showOrganic) return false;
    if (attrs.etype === "radicalOrbit" && !state.radicalOrbit) return false;
    return true;
  }

  function neighborsVisible(node) {
    const set = new Set([node]);
    graph.forEachEdge(node, (edge, attrs, source, target) => {
      if (!edgeVisibleForNeighbors(attrs)) return;
      set.add(source === node ? target : source);
    });
    return set;
  }

  function setPinned(node) {
    state.pinned = node;
    state.pinnedSet = node ? neighborsVisible(node) : new Set();
    if (node) showCard(node);
    else $("card").classList.remove("show");
    renderer.refresh();
  }

  function applySearch(query) {
    query = query.trim().toLowerCase();
    clearPin();
    if (!query) {
      state.filter = null;
    } else {
      state.filter = new Set();
      graph.forEachNode((node) => {
        const site = byId[node];
        if (site.slug.toLowerCase().includes(query) || (site.title || "").toLowerCase().includes(query)) {
          state.filter.add(node);
        }
      });
    }
    clearRailActive();
    if (state.radicalOrbit) centerRadicalOrbitHub(true);
    renderer.refresh();
  }

  function buildRail() {
    const present = new Set();
    graph.forEachNode((node) => present.add(graph.getNodeAttribute(node, "letter")));
    const rail = $("rail");
    const letters = ["#"].concat("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));

    letters.forEach((letter) => {
      const button = document.createElement("button");
      const has = present.has(letter);
      button.textContent = letter;
      button.dataset.has = has ? "1" : "0";
      if (!has) button.disabled = true;
      button.addEventListener("click", () => {
        const alreadyActive = button.classList.contains("active");
        clearRailActive();
        $("search").value = "";
        clearPin();

        if (alreadyActive) {
          state.filter = null;
          if (state.radicalOrbit) centerRadicalOrbitHub(true);
          renderer.refresh();
          return;
        }

        button.classList.add("active");
        state.filter = new Set();
        graph.forEachNode((node) => {
          if (graph.getNodeAttribute(node, "letter") === letter) state.filter.add(node);
        });
        if (state.radicalOrbit) centerRadicalOrbitHub(true);
        focusOn(Array.from(state.filter));
        renderer.refresh();
      });
      rail.appendChild(button);
    });
  }

  function clearRailActive() {
    $("rail").querySelectorAll("button").forEach((button) => button.classList.remove("active"));
  }

  function clearPin() {
    state.pinned = null;
    state.pinnedSet = new Set();
    $("card").classList.remove("show");
  }

  function focusOn(nodes) {
    let x = 0;
    let y = 0;
    let count = 0;
    nodes.forEach((node) => {
      const nodeMeta = meta.get(node);
      if (!nodeMeta || !nodeAllowed(node)) return;
      x += nodeMeta.x;
      y += nodeMeta.y;
      count++;
    });
    if (!count) return;
    camera.animate({ x: x / count, y: y / count, ratio: zoomToRatio($("zoom").value) }, { duration: 350 });
  }

  function buildControls() {
    $("toggle-curated").addEventListener("change", (event) => {
      state.showCurated = event.target.checked;
      updateNeighborhoods();
      renderer.refresh();
    });
    $("toggle-organic").addEventListener("change", (event) => {
      state.showOrganic = event.target.checked;
      updateNeighborhoods();
      renderer.refresh();
    });
    $("radical-orbit").addEventListener("change", (event) => {
      state.radicalOrbit = event.target.checked;
      if (state.radicalOrbit) centerRadicalOrbitHub(true);
      else restoreRadicalOrbitHub();
      updateNeighborhoods();
      renderer.refresh();
    });
    $("search").addEventListener("input", (event) => applySearch(event.target.value));
    $("zoom").addEventListener("input", (event) => {
      updateSliderValue(event.target);
      setZoomFromSlider(event.target.value);
    });
    $("tension").addEventListener("input", (event) => updateSliderValue(event.target));
    $("bubble-size").addEventListener("input", (event) => {
      state.bubbleScale = Number(event.target.value) / 100;
      updateSliderValue(event.target);
      updateNodeSizes();
      assignRadicalOrbitSlots();
      if (state.radicalOrbit) centerRadicalOrbitHub(true);
      renderer.refresh();
    });
    $("bubble-spacing").addEventListener("input", (event) => {
      updateSliderValue(event.target);
      setSpreadScale(Number(event.target.value) / 100, true);
      assignRadicalOrbitSlots();
      if (state.radicalOrbit) centerRadicalOrbitHub(true);
      renderer.refresh();
    });
    $("size-by-links").addEventListener("change", (event) => {
      state.sizeByLinks = event.target.checked;
      updateNodeSizes();
      assignRadicalOrbitSlots();
      if (state.radicalOrbit) centerRadicalOrbitHub(true);
      renderer.refresh();
    });
    $("reset").addEventListener("click", resetView);
    $("reset-settings").addEventListener("click", resetSettings);

    if (camera && typeof camera.on === "function") {
      camera.on("updated", updateZoomSliderFromCamera);
    }
    updateSliderValues();
  }

  function updateNeighborhoods() {
    if (state.pinned) state.pinnedSet = neighborsVisible(state.pinned);
    if (state.hovered) state.neighbors = neighborsVisible(state.hovered);
  }

  function resetSettings() {
    $("toggle-curated").checked = DEFAULT_SETTINGS.showCurated;
    $("toggle-organic").checked = DEFAULT_SETTINGS.showOrganic;
    $("radical-orbit").checked = DEFAULT_SETTINGS.radicalOrbit;
    $("size-by-links").checked = DEFAULT_SETTINGS.sizeByLinks;
    $("zoom").value = DEFAULT_SETTINGS.zoom;
    $("tension").value = DEFAULT_SETTINGS.tension;
    $("bubble-size").value = DEFAULT_SETTINGS.bubbleSize;
    $("bubble-spacing").value = DEFAULT_SETTINGS.bubbleSpacing;

    state.showCurated = DEFAULT_SETTINGS.showCurated;
    state.showOrganic = DEFAULT_SETTINGS.showOrganic;
    state.radicalOrbit = DEFAULT_SETTINGS.radicalOrbit;
    state.sizeByLinks = DEFAULT_SETTINGS.sizeByLinks;
    state.bubbleScale = DEFAULT_SETTINGS.bubbleScale;
    state.spreadScale = DEFAULT_SETTINGS.spreadScale;

    updateSliderValues();
    updateNodeSizes();
    assignRadicalOrbitSlots();
    setSpreadScale(DEFAULT_SETTINGS.spreadScale, false);
    if (state.radicalOrbit) centerRadicalOrbitHub(true);
    else restoreRadicalOrbitHub();
    updateNeighborhoods();
    setZoomFromSlider(DEFAULT_SETTINGS.zoom);
    renderer.refresh();
  }

  function resetView() {
    state.filter = null;
    clearPin();
    $("search").value = "";
    clearRailActive();

    meta.forEach((nodeMeta) => {
      nodeMeta.x = nodeMeta.homeX;
      nodeMeta.y = nodeMeta.homeY;
      nodeMeta.vx = 0;
      nodeMeta.vy = 0;
      writeNodePosition(nodeMeta);
    });
    if (state.radicalOrbit) centerRadicalOrbitHub(true);

    camera.animate({ x: 0, y: 0, ratio: zoomToRatio($("zoom").value) }, { duration: 300 });
    renderer.refresh();
  }

  function applyInitialView() {
    $("toggle-curated").checked = state.showCurated;
    $("toggle-organic").checked = state.showOrganic;
    $("radical-orbit").checked = state.radicalOrbit;
    $("size-by-links").checked = state.sizeByLinks;
    $("zoom").value = DEFAULT_SETTINGS.zoom;
    if (state.radicalOrbit) centerRadicalOrbitHub(true);
    setZoomFromSlider(DEFAULT_SETTINGS.zoom);
    updateSliderValues();
    renderer.refresh();
  }

  function formatSliderValue(input) {
    const value = Number(input.value);
    const precision = input.step && input.step.indexOf(".") >= 0 ? 2 : 0;
    let text = value.toFixed(precision);
    if (text.indexOf(".") >= 0) text = text.replace(/0+$/, "").replace(/\.$/, "");
    return text + "%";
  }

  function updateSliderValue(input) {
    if (!input || !input.parentNode) return;
    const output = input.parentNode.querySelector(".range-value");
    if (output) output.textContent = formatSliderValue(input);
  }

  function updateSliderValues() {
    ["zoom", "tension", "bubble-size", "bubble-spacing"].forEach((id) => updateSliderValue($(id)));
  }

  function zoomToRatio(value) {
    const zoom = Math.max(20, Math.min(500, Number(value) || 100));
    return DEFAULT_CAMERA_RATIO * (100 / zoom);
  }

  function setZoomFromSlider(value) {
    if (!camera) return;
    const current = camera.getState ? camera.getState() : {};
    camera.setState(Object.assign({}, current, { ratio: zoomToRatio(value) }));
  }

  function updateZoomSliderFromCamera() {
    if (!camera || !$("zoom")) return;
    const ratio = camera.getState().ratio || DEFAULT_CAMERA_RATIO;
    const zoom = Math.max(20, Math.min(500, Math.round(DEFAULT_CAMERA_RATIO * 100 / ratio)));
    if (Math.abs(Number($("zoom").value) - zoom) < 1) return;
    $("zoom").value = String(zoom);
    updateSliderValue($("zoom"));
  }

  function updateNodeSizes() {
    meta.forEach((nodeMeta) => {
      const base = state.sizeByLinks ? nodeMeta.linkSize : nodeMeta.uniformSize;
      nodeMeta.size = base * state.bubbleScale;
      if (graph && graph.hasNode(nodeMeta.slug)) graph.setNodeAttribute(nodeMeta.slug, "size", nodeMeta.size);
    });
  }

  function setSpreadScale(nextScale, moveCurrent) {
    const oldScale = state.spreadScale || 1;
    const ratio = oldScale > 0 ? nextScale / oldScale : 1;
    state.spreadScale = nextScale;
    meta.forEach((nodeMeta) => {
      nodeMeta.homeX = nodeMeta.baseX * nextScale;
      nodeMeta.homeY = nodeMeta.baseY * nextScale;
      if (moveCurrent && !state.radicalOrbit) {
        nodeMeta.x *= ratio;
        nodeMeta.y *= ratio;
        nodeMeta.vx *= 0.35;
        nodeMeta.vy *= 0.35;
        writeNodePosition(nodeMeta);
      }
    });
  }

  function centerRadicalOrbitHub(distributeNodes) {
    const hub = meta.get(RADICAL_RESPONSIBILITY_SLUG);
    if (!hub) return;
    hub.x = 0;
    hub.y = 0;
    hub.vx = 0;
    hub.vy = 0;
    writeNodePosition(hub);
    if (distributeNodes) balanceRadicalOrbitPositions(0.72);
  }

  function restoreRadicalOrbitHub() {
    const hub = meta.get(RADICAL_RESPONSIBILITY_SLUG);
    if (!hub) return;
    hub.x = hub.homeX;
    hub.y = hub.homeY;
    hub.vx = 0;
    hub.vy = 0;
    writeNodePosition(hub);
  }

  function balanceRadicalOrbitPositions(strength) {
    const hub = meta.get(RADICAL_RESPONSIBILITY_SLUG);
    if (!hub) return;
    meta.forEach((nodeMeta) => {
      if (nodeMeta === hub || !nodeAllowed(nodeMeta.slug)) return;
      const target = radicalOrbitTarget(nodeMeta, hub, 0);
      nodeMeta.x += (target.x - nodeMeta.x) * strength;
      nodeMeta.y += (target.y - nodeMeta.y) * strength;
      nodeMeta.vx *= 0.2;
      nodeMeta.vy *= 0.2;
      writeNodePosition(nodeMeta);
    });
  }

  function radicalOrbitDistance(nodeMeta, hub) {
    return Math.max(
      hub.size + nodeMeta.size + 80,
      Math.min(
        MAX_MAP_RADIUS * Math.max(1, state.spreadScale) * 0.96,
        (nodeMeta.orbitDistance || 520) * Math.max(0.86, Math.sqrt(state.spreadScale)) + nodeMeta.size * 1.6
      )
    );
  }

  function radicalOrbitTarget(nodeMeta, hub, elapsed) {
    const angle = nodeMeta.orbitAngle + nodeMeta.orbitPhase + elapsed * nodeMeta.orbitSpeed;
    const distance = radicalOrbitDistance(nodeMeta, hub);
    return {
      x: hub.x + Math.cos(angle) * distance,
      y: hub.y + Math.sin(angle) * distance
    };
  }

  function writeNodePosition(nodeMeta) {
    graph.setNodeAttribute(nodeMeta.slug, "x", nodeMeta.x);
    graph.setNodeAttribute(nodeMeta.slug, "y", nodeMeta.y);
  }

  function startAnimation() {
    if (animationStarted) return;
    animationStarted = true;
    let last = performance.now();

    function frame(now) {
      const delta = Math.min((now - last) / 16.667, 2.2);
      last = now;
      stepPhysics(delta, now / 1000);
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  function stepPhysics(frame, elapsed) {
    const tension = tensionFromSlider($("tension") ? $("tension").value : 0);
    const damping = Math.pow(0.84, frame);
    let moved = false;

    if (tension > 0) {
      applyHomeTension(tension, frame);
      applyLinkTension(tension, frame);
    }
    if (state.radicalOrbit) {
      applyRadicalOrbit(frame, elapsed);
    }

    meta.forEach((nodeMeta) => {
      if (!nodeAllowed(nodeMeta.slug)) return;
      nodeMeta.vx *= damping;
      nodeMeta.vy *= damping;
      if (Math.abs(nodeMeta.vx) > 0.001 || Math.abs(nodeMeta.vy) > 0.001) {
        nodeMeta.x += nodeMeta.vx * frame;
        nodeMeta.y += nodeMeta.vy * frame;
        clampNode(nodeMeta);
        writeNodePosition(nodeMeta);
        moved = true;
      }
    });

    if (moved) renderer.refresh();
  }

  function applyHomeTension(tension, frame) {
    const strength = 0.0022 * tension * frame;
    meta.forEach((nodeMeta) => {
      if (!nodeAllowed(nodeMeta.slug)) return;
      nodeMeta.vx += (nodeMeta.homeX - nodeMeta.x) * strength;
      nodeMeta.vy += (nodeMeta.homeY - nodeMeta.y) * strength;
    });
  }

  function applyLinkTension(tension, frame) {
    const strength = 0.00055 * tension * frame;
    graph.forEachEdge((edge, attrs, source, target) => {
      if (!attrs.real || !edgeVisibleForNeighbors(attrs) || !nodeAllowed(source) || !nodeAllowed(target)) return;
      const sourceMeta = meta.get(source);
      const targetMeta = meta.get(target);
      if (!sourceMeta || !targetMeta) return;
      const dx = targetMeta.x - sourceMeta.x;
      const dy = targetMeta.y - sourceMeta.y;
      const distance = Math.max(0.001, Math.hypot(dx, dy));
      const rest = Math.max(80, Math.hypot(targetMeta.homeX - sourceMeta.homeX, targetMeta.homeY - sourceMeta.homeY) * 0.55);
      const force = Math.max(-0.8, Math.min(0.8, (distance - rest) * strength));
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      sourceMeta.vx += fx;
      sourceMeta.vy += fy;
      targetMeta.vx -= fx;
      targetMeta.vy -= fy;
    });
  }

  function applyRadicalOrbit(frame, elapsed) {
    const hub = meta.get(RADICAL_RESPONSIBILITY_SLUG);
    if (!hub || !nodeAllowed(hub.slug)) return;
    hub.vx += (0 - hub.x) * 0.08 * frame;
    hub.vy += (0 - hub.y) * 0.08 * frame;

    meta.forEach((nodeMeta) => {
      if (nodeMeta === hub || !nodeAllowed(nodeMeta.slug)) return;
      const target = radicalOrbitTarget(nodeMeta, hub, elapsed);
      const dx = target.x - nodeMeta.x;
      const dy = target.y - nodeMeta.y;
      const targetDistance = Math.max(0.001, Math.hypot(dx, dy));
      const targetPull = Math.min(1.55, targetDistance * 0.0024) * frame;
      nodeMeta.vx += (dx / targetDistance) * targetPull;
      nodeMeta.vy += (dy / targetDistance) * targetPull;

      const centerDx = nodeMeta.x - hub.x;
      const centerDy = nodeMeta.y - hub.y;
      const centerDistance = Math.max(0.001, Math.hypot(centerDx, centerDy));
      const wanted = radicalOrbitDistance(nodeMeta, hub);
      const radial = Math.max(-1.15, Math.min(1.15, (centerDistance - wanted) * 0.002)) * frame;
      nodeMeta.vx -= (centerDx / centerDistance) * radial;
      nodeMeta.vy -= (centerDy / centerDistance) * radial;

      const tangent = 0.018 * frame * (1 + (hashString(nodeMeta.slug) % 70) / 100);
      nodeMeta.vx += (-centerDy / centerDistance) * tangent;
      nodeMeta.vy += (centerDx / centerDistance) * tangent;
    });
  }

  function clampNode(nodeMeta) {
    const limit = MAX_MAP_RADIUS * Math.max(1, state.spreadScale);
    const distance = Math.hypot(nodeMeta.x, nodeMeta.y);
    if (distance > limit) {
      const scale = limit / distance;
      nodeMeta.x *= scale;
      nodeMeta.y *= scale;
      nodeMeta.vx *= 0.55;
      nodeMeta.vy *= 0.55;
    }
  }

  function updateCounts(totalSites) {
    let curatedCount = 0;
    let organicCount = 0;
    graph.forEachEdge((edge, attrs) => {
      if (!attrs.real) return;
      if (attrs.etype === "curated") curatedCount++;
      else organicCount++;
    });
    $("counts").textContent =
      totalSites + " sites - " + curatedCount + " curated + " + organicCount + " organic links";
  }

  function fetchBuildStatus() {
    fetch("data/build-status.json").then((response) => (response.ok ? response.json() : null)).then((status) => {
      if (status && $("build-status")) {
        $("build-status").textContent =
          "Archive: " + status.captured + "/" + status.total + " sites with original-appearance screenshots";
      }
    }).catch(() => {});
  }

  function starfield() {
    const svg = $("stars");
    const width = window.innerWidth;
    const height = window.innerHeight;
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    let seed = 1337;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const starCount = Math.min(680, Math.max(320, Math.round((width * height) / 4200)));
    let html = "";
    for (let i = 0; i < starCount; i++) {
      const x = (rnd() * width).toFixed(1);
      const y = (rnd() * height).toFixed(1);
      const pinprick = rnd() > 0.72;
      const radius = (pinprick ? rnd() * 0.42 + 0.1 : rnd() * 1.35 + 0.18).toFixed(2);
      const opacity = (pinprick ? rnd() * 0.34 + 0.1 : rnd() * 0.5 + 0.14).toFixed(2);
      const color = rnd() > 0.78 ? "#ffe6a8" : "#d8f8ff";
      html += '<circle cx="' + x + '" cy="' + y + '" r="' + radius + '" fill="' + color + '" opacity="' + opacity + '"/>';
    }
    svg.innerHTML = html;
  }

  main().catch(function (err) {
    const el = $("loading");
    if (el) {
      el.textContent = "ERROR: " + (err && err.message);
      el.style.color = "#ff8a8a";
    }
    console.error("main() failed:", err);
  });
})();
