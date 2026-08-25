"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "simulations", "Mechanics", "earth_tunnel.html");
const stylePath = path.join(root, "simulations", "Mechanics", "css", "earth_tunnel.css");
const scriptPath = path.join(root, "simulations", "Mechanics", "js", "earth_tunnel.mjs");
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

function expectNear(actual, expected, tolerance, message) {
  expect(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${message}: expected about ${expected}, received ${actual}`
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function openingTagWithId(source, id) {
  const escapedId = escapeRegExp(id);
  return [...source.matchAll(/<[a-z][^>]*>/gi)]
    .map(match => match[0])
    .find(tag => new RegExp(`\\bid\\s*=\\s*(["'])${escapedId}\\1`, "i").test(tag)) || "";
}

function attributeValue(tag, name) {
  const match = tag.match(new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2] ?? "";
}

function hasLinkedAsset(source, element, attribute, assetPath) {
  const escapedPath = escapeRegExp(assetPath);
  return new RegExp(
    `<${element}\\b(?=[^>]*\\b${attribute}\\s*=\\s*(["'])${escapedPath}\\1)[^>]*>`,
    "i"
  ).test(source);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function mediaBlocks(source) {
  const blocks = [];
  const mediaStart = /@media\s*([^{}]+)\s*\{/gi;
  let match;

  while ((match = mediaStart.exec(source))) {
    let depth = 1;
    let cursor = mediaStart.lastIndex;
    for (; cursor < source.length && depth > 0; cursor += 1) {
      if (source[cursor] === "{") depth += 1;
      if (source[cursor] === "}") depth -= 1;
    }
    blocks.push({ condition: match[1].trim(), body: source.slice(mediaStart.lastIndex, cursor - 1) });
    mediaStart.lastIndex = cursor;
  }

  return blocks;
}

const html = requireFile(htmlPath);
const style = requireFile(stylePath);
const script = requireFile(scriptPath);
const index = requireFile(indexPath);

expect(
  hasLinkedAsset(html, "link", "href", "css/earth_tunnel.css"),
  "The Earth-tunnel page does not link its stylesheet."
);
expect(
  hasLinkedAsset(html, "script", "src", "js/earth_tunnel.mjs"),
  "The Earth-tunnel page does not load its JavaScript module."
);
expect(
  /<a\b(?=[^>]*\bhref\s*=\s*(["'])\.\.\/\.\.\/index\.html#physics\1)[^>]*>/i.test(html),
  "The Earth-tunnel page is missing its back link to the Physics section."
);

const physicsSection = index.match(
  /<article\b[^>]*\bid\s*=\s*(["'])physics\1[^>]*>[\s\S]*?(?=<article\b[^>]*\bid\s*=|<\/section>)/i
)?.[0] ?? "";
expect(physicsSection, "The homepage Physics section is missing.");
expect(
  /<h3\b[^>]*>\s*Mechanics\s*<\/h3>[\s\S]*?<a\b(?=[^>]*\bhref\s*=\s*(["'])simulations\/Mechanics\/earth_tunnel\.html\1)[^>]*>/i.test(physicsSection),
  "The homepage Mechanics group does not link to the Earth-tunnel simulation."
);

const threeUrls = [...html.matchAll(
  /https:\/\/cdn\.jsdelivr\.net\/npm\/three@([0-9]+\.[0-9]+\.[0-9]+)\/[^"'\s]+/g
)];
const threeVersions = threeUrls.map(match => match[1]);
expect(
  /["']three["']\s*:\s*["'][^"']+\/build\/three\.module\.js["']/i.test(html),
  "The import map must map Three.js core to its module build."
);
expect(
  /["']three\/addons\/["']\s*:\s*["'][^"']+\/examples\/jsm\/["']/i.test(html),
  "The import map must map Three.js addons to examples/jsm/."
);
expect(threeVersions.length === 2, "The import map must contain exactly two pinned Three.js URLs.");
expect(
  threeVersions.length === 2 && new Set(threeVersions).size === 1,
  `Three.js core and addons must pin the same version; found ${threeVersions.join(", ") || "none"}.`
);

const htmlIds = [...html.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map(match => match[2]);
const duplicateIds = sortedUnique(htmlIds.filter((id, indexValue) => htmlIds.indexOf(id) !== indexValue));
expect(duplicateIds.length === 0, `Duplicate HTML IDs: ${duplicateIds.join(", ") || "none"}.`);

const viewerTag = openingTagWithId(html, "earthViewer");
expect(viewerTag, "The 3D Earth viewer is missing.");
expect(attributeValue(viewerTag, "role").toLowerCase() === "region", "The 3D viewer must expose region semantics.");
const describedBy = attributeValue(viewerTag, "aria-describedby").trim().split(/\s+/).filter(Boolean);
expect(describedBy.length > 0, "The 3D viewer must use aria-describedby.");
for (const descriptionId of describedBy) {
  expect(htmlIds.includes(descriptionId), `aria-describedby targets missing HTML ID: ${descriptionId}`);
}
expect(
  describedBy.includes("sceneDescription"),
  "The 3D viewer must be described by the dedicated sceneDescription text."
);
const sceneDescription = html.match(
  /<p\b[^>]*\bid\s*=\s*(["'])sceneDescription\1[^>]*>[\s\S]*?<\/p>/i
)?.[0] ?? "";
expect(/\bchord\b/i.test(sceneDescription), "The accessible scene description must identify the chord tunnel.");
expect(
  /\b(?:tunnel\s+)?midpoint\b/i.test(sceneDescription),
  "The accessible scene description must explain the tunnel midpoint."
);
expect(
  /\b(?:far\s+(?:side|exit)|opposite\s+(?:side|end|exit))\b/i.test(sceneDescription),
  "The accessible scene description must explain the far exit."
);

const queriedIds = [...script.matchAll(/\bgetElementById\(\s*(["'])([^"']+)\1\s*\)/g)]
  .map(match => match[2]);
expect(queriedIds.length > 0, "The simulation module does not bind any page elements with getElementById.");
for (const id of sortedUnique(queriedIds)) {
  expect(htmlIds.includes(id), `JavaScript queries missing HTML ID: ${id}`);
}

const requiredIds = [
  "earthViewer",
  "sceneDescription",
  "journeyPhase",
  "journeyNarrative",
  "loadingMessage",
  "errorMessage",
  "progressFill",
  "journeyClock",
  "depthReadout",
  "speedReadout",
  "gravityReadout",
  "angleReadout",
  "chordReadout",
  "tunnelAngle",
  "tunnelAngleValue",
  "tunnelAngleHelp",
  "tunnelMidpointLabel",
  "heroTunnelLength",
  "heroTunnelCaption",
  "predictionFeedback",
  "timeScale",
  "timeScaleValue",
  "playPause",
  "restartBtn",
  "resetCameraBtn",
  "simStatus"
];
for (const id of requiredIds) {
  expect(htmlIds.includes(id), `Required simulation control or readout is missing: ${id}`);
}

const predictionValues = [...html.matchAll(/\bdata-answer\s*=\s*(["'])([^"']+)\1/gi)]
  .map(match => match[2]);
expect(
  JSON.stringify(sortedUnique(predictionValues)) === JSON.stringify(["faster", "same", "slower"]),
  `Prediction choices must be faster, slower, and same; found ${predictionValues.join(", ") || "none"}.`
);
expect(
  predictionValues.length === 3,
  `Exactly three prediction choices are required; found ${predictionValues.length}.`
);

const timeScaleTag = openingTagWithId(html, "timeScale");
expect(attributeValue(timeScaleTag, "type").toLowerCase() === "range", "Time acceleration must use a range control.");
const tunnelAngleTag = openingTagWithId(html, "tunnelAngle");
expect(attributeValue(tunnelAngleTag, "type").toLowerCase() === "range", "Tunnel angle must use a range control.");
expect(attributeValue(tunnelAngleTag, "min") === "0", "Tunnel angle minimum must be 0 degrees.");
expect(attributeValue(tunnelAngleTag, "max") === "75", "Tunnel angle maximum must be 75 degrees.");
expect(attributeValue(tunnelAngleTag, "step") === "5", "Tunnel angle step must be 5 degrees.");
expect(attributeValue(tunnelAngleTag, "value") === "30", "Tunnel angle must default to 30 degrees.");
expect(
  attributeValue(tunnelAngleTag, "aria-describedby").split(/\s+/).includes("tunnelAngleHelp"),
  "Tunnel angle must reference its accessible help text."
);
expect(
  /<label\b[^>]*\bfor\s*=\s*(["'])tunnelAngle\1[^>]*>[\s\S]*?<output\b(?=[^>]*\bid\s*=\s*(["'])tunnelAngleValue\2)(?=[^>]*\bfor\s*=\s*(["'])tunnelAngle\3)[^>]*>/i.test(html),
  "Tunnel angle needs a linked label and output value."
);
for (const id of ["playPause", "restartBtn", "resetCameraBtn"]) {
  expect(/^<button\b/i.test(openingTagWithId(html, id)), `${id} must be a button.`);
  expect(queriedIds.includes(id), `${id} is not wired up by the JavaScript module.`);
}
for (const id of [
  "journeyClock",
  "depthReadout",
  "speedReadout",
  "gravityReadout",
  "angleReadout",
  "chordReadout",
  "tunnelAngle",
  "tunnelAngleValue",
  "progressFill"
]) {
  expect(queriedIds.includes(id), `Live readout is not wired up by JavaScript: ${id}`);
}
expect(
  /restartBtn[\s\S]{0,240}addEventListener\(\s*(["'])click\1/i.test(script) ||
    /addEventListener\(\s*(["'])click\1[\s\S]{0,240}(?:restart|resetSimulation|startDrop)/i.test(script),
  "The Restart drop button must have a click handler."
);

const parsedMediaBlocks = mediaBlocks(style);
const responsiveBlocks = parsedMediaBlocks.filter(block => /\(\s*max-width\s*:/i.test(block.condition));
expect(responsiveBlocks.length >= 2, "The stylesheet must include responsive tablet and phone breakpoints.");
expect(
  responsiveBlocks.some(block => (
    /\.simulation-layout\s*\{[^}]*grid-template-columns\s*:\s*1fr\s*;/i.test(block.body)
  )),
  "The simulation layout must collapse to one column responsively."
);
const reducedMotionBlock = parsedMediaBlocks.find(block => (
  /\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/i.test(block.condition)
));
expect(reducedMotionBlock, "The stylesheet must respect prefers-reduced-motion.");
expect(
  /animation-(?:duration|iteration-count)\s*:/i.test(reducedMotionBlock?.body ?? "") &&
    /transition-duration\s*:/i.test(reducedMotionBlock?.body ?? ""),
  "Reduced-motion CSS must suppress both animation and transitions."
);

const numericScript = script.replace(/_/g, "");
expect(
  /\b(?:EARTH_?RADIUS(?:_?(?:M|METERS|METRES))?|RADIUS_?EARTH)\b\s*=\s*(?:6371000(?:\.0*)?|6\.371e\+?6)\b/i.test(numericScript),
  "The physics model must define Earth's mean radius as 6.371e6 m."
);
expect(
  /\b(?:SURFACE_?GRAVITY|GRAVITY_?(?:AT_?)?SURFACE|EARTH_?GRAVITY|G_SURFACE)\b\s*=\s*9\.81\b/i.test(numericScript),
  "The physics model must define surface gravity as 9.81 m/s²."
);
expect(/uniform[\s_-]*density/i.test(script), "The module must identify the uniform-density assumption.");
expect(
  /simple[\s_-]*harmonic|\bSHM\b/i.test(script),
  "The module must identify the motion as simple harmonic motion."
);
expect(
  /Math\.sqrt\(\s*[A-Z_$][\w$]*\s*\/\s*[A-Z_$][\w$]*\s*\)/.test(script),
  "The SHM angular frequency must be calculated as sqrt(g / R)."
);
expect(
  /\bangleRadians\s*=\s*THREE\.MathUtils\.degToRad\(\s*angleDegrees\s*\)/i.test(script) ||
    /\bangleRadians\s*=\s*angleDegrees\s*\*\s*Math\.PI\s*\/\s*180\b/i.test(script),
  "The tunnel slider angle must be converted from degrees to radians."
);
expect(
  /\b(?:cosine|cosAngle)\s*=\s*Math\.cos\(\s*angleRadians\s*\)/i.test(script) &&
    /\bhalfChord(?:Metres|Meters)?\s*=\s*(?:EARTH_RADIUS(?:_M|_METRES|_METERS)?|RADIUS_EARTH)\s*\*\s*(?:cosine|cosAngle)\b/i.test(script),
  "The chord model must calculate halfChord = R cos(angle)."
);
expect(
  /\b(?:sine|sinAngle)\s*=\s*Math\.sin\(\s*angleRadians\s*\)/i.test(script) &&
    /\bimpactParameter(?:Metres|Meters)?\s*=\s*(?:EARTH_RADIUS(?:_M|_METRES|_METERS)?|RADIUS_EARTH)\s*\*\s*(?:sine|sinAngle)\b/i.test(script),
  "The chord model must calculate impact = R sin(angle)."
);
expect(
  /\bmaximumDepth(?:Metres|Meters)?\s*:\s*(?:EARTH_RADIUS(?:_M|_METRES|_METERS)?|RADIUS_EARTH)\s*-\s*impactParameter(?:Metres|Meters)?\b/i.test(script),
  "The maximum radial depth must be R minus the chord impact parameter."
);
expect(
  /\bmaximumSpeed(?:MetresPerSecond|MetersPerSecond)?\s*:\s*(?:ANGULAR_FREQUENCY|OMEGA)\s*\*\s*halfChord(?:Metres|Meters)?\b/i.test(script),
  "Maximum speed must scale with the chord half-length."
);
expect(
  /\bphase\s*=\s*(?:ANGULAR_FREQUENCY|OMEGA)\s*\*\s*(?:simulationSeconds|time)\b/i.test(script) &&
    /\bpositionAlongTunnel(?:Metres|Meters)?\s*=\s*(?:model\.)?halfChord(?:Metres|Meters)?\s*\*\s*Math\.cos\s*\(\s*phase\s*\)/i.test(script),
  "The analytic position along the chord must be halfChord cos(omega t)."
);
expect(
  /\bvelocity(?:AlongTunnel)?(?:MetresPerSecond|MetersPerSecond)?\s*=\s*-\s*(?:model\.)?halfChord(?:Metres|Meters)?\s*\*\s*(?:ANGULAR_FREQUENCY|OMEGA)\s*\*\s*Math\.sin\s*\(\s*phase\s*\)/i.test(script),
  "The analytic velocity along the chord must be -halfChord omega sin(omega t)."
);
expect(
  /\bacceleration(?:AlongTunnel)?(?:MetresPerSecondSquared|MetersPerSecondSquared)?\s*=\s*-\s*(?:ANGULAR_FREQUENCY|OMEGA)\s*\*\s*(?:ANGULAR_FREQUENCY|OMEGA)\s*\*\s*positionAlongTunnel(?:Metres|Meters)?\b/i.test(script) ||
    /\bacceleration(?:AlongTunnel)?(?:MetresPerSecondSquared|MetersPerSecondSquared)?\s*=\s*-\s*[A-Z_$][\w$]*\s*\/\s*[A-Z_$][\w$]*\s*\*\s*positionAlongTunnel(?:Metres|Meters)?\b/i.test(script),
  "The acceleration along the chord must be a restoring acceleration proportional to -position."
);
expect(
  /\bsceneX\s*=\s*(?:model\.)?midpointX\s*\+\s*(?:model\.)?axisToStartX\s*\*\s*sceneOffset\b/i.test(script) &&
    /\bsceneY\s*=\s*(?:model\.)?midpointY\s*\+\s*(?:model\.)?axisToStartY\s*\*\s*sceneOffset\b/i.test(script) &&
    /ballGroup\.position\.set\(\s*sceneX\s*,\s*sceneY\s*,/i.test(script),
  "The ball must be placed in both scene dimensions along the angled chord."
);
expect(
  /updateTrail\(\s*sceneX\s*,\s*sceneY\s*\)/i.test(script) &&
    /trailPoints\.push\(\s*\{\s*x\s*:\s*sceneX\s*,\s*y\s*:\s*sceneY\s*\}\s*\)/i.test(script) &&
    /positions\[index\s*\*\s*3\]\s*=\s*trailPoints\[index\]\.x[\s\S]{0,140}positions\[index\s*\*\s*3\s*\+\s*1\]\s*=\s*trailPoints\[index\]\.y/i.test(script),
  "The glowing trail must retain both X and Y coordinates along the angled chord."
);
expect(
  /\bradialDistance(?:Metres|Meters)?\s*=\s*Math\.hypot\(\s*(?:state\.)?model\.impactParameter(?:Metres|Meters)?\s*,\s*(?:state\.)?positionAlongTunnel(?:Metres|Meters)?\s*\)/i.test(script) &&
    /\bdepthKilometres\s*=\s*\((?:EARTH_RADIUS(?:_M|_METRES|_METERS)?|RADIUS_EARTH)\s*-\s*radialDistance(?:Metres|Meters)?\)\s*\/\s*1000\b/i.test(script),
  "Live depth must be radial depth, using hypot(impact, positionAlongTunnel)."
);
expect(
  /(?:2\s*\*\s*Math\.PI|Math\.PI\s*\*\s*2)\s*\/\s*[A-Z_$][\w$]*/.test(script),
  "The full oscillation period must be derived as 2π / omega."
);

const threeModuleSpecifiers = [...script.matchAll(
  /(?:\bfrom\s*|\bimport\s*\(\s*)(["'])(three(?:\/[^"']*)?)\1/g
)].map(match => match[2]);
expect(
  threeModuleSpecifiers.includes("three"),
  "The module must import the Three.js core specifier mapped by the page import map."
);
expect(
  threeModuleSpecifiers.includes("three/addons/controls/OrbitControls.js") &&
    /new\s+OrbitControls\s*\(/.test(script),
  "The 3D viewer must import OrbitControls through the mapped Three.js addons prefix and create it."
);
expect(
  /Promise\.all\s*\(\s*\[[\s\S]*?import\(\s*(["'])three\1\s*\)[\s\S]*?import\(\s*(["'])three\/addons\/controls\/OrbitControls\.js\2\s*\)[\s\S]*?\]\s*\)/i.test(script) &&
    /\bcatch\s*\([^)]*\)\s*\{[\s\S]{0,360}showError\s*\(/i.test(script),
  "Three.js core and addons must load together dynamically, with a visible failure fallback."
);
expect(/new\s+ResizeObserver\s*\(/.test(script), "The renderer must respond to container resizing with ResizeObserver.");
expect(
  /setPixelRatio\s*\(/.test(script) && /devicePixelRatio/.test(script) && /Math\.min\s*\(/.test(script),
  "Renderer pixel ratio must cap devicePixelRatio with Math.min."
);
expect(
  /addEventListener\(\s*(["'])webglcontextlost\1/.test(script) &&
    /addEventListener\(\s*(["'])webglcontextrestored\1/.test(script) &&
    /preventDefault\s*\(/.test(script),
  "The viewer must handle WebGL context loss and restoration, preventing the browser default on loss."
);
expect(
  /matchMedia\s*\(\s*(["'])\(prefers-reduced-motion\s*:\s*reduce\)\1\s*\)/.test(script) &&
    /\.matches\b/.test(script),
  "The animation must detect and respond to the reduced-motion preference."
);
expect(
  /elements\.tunnelAngle\.addEventListener\(\s*(["'])input\1[\s\S]{0,360}updateTunnelGeometry\s*\([\s\S]{0,160}updateSimulationState\s*\(\s*0\b/i.test(script) &&
    /elements\.tunnelAngle\.addEventListener\(\s*(["'])change\1[\s\S]{0,280}restartSimulation\s*\(/i.test(script),
  "Changing the tunnel angle must rebuild the chord and restart its live state safely."
);
expect(
  /new\s+IntersectionObserver\s*\(/.test(script) &&
    /document\.hidden/.test(script) &&
    /addEventListener\(\s*(["'])pagehide\1/.test(script) &&
    /\bdisposeSimulation\s*\(/.test(script),
  "The animation must pause off-screen or while hidden and dispose its resources on page exit."
);

// Independent acceptance calculations for straight and angled chords through an ideal,
// non-rotating, uniform-density Earth.
const earthRadiusMetres = 6.371e6;
const surfaceGravity = 9.81;
const angularFrequency = Math.sqrt(surfaceGravity / earthRadiusMetres);
const periodSeconds = 2 * Math.PI / angularFrequency;
const midpointMinutes = periodSeconds / 4 / 60;
const crossingMinutes = periodSeconds / 2 / 60;
const periodMinutes = periodSeconds / 60;
const angleFixtures = [
  { degrees: 0, chordKilometres: 12742.0, maximumDepthKilometres: 6371.0, maximumSpeedKilometresPerSecond: 7.91 },
  { degrees: 30, chordKilometres: 11034.9, maximumDepthKilometres: 3185.5, maximumSpeedKilometresPerSecond: 6.85 },
  { degrees: 60, chordKilometres: 6371.0, maximumDepthKilometres: 853.5, maximumSpeedKilometresPerSecond: 3.95 },
  { degrees: 75, chordKilometres: 3297.8, maximumDepthKilometres: 217.1, maximumSpeedKilometresPerSecond: 2.05 }
];
const angleResults = angleFixtures.map(fixture => {
  const radians = fixture.degrees * Math.PI / 180;
  const halfChordMetres = earthRadiusMetres * Math.cos(radians);
  const impactParameterMetres = earthRadiusMetres * Math.sin(radians);
  const result = {
    degrees: fixture.degrees,
    chordKilometres: halfChordMetres * 2 / 1000,
    maximumDepthKilometres: (earthRadiusMetres - impactParameterMetres) / 1000,
    maximumSpeedKilometresPerSecond: angularFrequency * halfChordMetres / 1000,
    midpointMinutes: Math.acos(0) / angularFrequency / 60,
    crossingMinutes: Math.PI / angularFrequency / 60,
    periodMinutes: Math.PI * 2 / angularFrequency / 60
  };

  expectNear(result.chordKilometres, fixture.chordKilometres, 0.15, `${fixture.degrees}° chord-length check failed`);
  expectNear(result.maximumDepthKilometres, fixture.maximumDepthKilometres, 0.15, `${fixture.degrees}° maximum-depth check failed`);
  expectNear(result.maximumSpeedKilometresPerSecond, fixture.maximumSpeedKilometresPerSecond, 0.015, `${fixture.degrees}° maximum-speed check failed`);
  expectNear(result.midpointMinutes, 21.1, 0.2, `${fixture.degrees}° midpoint-time check failed`);
  expectNear(result.crossingMinutes, 42.2, 0.3, `${fixture.degrees}° crossing-time check failed`);
  expectNear(result.periodMinutes, 84.4, 0.6, `${fixture.degrees}° period check failed`);
  return result;
});

expect(
  angleResults.slice(1).every((result, indexValue) => (
    result.chordKilometres < angleResults[indexValue].chordKilometres &&
    result.maximumDepthKilometres < angleResults[indexValue].maximumDepthKilometres &&
    result.maximumSpeedKilometresPerSecond < angleResults[indexValue].maximumSpeedKilometresPerSecond
  )),
  "Chord length, maximum depth, and maximum speed must all decrease as tunnel angle increases."
);
expect(
  angleResults.every(result => (
    Math.abs(result.midpointMinutes - midpointMinutes) < 1e-12 &&
    Math.abs(result.crossingMinutes - crossingMinutes) < 1e-12 &&
    Math.abs(result.periodMinutes - periodMinutes) < 1e-12
  )),
  "Midpoint, crossing, and period times must remain angle-invariant."
);
expectNear(crossingMinutes, midpointMinutes * 2, 1e-12, "Half-period relationship check failed");
expectNear(periodMinutes, midpointMinutes * 4, 1e-12, "Full-period relationship check failed");

if (failures.length) {
  console.error(`Earth tunnel simulation validation failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Earth tunnel simulation valid at ${angleFixtures.map(item => `${item.degrees}°`).join(", ")}: ` +
    `midpoint ${midpointMinutes.toFixed(1)} min, crossing ${crossingMinutes.toFixed(1)} min, ` +
    `period ${periodMinutes.toFixed(1)} min; chord depth and maximum speed vary correctly.`
  );
}
