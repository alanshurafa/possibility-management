/* PM 3D Bubble Map - Three.js constellation renderer.
 * Reuses the SpacePort data package, thumbnails, and archive manifest.
 * Nodes are textured spheres that can be pulled in 3D space while their links
 * stay springy and the whole scene remains orbitable. */
(function () {
  "use strict";

  var DATA_ROOT = "../";
  var DATA_URLS = {
    registry: DATA_ROOT + "data/registry.json",
    edges: DATA_ROOT + "data/edges.json",
    layout: DATA_ROOT + "data/layout.json",
    archive: DATA_ROOT + "data/archive-manifest.json",
    build: DATA_ROOT + "data/build-status.json"
  };

  var CURATED_COLOR = 0xf4f7fa;
  var ORGANIC_COLOR = 0xf4f7fa;
  var HIGHLIGHT_COLOR = 0xffffff;
  var RADICAL_ORBIT_COLOR = 0xb9eefc;
  var RADICAL_RESPONSIBILITY_SLUG = "radicalresponsibility";
  var GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  var MAX_SCENE_RADIUS = 1450;
  var DEFAULT_CAMERA_X = 0;
  var DEFAULT_CAMERA_Y = -120;
  var DEFAULT_CAMERA_Z = 1680;
  var DEFAULT_CAMERA_DISTANCE = Math.hypot(DEFAULT_CAMERA_X, DEFAULT_CAMERA_Y, DEFAULT_CAMERA_Z);
  var RADICAL_FOCUS_MIN_DISTANCE = 175;
  var RADICAL_FOCUS_MAX_DISTANCE = 360;
  var RADICAL_FOCUS_GAP = 66;
  var BUBBLE_GLOW_SCALE = 2.55;
  var BUBBLE_GLOW_OPACITY = 0.075;
  var BUBBLE_INNER_GLOW_OPACITY = 0.2;
  var BASE_FOG_DENSITY = 0.00048;
  var MIN_FOG_DENSITY = 0.00012;

  var THREE = window.THREE;
  var $ = function (id) { return document.getElementById(id); };

  var scene;
  var camera;
  var renderer;
  var controls;
  var clock;
  var raycaster = new THREE.Raycaster();
  var pointer = new THREE.Vector2();
  var dragPlane = new THREE.Plane();
  var tmpVec = new THREE.Vector3();
  var tmpVec2 = new THREE.Vector3();
  var tmpDir = new THREE.Vector3();
  var radicalOrbitAxis = new THREE.Vector3(0.24, 0.91, 0.34).normalize();
  var radicalOrbitTime = 0;

  var graph = {
    nodes: [],
    edges: [],
    nodeBySlug: new Map(),
    adjacency: new Map(),
    pickables: [],
    hubSlugs: new Set(),
    activeCuratedEdges: [],
    activeOrganicEdges: [],
    activeRadicalOrbitEdges: [],
    activeHighlightEdges: [],
    curatedLines: null,
    organicLines: null,
    radicalOrbitLines: null,
    highlightLines: null
  };

  var DEFAULT_SETTINGS = {
    showCurated: true,
    showOrganic: true,
    bubbleScale: 1,
    sizeByLinks: true,
    spreadScale: 1,
    radicalOrbit: true,
    zoom: "175",
    tension: "0",
    orbitSpeed: "100",
    bubbleSize: "100",
    bubbleSpacing: "100"
  };

  var state = {
    showCurated: DEFAULT_SETTINGS.showCurated,
    showOrganic: DEFAULT_SETTINGS.showOrganic,
    hovered: null,
    hoverSet: new Set(),
    pinned: null,
    pinnedSet: new Set(),
    filterSet: null,
    bubbleScale: DEFAULT_SETTINGS.bubbleScale,
    sizeByLinks: DEFAULT_SETTINGS.sizeByLinks,
    spreadScale: DEFAULT_SETTINGS.spreadScale,
    radicalOrbit: DEFAULT_SETTINGS.radicalOrbit,
    orbitSpeedScale: Number(DEFAULT_SETTINGS.orbitSpeed) / 100,
    radicalFocus: null,
    drag: null,
    pointerDownEmpty: null
  };

  function letterOf(title) {
    var c = (title || "").trim().charAt(0).toUpperCase();
    return c >= "A" && c <= "Z" ? c : "#";
  }

  function hashString(value) {
    var h = 2166136261;
    for (var i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function colorForSlug(slug) {
    var color = new THREE.Color();
    var hue = (hashString(slug) % 360) / 360;
    color.setHSL(hue, 0.5, 0.5);
    return color;
  }

  function makeGlowTexture() {
    var size = 128;
    var canvas = document.createElement("canvas");
    var context = canvas.getContext("2d");
    var center = size / 2;
    canvas.width = size;
    canvas.height = size;

    var gradient = context.createRadialGradient(center, center, size * 0.08, center, center, center);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.36, "rgba(255,255,255,0.42)");
    gradient.addColorStop(0.7, "rgba(255,255,255,0.16)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    var texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    return texture;
  }

  function makeInnerGlowMaterial(color) {
    var glowColor = color.clone();
    glowColor.offsetHSL(0, 0.18, 0.22);
    return new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: glowColor },
        opacity: { value: BUBBLE_INNER_GLOW_OPACITY }
      },
      vertexShader: [
        "varying vec3 vNormal;",
        "varying vec3 vViewPosition;",
        "void main() {",
        "  vNormal = normalize(normalMatrix * normal);",
        "  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);",
        "  vViewPosition = -mvPosition.xyz;",
        "  gl_Position = projectionMatrix * mvPosition;",
        "}"
      ].join("\n"),
      fragmentShader: [
        "uniform vec3 glowColor;",
        "uniform float opacity;",
        "varying vec3 vNormal;",
        "varying vec3 vViewPosition;",
        "void main() {",
        "  vec3 normal = normalize(vNormal);",
        "  vec3 viewDir = normalize(vViewPosition);",
        "  float facing = max(dot(normal, viewDir), 0.0);",
        "  float core = pow(smoothstep(0.06, 1.0, facing), 1.45);",
        "  float ember = 0.22 * pow(facing, 0.45);",
        "  float innerGlow = min(core + ember, 1.0);",
        "  gl_FragColor = vec4(glowColor, opacity * innerGlow);",
        "}"
      ].join("\n"),
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      fog: false
    });
  }

  function clampVectorLength(vec, maxLength) {
    var length = vec.length();
    if (length > maxLength) vec.multiplyScalar(maxLength / length);
  }

  function tensionFromSlider(value) {
    var raw = Number(value) / 100;
    if (raw <= 0) return 0;
    if (raw >= 0.68) return raw;
    return 0.68 * Math.pow(raw / 0.68, 3);
  }

  function fogDensityForView() {
    var bubbleFactor = Math.max(1, state.bubbleScale / 2);
    var spreadFactor = Math.max(1, state.spreadScale / 1.5);
    var visibilityScale = Math.max(bubbleFactor, spreadFactor);
    return THREE.MathUtils.clamp(BASE_FOG_DENSITY / visibilityScale, MIN_FOG_DENSITY, BASE_FOG_DENSITY);
  }

  function updateFogDensity() {
    if (scene && scene.fog) scene.fog.density = fogDensityForView();
  }

  function setLoadingError(message) {
    var loading = $("loading");
    loading.classList.add("error");
    loading.textContent = message;
  }

  function loadJson(url) {
    return fetch(url).then(function (response) {
      if (!response.ok) throw new Error(url + " returned " + response.status);
      return response.json();
    });
  }

  function siteUrl(site, archiveManifest) {
    if (archiveManifest && archiveManifest[site.slug]) {
      return DATA_ROOT + archiveManifest[site.slug];
    }
    return site.live_url || site.url || "";
  }

  function main() {
    if (!THREE || !THREE.OrbitControls) {
      setLoadingError("Three.js failed to load.");
      return;
    }

    Promise.all([
      loadJson(DATA_URLS.registry),
      loadJson(DATA_URLS.edges),
      loadJson(DATA_URLS.layout),
      loadJson(DATA_URLS.archive).catch(function () { return {}; })
    ]).then(function (loaded) {
      initScene();
      buildGraph(loaded[0], loaded[1], loaded[2], loaded[3]);
      buildMeshes();
      buildControls();
      applyVisualState(true);
      updateCounts();
      fetchBuildStatus();
      starfield();
      $("loading").style.display = "none";
      clock = new THREE.Clock();
      animate();
    }).catch(function (err) {
      setLoadingError("Failed to load 3D map: " + err.message);
      console.error(err);
    });
  }

  function initScene() {
    var container = $("scene");

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030405, BASE_FOG_DENSITY);

    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 8, 30000);
    camera.position.set(DEFAULT_CAMERA_X, DEFAULT_CAMERA_Y, DEFAULT_CAMERA_Z);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.rotateSpeed = 0.48;
    controls.zoomSpeed = 0.82;
    controls.panSpeed = 0.5;
    controls.minDistance = 260;
    controls.maxDistance = 14000;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xc9f2ff, 0.76));

    var key = new THREE.DirectionalLight(0xffffff, 0.72);
    key.position.set(-600, -900, 900);
    scene.add(key);

    var rim = new THREE.DirectionalLight(0xe0b84f, 0.52);
    rim.position.set(900, 620, -860);
    scene.add(rim);

    graph.curatedLines = makeLineLayer(CURATED_COLOR, 0.075);
    graph.organicLines = makeLineLayer(ORGANIC_COLOR, 0.045);
    graph.radicalOrbitLines = makeLineLayer(RADICAL_ORBIT_COLOR, 0.1);
    graph.highlightLines = makeLineLayer(HIGHLIGHT_COLOR, 0.42);
    scene.add(graph.curatedLines);
    scene.add(graph.organicLines);
    scene.add(graph.radicalOrbitLines);
    scene.add(graph.highlightLines);

    window.addEventListener("resize", resize);
    renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
    renderer.domElement.addEventListener("pointermove", onPointerMove, true);
    renderer.domElement.addEventListener("pointerup", onPointerUp, true);
    renderer.domElement.addEventListener("pointercancel", onPointerUp, true);
    renderer.domElement.addEventListener("dblclick", onDoubleClick, true);
  }

  function makeLineLayer(color, opacity) {
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    geometry.setDrawRange(0, 0);

    var material = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: opacity,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    var lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    lines.visible = false;
    return lines;
  }

  function buildGraph(registry, rawEdges, layout, archiveManifest) {
    var slugs = new Set(registry.map(function (site) { return site.slug; }));
    var degree = new Map();
    var layoutValues = Object.keys(layout).map(function (slug) { return layout[slug]; });
    var minX = Infinity;
    var maxX = -Infinity;
    var minY = Infinity;
    var maxY = -Infinity;

    layoutValues.forEach(function (pos) {
      minX = Math.min(minX, pos[0]);
      maxX = Math.max(maxX, pos[0]);
      minY = Math.min(minY, pos[1]);
      maxY = Math.max(maxY, pos[1]);
    });

    var centerX = (minX + maxX) / 2;
    var centerY = (minY + maxY) / 2;
    var scale = 1060 / Math.max(maxX - minX, maxY - minY);
    var depth = 760;

    rawEdges.forEach(function (edge) {
      if (!slugs.has(edge.src) || !slugs.has(edge.tgt)) return;
      degree.set(edge.src, (degree.get(edge.src) || 0) + 1);
      degree.set(edge.tgt, (degree.get(edge.tgt) || 0) + 1);
    });

    var maxDegree = 1;
    degree.forEach(function (value) { maxDegree = Math.max(maxDegree, value); });

    registry.forEach(function (site) {
      var pos = layout[site.slug] || [centerX, centerY];
      var h = hashString(site.slug);
      var letter = letterOf(site.title);
      var letterIndex = letter === "#" ? 13 : letter.charCodeAt(0) - 65;
      var z =
        Math.sin((h % 6283) / 1000) * depth * 0.45 +
        Math.cos(((h >>> 7) % 6283) / 1000) * depth * 0.18 +
        (letterIndex - 12.5) * 7;
      var d = degree.get(site.slug) || 0;
      var degreeRatio = d / maxDegree;
      var linkRadius = 4.8 + 32 * Math.pow(degreeRatio, 0.62);
      var uniformRadius = 20;
      var baseHome = new THREE.Vector3((pos[0] - centerX) * scale, (centerY - pos[1]) * scale, z);
      var node = {
        slug: site.slug,
        title: site.title || site.slug,
        tagline: site.tagline || "",
        letter: letter,
        degree: d,
        url: siteUrl(site, archiveManifest),
        archived: !!(archiveManifest && archiveManifest[site.slug]),
        image: DATA_ROOT + (site.bubble_image || ("assets/bubbles/" + site.slug + ".webp")),
        baseHome: baseHome,
        home: baseHome.clone(),
        pos: baseHome.clone(),
        velocity: new THREE.Vector3(),
        radius: linkRadius,
        linkRadius: linkRadius,
        uniformRadius: uniformRadius,
        targetRadius: linkRadius,
        renderRadius: linkRadius,
        orbitSlot: null,
        orbitDistance: 520,
        orbitSpeed: 0.055,
        orbitPhase: 0,
        mesh: null,
        glow: null,
        innerGlow: null,
        labelEl: null
      };
      graph.nodes.push(node);
      graph.nodeBySlug.set(node.slug, node);
      graph.adjacency.set(node.slug, []);
    });

    rawEdges.forEach(function (raw) {
      var source = graph.nodeBySlug.get(raw.src);
      var target = graph.nodeBySlug.get(raw.tgt);
      if (!source || !target) return;
      var edge = {
        source: source,
        target: target,
        type: raw.type === "curated" ? "curated" : "organic",
        count: raw.count || 1,
        baseRest: source.baseHome.distanceTo(target.baseHome),
        rest: Math.max(45, source.baseHome.distanceTo(target.baseHome))
      };
      graph.edges.push(edge);
      graph.adjacency.get(source.slug).push(edge);
      graph.adjacency.get(target.slug).push(edge);
    });

    graph.nodes
      .slice()
      .sort(function (a, b) { return b.degree - a.degree; })
      .slice(0, 24)
      .forEach(function (node) { graph.hubSlugs.add(node.slug); });

    assignRadicalOrbitSlots();
  }

  function assignRadicalOrbitSlots() {
    var hub = graph.nodeBySlug.get(RADICAL_RESPONSIBILITY_SLUG);
    var orbitNodes = graph.nodes
      .filter(function (node) { return node !== hub; })
      .sort(function (a, b) {
        return b.degree - a.degree || a.slug.localeCompare(b.slug);
      });
    var count = Math.max(1, orbitNodes.length - 1);
    var maxDegree = graph.nodes.reduce(function (max, node) {
      return Math.max(max, node.degree || 0);
    }, 1);

    orbitNodes.forEach(function (node, index) {
      var hash = hashString(node.slug);
      var rank = index / count;
      var y = 1 - rank * 2;
      var bandJitter = (((hash >>> 5) % 1000) / 1000 - 0.5) * 0.22;
      y = THREE.MathUtils.clamp(y * 0.84 + bandJitter, -0.94, 0.94);
      var ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
      var theta = index * GOLDEN_ANGLE + (((hash >>> 13) % 1000) / 1000 - 0.5) * 0.58;
      node.orbitSlot = new THREE.Vector3(
        Math.cos(theta) * ringRadius,
        y,
        Math.sin(theta) * ringRadius
      ).normalize();

      var shell = index % 5;
      var degreeRatio = (node.degree || 0) / maxDegree;
      var distanceJitter = ((hash >>> 21) % 120) - 60;
      node.orbitDistance =
        390 +
        shell * 118 +
        (1 - Math.pow(degreeRatio, 0.55)) * 155 +
        distanceJitter +
        node.radius * 1.3;
      node.orbitSpeed = 0.038 + ((hash >>> 9) % 100) / 2600;
      node.orbitPhase = ((hash >>> 17) % 6283) / 1000;
    });
  }

  function buildMeshes() {
    var sphereGeometry = new THREE.SphereGeometry(1, 24, 16);
    var glowTexture = makeGlowTexture();
    var loader = new THREE.TextureLoader();
    var labels = $("labels");

    graph.nodes.forEach(function (node) {
      var color = colorForSlug(node.slug);
      var material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 1
      });

      var mesh = new THREE.Mesh(sphereGeometry, material);
      mesh.position.copy(node.pos);
      mesh.scale.setScalar(node.radius);
      mesh.userData.slug = node.slug;
      mesh.frustumCulled = false;
      node.mesh = mesh;

      var innerGlow = new THREE.Mesh(sphereGeometry, makeInnerGlowMaterial(color));
      innerGlow.scale.setScalar(1.012);
      innerGlow.renderOrder = 2;
      innerGlow.frustumCulled = false;
      mesh.add(innerGlow);
      node.innerGlow = innerGlow;

      var glowColor = color.clone();
      glowColor.offsetHSL(0, 0.08, 0.18);
      var glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color: glowColor,
        transparent: true,
        opacity: BUBBLE_GLOW_OPACITY,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        fog: false
      }));
      glow.scale.setScalar(BUBBLE_GLOW_SCALE);
      glow.renderOrder = 0;
      glow.frustumCulled = false;
      mesh.add(glow);
      node.glow = glow;

      graph.pickables.push(mesh);
      scene.add(mesh);

      loader.load(node.image, function (texture) {
        texture.encoding = THREE.sRGBEncoding;
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        material.map = texture;
        material.needsUpdate = true;
      }, undefined, function () {
        material.needsUpdate = true;
      });

      var label = document.createElement("div");
      label.className = "label";
      label.textContent = node.title;
      labels.appendChild(label);
      node.labelEl = label;
    });
  }

  function buildControls() {
    $("toggle-curated").addEventListener("change", updateLinkVisibility);
    $("toggle-organic").addEventListener("change", updateLinkVisibility);
    $("radical-orbit").addEventListener("change", updateRadicalOrbit);

    $("search").addEventListener("input", function (event) {
      applySearch(event.target.value);
    });

    $("zoom").addEventListener("input", function (event) {
      setZoomFromSlider(event.target.value);
      updateSliderValue(event.target);
    });
    controls.addEventListener("change", updateZoomSliderFromCamera);

    $("tension").addEventListener("input", function (event) {
      updateSliderValue(event.target);
    });

    $("orbit-speed").addEventListener("input", function (event) {
      state.orbitSpeedScale = Number(event.target.value) / 100;
      updateSliderValue(event.target);
    });

    $("bubble-size").addEventListener("input", function (event) {
      state.bubbleScale = Number(event.target.value) / 100;
      updateSliderValue(event.target);
      updateNodeRadii();
      applyVisualState(false);
    });

    $("size-by-links").addEventListener("change", function (event) {
      state.sizeByLinks = event.target.checked;
      updateNodeRadii();
      applyVisualState(false);
    });

    $("bubble-spacing").addEventListener("input", function (event) {
      updateSliderValue(event.target);
      setSpreadScale(Number(event.target.value) / 100, true);
    });

    $("reset").addEventListener("click", function () {
      resetView();
    });

    $("reset-settings").addEventListener("click", function () {
      resetSettings();
    });

    buildRail();
    $("radical-orbit").checked = DEFAULT_SETTINGS.radicalOrbit;
    if (state.radicalOrbit) centerRadicalOrbitHub(true);
    $("zoom").value = DEFAULT_SETTINGS.zoom;
    $("orbit-speed").value = DEFAULT_SETTINGS.orbitSpeed;
    setZoomFromSlider(DEFAULT_SETTINGS.zoom);
    updateSliderValues();
  }

  function resetSettings() {
    $("toggle-curated").checked = DEFAULT_SETTINGS.showCurated;
    $("toggle-organic").checked = DEFAULT_SETTINGS.showOrganic;
    $("radical-orbit").checked = DEFAULT_SETTINGS.radicalOrbit;
    $("size-by-links").checked = DEFAULT_SETTINGS.sizeByLinks;
    $("zoom").value = DEFAULT_SETTINGS.zoom;
    $("tension").value = DEFAULT_SETTINGS.tension;
    $("orbit-speed").value = DEFAULT_SETTINGS.orbitSpeed;
    $("bubble-size").value = DEFAULT_SETTINGS.bubbleSize;
    $("bubble-spacing").value = DEFAULT_SETTINGS.bubbleSpacing;
    setZoomFromSlider(DEFAULT_SETTINGS.zoom);
    updateSliderValues();

    state.showCurated = DEFAULT_SETTINGS.showCurated;
    state.showOrganic = DEFAULT_SETTINGS.showOrganic;
    state.radicalOrbit = DEFAULT_SETTINGS.radicalOrbit;
    state.bubbleScale = DEFAULT_SETTINGS.bubbleScale;
    state.sizeByLinks = DEFAULT_SETTINGS.sizeByLinks;
    state.orbitSpeedScale = Number(DEFAULT_SETTINGS.orbitSpeed) / 100;
    state.radicalFocus = null;
    setSpreadScale(DEFAULT_SETTINGS.spreadScale, true);
    updateNodeRadii();
    if (state.pinned) state.pinnedSet = neighborsVisible(state.pinned);
    if (state.hovered) state.hoverSet = neighborsVisible(state.hovered);
    if (state.radicalOrbit && state.pinned && state.pinned !== RADICAL_RESPONSIBILITY_SLUG) {
      focusRadicalOrbitSelection(state.pinned);
    } else if (state.radicalOrbit) {
      centerRadicalOrbitHub(true);
    } else {
      restoreRadicalOrbitHub();
    }
    applyVisualState(true);
  }

  function buildRail() {
    var present = new Set();
    graph.nodes.forEach(function (node) { present.add(node.letter); });

    var rail = $("rail");
    var letters = ["#"].concat("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));
    letters.forEach(function (letter) {
      var button = document.createElement("button");
      var has = present.has(letter);
      button.textContent = letter;
      button.dataset.has = has ? "1" : "0";
      button.disabled = !has;
      button.addEventListener("click", function () {
        var alreadyActive = button.classList.contains("active");
        clearRailActive();
        $("search").value = "";
        clearPin();

        if (alreadyActive) {
          state.filterSet = null;
          applyVisualState(true);
          return;
        }

        button.classList.add("active");
        state.filterSet = new Set();
        graph.nodes.forEach(function (node) {
          if (node.letter === letter) state.filterSet.add(node.slug);
        });
        focusOnSlugs(Array.from(state.filterSet));
        applyVisualState(true);
      });
      rail.appendChild(button);
    });
  }

  function updateLinkVisibility() {
    state.showCurated = $("toggle-curated").checked;
    state.showOrganic = $("toggle-organic").checked;
    if (state.pinned) state.pinnedSet = neighborsVisible(state.pinned);
    if (state.hovered) state.hoverSet = neighborsVisible(state.hovered);
    applyVisualState(true);
  }

  function updateRadicalOrbit(event) {
    state.radicalOrbit = event.target.checked;
    if (state.radicalOrbit && graph.nodeBySlug.has(RADICAL_RESPONSIBILITY_SLUG)) {
      centerRadicalOrbitHub(true);
      if (state.pinned && state.pinned !== RADICAL_RESPONSIBILITY_SLUG) {
        focusRadicalOrbitSelection(state.pinned);
      } else {
        focusOnSlugs([RADICAL_RESPONSIBILITY_SLUG], true);
      }
    } else if (!state.radicalOrbit) {
      state.radicalFocus = null;
      restoreRadicalOrbitHub();
    }
    applyVisualState(true);
  }

  function centerRadicalOrbitHub(distributeNodes) {
    var hub = graph.nodeBySlug.get(RADICAL_RESPONSIBILITY_SLUG);
    if (!hub || (state.drag && state.drag.node === hub)) return;
    hub.pos.set(0, 0, 0);
    hub.velocity.set(0, 0, 0);
    if (hub.mesh) hub.mesh.position.copy(hub.pos);
    if (distributeNodes) balanceRadicalOrbitPositions(0.62);
  }

  function restoreRadicalOrbitHub() {
    var hub = graph.nodeBySlug.get(RADICAL_RESPONSIBILITY_SLUG);
    if (!hub || (state.drag && state.drag.node === hub)) return;
    hub.pos.copy(hub.home);
    hub.velocity.set(0, 0, 0);
    if (hub.mesh) hub.mesh.position.copy(hub.pos);
  }

  function balanceRadicalOrbitPositions(strength) {
    var hub = graph.nodeBySlug.get(RADICAL_RESPONSIBILITY_SLUG);
    if (!hub) return;
    graph.nodes.forEach(function (node) {
      if (node === hub || !nodeAllowed(node.slug) || (state.drag && state.drag.node === node)) return;
      radicalOrbitTarget(node, hub, 0, tmpVec2);
      node.pos.lerp(tmpVec2, strength);
      node.velocity.multiplyScalar(0.2);
      if (node.mesh) node.mesh.position.copy(node.pos);
    });
  }

  function formatSliderValue(input) {
    var value = Number(input.value);
    var precision = input.step && input.step.indexOf(".") >= 0 ? 2 : 0;
    var text = value.toFixed(precision);
    if (text.indexOf(".") >= 0) text = text.replace(/0+$/, "").replace(/\.$/, "");
    return text + "%";
  }

  function updateSliderValue(input) {
    if (!input || !input.parentNode) return;
    var output = input.parentNode.querySelector(".range-value");
    if (output) output.textContent = formatSliderValue(input);
  }

  function updateSliderValues() {
    ["zoom", "tension", "orbit-speed", "bubble-size", "bubble-spacing"].forEach(function (id) {
      updateSliderValue($(id));
    });
  }

  function setZoomFromSlider(value) {
    if (!camera || !controls) return;
    var zoom = THREE.MathUtils.clamp(Number(value) || 100, 20, 500);
    var distance = THREE.MathUtils.clamp(DEFAULT_CAMERA_DISTANCE * (100 / zoom), controls.minDistance, controls.maxDistance);
    var direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 0.001) direction.set(DEFAULT_CAMERA_X, DEFAULT_CAMERA_Y, DEFAULT_CAMERA_Z);
    direction.normalize();
    camera.position.copy(controls.target).addScaledVector(direction, distance);
    controls.update();
  }

  function updateZoomSliderFromCamera() {
    var input = $("zoom");
    if (!input || !camera || !controls) return;
    var distance = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target), controls.minDistance, controls.maxDistance);
    var zoom = THREE.MathUtils.clamp(Math.round(DEFAULT_CAMERA_DISTANCE * 100 / distance), Number(input.min), Number(input.max));
    if (Math.abs(Number(input.value) - zoom) < 1) return;
    input.value = String(zoom);
    updateSliderValue(input);
  }

  function clearRailActive() {
    document.querySelectorAll("#rail button").forEach(function (button) {
      button.classList.remove("active");
    });
  }

  function updateCounts() {
    var curatedCount = graph.edges.filter(function (edge) { return edge.type === "curated"; }).length;
    var organicCount = graph.edges.length - curatedCount;
    $("counts").textContent =
      graph.nodes.length + " sites - " + curatedCount + " curated + " + organicCount + " organic links";
  }

  function fetchBuildStatus() {
    fetch(DATA_URLS.build).then(function (response) {
      return response.ok ? response.json() : null;
    }).then(function (status) {
      if (!status) return;
      $("build-status").textContent =
        "Archive: " + status.captured + "/" + status.total + " sites with original-appearance screenshots";
    }).catch(function () {});
  }

  function nodeAllowed(slug) {
    if (state.radicalOrbit && slug === RADICAL_RESPONSIBILITY_SLUG) return true;
    if (state.filterSet && !state.filterSet.has(slug)) return false;
    if (state.pinned && !state.pinnedSet.has(slug)) return false;
    return true;
  }

  function edgeAllowed(edge) {
    if (edge.type === "curated" && !state.showCurated) return false;
    if (edge.type === "organic" && !state.showOrganic) return false;
    if (!nodeAllowed(edge.source.slug) || !nodeAllowed(edge.target.slug)) return false;
    if (state.pinned && edge.source.slug !== state.pinned && edge.target.slug !== state.pinned) return false;
    return true;
  }

  function neighborsVisible(slug) {
    var set = new Set([slug]);
    (graph.adjacency.get(slug) || []).forEach(function (edge) {
      if (edge.type === "curated" && !state.showCurated) return;
      if (edge.type === "organic" && !state.showOrganic) return;
      set.add(edge.source.slug === slug ? edge.target.slug : edge.source.slug);
    });
    return set;
  }

  function applyVisualState(rebuildEdges) {
    graph.nodes.forEach(function (node) {
      var visible = nodeAllowed(node.slug);
      node.mesh.visible = visible;
      if (!visible) return;

      var opacity = 1;
      var targetRadius = node.radius;

      if (state.pinned) {
        if (node.slug === state.pinned) targetRadius = node.radius * 1.38;
        else opacity = 0.86;
      } else if (state.hovered) {
        if (node.slug === state.hovered) targetRadius = node.radius * 1.38;
        else if (state.hoverSet.has(node.slug)) opacity = 0.9;
        else {
          opacity = 0.24;
          targetRadius = node.radius * 0.78;
        }
      }

      if (state.radicalOrbit && node.slug === RADICAL_RESPONSIBILITY_SLUG) {
        opacity = 1;
        targetRadius = Math.max(targetRadius, node.radius * 2.3, 86 * state.bubbleScale);
      }

      node.targetRadius = targetRadius;
      node.mesh.material.opacity = opacity;
      node.mesh.renderOrder = node.slug === state.hovered || node.slug === state.pinned ? 3 : 1;
      if (node.glow) {
        var focused = node.slug === state.hovered || node.slug === state.pinned;
        node.glow.material.opacity = focused ? 0.16 : BUBBLE_GLOW_OPACITY * opacity;
        node.glow.renderOrder = focused ? 2 : 0;
      }
      if (node.innerGlow) {
        node.innerGlow.material.uniforms.opacity.value =
          (node.slug === state.hovered || node.slug === state.pinned ? 0.32 : BUBBLE_INNER_GLOW_OPACITY) * opacity;
        node.innerGlow.renderOrder = node.slug === state.hovered || node.slug === state.pinned ? 4 : 2;
      }
    });

    if (rebuildEdges) rebuildEdgeBuffers();
    updateSelectionText();
  }

  function updateNodeRadii() {
    graph.nodes.forEach(function (node) {
      var base = state.sizeByLinks ? node.linkRadius : node.uniformRadius;
      node.radius = base * state.bubbleScale;
    });
  }

  function setSpreadScale(nextScale, moveCurrent) {
    var oldScale = state.spreadScale || 1;
    var ratio = oldScale > 0 ? nextScale / oldScale : 1;
    state.spreadScale = nextScale;

    graph.nodes.forEach(function (node) {
      node.home.copy(node.baseHome).multiplyScalar(nextScale);
      if (moveCurrent && (!state.drag || state.drag.node !== node)) {
        node.pos.multiplyScalar(ratio);
        clampVectorLength(node.pos, MAX_SCENE_RADIUS * Math.max(1, nextScale));
        node.velocity.multiplyScalar(0.45);
        node.mesh.position.copy(node.pos);
      }
    });

    graph.edges.forEach(function (edge) {
      edge.rest = Math.max(45, edge.baseRest * nextScale);
    });
  }

  function rebuildEdgeBuffers() {
    graph.activeCuratedEdges = [];
    graph.activeOrganicEdges = [];
    graph.activeRadicalOrbitEdges = [];

    graph.edges.forEach(function (edge) {
      if (!edgeAllowed(edge)) return;
      if (edge.type === "curated") graph.activeCuratedEdges.push(edge);
      else graph.activeOrganicEdges.push(edge);
    });

    if (state.radicalOrbit) {
      var hub = graph.nodeBySlug.get(RADICAL_RESPONSIBILITY_SLUG);
      if (hub) {
        graph.nodes.forEach(function (node) {
          if (node === hub || !nodeAllowed(node.slug)) return;
          graph.activeRadicalOrbitEdges.push({
            source: node,
            target: hub,
            type: "radicalOrbit"
          });
        });
      }
    }

    graph.activeHighlightEdges = [];
    var focus = state.pinned || state.hovered;
    if (focus) {
      (graph.adjacency.get(focus) || []).forEach(function (edge) {
        if (edgeAllowed(edge)) graph.activeHighlightEdges.push(edge);
      });
    }

    resetLineGeometry(graph.curatedLines, graph.activeCuratedEdges);
    resetLineGeometry(graph.organicLines, graph.activeOrganicEdges);
    resetLineGeometry(graph.radicalOrbitLines, graph.activeRadicalOrbitEdges);
    resetLineGeometry(graph.highlightLines, graph.activeHighlightEdges);
  }

  function resetLineGeometry(lines, edges) {
    var positions = new Float32Array(Math.max(1, edges.length * 6));
    lines.geometry.dispose();
    lines.geometry = new THREE.BufferGeometry();
    lines.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    lines.geometry.setDrawRange(0, edges.length * 2);
    lines.frustumCulled = false;
    lines.visible = edges.length > 0;
  }

  function syncLinePositions(lines, edges) {
    if (!edges.length) return;
    var attr = lines.geometry.getAttribute("position");
    var array = attr.array;
    var i = 0;
    edges.forEach(function (edge) {
      array[i++] = edge.source.pos.x;
      array[i++] = edge.source.pos.y;
      array[i++] = edge.source.pos.z;
      array[i++] = edge.target.pos.x;
      array[i++] = edge.target.pos.y;
      array[i++] = edge.target.pos.z;
    });
    attr.needsUpdate = true;
  }

  function applySearch(query) {
    query = query.trim().toLowerCase();
    clearRailActive();
    clearPin();

    if (!query) {
      state.filterSet = null;
      applyVisualState(true);
      return;
    }

    state.filterSet = new Set();
    graph.nodes.forEach(function (node) {
      if (node.slug.toLowerCase().includes(query) || node.title.toLowerCase().includes(query)) {
        state.filterSet.add(node.slug);
      }
    });
    focusOnSlugs(Array.from(state.filterSet));
    applyVisualState(true);
  }

  function clearPin() {
    state.pinned = null;
    state.pinnedSet = new Set();
    state.radicalFocus = null;
    if (!state.hovered) $("card").classList.remove("show");
  }

  function setPinned(slug) {
    state.pinned = slug;
    state.pinnedSet = slug ? neighborsVisible(slug) : new Set();
    if (slug) {
      showCard(slug);
      if (state.radicalOrbit && slug !== RADICAL_RESPONSIBILITY_SLUG) {
        focusRadicalOrbitSelection(slug);
      } else {
        state.radicalFocus = null;
        focusOnSlugs(Array.from(state.pinnedSet), true);
      }
    } else if (!state.hovered) {
      state.radicalFocus = null;
      $("card").classList.remove("show");
    }
    applyVisualState(true);
  }

  function setHovered(slug) {
    if (state.hovered === slug) return;
    state.hovered = slug;
    state.hoverSet = slug ? neighborsVisible(slug) : new Set();
    if (slug) showCard(slug);
    else if (!state.pinned) $("card").classList.remove("show");
    document.body.style.cursor = slug ? "grab" : "default";
    applyVisualState(true);
  }

  function showCard(slug) {
    var node = graph.nodeBySlug.get(slug);
    if (!node) return;
    $("card-img").src = node.image;
    $("card-title").textContent = node.title;
    $("card-slug").textContent = node.archived
      ? "possibilitymanagement.xyz/" + node.slug + "/"
      : node.slug + ".mystrikingly.com";
    $("card-tag").textContent = node.tagline;
    $("card-hint").textContent = node.archived ? "Local archive page" : "Live site fallback";
    $("card").classList.add("show");
  }

  function updateSelectionText() {
    var selection = $("selection");
    if (!selection) return;
    var text = "Free orbit";
    if (state.filterSet) text = state.filterSet.size + " matching sites";
    if (state.pinned) {
      var node = graph.nodeBySlug.get(state.pinned);
      text = "Pinned: " + (node ? node.title : state.pinned);
    }
    if (state.drag) text = "Pulling: " + state.drag.node.title;
    selection.textContent = text;
  }

  function focusOnSlugs(slugs, keepDistance) {
    if (!slugs || !slugs.length) return;

    var center = new THREE.Vector3();
    var count = 0;
    slugs.forEach(function (slug) {
      var node = graph.nodeBySlug.get(slug);
      if (!node || !node.mesh.visible) return;
      center.add(node.pos);
      count++;
    });
    if (!count) return;
    center.multiplyScalar(1 / count);

    var maxDistance = 0;
    slugs.forEach(function (slug) {
      var node = graph.nodeBySlug.get(slug);
      if (!node || !node.mesh.visible) return;
      maxDistance = Math.max(maxDistance, node.pos.distanceTo(center));
    });

    var direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 0.001) direction.set(0, -0.15, 1);
    direction.normalize();

    var currentDistance = camera.position.distanceTo(controls.target);
    var distance = keepDistance
      ? currentDistance
      : THREE.MathUtils.clamp(maxDistance * 2.0 + 420, 520, 12000);

    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, distance);
    controls.update();
    updateZoomSliderFromCamera();
  }

  function focusRadicalOrbitSelection(slug) {
    var hub = graph.nodeBySlug.get(RADICAL_RESPONSIBILITY_SLUG);
    var node = graph.nodeBySlug.get(slug);
    if (!hub || !node || node === hub || !node.mesh.visible) return;

    centerRadicalOrbitHub(false);
    var side = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    var lift = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    var focusDirection = side.multiplyScalar(0.92).addScaledVector(lift, 0.28).normalize();
    state.radicalFocus = {
      slug: slug,
      direction: focusDirection
    };

    radicalOrbitTarget(node, hub, 0, tmpVec);
    node.pos.copy(tmpVec);
    node.velocity.set(0, 0, 0);
    if (node.mesh) node.mesh.position.copy(node.pos);
    focusOnRadicalOrbitPair(node, hub);
  }

  function focusOnRadicalOrbitPair(node, hub) {
    var center = hub.pos.clone().add(node.pos).multiplyScalar(0.5);
    var direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 0.001) direction.set(DEFAULT_CAMERA_X, DEFAULT_CAMERA_Y, DEFAULT_CAMERA_Z);
    direction.normalize();

    var separation = hub.pos.distanceTo(node.pos);
    var extent = separation + (hub.renderRadius || hub.targetRadius || hub.radius) + (node.renderRadius || node.targetRadius || node.radius);
    var distance = THREE.MathUtils.clamp(extent * 2.15 + 240, 460, 980);

    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, distance);
    controls.update();
    updateZoomSliderFromCamera();
  }

  function resetView() {
    state.hovered = null;
    state.hoverSet = new Set();
    state.pinned = null;
    state.pinnedSet = new Set();
    state.filterSet = null;
    state.radicalFocus = null;
    state.drag = null;
    $("search").value = "";
    clearRailActive();
    $("card").classList.remove("show");
    state.bubbleScale = Number($("bubble-size").value) / 100;
    state.sizeByLinks = $("size-by-links").checked;
    setSpreadScale(Number($("bubble-spacing").value) / 100, false);
    updateNodeRadii();

    graph.nodes.forEach(function (node) {
      node.pos.copy(node.home);
      node.velocity.set(0, 0, 0);
      node.mesh.position.copy(node.pos);
      node.targetRadius = node.radius;
      node.renderRadius = node.radius;
      node.mesh.scale.setScalar(node.radius);
    });
    if (state.radicalOrbit) centerRadicalOrbitHub(true);

    controls.target.set(0, 0, 0);
    camera.position.set(DEFAULT_CAMERA_X, DEFAULT_CAMERA_Y, DEFAULT_CAMERA_Z);
    $("zoom").value = DEFAULT_SETTINGS.zoom;
    setZoomFromSlider(DEFAULT_SETTINGS.zoom);
    updateSliderValue($("zoom"));
    applyVisualState(true);
  }

  function setPointer(event) {
    var rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pickNode(event) {
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    var hits = raycaster.intersectObjects(graph.pickables, false);
    for (var i = 0; i < hits.length; i++) {
      if (hits[i].object.visible) return graph.nodeBySlug.get(hits[i].object.userData.slug);
    }
    return null;
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    var node = pickNode(event);
    if (!node) {
      state.pointerDownEmpty = { x: event.clientX, y: event.clientY };
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    renderer.domElement.setPointerCapture(event.pointerId);
    controls.enabled = false;
    setHovered(node.slug);

    camera.getWorldDirection(tmpDir);
    dragPlane.setFromNormalAndCoplanarPoint(tmpDir, node.pos);
    raycaster.ray.intersectPlane(dragPlane, tmpVec);

    state.drag = {
      pointerId: event.pointerId,
      node: node,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      offset: tmpVec.clone().sub(node.pos)
    };
    updateSelectionText();
  }

  function onPointerMove(event) {
    if (state.drag) {
      event.preventDefault();
      event.stopPropagation();
      var drag = state.drag;
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) {
        drag.moved = true;
        document.body.style.cursor = "grabbing";
      }
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(dragPlane, tmpVec2)) {
        drag.node.pos.copy(tmpVec2.sub(drag.offset));
        clampVectorLength(drag.node.pos, MAX_SCENE_RADIUS * Math.max(1, state.spreadScale));
        drag.node.velocity.set(0, 0, 0);
        drag.node.mesh.position.copy(drag.node.pos);
      }
      return;
    }

    var node = pickNode(event);
    setHovered(node ? node.slug : null);
  }

  function onPointerUp(event) {
    if (state.drag) {
      event.preventDefault();
      event.stopPropagation();
      var drag = state.drag;
      state.drag = null;
      controls.enabled = true;
      try {
        renderer.domElement.releasePointerCapture(event.pointerId);
      } catch (err) {}

      if (!drag.moved) setPinned(drag.node.slug);
      else {
        if (state.radicalFocus && state.radicalFocus.slug === drag.node.slug) state.radicalFocus = null;
        updateSelectionText();
      }
      document.body.style.cursor = state.hovered ? "grab" : "default";
      return;
    }

    if (state.pointerDownEmpty) {
      var dx = event.clientX - state.pointerDownEmpty.x;
      var dy = event.clientY - state.pointerDownEmpty.y;
      state.pointerDownEmpty = null;
      if (Math.hypot(dx, dy) < 5 && state.pinned) setPinned(null);
    }
  }

  function onDoubleClick(event) {
    var node = pickNode(event);
    if (!node || !node.url) return;
    event.preventDefault();
    event.stopPropagation();
    window.open(node.url, "_blank", "noopener");
  }

  function stepPhysics(delta) {
    var frame = Math.min(delta * 60, 2.2);
    var tensionInput = $("tension");
    var tension = tensionInput ? tensionFromSlider(tensionInput.value) : 0.68;
    var homeStrength = 0.0026 * tension * frame;
    var springStrength = 0.00082 * tension * frame;
    var damping = Math.pow(0.84, frame);
    var physicsEdges = graph.activeCuratedEdges.concat(graph.activeOrganicEdges);

    graph.nodes.forEach(function (node) {
      if (!node.mesh.visible || (state.drag && state.drag.node === node)) return;
      tmpVec.copy(node.home).sub(node.pos);
      node.velocity.addScaledVector(tmpVec, homeStrength);
    });

    physicsEdges.forEach(function (edge) {
      var source = edge.source;
      var target = edge.target;
      if (!source.mesh.visible || !target.mesh.visible) return;

      tmpVec.copy(target.pos).sub(source.pos);
      var dist = Math.max(0.001, tmpVec.length());
      var stretch = THREE.MathUtils.clamp((dist - edge.rest) * springStrength, -0.42, 0.42);
      tmpVec.multiplyScalar(stretch / dist);

      if (!state.drag || state.drag.node !== source) source.velocity.add(tmpVec);
      if (!state.drag || state.drag.node !== target) target.velocity.sub(tmpVec);
    });

    if (state.radicalOrbit) applyRadicalOrbit(frame);

    graph.nodes.forEach(function (node) {
      if (!node.mesh.visible) return;
      if (!state.drag || state.drag.node !== node) {
        node.velocity.multiplyScalar(damping);
        node.pos.addScaledVector(node.velocity, frame);
        clampVectorLength(node.pos, MAX_SCENE_RADIUS * Math.max(1, state.spreadScale));
      }
      node.mesh.position.copy(node.pos);
    });
  }

  function applyRadicalOrbit(frame) {
    var hub = graph.nodeBySlug.get(RADICAL_RESPONSIBILITY_SLUG);
    if (!hub || !hub.mesh.visible) return;
    radicalOrbitTime += (frame / 60) * Math.max(0, state.orbitSpeedScale);
    var elapsed = radicalOrbitTime;

    if (!state.drag || state.drag.node !== hub) {
      tmpVec.set(0, 0, 0).sub(hub.pos);
      hub.velocity.addScaledVector(tmpVec, 0.04 * frame);
    }

    graph.nodes.forEach(function (node) {
      if (node === hub || !node.mesh.visible || (state.drag && state.drag.node === node)) return;

      tmpVec.copy(node.pos).sub(hub.pos);
      var distance = tmpVec.length();
      if (distance < 0.001) {
        var seed = hashString(node.slug);
        tmpVec.set(
          ((seed & 255) / 255) - 0.5,
          (((seed >>> 8) & 255) / 255) - 0.5,
          (((seed >>> 16) & 255) / 255) - 0.5
        );
        distance = Math.max(0.001, tmpVec.length());
      }

      tmpVec.multiplyScalar(1 / distance);
      var targetDistance = radicalOrbitDistance(node, hub);
      var radialError = distance - targetDistance;
      var radialPull = THREE.MathUtils.clamp(radialError * 0.0014, -1.8, 1.8) * frame;
      node.velocity.addScaledVector(tmpVec, -radialPull);

      radicalOrbitTarget(node, hub, elapsed, tmpDir);
      tmpDir.sub(node.pos);
      var targetPull = THREE.MathUtils.clamp(tmpDir.length() * 0.00115, 0, 1.25) * frame;
      if (targetPull > 0) node.velocity.addScaledVector(tmpDir.normalize(), targetPull);

      if (isRadicalFocusNode(node)) {
        node.velocity.multiplyScalar(Math.pow(0.62, frame));
        return;
      }

      tmpVec2.crossVectors(radicalOrbitAxis, tmpVec);
      if (tmpVec2.lengthSq() < 0.0001) tmpVec2.set(-tmpVec.y, tmpVec.x, tmpVec.z);
      tmpVec2.normalize();
      var speedSeed = (hashString(node.slug) % 100) / 100;
      node.velocity.addScaledVector(tmpVec2, (0.1 + speedSeed * 0.06) * frame * Math.max(0, state.orbitSpeedScale));
    });
  }

  function radicalOrbitDistance(node, hub) {
    if (isRadicalFocusNode(node)) return focusedRadicalOrbitDistance(node, hub);
    return THREE.MathUtils.clamp(
      (node.orbitDistance || 560) * Math.max(0.9, Math.sqrt(state.spreadScale)) + node.radius * 1.2,
      hub.radius + node.radius + 95,
      MAX_SCENE_RADIUS * Math.max(1, state.spreadScale) * 0.96
    );
  }

  function radicalOrbitTarget(node, hub, elapsed, out) {
    if (isRadicalFocusNode(node)) {
      out.copy(state.radicalFocus.direction).normalize();
      return out.multiplyScalar(focusedRadicalOrbitDistance(node, hub)).add(hub.pos);
    }
    if (!node.orbitSlot) node.orbitSlot = new THREE.Vector3(1, 0, 0);
    var angle = (elapsed || 0) * (node.orbitSpeed || 0.055) + (node.orbitPhase || 0);
    out.copy(node.orbitSlot).applyAxisAngle(radicalOrbitAxis, angle).normalize();
    return out.multiplyScalar(radicalOrbitDistance(node, hub)).add(hub.pos);
  }

  function isRadicalFocusNode(node) {
    return !!(
      state.radicalOrbit &&
      state.radicalFocus &&
      state.radicalFocus.slug === node.slug &&
      state.radicalFocus.direction
    );
  }

  function focusedRadicalOrbitDistance(node, hub) {
    var hubRadius = Math.max(hub.renderRadius || 0, hub.targetRadius || 0, hub.radius || 0);
    var nodeRadius = Math.max(node.renderRadius || 0, node.targetRadius || 0, node.radius || 0);
    return THREE.MathUtils.clamp(
      hubRadius + nodeRadius + RADICAL_FOCUS_GAP,
      RADICAL_FOCUS_MIN_DISTANCE,
      RADICAL_FOCUS_MAX_DISTANCE
    );
  }

  function easeSphereScales() {
    graph.nodes.forEach(function (node) {
      node.renderRadius += (node.targetRadius - node.renderRadius) * 0.18;
      node.mesh.scale.setScalar(node.renderRadius);
    });
  }

  function updateLabels() {
    var width = window.innerWidth;
    var height = window.innerHeight;
    var projections = [];

    graph.nodes.forEach(function (node) {
      tmpVec.copy(node.pos).project(camera);
      if (tmpVec.z < -1 || tmpVec.z > 1 || !node.mesh.visible) {
        node.labelEl.style.opacity = "0";
        return;
      }

      var x = (tmpVec.x * 0.5 + 0.5) * width;
      var y = (-tmpVec.y * 0.5 + 0.5) * height;
      var screenRadius = projectedRadius(node);
      projections.push({
        node: node,
        x: x,
        y: y,
        screenRadius: screenRadius,
        depth: camera.position.distanceToSquared(node.pos),
        fullOnScreen:
          screenRadius >= 12 &&
          x - screenRadius * 0.85 >= 0 &&
          x + screenRadius * 0.85 <= width &&
          y - screenRadius * 0.85 >= 0 &&
          y + screenRadius * 0.85 <= height
      });
    });

    projections.forEach(function (projection) {
      var node = projection.node;
      var show = shouldShowLabel(projection, projections);
      if (!show) {
        node.labelEl.style.opacity = "0";
        return;
      }

      var labelBox = labelBoxForProjection(projection);
      var labelWidth = labelBox.width;
      var labelHeight = labelBox.height;
      var baseFontSize = THREE.MathUtils.clamp(projection.screenRadius / 3.08, 11.25, 18.75);
      var fontSize = labelFitForBox(node.title, labelWidth, labelHeight, baseFontSize).fontSize;
      node.labelEl.classList.toggle("focus", node.slug === state.hovered || node.slug === state.pinned);
      node.labelEl.style.width = labelWidth.toFixed(1) + "px";
      node.labelEl.style.height = labelHeight.toFixed(1) + "px";
      node.labelEl.style.fontSize = fontSize.toFixed(1) + "px";
      node.labelEl.style.transform = "translate(-50%, -50%) translate(" + projection.x.toFixed(1) + "px," + projection.y.toFixed(1) + "px)";
      node.labelEl.style.opacity = node.slug === state.hovered || node.slug === state.pinned ? "1" : "0.78";
    });
  }

  function labelBoxForProjection(projection) {
    return {
      width: Math.max(58, projection.screenRadius * 2.35),
      height: Math.max(46, projection.screenRadius * 1.72)
    };
  }

  function labelFitForBox(title, width, height, baseFontSize) {
    var words = (title || "").trim().split(/\s+/).filter(Boolean);
    var longestWord = words.reduce(function (max, word) {
      return Math.max(max, word.length);
    }, 1);
    var contentWidth = Math.max(1, width - 8);
    var contentHeight = Math.max(1, height - 4);
    var characterWidth = baseFontSize * 0.68;
    var lineHeight = baseFontSize * 0.98;
    var horizontalFit = contentWidth / Math.max(characterWidth * longestWord, 1);
    var averageLineCapacity = Math.max(4, Math.floor(contentWidth / Math.max(characterWidth, 1)));
    var neededLines = Math.max(words.length > 1 ? 2 : 1, Math.ceil((title || "").length / averageLineCapacity));
    var verticalFit = contentHeight / Math.max(lineHeight * neededLines, 1);
    var fit = Math.min(1, horizontalFit, verticalFit);
    var minimumFontSize = 7.2;
    return {
      fontSize: THREE.MathUtils.clamp(baseFontSize * fit, minimumFontSize, baseFontSize),
      fits: baseFontSize * fit >= minimumFontSize
    };
  }

  function labelCanFit(projection) {
    var labelBox = labelBoxForProjection(projection);
    var baseFontSize = THREE.MathUtils.clamp(projection.screenRadius / 3.08, 11.25, 18.75);
    return labelFitForBox(projection.node.title, labelBox.width, labelBox.height, baseFontSize).fits;
  }

  function projectedRadius(node) {
    camera.getWorldDirection(tmpDir);
    tmpVec2.crossVectors(camera.up, tmpDir).normalize();
    if (tmpVec2.lengthSq() < 0.001) tmpVec2.set(1, 0, 0);

    var center = node.pos.clone().project(camera);
    var edge = node.pos.clone().addScaledVector(tmpVec2, node.renderRadius).project(camera);
    var cx = (center.x * 0.5 + 0.5) * window.innerWidth;
    var cy = (-center.y * 0.5 + 0.5) * window.innerHeight;
    var ex = (edge.x * 0.5 + 0.5) * window.innerWidth;
    var ey = (-edge.y * 0.5 + 0.5) * window.innerHeight;
    return Math.hypot(ex - cx, ey - cy);
  }

  function shouldShowLabel(projection, projections) {
    var node = projection.node;
    if (!node.mesh.visible) return false;
    if (state.radicalOrbit && node.slug === RADICAL_RESPONSIBILITY_SLUG) return true;
    if (node.slug === state.hovered || node.slug === state.pinned) return true;
    if (!projection.fullOnScreen) return false;
    if (isScreenOccluded(projection, projections)) return false;
    if (!labelCanFit(projection)) return false;
    if (state.filterSet && state.filterSet.size <= 45) return true;
    return projection.screenRadius >= 14;
  }

  function isScreenOccluded(projection, projections) {
    for (var i = 0; i < projections.length; i++) {
      var other = projections[i];
      if (other === projection) continue;
      if (other.depth >= projection.depth - 1) continue;
      var dx = projection.x - other.x;
      var dy = projection.y - other.y;
      var minDistance = projection.screenRadius * 0.86 + other.screenRadius * 0.72;
      if ((dx * dx + dy * dy) < (minDistance * minDistance)) return true;
    }
    return false;
  }

  function animate() {
    requestAnimationFrame(animate);
    var delta = clock.getDelta();
    controls.update();
    updateFogDensity();
    stepPhysics(delta);
    easeSphereScales();
    syncLinePositions(graph.curatedLines, graph.activeCuratedEdges);
    syncLinePositions(graph.organicLines, graph.activeOrganicEdges);
    syncLinePositions(graph.radicalOrbitLines, graph.activeRadicalOrbitEdges);
    syncLinePositions(graph.highlightLines, graph.activeHighlightEdges);
    updateLabels();
    renderer.render(scene, camera);
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    starfield();
  }

  function starfield() {
    var svg = $("stars");
    var width = window.innerWidth;
    var height = window.innerHeight;
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);

    var seed = 7027;
    var rnd = function () {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    var html = "";
    var starCount = Math.min(680, Math.max(320, Math.round((width * height) / 4200)));
    for (var i = 0; i < starCount; i++) {
      var x = (rnd() * width).toFixed(1);
      var y = (rnd() * height).toFixed(1);
      var pinprick = rnd() > 0.72;
      var r = (pinprick ? rnd() * 0.42 + 0.1 : rnd() * 1.35 + 0.18).toFixed(2);
      var o = (pinprick ? rnd() * 0.34 + 0.1 : rnd() * 0.5 + 0.14).toFixed(2);
      var color = rnd() > 0.78 ? "#ffe6a8" : "#d8f8ff";
      html += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + color + '" opacity="' + o + '"/>';
    }
    svg.innerHTML = html;
  }

  main();
})();
