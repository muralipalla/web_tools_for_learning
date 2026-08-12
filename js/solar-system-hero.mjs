const viewer = document.getElementById("solarSystemViewer");
const loading = document.getElementById("solarSystemLoading");
const errorMessage = document.getElementById("solarSystemError");
const label = document.getElementById("solarSystemLabel");
const resetButton = document.getElementById("solarResetButton");
const motionButton = document.getElementById("solarMotionButton");

let THREE;
let OrbitControls;

if (viewer) loadSolarSystem();

async function loadSolarSystem() {
  try {
    const [threeModule, controlsModule] = await Promise.all([
      import("three"),
      import("three/addons/controls/OrbitControls.js")
    ]);
    THREE = threeModule;
    OrbitControls = controlsModule.OrbitControls;
    initializeSolarSystem();
  } catch (error) {
    console.error("Could not initialize the solar system.", error);
    showError();
  }
}

function initializeSolarSystem() {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let motionPaused = prefersReducedMotion.matches;
  let isVisible = true;
  let selectedPlanet = null;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020617, 0.012);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 160);
  const defaultCameraPosition = new THREE.Vector3(0, 14, 31);
  camera.position.copy(defaultCameraPosition);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  viewer.prepend(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.enablePan = true;
  controls.minDistance = 12;
  controls.maxDistance = 58;
  controls.minPolarAngle = 0.18;
  controls.maxPolarAngle = Math.PI - 0.18;
  controls.target.set(0, 0, 0);
  controls.update();

  scene.add(new THREE.HemisphereLight(0x9ec5ff, 0x07111f, 0.45));
  const sunlight = new THREE.PointLight(0xfff1c4, 170, 90, 1.45);
  scene.add(sunlight);

  const solarSystem = new THREE.Group();
  solarSystem.rotation.x = THREE.MathUtils.degToRad(5);
  scene.add(solarSystem);

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(1.45, 40, 30),
    new THREE.MeshStandardMaterial({
      color: 0xffb52e,
      emissive: 0xff7800,
      emissiveIntensity: 2.4,
      roughness: 0.72
    })
  );
  sun.userData.planetName = "Sun";
  solarSystem.add(sun);

  const corona = new THREE.Mesh(
    new THREE.SphereGeometry(1.78, 32, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffa62b,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide
    })
  );
  sun.add(corona);

  const planetData = [
    { name: "Mercury", color: 0xa8a29e, radius: 0.24, distance: 3.1, speed: 0.78, spin: 0.35, angle: 0.3 },
    { name: "Venus", color: 0xe7b86a, radius: 0.38, distance: 4.4, speed: 0.58, spin: -0.12, angle: 2.2 },
    { name: "Earth", color: 0x3b82f6, radius: 0.42, distance: 5.9, speed: 0.47, spin: 0.9, angle: 4.1 },
    { name: "Mars", color: 0xc45a36, radius: 0.31, distance: 7.3, speed: 0.38, spin: 0.82, angle: 1.35 },
    { name: "Jupiter", color: 0xd6aa78, radius: 0.92, distance: 9.7, speed: 0.21, spin: 1.18, angle: 3.05 },
    { name: "Saturn", color: 0xe4c678, radius: 0.76, distance: 12.4, speed: 0.16, spin: 1.05, angle: 5.25, ring: true },
    { name: "Uranus", color: 0x78d5e3, radius: 0.56, distance: 15.0, speed: 0.115, spin: -0.72, angle: 0.9 },
    { name: "Neptune", color: 0x4169d8, radius: 0.54, distance: 17.5, speed: 0.09, spin: 0.68, angle: 4.75 }
  ];

  const planetObjects = [];
  const interactiveMeshes = [sun];
  const planetGeometryCache = new Map();

  for (const planet of planetData) {
    const orbit = createOrbit(planet.distance);
    solarSystem.add(orbit);

    const pivot = new THREE.Group();
    pivot.rotation.y = planet.angle;
    solarSystem.add(pivot);

    const geometryKey = planet.radius.toFixed(2);
    let geometry = planetGeometryCache.get(geometryKey);
    if (!geometry) {
      geometry = new THREE.SphereGeometry(planet.radius, 28, 20);
      planetGeometryCache.set(geometryKey, geometry);
    }

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: planet.color,
        roughness: 0.72,
        metalness: 0.02
      })
    );
    mesh.position.x = planet.distance;
    mesh.rotation.z = THREE.MathUtils.degToRad(planet.name === "Uranus" ? 82 : 8);
    mesh.userData.planetName = planet.name;
    pivot.add(mesh);

    if (planet.ring) addSaturnRings(mesh, planet.radius);
    if (planet.name === "Earth") addMoon(mesh);

    planetObjects.push({ pivot, mesh, orbitSpeed: planet.speed, spinSpeed: planet.spin });
    interactiveMeshes.push(mesh);
  }

  addStars(scene);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function createOrbit(radius) {
    const points = [];
    const segments = 128;
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.LineLoop(
      geometry,
      new THREE.LineBasicMaterial({ color: 0x8aa4cb, transparent: true, opacity: 0.22 })
    );
  }

  function addSaturnRings(planet, radius) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 1.35, radius * 2.05, 64),
      new THREE.MeshBasicMaterial({
        color: 0xdcc88b,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = Math.PI / 2;
    planet.add(ring);
  }

  function addMoon(earth) {
    const moonPivot = new THREE.Group();
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 18, 12),
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.88 })
    );
    moon.position.x = 0.78;
    moonPivot.add(moon);
    earth.add(moonPivot);
    earth.userData.moonPivot = moonPivot;
  }

  function addStars(targetScene) {
    const count = window.matchMedia("(max-width: 560px)").matches ? 500 : 900;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const radius = 35 + Math.random() * 55;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.cos(phi);
      positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    targetScene.add(new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: 0xdbeafe, size: 0.12, transparent: true, opacity: 0.72 })
    ));
  }

  function resize() {
    const width = Math.max(1, viewer.clientWidth);
    const height = Math.max(1, viewer.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function resetCamera() {
    camera.position.copy(defaultCameraPosition);
    controls.target.set(0, 0, 0);
    controls.update();
    selectedPlanet = null;
    label.hidden = true;
  }

  function setMotionPaused(nextPaused) {
    motionPaused = nextPaused;
    motionButton.textContent = motionPaused ? "Play" : "Pause";
    motionButton.setAttribute("aria-pressed", String(motionPaused));
  }

  function updatePointer(event) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    label.style.left = `${event.clientX - bounds.left}px`;
    label.style.top = `${event.clientY - bounds.top}px`;
  }

  function planetAtPointer(event) {
    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(interactiveMeshes, false)[0]?.object || null;
  }

  function showPlanetLabel(planet) {
    if (!planet?.userData.planetName) {
      if (!selectedPlanet) label.hidden = true;
      return;
    }
    label.textContent = planet.userData.planetName;
    label.hidden = false;
  }

  renderer.domElement.addEventListener("pointermove", event => {
    const planet = planetAtPointer(event);
    renderer.domElement.style.cursor = planet ? "pointer" : "grab";
    showPlanetLabel(planet || selectedPlanet);
  });

  renderer.domElement.addEventListener("pointerdown", () => {
    viewer.focus({ preventScroll: true });
  });

  renderer.domElement.addEventListener("pointerleave", () => {
    renderer.domElement.style.cursor = "grab";
    if (!selectedPlanet) label.hidden = true;
  });

  renderer.domElement.addEventListener("click", event => {
    selectedPlanet = planetAtPointer(event);
    showPlanetLabel(selectedPlanet);
  });

  viewer.addEventListener("keydown", event => {
    const key = event.key;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "_", "r", "R"].includes(key)) return;
    event.preventDefault();
    if (key.toLowerCase() === "r") {
      resetCamera();
      return;
    }

    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    if (key === "ArrowLeft") spherical.theta -= 0.11;
    if (key === "ArrowRight") spherical.theta += 0.11;
    if (key === "ArrowUp") spherical.phi = Math.max(0.2, spherical.phi - 0.09);
    if (key === "ArrowDown") spherical.phi = Math.min(Math.PI - 0.2, spherical.phi + 0.09);
    if (key === "+" || key === "=") spherical.radius = Math.max(controls.minDistance, spherical.radius - 1.6);
    if (key === "-" || key === "_") spherical.radius = Math.min(controls.maxDistance, spherical.radius + 1.6);
    camera.position.copy(new THREE.Vector3().setFromSpherical(spherical).add(controls.target));
    controls.update();
  });

  resetButton.addEventListener("click", resetCamera);
  motionButton.addEventListener("click", () => setMotionPaused(!motionPaused));
  prefersReducedMotion.addEventListener("change", event => setMotionPaused(event.matches));

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(viewer);

  const visibilityObserver = new IntersectionObserver(entries => {
    isVisible = entries[0]?.isIntersecting ?? true;
  }, { threshold: 0.01 });
  visibilityObserver.observe(viewer);

  renderer.domElement.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    showError();
  });

  const clock = new THREE.Clock();
  setMotionPaused(motionPaused);
  resize();
  loading.hidden = true;

  function animate() {
    window.requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);
    if (!isVisible) return;

    if (!motionPaused) {
      sun.rotation.y += delta * 0.14;
      for (const planet of planetObjects) {
        planet.pivot.rotation.y += delta * planet.orbitSpeed;
        planet.mesh.rotation.y += delta * planet.spinSpeed;
        if (planet.mesh.userData.moonPivot) {
          planet.mesh.userData.moonPivot.rotation.y += delta * 1.8;
        }
      }
    }

    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  function showError() {
    loading.hidden = true;
    errorMessage.hidden = false;
    motionButton.disabled = true;
    resetButton.disabled = true;
  }
}

function showError() {
  if (loading) loading.hidden = true;
  if (errorMessage) errorMessage.hidden = false;
  if (motionButton) motionButton.disabled = true;
  if (resetButton) resetButton.disabled = true;
}
