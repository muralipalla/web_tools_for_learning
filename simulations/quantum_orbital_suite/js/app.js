import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  suggestedRMax,
  sampleOrbitalCloud,
  makeOrbitalSurface,
  orbitalLabel
} from './orbital-math.js';
import { drawRadialPlot, drawAngularPlot } from './plotting.js';

const dom = {
  viewer: document.getElementById('viewer'),
  nSlider: document.getElementById('nSlider'),
  lSlider: document.getElementById('lSlider'),
  mSlider: document.getElementById('mSlider'),
  nValue: document.getElementById('nValue'),
  lValue: document.getElementById('lValue'),
  mValue: document.getElementById('mValue'),
  modeSelect: document.getElementById('modeSelect'),
  pointCountSelect: document.getElementById('pointCountSelect'),
  pointSizeSlider: document.getElementById('pointSizeSlider'),
  opacitySlider: document.getElementById('opacitySlider'),
  scaleSlider: document.getElementById('scaleSlider'),
  pointSizeValue: document.getElementById('pointSizeValue'),
  opacityValue: document.getElementById('opacityValue'),
  scaleValue: document.getElementById('scaleValue'),
  rotXSlider: document.getElementById('rotXSlider'),
  rotYSlider: document.getElementById('rotYSlider'),
  rotZSlider: document.getElementById('rotZSlider'),
  rotXValue: document.getElementById('rotXValue'),
  rotYValue: document.getElementById('rotYValue'),
  rotZValue: document.getElementById('rotZValue'),
  regenerateButton: document.getElementById('regenerateButton'),
  cameraButton: document.getElementById('cameraButton'),
  orientationButton: document.getElementById('orientationButton'),
  snapshotButton: document.getElementById('snapshotButton'),
  autoRotateCheck: document.getElementById('autoRotateCheck'),
  axesCheck: document.getElementById('axesCheck'),
  gridCheck: document.getElementById('gridCheck'),
  orbitalLabel: document.getElementById('orbitalLabel'),
  statusText: document.getElementById('statusText'),
  radialPlot: document.getElementById('radialPlot'),
  angularPlot: document.getElementById('angularPlot')
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1420);

const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 200);
camera.position.set(7.5, 5.2, 9.5);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(100, 100);
renderer.outputColorSpace = THREE.SRGBColorSpace;
dom.viewer.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0, 0);
controls.maxDistance = 80;
controls.minDistance = 2.5;

const orbitalGroup = new THREE.Group();
scene.add(orbitalGroup);

const axes = new THREE.AxesHelper(4.2);
scene.add(axes);

const grid = new THREE.GridHelper(12, 12, 0x38506f, 0x24344a);
grid.position.y = -4.2;
scene.add(grid);

const nucleus = new THREE.Mesh(
  new THREE.SphereGeometry(0.09, 24, 24),
  new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x527fbf, emissiveIntensity: 0.55 })
);
orbitalGroup.add(nucleus);

scene.add(new THREE.AmbientLight(0xffffff, 0.46));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
keyLight.position.set(4, 7, 9);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x91c7ff, 0.55);
rimLight.position.set(-5, -1, -3);
scene.add(rimLight);

let cloudObject = null;
let surfaceObject = null;
let pendingTimer = null;
let rebuildId = 0;

function numberValue(element) {
  return Number(element.value);
}

function state() {
  return {
    n: numberValue(dom.nSlider),
    l: numberValue(dom.lSlider),
    m: numberValue(dom.mSlider),
    mode: dom.modeSelect.value,
    pointCount: Number(dom.pointCountSelect.value),
    pointSize: numberValue(dom.pointSizeSlider),
    opacity: numberValue(dom.opacitySlider),
    visualScale: numberValue(dom.scaleSlider)
  };
}

function syncQuantumConstraints() {
  const n = numberValue(dom.nSlider);
  dom.lSlider.max = String(n - 1);
  if (numberValue(dom.lSlider) > n - 1) dom.lSlider.value = String(n - 1);

  const l = numberValue(dom.lSlider);
  dom.mSlider.min = String(-l);
  dom.mSlider.max = String(l);
  if (numberValue(dom.mSlider) < -l) dom.mSlider.value = String(-l);
  if (numberValue(dom.mSlider) > l) dom.mSlider.value = String(l);

  dom.nValue.value = dom.nSlider.value;
  dom.lValue.value = dom.lSlider.value;
  dom.mValue.value = dom.mSlider.value;

  dom.pointSizeValue.value = Number(dom.pointSizeSlider.value).toFixed(3);
  dom.opacityValue.value = Number(dom.opacitySlider.value).toFixed(2);
  dom.scaleValue.value = Number(dom.scaleSlider.value).toFixed(1);
}

function setStatus(message) {
  dom.statusText.textContent = message;
}

function disposeObject(object) {
  if (!object) return;
  if (object.geometry) object.geometry.dispose();
  if (object.material) object.material.dispose();
  orbitalGroup.remove(object);
}

function updateOrientation() {
  const rx = THREE.MathUtils.degToRad(numberValue(dom.rotXSlider));
  const ry = THREE.MathUtils.degToRad(numberValue(dom.rotYSlider));
  const rz = THREE.MathUtils.degToRad(numberValue(dom.rotZSlider));
  orbitalGroup.rotation.set(rx, ry, rz);

  dom.rotXValue.value = `${dom.rotXSlider.value}°`;
  dom.rotYValue.value = `${dom.rotYSlider.value}°`;
  dom.rotZValue.value = `${dom.rotZSlider.value}°`;
}

