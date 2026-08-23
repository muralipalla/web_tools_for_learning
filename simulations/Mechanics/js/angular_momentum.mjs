const PULSE_DURATION = 0.1;
const INITIAL_OMEGA = 0;
const INITIAL_PHASE = 0;
const TAU = Math.PI * 2;
const EPSILON = 1e-7;
const WORLD_AXIS_LENGTH = 4.6;
const AXIS_LABEL_OFFSET = 0.42;
const GUIDE_SHAFT_RADIUS = 0.065;
const L_SHAFT_RADIUS = 0.1;

const elements = {
  viewer: document.getElementById("viewer"),
  loadingMessage: document.getElementById("loadingMessage"),
  errorMessage: document.getElementById("errorMessage"),
  inertiaReadout: document.getElementById("inertiaReadout"),
  omegaReadout: document.getElementById("omegaReadout"),
  angularMomentumReadout: document.getElementById("angularMomentumReadout"),
  rVector: document.getElementById("rVector"),
  rMagnitude: document.getElementById("rMagnitude"),
  vVector: document.getElementById("vVector"),
  vMagnitude: document.getElementById("vMagnitude"),
  pVector: document.getElementById("pVector"),
  pMagnitude: document.getElementById("pMagnitude"),
  lVector: document.getElementById("lVector"),
  lMagnitude: document.getElementById("lMagnitude"),
  mass: document.getElementById("mass"),
  massValue: document.getElementById("massValue"),
  radius: document.getElementById("radius"),
  radiusValue: document.getElementById("radiusValue"),
  torque: document.getElementById("torque"),
  torqueValue: document.getElementById("torqueValue"),
  tilt: document.getElementById("tilt"),
  tiltValue: document.getElementById("tiltValue"),
  azimuth: document.getElementById("azimuth"),
  azimuthValue: document.getElementById("azimuthValue"),
  playPause: document.getElementById("playPause"),
  restartBtn: document.getElementById("restartBtn"),
  resetCameraBtn: document.getElementById("resetCameraBtn"),
  simStatus: document.getElementById("simStatus")
};

let THREE;
let OrbitControls;

void loadSimulation();

async function loadSimulation() {
  try {
    const [threeModule, controlsModule] = await Promise.all([
      import("three"),
      import("three/addons/controls/OrbitControls.js")
    ]);
    THREE = threeModule;
    OrbitControls = controlsModule.OrbitControls;
    initializeSimulation();
  } catch (error) {
    console.error("Could not initialize the angular momentum simulation.", error);
    showError();
  }
}

