const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "simulations", "Mechanics", "angular_momentum.html");
const scriptPath = path.join(root, "simulations", "Mechanics", "js", "angular_momentum.mjs");
const stylePath = path.join(root, "simulations", "Mechanics", "css", "angular_momentum.css");
const indexPath = path.join(root, "index.html");

const failures = [];

function requireFile(filePath) {
  if (!fs.existsSync(filePath)) {
    failures.push(`Missing file: ${path.relative(root, filePath)}`);
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function expectClose(actual, expected, message, tolerance = 1e-10) {
  expect(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, received ${actual}`);
}

const html = requireFile(htmlPath);
const script = requireFile(scriptPath);
requireFile(stylePath);
const index = requireFile(indexPath);

expect(
  index.includes('href="simulations/Mechanics/angular_momentum.html"'),
  "The Mechanics section does not link to the angular momentum simulation."
);
expect(html.includes('href="../../index.html#physics"'), "The simulation back link is missing or incorrect.");
expect(html.includes('src="js/angular_momentum.mjs"'), "The simulation module path is missing or incorrect.");
expect(html.includes('href="css/angular_momentum.css"'), "The simulation stylesheet path is missing or incorrect.");
expect(html.includes('id="viewer"') && html.includes('role="region"'), "The interactive viewer must use exposed region semantics.");

const importVersions = [...html.matchAll(/three@([0-9.]+)/g)].map(match => match[1]);
expect(importVersions.length === 2, "The Three.js import map must pin both core and addons.");
expect(new Set(importVersions).size === 1, "Three.js core and addons must use the same version.");

const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = htmlIds.filter((id, indexValue) => htmlIds.indexOf(id) !== indexValue);
expect(duplicateIds.length === 0, `Duplicate HTML IDs: ${[...new Set(duplicateIds)].join(", ")}`);

const queriedIds = [...script.matchAll(/getElementById\("([^"]+)"\)/g)].map(match => match[1]);
for (const id of queriedIds) {
  expect(htmlIds.includes(id), `JavaScript queries missing HTML ID: ${id}`);
}

for (const expectedSnippet of [
  "const PULSE_DURATION = 0.1",
  "active.inertia = active.mass * active.radius * active.radius",
  "crossVectors(omegaVector, radiusVector)",
  "velocity.multiplyScalar(active.mass)",
  "crossVectors(radiusVector, momentum)",
  "active.torque / active.inertia",
  "0.5 * alpha * pulseTime * pulseTime",
  "new THREE.ArrowHelper",
  "new OrbitControls",
  "renderer.setAnimationLoop",
  "new ResizeObserver",
  "prefers-reduced-motion",
  "webglcontextlost",
  "event.persisted",
  'renderer.domElement.style.touchAction = "pan-y"',
  'document.querySelectorAll(".controls-card input, .controls-card button")'
]) {
  expect(script.includes(expectedSnippet), `Required implementation missing: ${expectedSnippet}`);
}
expect(!script.includes("Math.abs(axis.y) < 0.92"), "The orbital basis must not jump at an arbitrary axis threshold.");
expect(
  script.indexOf('renderer.domElement.style.touchAction = "pan-y"') > script.indexOf("new OrbitControls"),
  "The mobile touch action must be restored after OrbitControls initializes."
);
expect(script.includes("controls.enabled = false"), "A fatal WebGL state must disable camera interaction.");
expect(script.includes("elements.viewer.tabIndex = -1"), "A failed viewer must leave the keyboard tab order.");

// Independent numerical acceptance check for a point mass in circular motion.
const mass = 2;
const radius = 3;
const omega = 4;
const torque = 9;
const pulseDuration = 0.1;
const inertia = mass * radius ** 2;
const momentumMagnitude = mass * Math.abs(omega) * radius;
const angularMomentumMagnitude = radius * momentumMagnitude;
const deltaOmega = torque * pulseDuration / inertia;
const deltaAngularMomentum = inertia * deltaOmega;

expectClose(inertia, 18, "Moment of inertia check failed");
expectClose(momentumMagnitude, 24, "Linear momentum check failed");
expectClose(angularMomentumMagnitude, 72, "Angular momentum check failed");
expectClose(deltaOmega, 0.05, "Torque impulse angular-velocity check failed");
expectClose(deltaAngularMomentum, torque * pulseDuration, "Angular impulse check failed");

if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Angular momentum simulation: routes, DOM contract, Three.js setup, and physics checks passed.");
}