function updateVisibility() {
  const mode = dom.modeSelect.value;
  if (cloudObject) cloudObject.visible = (mode === 'cloud' || mode === 'both');
  if (surfaceObject) surfaceObject.visible = (mode === 'surface' || mode === 'both');
  axes.visible = dom.axesCheck.checked;
  grid.visible = dom.gridCheck.checked;
}

function createCloud(params, currentId) {
  const rMax = suggestedRMax(params.n);
  const sample = sampleOrbitalCloud({
    n: params.n,
    l: params.l,
    m: params.m,
    count: params.pointCount,
    rMax,
    visualScale: params.visualScale
  });

  if (currentId !== rebuildId) return;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(sample.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(sample.colors, 3));
  geometry.computeBoundingSphere();

  const material = new THREE.PointsMaterial({
    size: params.pointSize,
    vertexColors: true,
    transparent: true,
    opacity: params.opacity,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  cloudObject = new THREE.Points(geometry, material);
  orbitalGroup.add(cloudObject);

  const efficiency = sample.attempts > 0 ? (100 * sample.accepted / sample.attempts).toFixed(2) : '0.00';
  setStatus(`${sample.accepted.toLocaleString()} cloud points sampled from |ψ|²; acceptance ${efficiency}%.`);
}

function createSurface(params) {
  const surface = makeOrbitalSurface({
    n: params.n,
    l: params.l,
    m: params.m,
    visualScale: params.visualScale
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(surface.vertices, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(surface.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(surface.indices, 1));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: Math.min(0.75, Math.max(0.22, params.opacity + 0.08)),
    roughness: 0.62,
    metalness: 0.03,
    depthWrite: false
  });

  surfaceObject = new THREE.Mesh(geometry, material);
  orbitalGroup.add(surfaceObject);
}

function rebuildOrbital() {
  syncQuantumConstraints();
  const params = state();
  rebuildId += 1;
  const currentId = rebuildId;

  disposeObject(cloudObject);
  disposeObject(surfaceObject);
  cloudObject = null;
  surfaceObject = null;

  dom.orbitalLabel.textContent = orbitalLabel(params.n, params.l, params.m);
  setStatus('Computing ψ and sampling probability cloud…');

  drawRadialPlot(dom.radialPlot, params.n, params.l);
  drawAngularPlot(dom.angularPlot, params.l, params.m);

  // Let the UI paint the status before the heavier sampling step.
  window.setTimeout(() => {
    if (currentId !== rebuildId) return;
    createSurface(params);
    if (params.mode === 'cloud' || params.mode === 'both') {
      createCloud(params, currentId);
    } else {
      setStatus('Textbook-style angular surface shown. Switch to cloud mode for full |ψ|² distribution.');
    }
    updateVisibility();
  }, 25);
}

function scheduleRebuild() {
  window.clearTimeout(pendingTimer);
  syncQuantumConstraints();
  pendingTimer = window.setTimeout(rebuildOrbital, 220);
}

function resize() {
  const rect = dom.viewer.getBoundingClientRect();
  const width = Math.max(320, rect.width);
  const height = Math.max(320, rect.height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function resetCamera() {
  camera.position.set(7.5, 5.2, 9.5);
  controls.target.set(0, 0, 0);
  controls.update();
}

function resetOrientation() {
  dom.rotXSlider.value = '0';
  dom.rotYSlider.value = '0';
  dom.rotZSlider.value = '0';
  updateOrientation();
}

function saveSnapshot() {
  renderer.render(scene, camera);
  const link = document.createElement('a');
  const params = state();
  link.download = `orbital_${params.n}_${params.l}_${params.m}.png`;
  link.href = renderer.domElement.toDataURL('image/png');
  link.click();
}

['input', 'change'].forEach((eventName) => {
  dom.nSlider.addEventListener(eventName, scheduleRebuild);
  dom.lSlider.addEventListener(eventName, scheduleRebuild);
  dom.mSlider.addEventListener(eventName, scheduleRebuild);
  dom.pointSizeSlider.addEventListener(eventName, scheduleRebuild);
  dom.opacitySlider.addEventListener(eventName, scheduleRebuild);
  dom.scaleSlider.addEventListener(eventName, scheduleRebuild);
});

dom.modeSelect.addEventListener('change', () => {
  if (dom.modeSelect.value === 'surface') {
    updateVisibility();
    setStatus('Textbook-style angular surface shown. Switch to cloud mode for full |ψ|² distribution.');
  } else if (!cloudObject) {
    scheduleRebuild();
  } else {
    updateVisibility();
  }
});

dom.pointCountSelect.addEventListener('change', scheduleRebuild);
dom.regenerateButton.addEventListener('click', rebuildOrbital);
dom.cameraButton.addEventListener('click', resetCamera);
dom.orientationButton.addEventListener('click', resetOrientation);
dom.snapshotButton.addEventListener('click', saveSnapshot);
dom.axesCheck.addEventListener('change', updateVisibility);
dom.gridCheck.addEventListener('change', updateVisibility);

dom.rotXSlider.addEventListener('input', updateOrientation);
dom.rotYSlider.addEventListener('input', updateOrientation);
dom.rotZSlider.addEventListener('input', updateOrientation);

window.addEventListener('resize', () => {
  resize();
  const params = state();
  drawRadialPlot(dom.radialPlot, params.n, params.l);
  drawAngularPlot(dom.angularPlot, params.l, params.m);
});

function animate() {
  requestAnimationFrame(animate);
  if (dom.autoRotateCheck.checked) orbitalGroup.rotation.y += 0.005;
  controls.update();
  renderer.render(scene, camera);
}

syncQuantumConstraints();
updateOrientation();
resize();
rebuildOrbital();
animate();
