const EARTH_RADIUS_M = 6_371_000;
const SURFACE_GRAVITY = 9.81;
const SCENE_RADIUS = 3.35;
const UNIFORM_DENSITY_MODEL = true;
const ANGULAR_FREQUENCY = Math.sqrt(SURFACE_GRAVITY / EARTH_RADIUS_M);
const FULL_PERIOD_SECONDS = 2 * Math.PI / ANGULAR_FREQUENCY;
const FAR_SIDE_SECONDS = FULL_PERIOD_SECONDS / 2;
const MAX_TRAIL_POINTS = 90;

const elements = {
  viewer: document.getElementById("earthViewer"),
  loading: document.getElementById("loadingMessage"),
  error: document.getElementById("errorMessage"),
  playPause: document.getElementById("playPause"),
  restart: document.getElementById("restartBtn"),
  resetCamera: document.getElementById("resetCameraBtn"),
  tunnelAngle: document.getElementById("tunnelAngle"),
  tunnelAngleValue: document.getElementById("tunnelAngleValue"),
  timeScale: document.getElementById("timeScale"),
  timeScaleValue: document.getElementById("timeScaleValue"),
  journeyClock: document.getElementById("journeyClock"),
  depth: document.getElementById("depthReadout"),
  speed: document.getElementById("speedReadout"),
  gravity: document.getElementById("gravityReadout"),
  angle: document.getElementById("angleReadout"),
  chord: document.getElementById("chordReadout"),
  journeyPhase: document.getElementById("journeyPhase"),
  journeyNarrative: document.getElementById("journeyNarrative"),
  progress: document.getElementById("progressFill"),
  midpointLabel: document.getElementById("tunnelMidpointLabel"),
  heroTunnelLength: document.getElementById("heroTunnelLength"),
  heroTunnelCaption: document.getElementById("heroTunnelCaption"),
  predictionFeedback: document.getElementById("predictionFeedback"),
  status: document.getElementById("simStatus")
};

let THREE;
let OrbitControls;
let renderer;
let scene;
let camera;
let controls;
let resizeObserver;
let visibilityObserver;
let motionQuery;
let ballGroup;
let ballLight;
let trail;
let trailAttribute;
let trailPoints = [];
let earthGroup;
let innerCoreGlow;
let tunnelGlow;
let tunnelBody;
let midpointRing;
let tunnelPortals = [];
let sceneLabels = {};
let elapsedSimulationSeconds = 0;
let lastFrameTime = null;
let lastPhaseKey = "";
let isPaused = false;
let isViewerVisible = true;
let hasFatalError = false;
let isDisposed = false;

void loadSimulation();

async function loadSimulation() {
  try {
    const modules = await Promise.all([
      import("three"),
      import("three/addons/controls/OrbitControls.js")
    ]);
    THREE = modules[0];
    OrbitControls = modules[1].OrbitControls;
    initializeSimulation();
  } catch (error) {
    console.error("Could not initialize the Earth tunnel simulation.", error);
    showError("The 3D Earth could not load. Refresh the page or check your connection.");
  }
}

function initializeSimulation() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010711);
  scene.fog = new THREE.FogExp2(0x010711, 0.025);

  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
  setDefaultCamera();

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.domElement.setAttribute("aria-hidden", "true");
  elements.viewer.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.minDistance = 7.2;
  controls.maxDistance = 18;
  controls.minPolarAngle = 0.36;
  controls.maxPolarAngle = Math.PI - 0.36;
  controls.target.set(0, 0, 0);
  controls.update();
  renderer.domElement.style.touchAction = "pan-y";

  addLighting();
  createStarField();
  createEarthCutaway();
  createTunnel();
  createBall();
  createTrail();
  createSceneLabels();
  updateTunnelGeometry();
  installEvents();
  resizeRenderer();
  restartSimulation({ announce: false, startPlaying: !motionQuery.matches });

  elements.loading.hidden = true;
  renderer.setAnimationLoop(animate);

  if (motionQuery.matches) {
    announce("Animation paused to respect reduced-motion settings. Press Drop ball to begin.");
  }
}