function initializeSimulation() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let isPaused = reducedMotion.matches;
  let userChosePlayback = false;
  let isVisible = true;
  let documentHidden = document.hidden;
  let simulationTime = 0;
  let lastTimestamp = null;
  let lastTrailSample = -Infinity;
  let lastReadoutTime = -Infinity;
  let active = null;
  let trailPoints = [];
  let needsRender = true;
  let isDisposed = false;
  let hasFatalError = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020617);
  scene.fog = new THREE.FogExp2(0x020617, 0.035);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  const defaultCameraPosition = new THREE.Vector3(8.6, 6.7, 9.8);
  camera.position.copy(defaultCameraPosition);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.domElement.setAttribute("aria-hidden", "true");
  elements.viewer.prepend(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.enablePan = false;
  controls.minDistance = 5;
  controls.maxDistance = 25;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = Math.PI - 0.12;
  controls.target.set(0, 0, 0);
  controls.update();
  renderer.domElement.style.touchAction = "pan-y";
  controls.addEventListener("change", requestRender);

  scene.add(new THREE.HemisphereLight(0xa8d8ff, 0x071426, 1.2));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(5, 8, 6);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(0x8b5cf6, 24, 28, 1.8);
  rimLight.position.set(-5, 3, -5);
  scene.add(rimLight);

  const grid = new THREE.GridHelper(14, 14, 0x315d83, 0x173652);
  grid.position.y = -4.2;
  grid.material.transparent = true;
  grid.material.opacity = 0.42;
  scene.add(grid);

  const axes = new THREE.AxesHelper(WORLD_AXIS_LENGTH);
  axes.material.transparent = true;
  axes.material.opacity = 0.55;
  scene.add(axes);

  const xAxisLabel = createLabelSprite("X", "#ff5a5a");
  const yAxisLabel = createLabelSprite("Y", "#55e879");
  const zAxisLabel = createLabelSprite("Z", "#60a5fa");
  for (const label of [xAxisLabel, yAxisLabel, zAxisLabel]) {
    label.scale.set(0.56, 0.28, 1);
  }
  xAxisLabel.position.set(WORLD_AXIS_LENGTH + AXIS_LABEL_OFFSET, 0, 0);
  yAxisLabel.position.set(0, WORLD_AXIS_LENGTH + AXIS_LABEL_OFFSET, 0);
  zAxisLabel.position.set(0, 0, WORLD_AXIS_LENGTH + AXIS_LABEL_OFFSET);
  scene.add(xAxisLabel, yAxisLabel, zAxisLabel);

  const origin = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 24, 18),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0x334155, roughness: 0.35 })
  );
  scene.add(origin);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 36, 26),
    new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      emissive: 0x0b3c75,
      emissiveIntensity: 0.65,
      roughness: 0.3,
      metalness: 0.08
    })
  );
  scene.add(ball);

  const orbitalPlane = new THREE.Mesh(
    new THREE.CircleGeometry(1, 96),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.055,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  scene.add(orbitalPlane);

  const orbitSegments = 160;
  const orbitPositions = new Float32Array((orbitSegments + 1) * 3);
  const orbitGeometry = new THREE.BufferGeometry();
  orbitGeometry.setAttribute("position", new THREE.BufferAttribute(orbitPositions, 3));
  const orbitLine = new THREE.LineLoop(
    orbitGeometry,
    new THREE.LineBasicMaterial({ color: 0x74c9f5, transparent: true, opacity: 0.55 })
  );
  scene.add(orbitLine);

  const axisPositions = new Float32Array(6);
  const axisGeometry = new THREE.BufferGeometry();
  axisGeometry.setAttribute("position", new THREE.BufferAttribute(axisPositions, 3));
  const axisLine = new THREE.Line(
    axisGeometry,
    new THREE.LineDashedMaterial({
      color: 0xb6a5ef,
      dashSize: 0.2,
      gapSize: 0.14,
      transparent: true,
      opacity: 0.5
    })
  );
  scene.add(axisLine);

  const trailCapacity = 180;
  const trailPositions = new Float32Array(trailCapacity * 3);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
  trailGeometry.setDrawRange(0, 0);
  const trail = new THREE.Line(
    trailGeometry,
    new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.72 })
  );
  scene.add(trail);

  const radiusArrow = createMeshArrow(0x38bdf8, {
    shaftRadius: GUIDE_SHAFT_RADIUS,
    headRadius: 0.19,
    minHead: 0.22,
    maxHead: 0.42,
    overlay: true
  });
  const velocityArrow = createMeshArrow(0x34d399, {
    shaftRadius: GUIDE_SHAFT_RADIUS,
    headRadius: 0.19,
    minHead: 0.22,
    maxHead: 0.42
  });
  const angularArrow = createMeshArrow(0xfbbf24, {
    shaftRadius: L_SHAFT_RADIUS,
    headRadius: 0.27,
    minHead: 0.34,
    maxHead: 0.58
  });
  const radiusLabel = createLabelSprite("r", "#38bdf8");
  const velocityLabel = createLabelSprite("v", "#34d399");
  const angularLabel = createLabelSprite("L", "#fbbf24");
  scene.add(
    radiusArrow,
    velocityArrow,
    angularArrow,
    radiusLabel,
    velocityLabel,
    angularLabel
  );

  const zAxis = new THREE.Vector3(0, 0, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);

  function createMeshArrow(color, { shaftRadius, headRadius, minHead, maxHead, overlay = false }) {
    const baseColor = new THREE.Color(color);
    const material = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: baseColor.clone().multiplyScalar(0.28),
      emissiveIntensity: 0.7,
      roughness: 0.25,
      metalness: 0.06,
      depthTest: !overlay,
      depthWrite: !overlay
    });
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(shaftRadius, shaftRadius, 1, 20),
      material
    );
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(headRadius, 0.5, 24),
      material
    );
    const arrow = new THREE.Group();
    arrow.add(shaft, head);
    arrow.renderOrder = overlay ? 6 : 0;
    Object.assign(arrow.userData, { shaft, head, minHead, maxHead });
    return arrow;
  }

  function createLabelSprite(text, color) {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 80;
    const context = canvas.getContext("2d");
    context.fillStyle = "rgba(2, 6, 23, 0.82)";
    context.fillRect(16, 10, 128, 60);
    context.strokeStyle = color;
    context.lineWidth = 4;
    context.strokeRect(16, 10, 128, 60);
    context.fillStyle = color;
    context.font = "700 42px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 80, 40);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
    );
    sprite.scale.set(0.72, 0.36, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  function readParameters() {
    const tilt = THREE.MathUtils.degToRad(Number(elements.tilt.value));
    const azimuth = THREE.MathUtils.degToRad(Number(elements.azimuth.value));
    const axis = new THREE.Vector3(
      Math.sin(tilt) * Math.cos(azimuth),
      Math.cos(tilt),
      Math.sin(tilt) * Math.sin(azimuth)
    ).normalize();
    const basisU = new THREE.Vector3(
      Math.cos(tilt) * Math.cos(azimuth),
      -Math.sin(tilt),
      Math.cos(tilt) * Math.sin(azimuth)
    ).normalize();
    const basisV = new THREE.Vector3(
      Math.sin(azimuth),
      0,
      -Math.cos(azimuth)
    );

    return {
      mass: Number(elements.mass.value),
      radius: Number(elements.radius.value),
      phase: INITIAL_PHASE,
      omega0: INITIAL_OMEGA,
      torque: Number(elements.torque.value),
      axis,
      basisU,
      basisV
    };
  }

  function evaluateState(time) {
    const pulseTime = Math.min(time, PULSE_DURATION);
    const coastTime = Math.max(0, time - PULSE_DURATION);
    const alpha = active.torque / active.inertia;
    const omega = active.omega0 + alpha * pulseTime;
    const omegaAfterPulse = active.omega0 + alpha * PULSE_DURATION;
    const angle = (
      active.phase +
      active.omega0 * pulseTime +
      0.5 * alpha * pulseTime * pulseTime +
      omegaAfterPulse * coastTime
    ) % TAU;

    const radiusVector = active.basisU.clone().multiplyScalar(Math.cos(angle));
    radiusVector.addScaledVector(active.basisV, Math.sin(angle));
    radiusVector.multiplyScalar(active.radius);

    const omegaVector = active.axis.clone().multiplyScalar(omega);
    const velocity = new THREE.Vector3().crossVectors(omegaVector, radiusVector);
    const momentum = velocity.clone().multiplyScalar(active.mass);
    const angularMomentum = new THREE.Vector3().crossVectors(radiusVector, momentum);

    return {
      time,
      radiusVector,
      omega,
      omegaVector,
      velocity,
      momentum,
      angularMomentum
    };
  }

  function updateStaticGeometry() {
    for (let index = 0; index <= orbitSegments; index += 1) {
      const angle = (index / orbitSegments) * TAU;
      const point = active.basisU.clone().multiplyScalar(Math.cos(angle));
      point.addScaledVector(active.basisV, Math.sin(angle));
      point.multiplyScalar(active.radius);
      orbitPositions[index * 3] = point.x;
      orbitPositions[index * 3 + 1] = point.y;
      orbitPositions[index * 3 + 2] = point.z;
    }
    orbitGeometry.attributes.position.needsUpdate = true;
    orbitGeometry.computeBoundingSphere();

    const axisExtent = Math.max(4.8, active.radius * 1.7);
    const axisStart = active.axis.clone().multiplyScalar(-axisExtent);
    const axisEnd = active.axis.clone().multiplyScalar(axisExtent);
    axisPositions.set([axisStart.x, axisStart.y, axisStart.z, axisEnd.x, axisEnd.y, axisEnd.z]);
    axisGeometry.attributes.position.needsUpdate = true;
    axisLine.computeLineDistances();

    orbitalPlane.scale.setScalar(active.radius);
    orbitalPlane.quaternion.setFromUnitVectors(zAxis, active.axis);
    ball.scale.setScalar(0.88 + Math.cbrt(active.mass) * 0.12);
  }

  function setMeshArrow(arrow, vector, originPoint, visualLength) {
    const magnitude = vector.length();
    arrow.position.copy(originPoint);
    if (magnitude < EPSILON || visualLength < EPSILON) {
      arrow.visible = false;
      return null;
    }
    const direction = vector.clone().normalize();
    const headLength = Math.min(
      arrow.userData.maxHead,
      Math.max(arrow.userData.minHead, visualLength * 0.2),
      visualLength * 0.68
    );
    const shaftLength = Math.max(0.02, visualLength - headLength);
    const shaft = arrow.userData.shaft;
    const head = arrow.userData.head;
    shaft.scale.set(1, shaftLength, 1);
    shaft.position.set(0, shaftLength / 2, 0);
    head.scale.set(1, headLength / 0.5, 1);
    head.position.set(0, shaftLength + headLength / 2, 0);
    arrow.visible = true;
    arrow.quaternion.setFromUnitVectors(yAxis, direction);
    return originPoint.clone().addScaledVector(direction, visualLength);
  }

  function updateScene(state) {
    ball.position.copy(state.radiusVector);

    const radiusTip = setMeshArrow(
      radiusArrow,
      state.radiusVector,
      origin.position,
      active.radius
    );
    const velocityLength = 0.9 + Math.min(Math.log1p(state.velocity.length()) * 0.75, 3.2);
    const velocityTip = setMeshArrow(
      velocityArrow,
      state.velocity,
      state.radiusVector,
      velocityLength
    );

    const angularLength = 1.25 + Math.min(Math.log1p(state.angularMomentum.length()) * 0.78, 3.8);
    const angularTip = setMeshArrow(
      angularArrow,
      state.angularMomentum,
      origin.position,
      angularLength
    );

    updateLabel(radiusLabel, radiusTip, Boolean(radiusTip));
    updateLabel(velocityLabel, velocityTip, Boolean(velocityTip));
    updateLabel(angularLabel, angularTip, Boolean(angularTip));
  }

  function updateLabel(label, position, shouldShow) {
    label.visible = shouldShow;
    if (position) label.position.copy(position);
  }

  function updateTrail(state, force = false) {
    if (!force && state.time - lastTrailSample < 0.035) return;
    lastTrailSample = state.time;
    trailPoints.push(state.radiusVector.clone());
    if (trailPoints.length > trailCapacity) trailPoints.shift();
    for (let index = 0; index < trailPoints.length; index += 1) {
      const point = trailPoints[index];
      trailPositions[index * 3] = point.x;
      trailPositions[index * 3 + 1] = point.y;
      trailPositions[index * 3 + 2] = point.z;
    }
    trailGeometry.setDrawRange(0, trailPoints.length);
    trailGeometry.attributes.position.needsUpdate = true;
  }

  function updateReadouts(state, force = false) {
    if (!force && state.time - lastReadoutTime < 0.075) return;
    lastReadoutTime = state.time;
    const angularMomentumMagnitude = state.angularMomentum.length();
    elements.inertiaReadout.textContent = active.inertia.toFixed(2) + " kg·m²";
    elements.omegaReadout.textContent = formatSigned(state.omega) + " rad/s";
    elements.angularMomentumReadout.textContent = angularMomentumMagnitude.toFixed(2) + " kg·m²/s";
    elements.rVector.textContent = formatVector(state.radiusVector) + " m";
    elements.rMagnitude.textContent = state.radiusVector.length().toFixed(2) + " m";
    elements.vVector.textContent = formatVector(state.velocity) + " m/s";
    elements.vMagnitude.textContent = state.velocity.length().toFixed(2) + " m/s";
    elements.pVector.textContent = formatVector(state.momentum) + " kg·m/s";
    elements.pMagnitude.textContent = state.momentum.length().toFixed(2) + " kg·m/s";
    elements.lVector.textContent = formatVector(state.angularMomentum) + " kg·m²/s";
    elements.lMagnitude.textContent = angularMomentumMagnitude.toFixed(2) + " kg·m²/s";
  }

  function formatVector(vector) {
    return "(" + [vector.x, vector.y, vector.z].map(formatSigned).join(", ") + ")";
  }

  function formatSigned(value) {
    const clean = Math.abs(value) < 0.0005 ? 0 : value;
    return clean.toFixed(2);
  }

  function updateControlOutputs() {
    const massText = Number(elements.mass.value).toFixed(1) + " kg";
    const radiusText = Number(elements.radius.value).toFixed(1) + " m";
    const torqueText = Number(elements.torque.value).toFixed(1) + " N·m";
    const tiltText = String(Math.round(Number(elements.tilt.value))) + "°";
    const azimuthText = String(Math.round(Number(elements.azimuth.value))) + "°";

    elements.massValue.textContent = massText;
    elements.radiusValue.textContent = radiusText;
    elements.torqueValue.textContent = torqueText;
    elements.tiltValue.textContent = tiltText;
    elements.azimuthValue.textContent = azimuthText;
    elements.mass.setAttribute("aria-valuetext", massText);
    elements.radius.setAttribute("aria-valuetext", radiusText);
    elements.torque.setAttribute("aria-valuetext", torqueText);
    elements.tilt.setAttribute("aria-valuetext", tiltText);
    elements.azimuth.setAttribute("aria-valuetext", azimuthText);
  }

  function requestRender() {
    needsRender = true;
  }

  function startRendering() {
    if (isDisposed || hasFatalError || documentHidden || !isVisible) return;
    renderer.setAnimationLoop(renderFrame);
  }

  function restartSimulation({ announce = true, startPlaying = false } = {}) {
    active = readParameters();
    active.inertia = active.mass * active.radius * active.radius;
    simulationTime = 0;
    lastTrailSample = -Infinity;
    lastReadoutTime = -Infinity;
    trailPoints = [];
    trailGeometry.setDrawRange(0, 0);
    updateStaticGeometry();
    const initialState = evaluateState(0);
    updateScene(initialState);
    updateTrail(initialState, true);
    updateReadouts(initialState, true);
    requestRender();
    if (startPlaying) setPaused(false);
    if (announce) announceStatus("Motion restarted.");
  }

  function setPaused(nextPaused) {
    isPaused = nextPaused;
    elements.playPause.textContent = isPaused ? "Resume" : "Pause";
    requestRender();
    announceStatus(isPaused ? "Motion paused." : "Motion playing.");
  }

  function announceStatus(message) {
    elements.simStatus.textContent = "";
    window.requestAnimationFrame(() => {
      elements.simStatus.textContent = message;
    });
  }

  function resetCamera() {
    camera.position.copy(defaultCameraPosition);
    controls.target.set(0, 0, 0);
    controls.update();
    requestRender();
    announceStatus("Camera reset.");
  }

  function resize() {
    const width = Math.max(1, elements.viewer.clientWidth);
    const height = Math.max(1, elements.viewer.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    requestRender();
  }

  const restartInputs = [
    elements.mass,
    elements.radius,
    elements.torque,
    elements.tilt,
    elements.azimuth
  ];
  for (const input of restartInputs) {
    input.addEventListener("input", () => {
      updateControlOutputs();
      restartSimulation({ announce: false });
    });
    input.addEventListener("change", () => {
      announceStatus("Parameters updated. The motion restarted.");
    });
  }

  elements.playPause.addEventListener("click", () => {
    userChosePlayback = true;
    setPaused(!isPaused);
  });
  elements.restartBtn.addEventListener("click", () => {
    userChosePlayback = true;
    restartSimulation({ startPlaying: true });
  });
  elements.resetCameraBtn.addEventListener("click", resetCamera);

  renderer.domElement.addEventListener("pointerdown", () => {
    if (hasFatalError) return;
    elements.viewer.focus({ preventScroll: true });
  });

  elements.viewer.addEventListener("keydown", event => {
    if (hasFatalError) return;
    const key = event.key;
    const handled = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "_", "r", "R", " "];
    if (!handled.includes(key)) return;
    event.preventDefault();
    if (key === " ") {
      userChosePlayback = true;
      setPaused(!isPaused);
      return;
    }
    if (key.toLowerCase() === "r") {
      resetCamera();
      return;
    }

    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    if (key === "ArrowLeft") spherical.theta -= 0.11;
    if (key === "ArrowRight") spherical.theta += 0.11;
    if (key === "ArrowUp") spherical.phi = Math.max(0.16, spherical.phi - 0.09);
    if (key === "ArrowDown") spherical.phi = Math.min(Math.PI - 0.16, spherical.phi + 0.09);
    if (key === "+" || key === "=") spherical.radius = Math.max(controls.minDistance, spherical.radius - 1.2);
    if (key === "-" || key === "_") spherical.radius = Math.min(controls.maxDistance, spherical.radius + 1.2);
    camera.position.copy(new THREE.Vector3().setFromSpherical(spherical).add(controls.target));
    controls.update();
    requestRender();
  });

  reducedMotion.addEventListener("change", event => {
    if (event.matches) setPaused(true);
    else if (!userChosePlayback) setPaused(false);
  });

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(elements.viewer);
  const visibilityObserver = new IntersectionObserver(entries => {
    isVisible = entries[0]?.isIntersecting ?? true;
    lastTimestamp = null;
    if (!isVisible) renderer.setAnimationLoop(null);
    else {
      requestRender();
      startRendering();
    }
  }, { threshold: 0.01 });
  visibilityObserver.observe(elements.viewer);
  document.addEventListener("visibilitychange", () => {
    documentHidden = document.hidden;
    lastTimestamp = null;
    if (documentHidden) renderer.setAnimationLoop(null);
    else {
      requestRender();
      startRendering();
    }
  });

  renderer.domElement.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    hasFatalError = true;
    controls.enabled = false;
    setPaused(true);
    renderer.setAnimationLoop(null);
    showError("The 3D graphics context was lost. Refresh the page to restart the simulation.");
  });
  renderer.domElement.addEventListener("webglcontextrestored", () => {
    controls.enabled = false;
    showError("The 3D graphics context was restored. Refresh the page to rebuild the simulation.");
  });

  window.addEventListener("pagehide", event => {
    renderer.setAnimationLoop(null);
    lastTimestamp = null;
    if (event.persisted || isDisposed) return;
    isDisposed = true;
    resizeObserver.disconnect();
    visibilityObserver.disconnect();
    controls.dispose();
    renderer.dispose();
  });
  window.addEventListener("pageshow", event => {
    if (!event.persisted || isDisposed || hasFatalError) return;
    resize();
    requestRender();
    startRendering();
  });

  updateControlOutputs();
  restartSimulation({ announce: false });
  setPaused(isPaused);
  resize();
  elements.loadingMessage.hidden = true;

  startRendering();

  function renderFrame(timestamp) {
    if (lastTimestamp === null) lastTimestamp = timestamp;
    const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
    lastTimestamp = timestamp;
    if (!isVisible || documentHidden) return;
    if (isPaused && !needsRender) return;

    if (!isPaused) simulationTime += delta;

    const state = evaluateState(simulationTime);
    updateScene(state);
    if (!isPaused) updateTrail(state);
    updateReadouts(state);
    needsRender = false;
    controls.update();
    renderer.render(scene, camera);
  }
}

function showError(message) {
  elements.loadingMessage.hidden = true;
  elements.errorMessage.hidden = false;
  if (message) elements.errorMessage.textContent = message;
  elements.viewer.setAttribute("aria-disabled", "true");
  elements.viewer.tabIndex = -1;
  for (const control of document.querySelectorAll(".side-panel input, .side-panel button")) {
    control.disabled = true;
  }
}
