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
expect(
  /id="viewer"[^>]*aria-describedby="vectorSceneDescription"/s.test(html) &&
    htmlIds.includes("vectorSceneDescription"),
  "The 3D viewer must describe where the r, v, and L vectors appear."
);
expect(
  /vectorSceneDescription[^>]*>[\s\S]*axes[^<]*X[^<]*Y[^<]*Z/i.test(html),
  "The accessible scene description must name the X, Y, and Z world axes."
);
expect(
  /vectorSceneDescription[^>]*>[\s\S]*dashed[^<]*adjustable rotation axis/i.test(html),
  "The accessible scene description must distinguish the dashed adjustable rotation axis."
);

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
expect(
  htmlIds.includes("rVector") && htmlIds.includes("rMagnitude") &&
    htmlIds.includes("vVector") && htmlIds.includes("vMagnitude"),
  "Radius and velocity values must both be displayed."
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
  "velocity.clone().multiplyScalar(active.mass)",
  "crossVectors(radiusVector, momentum)",
  "active.torque / active.inertia",
  "0.5 * alpha * pulseTime * pulseTime",
  "const WORLD_AXIS_LENGTH = 4.6",
  "const AXIS_LABEL_OFFSET = 0.42",
  "new THREE.AxesHelper(WORLD_AXIS_LENGTH)",
  "scene.add(axes)",
  "scene.add(xAxisLabel, yAxisLabel, zAxisLabel)",
  "createMeshArrow",
  "radiusArrow",
  "velocityArrow",
  "angularArrow",
  "new THREE.CylinderGeometry(shaftRadius, shaftRadius, 1, 20)",
  "new THREE.ConeGeometry(headRadius, 0.5, 24)",
  "shaft.position.set(0, shaftLength / 2, 0)",
  "head.position.set(0, shaftLength + headLength / 2, 0)",
  "arrow.quaternion.setFromUnitVectors(yAxis, direction)",
  "depthTest: !overlay",
  "depthWrite: !overlay",
  "arrow.renderOrder = overlay ? 6 : 0",
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
  "omegaArrow",
  "momentumArrow",
  "labels.torque",
  "elements.pulseBadge",
  "elements.pulseReadout",
  "elements.omegaVector",
  "elements.omegaMagnitude",
  "new THREE.ArrowHelper",
  "createGuideArrow",
  "setGuideArrow",
  "createProminentArrow",
  "setProminentArrow"
]) {
  expect(!script.includes(forbiddenSnippet), `Removed vector or pulse display remains: ${forbiddenSnippet}`);
}

const meshBindings = [...script.matchAll(/const\s+(\w+Arrow)\s*=\s*createMeshArrow\(/g)]
  .map(match => match[1]);
expect(
  JSON.stringify(meshBindings) === JSON.stringify(["radiusArrow", "velocityArrow", "angularArrow"]),
  `Thick mesh arrows must be exactly r, v, and L: ${meshBindings.join(", ")}`
);
const guideRadius = Number(script.match(/const GUIDE_SHAFT_RADIUS = ([0-9.]+);/)?.[1]);
const lRadius = Number(script.match(/const L_SHAFT_RADIUS = ([0-9.]+);/)?.[1]);
expect(
  Number.isFinite(guideRadius) && Number.isFinite(lRadius) && guideRadius > 0 && lRadius > guideRadius,
  "All vectors must be thick meshes, with L remaining the most prominent."
);
expect(
  /const radiusArrow = createMeshArrow\([\s\S]*?overlay: true[\s\S]*?\}\);/.test(script),
  "The r vector must remain visible over the ball at the minimum radius."
);
expect(
  /setMeshArrow\(\s*radiusArrow,\s*state\.radiusVector,\s*origin\.position,\s*active\.radius\s*\)/s.test(script),
  "The r vector must run from the origin to the ball."
);
expect(
  /setMeshArrow\(\s*velocityArrow,\s*state\.velocity,\s*state\.radiusVector,/s.test(script),
  "The v vector must originate at the ball."
);
expect(
  /setMeshArrow\(\s*angularArrow,\s*state\.angularMomentum,\s*origin\.position,/s.test(script),
  "The L vector must begin at the rotation origin."
);
expect(
  script.includes("const velocity = new THREE.Vector3().crossVectors(omegaVector, radiusVector)"),
  "The velocity vector must be calculated as omega cross r."
);
expect(
  script.includes("const momentum = velocity.clone().multiplyScalar(active.mass)") &&
    !script.includes("const momentum = velocity.multiplyScalar"),
  "Linear momentum must not overwrite the velocity vector."
);
for (const labelSnippet of [
  'createLabelSprite("r"',
  'createLabelSprite("v"',
  'createLabelSprite("L"',
  'createLabelSprite("X"',
  'createLabelSprite("Y"',
  'createLabelSprite("Z"',
  "xAxisLabel.position.set(WORLD_AXIS_LENGTH + AXIS_LABEL_OFFSET, 0, 0)",
  "yAxisLabel.position.set(0, WORLD_AXIS_LENGTH + AXIS_LABEL_OFFSET, 0)",
  "zAxisLabel.position.set(0, 0, WORLD_AXIS_LENGTH + AXIS_LABEL_OFFSET)",
  "updateLabel(radiusLabel, radiusTip",
  "updateLabel(velocityLabel, velocityTip",
  "updateLabel(angularLabel, angularTip"
]) {
  expect(script.includes(labelSnippet), `Vector label is missing or unsynchronized: ${labelSnippet}`);
}

expect(!script.includes("Math.abs(axis.y) < 0.92"), "The orbital basis must not jump at an arbitrary axis threshold.");
expect(
  script.indexOf('renderer.domElement.style.touchAction = "pan-y"') > script.indexOf("new OrbitControls"),
  "The mobile touch action must be restored after OrbitControls initializes."
);
expect(script.includes("controls.enabled = false"), "A fatal WebGL state must disable camera interaction.");
expect(script.includes("elements.viewer.tabIndex = -1"), "A failed viewer must leave the keyboard tab order.");

// Independent acceptance check: the particle begins from rest and receives one axial impulse.
const mass = 2;
const radius = 3;
const torque = 9;
const pulseDuration = 0.1;
const initialOmega = 0;
const inertia = mass * radius ** 2;
const finalOmega = initialOmega + torque * pulseDuration / inertia;
const finalVelocityMagnitude = Math.abs(finalOmega) * radius;
const finalMomentumMagnitude = mass * Math.abs(finalOmega) * radius;
const finalAngularMomentumMagnitude = inertia * Math.abs(finalOmega);

expectClose(initialOmega, 0, "Initial angular velocity check failed");
expectClose(inertia, 18, "Moment of inertia check failed");
expectClose(finalOmega, 0.05, "Torque impulse angular-velocity check failed");
expectClose(finalVelocityMagnitude, 0.15, "Tangential velocity check failed");
expectClose(finalMomentumMagnitude, 0.3, "Linear momentum check failed");
expectClose(finalAngularMomentumMagnitude, 0.9, "Angular-momentum magnitude check failed");
expectClose(finalAngularMomentumMagnitude, Math.abs(torque) * pulseDuration, "Angular impulse check failed");

if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Angular momentum simulation: r, v, and prominent L vectors, routes, and physics checks passed.");
}