function addLighting() {
  scene.add(new THREE.HemisphereLight(0xb9e6ff, 0x16070c, 1.45));

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.7);
  keyLight.position.set(6, 8, 10);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x4cc9ff, 1.8);
  rimLight.position.set(-8, 2, -7);
  scene.add(rimLight);

  const coreLight = new THREE.PointLight(0xff9f43, 24, 11, 1.7);
  coreLight.position.set(0, 0, 2.5);
  scene.add(coreLight);
}

function createStarField() {
  const positions = [];
  const colors = [];
  const random = seededRandom(46);
  const paleBlue = new THREE.Color(0xb8dcff);
  const warmWhite = new THREE.Color(0xfff1d6);

  for (let index = 0; index < 720; index += 1) {
    const radius = 13 + random() * 18;
    const theta = random() * Math.PI * 2;
    const cosinePhi = random() * 2 - 1;
    const sinePhi = Math.sqrt(1 - cosinePhi * cosinePhi);
    positions.push(
      radius * sinePhi * Math.cos(theta),
      radius * cosinePhi,
      radius * sinePhi * Math.sin(theta)
    );
    const color = random() > 0.82 ? warmWhite : paleBlue;
    const brightness = 0.35 + random() * 0.65;
    colors.push(color.r * brightness, color.g * brightness, color.b * brightness);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.035,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.78,
    vertexColors: true,
    depthWrite: false
  });
  scene.add(new THREE.Points(geometry, material));
}

function createEarthCutaway() {
  earthGroup = new THREE.Group();
  earthGroup.rotation.x = -0.055;
  scene.add(earthGroup);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(SCENE_RADIUS * 1.035, 72, 48),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.075,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  atmosphere.renderOrder = -2;
  earthGroup.add(atmosphere);

  const backHemisphere = new THREE.Mesh(
    new THREE.SphereGeometry(SCENE_RADIUS, 96, 64, Math.PI, Math.PI, 0, Math.PI),
    new THREE.MeshPhysicalMaterial({
      map: createLayerTexture("#0b5f91", "#2bb7a6", 17),
      color: 0x299bd1,
      emissive: 0x052a49,
      emissiveIntensity: 0.6,
      roughness: 0.72,
      metalness: 0.02,
      clearcoat: 0.25,
      clearcoatRoughness: 0.76,
      side: THREE.DoubleSide
    })
  );
  backHemisphere.renderOrder = -1;
  earthGroup.add(backHemisphere);

  const layers = [
    { radius: SCENE_RADIUS, color: 0x2e9bd0, base: "#137aa9", vein: "#52c6b4", seed: 8, z: 0.015 },
    { radius: SCENE_RADIUS * 0.962, color: 0xd65a2c, base: "#b73a25", vein: "#f58b3a", seed: 15, z: 0.035 },
    { radius: SCENE_RADIUS * 0.546, color: 0xef8d17, base: "#d46a10", vein: "#ffc44c", seed: 23, z: 0.055 },
    { radius: SCENE_RADIUS * 0.191, color: 0xffe29a, base: "#ffb92e", vein: "#fff3b5", seed: 31, z: 0.075 }
  ];

  for (const layer of layers) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(layer.radius, 128),
      new THREE.MeshStandardMaterial({
        map: createLayerTexture(layer.base, layer.vein, layer.seed),
        color: layer.color,
        emissive: layer.color,
        emissiveIntensity: 0.08,
        roughness: 0.86,
        metalness: 0.015,
        side: THREE.DoubleSide
      })
    );
    disc.position.z = layer.z;
    disc.renderOrder = 1;
    earthGroup.add(disc);
  }

  const layerRings = [
    { radius: SCENE_RADIUS, color: 0x7dd3fc, width: 0.026 },
    { radius: SCENE_RADIUS * 0.962, color: 0xff9a56, width: 0.016 },
    { radius: SCENE_RADIUS * 0.546, color: 0xffd166, width: 0.017 },
    { radius: SCENE_RADIUS * 0.191, color: 0xfff3bf, width: 0.018 }
  ];

  for (const ring of layerRings) {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(ring.radius, ring.width, 10, 144),
      new THREE.MeshBasicMaterial({
        color: ring.color,
        transparent: true,
        opacity: 0.82,
        depthWrite: false
      })
    );
    mesh.position.z = 0.105;
    mesh.renderOrder = 3;
    earthGroup.add(mesh);
  }

  innerCoreGlow = new THREE.Mesh(
    new THREE.SphereGeometry(SCENE_RADIUS * 0.205, 44, 30),
    new THREE.MeshBasicMaterial({
      color: 0xffc24d,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  innerCoreGlow.position.z = 0.16;
  innerCoreGlow.renderOrder = 2;
  earthGroup.add(innerCoreGlow);
}

function createLayerTexture(baseColor, veinColor, seed) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const random = seededRandom(seed);

  context.fillStyle = baseColor;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const glow = context.createRadialGradient(210, 180, 18, 256, 256, 350);
  glow.addColorStop(0, "rgba(255,255,255,0.27)");
  glow.addColorStop(0.5, "rgba(255,255,255,0.035)");
  glow.addColorStop(1, "rgba(0,0,0,0.34)");
  context.fillStyle = glow;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = veinColor;
  context.globalAlpha = 0.18;
  for (let index = 0; index < 62; index += 1) {
    const startX = random() * 512;
    const startY = random() * 512;
    context.beginPath();
    context.moveTo(startX, startY);
    context.bezierCurveTo(
      startX + (random() - 0.5) * 130,
      startY + (random() - 0.5) * 130,
      startX + (random() - 0.5) * 210,
      startY + (random() - 0.5) * 210,
      startX + (random() - 0.5) * 270,
      startY + (random() - 0.5) * 270
    );
    context.lineWidth = 0.7 + random() * 3.2;
    context.stroke();
  }
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function createTunnel() {
  tunnelGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.38, SCENE_RADIUS * 2.08),
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  tunnelGlow.position.z = 0.16;
  tunnelGlow.renderOrder = 4;
  earthGroup.add(tunnelGlow);

  tunnelBody = new THREE.Mesh(
    new THREE.PlaneGeometry(0.205, SCENE_RADIUS * 2.08),
    new THREE.MeshBasicMaterial({
      color: 0x010711,
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide
    })
  );
  tunnelBody.position.z = 0.19;
  tunnelBody.renderOrder = 5;
  earthGroup.add(tunnelBody);

  midpointRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.235, 0.018, 10, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    })
  );
  midpointRing.position.z = 0.23;
  midpointRing.renderOrder = 6;
  earthGroup.add(midpointRing);

  tunnelPortals = [];
  for (let index = 0; index < 2; index += 1) {
    const portal = new THREE.Mesh(
      new THREE.TorusGeometry(0.155, 0.028, 12, 48),
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.95,
        depthWrite: false
      })
    );
    portal.position.z = 0.23;
    portal.renderOrder = 7;
    earthGroup.add(portal);
    tunnelPortals.push(portal);
  }
}

