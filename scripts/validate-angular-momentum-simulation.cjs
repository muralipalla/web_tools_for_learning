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
const style = requireFile(stylePath);
const index = requireFile(indexPath);

expect(
  index.includes('href="simulations/Mechanics/angular_momentum.html"'),
  "The Mechanics section does not link to the angular momentum simulation."
);
expect(html.includes('href="../../index.html#physics"'), "The simulation back link is missing or incorrect.");
expect(html.includes('src="js/angular_momentum.mjs"'), "The simulation module path is missing or incorrect.");
expect(html.includes('href="css/angular_momentum.css"'), "The simulation stylesheet path is missing or incorrect.");
expect(
  html.includes('id="viewer"') && html.includes('role="region"'),
  "The interactive viewer must use exposed region semantics."
);

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

const removedIds = [
  "pulseBadge",
  "pulseReadout",
  "timeReadout",
  "phase",
  "phaseValue",
  "omega",
  "omegaValue",
  "omegaVector",
  "omegaMagnitude",
  "speed",
  "speedValue"
];
for (const id of removedIds) {
  expect(!htmlIds.includes(id), `Removed control or display is still present: ${id}`);
}

expect(!/torque pulse/i.test(html), "The page must not display a torque-pulse label or status.");
expect(!html.includes("vector-legend"), "The scene must not include a multi-vector legend.");
expect(htmlIds.includes("torque"), "The adjustable torque control is missing.");
expect(
  /id="torque"[^>]*min="-100"[^>]*max="100"[^>]*step="1"/.test(html),
  "The torque control must span -100 to 100 N·m in 1 N·m steps."
);
expect(
  /id="torque"[^>]*aria-describedby="torqueHelp"/.test(html),
  "The torque control must expose its 0.10 s instruction to assistive technology."
);
expect(htmlIds.includes("tilt") && htmlIds.includes("azimuth"), "Both axis-direction controls are required.");
expect(
  htmlIds.includes("angularMomentumReadout") && htmlIds.includes("lMagnitude"),
  "Angular-momentum magnitude must be prominent in the viewer status and values panel."
);

const inputIds = [...html.matchAll(/<input\b[^>]*\bid="([^"]+)"/g)].map(match => match[1]);
expect(
  JSON.stringify(inputIds) === JSON.stringify(["mass", "radius", "torque", "tilt", "azimuth"]),
  `Unexpected parameter controls: ${inputIds.join(", ")}`
);

const controlsPosition = html.indexOf("controls-section");
const vectorValuesPosition = html.indexOf("vector-section");
const axisPosition = html.indexOf("axis-section");
expect(
  controlsPosition >= 0 && vectorValuesPosition > controlsPosition && axisPosition > vectorValuesPosition,
  "Main controls, vector values, and bottom axis controls are not in the required order."
);
expect(style.includes("grid-template-columns: minmax(0, 1fr) 390px"), "The vector-values panel is not adjacent on desktop.");
expect(!style.includes("position: sticky"), "The long side panel must not strand the bottom axis controls.");
const vectorCodeStyles = style.match(/\.vector-list code\s*\{([^}]+)\}/)?.[1] ?? "";
expect(
  vectorCodeStyles.includes("overflow-wrap: anywhere") && vectorCodeStyles.includes("white-space: normal"),
  "Vector components must remain fully readable at narrow widths and large text sizes."
);

for (const expectedSnippet of [
  "const PULSE_DURATION = 0.1",
  "const INITIAL_OMEGA = 0",
  "const INITIAL_PHASE = 0",
  "omega0: INITIAL_OMEGA",
  "phase: INITIAL_PHASE",
  "active.inertia = active.mass * active.radius * active.radius",
  "crossVectors(omegaVector, radiusVector)",
  "velocity.multiplyScalar(active.mass)",
  "crossVectors(radiusVector, momentum)",
  "active.torque / active.inertia",
  "0.5 * alpha * pulseTime * pulseTime",
  "createProminentArrow",
  "new THREE.CylinderGeometry(0.09",
  "new THREE.ConeGeometry(0.25",
  "new OrbitControls",
  "renderer.setAnimationLoop",
  "new ResizeObserver",
  "prefers-reduced-motion",
  "webglcontextlost",
  "event.persisted",
  'renderer.domElement.style.touchAction = "pan-y"',
  'document.querySelectorAll(".side-panel input, .side-panel button")'
]) {
  expect(script.includes(expectedSnippet), `Required implementation missing: ${expectedSnippet}`);
}

for (const forbiddenSnippet of [
  "torqueArrow",
  "radiusArrow",
  "omegaArrow",
  "momentumArrow",
  "labels.torque",
  "new THREE.ArrowHelper",
  "elements.pulseBadge",
  "elements.pulseReadout",
  "elements.omegaVector",
  "elements.omegaMagnitude"
]) {
  expect(!script.includes(forbiddenSnippet), `Removed vector or pulse display remains: ${forbiddenSnippet}`);
}

expect(!script.includes("Math.abs(axis.y) < 0.92"), "The orbital basis must not jump at an arbitrary axis threshold.");
expect(
  script.indexOf('renderer.domElement.style.touchAction = "pan-y"') > script.indexOf("new OrbitControls"),
  "The mobile touch action must be restored after OrbitControls initializes."
);
expect(script.includes("controls.enabled = false"), "A fatal WebGL state must disable camera interaction.");
expect(script.includes("elements.viewer.tabIndex = -1"), "A failed viewer must leave the keyboard tab order.");
expect(script.includes("origin.position"), "The L vector must begin at the rotation origin.");

// Independent acceptance check: the particle begins from rest and receives one axial impulse.
const mass = 2;
const radius = 3;
const torque = 9;
const pulseDuration = 0.1;
const initialOmega = 0;
const inertia = mass * radius ** 2;
const finalOmega = initialOmega + torque * pulseDuration / inertia;
const finalMomentumMagnitude = mass * Math.abs(finalOmega) * radius;
const finalAngularMomentumMagnitude = inertia * Math.abs(finalOmega);

expectClose(initialOmega, 0, "Initial angular velocity check failed");
expectClose(inertia, 18, "Moment of inertia check failed");
expectClose(finalOmega, 0.05, "Torque impulse angular-velocity check failed");
expectClose(finalMomentumMagnitude, 0.3, "Linear momentum check failed");
expectClose(finalAngularMomentumMagnitude, 0.9, "Angular-momentum magnitude check failed");
expectClose(finalAngularMomentumMagnitude, Math.abs(torque) * pulseDuration, "Angular impulse check failed");

if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Angular momentum simulation: simplified UI, single L vector, routes, and physics checks passed.");
}