function createBall() {
  ballGroup = new THREE.Group();
  ballGroup.position.set(0, SCENE_RADIUS, 0.34);
  ballGroup.renderOrder = 10;
  earthGroup.add(ballGroup);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.245, 30, 22),
    new THREE.MeshBasicMaterial({
      color: 0xffd45c,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  ballGroup.add(glow);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.135, 36, 28),
    new THREE.MeshPhysicalMaterial({
      color: 0xfff4c4,
      emissive: 0xff8a18,
      emissiveIntensity: 1.15,
      roughness: 0.2,
      metalness: 0.08,
      clearcoat: 1,
      clearcoatRoughness: 0.16
    })
  );
  ballGroup.add(ball);

  ballLight = new THREE.PointLight(0xffb23f, 5.5, 3.1, 1.8);
  ballLight.position.set(0, 0, 0.42);
  ballGroup.add(ballLight);
}

function createTrail() {
  const positions = new Float32Array(MAX_TRAIL_POINTS * 3);
  trailAttribute = new THREE.BufferAttribute(positions, 3);
  trailAttribute.setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", trailAttribute);
  geometry.setDrawRange(0, 0);

  trail = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0xffcb52,
      transparent: true,
      opacity: 0.64,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  trail.position.z = 0.315;
  trail.renderOrder = 8;
  earthGroup.add(trail);
}

function createSceneLabels() {
  const labels = [
    { key: "start", text: "START", color: "#a5f3fc", scale: 0.82 },
    { key: "midpoint", text: "MIDPOINT", color: "#fff1a8", scale: 1.08 },
    { key: "far", text: "FAR EXIT", color: "#fda4af", scale: 1.04 }
  ];
  for (const label of labels) {
    const sprite = createTextSprite(label.text, label.color);
    sprite.scale.set(label.scale, label.scale * 0.23, 1);
    sprite.renderOrder = 12;
    earthGroup.add(sprite);
    sceneLabels[label.key] = sprite;
  }
}

function createTextSprite(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.font = "900 58px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = color;
  context.shadowBlur = 18;
  context.fillStyle = color;
  context.fillText(text, 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  return new THREE.Sprite(material);
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return function nextRandom() {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function getTunnelModel() {
  const angleDegrees = Number(elements.tunnelAngle.value);
  const angleRadians = THREE.MathUtils.degToRad(angleDegrees);
  const sine = Math.sin(angleRadians);
  const cosine = Math.cos(angleRadians);
  const halfChordMetres = EARTH_RADIUS_M * cosine;
  const halfChordScene = SCENE_RADIUS * cosine;
  const impactParameterMetres = EARTH_RADIUS_M * sine;
  const midpointX = SCENE_RADIUS * sine * cosine;
  const midpointY = SCENE_RADIUS * sine * sine;
  const axisToStartX = -sine;
  const axisToStartY = cosine;

  return {
    angleDegrees,
    angleRadians,
    sine,
    cosine,
    halfChordMetres,
    halfChordScene,
    chordLengthMetres: halfChordMetres * 2,
    impactParameterMetres,
    maximumDepthMetres: EARTH_RADIUS_M - impactParameterMetres,
    maximumSpeedMetresPerSecond: ANGULAR_FREQUENCY * halfChordMetres,
    midpointX,
    midpointY,
    axisToStartX,
    axisToStartY,
    startX: midpointX + axisToStartX * halfChordScene,
    startY: midpointY + axisToStartY * halfChordScene,
    farX: midpointX - axisToStartX * halfChordScene,
    farY: midpointY - axisToStartY * halfChordScene
  };
}

function updateTunnelGeometry() {
  const model = getTunnelModel();

  for (const mesh of [tunnelGlow, tunnelBody]) {
    mesh.position.x = model.midpointX;
    mesh.position.y = model.midpointY;
    mesh.rotation.z = model.angleRadians;
    mesh.scale.set(1, model.cosine, 1);
  }

  midpointRing.position.x = model.midpointX;
  midpointRing.position.y = model.midpointY;
  tunnelPortals[0].position.x = model.startX;
  tunnelPortals[0].position.y = model.startY;
  tunnelPortals[1].position.x = model.farX;
  tunnelPortals[1].position.y = model.farY;

  sceneLabels.start.position.set(model.startX - 0.7, model.startY + 0.2, 0.38);
  sceneLabels.midpoint.position.set(
    model.midpointX + model.cosine * 0.72,
    model.midpointY + model.sine * 0.72,
    0.38
  );
  const farRadius = Math.hypot(model.farX, model.farY) || 1;
  sceneLabels.far.position.set(
    model.farX + model.farX / farRadius * 0.38,
    model.farY + model.farY / farRadius * 0.38,
    0.38
  );

  const chordKilometres = model.chordLengthMetres / 1000;
  const formattedChord = Math.round(chordKilometres).toLocaleString("en") + " km";
  elements.tunnelAngleValue.value = model.angleDegrees + "°";
  elements.tunnelAngleValue.textContent = model.angleDegrees + "°";
  elements.tunnelAngle.setAttribute(
    "aria-valuetext",
    model.angleDegrees + " degrees from straight down; " + formattedChord + " chord"
  );
  elements.angle.textContent = model.angleDegrees + "° from straight down";
  elements.chord.textContent = formattedChord;
  elements.midpointLabel.textContent = model.angleDegrees === 0 ? "Centre" : "Tunnel midpoint";
  elements.heroTunnelLength.textContent = formattedChord;
  elements.heroTunnelCaption.textContent = model.angleDegrees === 0
    ? "through the centre at 0°"
    : model.angleDegrees + "° chord · still about 42 minutes";
}

function installEvents() {
  motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  elements.playPause.addEventListener("click", togglePlayback);
  elements.restart.addEventListener("click", () => restartSimulation({ announce: true, startPlaying: true }));
  elements.resetCamera.addEventListener("click", () => {
    setDefaultCamera();
    controls.target.set(0, 0, 0);
    controls.update();
    announce("Camera view reset.");
  });

  elements.tunnelAngle.addEventListener("input", () => {
    elapsedSimulationSeconds = 0;
    lastFrameTime = null;
    lastPhaseKey = "";
    clearTrail();
    updateTunnelGeometry();
    updateSimulationState(0, { announcePhase: false });
  });
  elements.tunnelAngle.addEventListener("change", () => {
    const model = getTunnelModel();
    const shouldKeepPlaying = !isPaused;
    restartSimulation({ announce: false, startPlaying: shouldKeepPlaying });
    announce(
      "Tunnel tilted to " + model.angleDegrees + " degrees. It is " +
      Math.round(model.chordLengthMetres / 1000).toLocaleString("en") +
      " kilometres long, but the ideal crossing still takes about 42 minutes."
    );
  });

  elements.timeScale.addEventListener("input", () => {
    elements.timeScaleValue.value = elements.timeScale.value + "×";
    elements.timeScaleValue.textContent = elements.timeScale.value + "×";
  });
  elements.timeScale.addEventListener("change", () => {
    announce("Time accelerator set to " + elements.timeScale.value + " times.");
  });

  for (const button of document.querySelectorAll(".prediction-option")) {
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => choosePrediction(button));
  }

  elements.viewer.addEventListener("keydown", handleViewerKeydown);
  renderer.domElement.addEventListener("webglcontextlost", handleContextLost, false);
  renderer.domElement.addEventListener("webglcontextrestored", handleContextRestored, false);
  document.addEventListener("visibilitychange", handleDocumentVisibility);
  window.addEventListener("pagehide", handlePageHide);

  const motionListener = event => {
    if (event.matches && !isPaused) {
      setPaused(true, "Animation paused because reduced motion is preferred.");
    }
  };
  motionQuery.addEventListener?.("change", motionListener);

  resizeObserver = new ResizeObserver(resizeRenderer);
  resizeObserver.observe(elements.viewer);

  visibilityObserver = new IntersectionObserver(entries => {
    isViewerVisible = entries[0]?.isIntersecting ?? true;
    lastFrameTime = null;
  }, { threshold: 0.02 });
  visibilityObserver.observe(elements.viewer);
}

function choosePrediction(selectedButton) {
  const answer = selectedButton.dataset.answer;
  for (const button of document.querySelectorAll(".prediction-option")) {
    const isSelected = button === selectedButton;
    button.setAttribute("aria-pressed", String(isSelected));
    button.classList.toggle("is-correct", isSelected && answer === "same");
  }

  if (answer === "same") {
    elements.predictionFeedback.innerHTML =
      "<strong>Cosmic tie!</strong> The shorter road and gentler pull cancel perfectly: about 42 minutes.";
  } else if (answer === "faster") {
    elements.predictionFeedback.innerHTML =
      "<strong>The road is shorter.</strong> But tilting also weakens gravity's forward tug—enough to erase the gain.";
  } else {
    elements.predictionFeedback.innerHTML =
      "<strong>The forward tug is weaker.</strong> But the distance shrinks by exactly the matching amount.";
  }
}

function togglePlayback() {
  const nextPausedState = !isPaused;
  setPaused(nextPausedState, nextPausedState ? "Simulation paused." : "Simulation continuing.");
}

function setPaused(paused, message) {
  isPaused = paused;
  lastFrameTime = null;
  elements.playPause.textContent = isPaused
    ? (elapsedSimulationSeconds === 0 ? "Drop ball" : "Continue")
    : "Pause";
  elements.playPause.setAttribute("aria-pressed", String(isPaused));
  if (message) announce(message);
}

function restartSimulation({ announce: shouldAnnounce = true, startPlaying = true } = {}) {
  elapsedSimulationSeconds = 0;
  lastFrameTime = null;
  lastPhaseKey = "";
  clearTrail();
  setPaused(!startPlaying, "");
  updateSimulationState(0, { announcePhase: false });
  if (shouldAnnounce) {
    announce("Drop restarted in the " + getTunnelModel().angleDegrees + " degree tunnel.");
  }
}

function updateSimulationState(simulationSeconds, { announcePhase = true } = {}) {
  const model = getTunnelModel();
  const phase = ANGULAR_FREQUENCY * simulationSeconds;
  const positionAlongTunnelMetres = model.halfChordMetres * Math.cos(phase);
  const velocityMetresPerSecond = -model.halfChordMetres * ANGULAR_FREQUENCY * Math.sin(phase);
  const accelerationMetresPerSecondSquared =
    -ANGULAR_FREQUENCY * ANGULAR_FREQUENCY * positionAlongTunnelMetres;
  const sceneOffset = model.halfChordScene * Math.cos(phase);
  const sceneX = model.midpointX + model.axisToStartX * sceneOffset;
  const sceneY = model.midpointY + model.axisToStartY * sceneOffset;

  ballGroup.position.set(sceneX, sceneY, 0.34);
  const speedRatio = Math.abs(velocityMetresPerSecond) / model.maximumSpeedMetresPerSecond;
  const pulse = 1 + Math.sin(simulationSeconds * 0.055) * 0.06 + speedRatio * 0.1;
  ballGroup.scale.setScalar(pulse);
  ballLight.intensity = 4.2 + speedRatio * 5.3;
  innerCoreGlow.material.opacity = 0.1 + speedRatio * 0.08;

  updateTrail(sceneX, sceneY);
  updateReadouts({
    simulationSeconds,
    phase,
    model,
    positionAlongTunnelMetres,
    velocityMetresPerSecond,
    accelerationMetresPerSecondSquared
  }, { announcePhase });
}

function updateReadouts(state, { announcePhase = true } = {}) {
  const normalizedPhase = ((state.phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const radialDistanceMetres = Math.hypot(
    state.model.impactParameterMetres,
    state.positionAlongTunnelMetres
  );
  const depthKilometres = (EARTH_RADIUS_M - radialDistanceMetres) / 1000;
  const speedKilometresPerSecond = Math.abs(state.velocityMetresPerSecond) / 1000;
  const alongTunnelGravity = Math.abs(state.accelerationMetresPerSecondSquared);
  const routeProgress = (1 - Math.cos(normalizedPhase)) / 2;

  elements.journeyClock.textContent = formatTime(state.simulationSeconds % FULL_PERIOD_SECONDS);
  elements.depth.textContent = Math.max(0, depthKilometres).toLocaleString("en", {
    maximumFractionDigits: depthKilometres < 10 ? 1 : 0
  }) + " km";
  elements.speed.textContent = speedKilometresPerSecond.toFixed(2) + " km/s";
  elements.gravity.textContent = alongTunnelGravity.toFixed(2) + " m/s²";
  elements.progress.style.width = (routeProgress * 100).toFixed(2) + "%";

  const phaseStory = describeJourney(normalizedPhase, state.model);
  elements.journeyPhase.textContent = phaseStory.title;
  elements.journeyNarrative.textContent = phaseStory.narrative;
  if (phaseStory.key !== lastPhaseKey) {
    lastPhaseKey = phaseStory.key;
    if (announcePhase) announce(phaseStory.announcement);
  }
}

function describeJourney(phase, model) {
  const turnWindow = 0.075;
  const centreWindow = 0.095;
  const halfPi = Math.PI / 2;
  const crossesEarthCentre = model.angleDegrees === 0;
  const maximumSpeed = (model.maximumSpeedMetresPerSecond / 1000).toFixed(2);

  if (phase < turnWindow || phase > Math.PI * 2 - turnWindow) {
    return {
      key: "start",
      title: "Leaving the surface",
      narrative: crossesEarthCentre
        ? "Earth pulls. The adventure begins."
        : "Shorter road, gentler forward pull. Start the clock.",
      announcement: "The ball is entering the " + model.angleDegrees + " degree tunnel."
    };
  }
  if (phase < halfPi - centreWindow) {
    return {
      key: "inbound",
      title: "Diving toward the midpoint",
      narrative: "The forward pull weakens, yet the ball keeps speeding up.",
      announcement: "The ball is accelerating toward the tunnel midpoint."
    };
  }
  if (phase < halfPi + centreWindow) {
    return {
      key: "first-center",
      title: crossesEarthCentre ? "Centre crossed!" : "Closest approach!",
      narrative: crossesEarthCentre
        ? "Gravity is zero here. Speed is a blazing " + maximumSpeed + " km/s."
        : "Forward pull is zero; speed peaks at " + maximumSpeed + " km/s. Gravity still pulls sideways.",
      announcement: crossesEarthCentre
        ? "Earth's centre crossed at maximum speed."
        : "Tunnel midpoint crossed at maximum speed. Gravity still points sideways toward Earth's centre."
    };
  }
  if (phase < Math.PI - turnWindow) {
    return {
      key: "outbound",
      title: "Climbing toward the far exit",
      narrative: "Gravity's along-tunnel pull points backward now, slowing the ball down.",
      announcement: "The ball is climbing toward the far exit and slowing down."
    };
  }
  if (phase < Math.PI + turnWindow) {
    return {
      key: "far-side",
      title: crossesEarthCentre ? "The antipode!" : "The tilted exit!",
      narrative: "A heartbeat at rest—then the whole journey reverses.",
      announcement: "The ball reaches the far end after about 42 minutes, stops briefly, and falls back."
    };
  }
  if (phase < Math.PI + halfPi - centreWindow) {
    return {
      key: "return-inbound",
      title: "Falling back through Earth",
      narrative: "No drag means no energy lost. Here comes the midpoint again.",
      announcement: "The ball is returning toward the tunnel midpoint."
    };
  }
  if (phase < Math.PI + halfPi + centreWindow) {
    return {
      key: "second-center",
      title: crossesEarthCentre ? "Centre crossed again" : "Midpoint crossed again",
      narrative: crossesEarthCentre
        ? "Maximum speed, zero gravity—the perfect fly-through."
        : "Maximum speed again; the tube cancels gravity's sideways tug.",
      announcement: crossesEarthCentre
        ? "The ball crosses Earth's centre again at maximum speed."
        : "The ball crosses the chord midpoint again at maximum speed."
    };
  }
  return {
    key: "homeward",
    title: "The homeward climb",
    narrative: "It slows toward the start, ready to repeat forever.",
    announcement: "The ball is climbing back toward its starting surface."
  };
}

function updateTrail(sceneX, sceneY) {
  const latest = trailPoints[trailPoints.length - 1];
  if (!latest || Math.hypot(latest.x - sceneX, latest.y - sceneY) > 0.018) {
    trailPoints.push({ x: sceneX, y: sceneY });
    if (trailPoints.length > MAX_TRAIL_POINTS) trailPoints.shift();
  }

  const positions = trailAttribute.array;
  for (let index = 0; index < trailPoints.length; index += 1) {
    positions[index * 3] = trailPoints[index].x;
    positions[index * 3 + 1] = trailPoints[index].y;
    positions[index * 3 + 2] = 0;
  }
  trail.geometry.setDrawRange(0, trailPoints.length);
  trailAttribute.needsUpdate = true;
}

function clearTrail() {
  trailPoints = [];
  if (trail) {
    trail.geometry.setDrawRange(0, 0);
    trailAttribute.needsUpdate = true;
  }
}

function formatTime(totalSeconds) {
  const roundedSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

function handleViewerKeydown(event) {
  if (hasFatalError) return;
  const key = event.key.toLowerCase();

  if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
    return;
  }
  if (key === "r") {
    event.preventDefault();
    restartSimulation({ announce: true, startPlaying: true });
    return;
  }
  if (key === "0") {
    event.preventDefault();
    setDefaultCamera();
    controls.target.set(0, 0, 0);
    controls.update();
    announce("Camera view reset.");
    return;
  }

  const arrows = ["arrowleft", "arrowright", "arrowup", "arrowdown"];
  if (arrows.includes(key)) {
    event.preventDefault();
    orbitCamera(key);
  } else if (key === "+" || key === "=" || key === "-" || key === "_") {
    event.preventDefault();
    zoomCamera(key === "+" || key === "=" ? 0.9 : 1.1);
  }
}

function orbitCamera(direction) {
  const offset = camera.position.clone().sub(controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  const step = 0.11;
  if (direction === "arrowleft") spherical.theta += step;
  if (direction === "arrowright") spherical.theta -= step;
  if (direction === "arrowup") spherical.phi = Math.max(0.38, spherical.phi - step);
  if (direction === "arrowdown") spherical.phi = Math.min(Math.PI - 0.38, spherical.phi + step);
  camera.position.copy(new THREE.Vector3().setFromSpherical(spherical).add(controls.target));
  camera.lookAt(controls.target);
  controls.update();
}

function zoomCamera(factor) {
  const offset = camera.position.clone().sub(controls.target);
  const newLength = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
  offset.setLength(newLength);
  camera.position.copy(controls.target).add(offset);
  controls.update();
}

function setDefaultCamera() {
  camera.position.set(7.7, 1.45, 10.6);
  camera.lookAt(0, 0, 0);
}

function resizeRenderer() {
  if (!renderer || hasFatalError) return;
  const width = Math.max(1, elements.viewer.clientWidth);
  const height = Math.max(1, elements.viewer.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate(frameTime) {
  if (hasFatalError || isDisposed) return;
  if (lastFrameTime === null) lastFrameTime = frameTime;
  const deltaSeconds = Math.min(Math.max((frameTime - lastFrameTime) / 1000, 0), 0.05);
  lastFrameTime = frameTime;

  if (isViewerVisible && !document.hidden && !isPaused) {
    const timeScale = Number(elements.timeScale.value);
    elapsedSimulationSeconds = (elapsedSimulationSeconds + deltaSeconds * timeScale) % FULL_PERIOD_SECONDS;
    updateSimulationState(elapsedSimulationSeconds);
  }

  if (earthGroup) {
    const shimmer = elapsedSimulationSeconds * 0.00065;
    earthGroup.rotation.y = Math.sin(shimmer) * 0.018;
  }
  controls.update();
  if (isViewerVisible) renderer.render(scene, camera);
}

function handleDocumentVisibility() {
  lastFrameTime = null;
}

function handleContextLost(event) {
  event.preventDefault();
  showError("The 3D graphics context was lost. Refresh the page to restart the experiment.");
}

function handleContextRestored() {
  showError("The 3D graphics context was restored. Refresh the page to rebuild the experiment.");
}

function showError(message) {
  hasFatalError = true;
  if (elements.loading) elements.loading.hidden = true;
  if (elements.error) {
    elements.error.textContent = message;
    elements.error.hidden = false;
  }
  if (renderer) renderer.setAnimationLoop(null);
  if (controls) controls.enabled = false;
  elements.viewer.tabIndex = -1;
  for (const control of document.querySelectorAll(".side-panel input, .side-panel button")) {
    control.disabled = true;
  }
}

function announce(message) {
  elements.status.textContent = "";
  window.setTimeout(() => {
    elements.status.textContent = message;
  }, 20);
}

function handlePageHide(event) {
  if (!event.persisted) disposeSimulation();
}

function disposeSimulation() {
  if (isDisposed) return;
  isDisposed = true;
  resizeObserver?.disconnect();
  visibilityObserver?.disconnect();
  renderer?.setAnimationLoop(null);
  controls?.dispose();

  scene?.traverse(object => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        material.map?.dispose();
        material.dispose();
      }
    }
  });
  renderer?.dispose();
}

// Every straight chord is simple harmonic motion in a uniform-density Earth.
// With h = R cos(angle), s(t) = h cos(ωt), v(t) = -hω sin(ωt), and a(t) = -ω²s.
// A tilted chord is shorter and has a lower maximum speed, but still takes about
// 21.1 minutes to its midpoint, 42.2 minutes to the far end, and 84.4 minutes
// for a complete, constrained, drag-free oscillation.
if (!UNIFORM_DENSITY_MODEL || Math.abs(FAR_SIDE_SECONDS / 60 - 42.2) > 0.4) {
  console.warn("Earth tunnel model constants are outside the expected idealized range.");
}
