const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "simulations", "Mechanics", "n_body_pursuit.html");
const stylePath = path.join(root, "simulations", "Mechanics", "css", "n_body_pursuit.css");
const scriptPath = path.join(root, "simulations", "Mechanics", "js", "n_body_pursuit.mjs");
const indexPath = path.join(root, "index.html");
const failures = [];
const TAU = Math.PI * 2;

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
    .map((match) => match[0])
    .find((tag) => new RegExp(`\\bid\\s*=\\s*(["'])${escapedId}\\1`, "i").test(tag)) || "";
}

function attributeValue(tag, name) {
  const match = tag.match(new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2] ?? "";
}

function pursuitModel(count, speed, progress, initialRadius = 10) {
  const halfVertexAngle = Math.PI / count;
  const sine = Math.sin(halfVertexAngle);
  const cosine = Math.cos(halfVertexAngle);
  const meetingTime = initialRadius / (speed * sine);
  const radius = initialRadius * (1 - progress);
  const angleAdvance = progress >= 1
    ? Infinity
    : (cosine / sine) * -Math.log1p(-progress);

  return {
    sine,
    cosine,
    meetingTime,
    radius,
    angleAdvance,
    pathLength: speed * meetingTime,
    radialSpeed: -speed * sine,
    tangentialSpeed: speed * cosine,
  };
}

function pursuitPositions(count, speed, progress, initialRadius = 10) {
  if (progress >= 1) return Array.from({ length: count }, () => ({ x: 0, y: 0 }));
  const model = pursuitModel(count, speed, progress, initialRadius);
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * TAU) / count + model.angleAdvance;
    return {
      x: model.radius * Math.cos(angle),
      y: model.radius * Math.sin(angle),
    };
  });
}

function velocityComponents(count, speed, theta) {
  const halfVertexAngle = Math.PI / count;
  const inwardFactor = Math.sin(halfVertexAngle);
  const tangentialFactor = Math.cos(halfVertexAngle);
  const inward = { x: -Math.cos(theta), y: -Math.sin(theta) };
  const tangent = { x: -Math.sin(theta), y: Math.cos(theta) };
  const radial = {
    x: inward.x * speed * inwardFactor,
    y: inward.y * speed * inwardFactor,
  };
  const tangential = {
    x: tangent.x * speed * tangentialFactor,
    y: tangent.y * speed * tangentialFactor,
  };
  return {
    radial,
    tangential,
    resultant: {
      x: radial.x + tangential.x,
      y: radial.y + tangential.y,
    },
  };
}

const html = requireFile(htmlPath);
const style = requireFile(stylePath);
const script = requireFile(scriptPath);
const index = requireFile(indexPath);

expect(
  /<link\b(?=[^>]*\bhref\s*=\s*(["'])css\/n_body_pursuit\.css\1)[^>]*>/i.test(html),
  "The pursuit page does not link its stylesheet."
);
expect(
  /<script\b(?=[^>]*\bsrc\s*=\s*(["'])js\/n_body_pursuit\.mjs\1)[^>]*>/i.test(html),
  "The pursuit page does not load its JavaScript module."
);
expect(
  /<a\b(?=[^>]*\bhref\s*=\s*(["'])\.\.\/\.\.\/index\.html#physics\1)[^>]*>/i.test(html),
  "The simulation is missing its back link to Physics."
);
expect(
  /<a\b(?=[^>]*\bhref\s*=\s*(["'])simulations\/Mechanics\/n_body_pursuit\.html\1)[^>]*>[\s\S]*?N-Body Pursuit/i.test(index),
  "Physics → Mechanics does not link to the N-body pursuit simulation."
);

const htmlIds = [...html.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map((match) => match[2]);
const duplicates = [...new Set(htmlIds.filter((id, indexValue) => htmlIds.indexOf(id) !== indexValue))];
expect(duplicates.length === 0, `Duplicate HTML IDs: ${duplicates.join(", ") || "none"}.`);

const queriedIds = [...script.matchAll(/\bgetElementById\(\s*(["'])([^"']+)\1\s*\)/g)].map((match) => match[2]);
expect(queriedIds.length > 0, "The pursuit module does not bind any page elements.");
for (const id of [...new Set(queriedIds)]) {
  expect(htmlIds.includes(id), `JavaScript queries missing HTML ID: ${id}`);
}

const viewerTag = openingTagWithId(html, "pursuitViewer");
expect(attributeValue(viewerTag, "role") === "region", "The simulation viewer must expose region semantics.");
expect(attributeValue(viewerTag, "tabindex") === "0", "The simulation viewer must be keyboard focusable.");
expect(
  attributeValue(viewerTag, "aria-describedby").split(/\s+/).includes("sceneDescription"),
  "The viewer must reference its accessible scene description."
);
expect(/id\s*=\s*(["'])sceneDescription\1[^>]*>[\s\S]*?regular polygon[\s\S]*?next person/i.test(html), "The accessible scene description must explain the pursuit setup.");
expect(/id\s*=\s*(["'])simStatus\1[^>]*\baria-live\s*=\s*(["'])polite\2/i.test(html), "The simulation needs a polite live status region.");

const rangeExpectations = [
  ["nCount", "3", "12", "1", "5"],
  ["speed", "0.5", "5", "0.5", "2"],
  ["playbackSpeed", "0.5", "4", "0.5", "1"],
  ["timeProgress", "0", "1000", "1", "0"],
];
for (const [id, minimum, maximum, step, value] of rangeExpectations) {
  const tag = openingTagWithId(html, id);
  expect(/^<input\b/i.test(tag), `${id} must be a native input.`);
  expect(attributeValue(tag, "type") === "range", `${id} must be a range control.`);
  expect(attributeValue(tag, "min") === minimum, `${id} has the wrong minimum.`);
  expect(attributeValue(tag, "max") === maximum, `${id} has the wrong maximum.`);
  expect(attributeValue(tag, "step") === step, `${id} has the wrong step.`);
  expect(attributeValue(tag, "value") === value, `${id} has the wrong default.`);
}

for (const id of ["playPauseBtn", "restartBtn", "stepBtn"]) {
  expect(/^<button\b/i.test(openingTagWithId(html, id)), `${id} must be a native button.`);
}
for (const id of ["trailToggle", "polygonToggle", "arrowToggle", "vectorToggle"]) {
  const tag = openingTagWithId(html, id);
  expect(/^<input\b/i.test(tag), `${id} must be a native input.`);
  expect(attributeValue(tag, "type") === "checkbox", `${id} must be a checkbox.`);
}
expect(!/id\s*=\s*(["'])vectorToggle\1[^>]*\bchecked\b/i.test(html), "The velocity overlay must default to off so the diagram remains uncluttered.");
const velocityLegendTag = openingTagWithId(html, "velocityLegend");
expect(attributeValue(velocityLegendTag, "role") === "group", "The velocity legend must expose grouped semantics.");
expect(/id\s*=\s*(["'])velocityLegend\1[^>]*\bhidden\b/i.test(html), "The velocity legend must be hidden until its toggle is enabled.");
expect(/<\/div>\s*<div\s+id\s*=\s*(["'])velocityLegend\1/i.test(html), "The velocity key must be docked below the drawing instead of covering the canvas.");
for (const id of ["radialVectorValue", "tangentialVectorValue", "resultantVectorValue"]) {
  expect(/^<output\b/i.test(openingTagWithId(html, id)), `${id} must be a native output.`);
}
expect(/Velocity components/i.test(html), "The diagram options must label the velocity decomposition toggle.");
expect(/Arrow lengths are normalized/i.test(html), "The normalized vector-length convention must be disclosed.");

const predictionValues = [...html.matchAll(/\bdata-prediction\s*=\s*(["'])([^"']+)\1/gi)].map((match) => match[2]).sort();
expect(
  JSON.stringify(predictionValues) === JSON.stringify(["forever", "spiral", "straight", "unsure"]),
  `Prediction choices are incomplete: ${predictionValues.join(", ") || "none"}.`
);
expect(/id\s*=\s*(["'])explanationCard\1[^>]*\bhidden\b/i.test(html), "The explanation must remain hidden until a prediction.");
expect(!/id\s*=\s*(["'])explanationGate\1[^>]*\bhidden\b/i.test(html), "The prediction gate must be visible initially.");
expect(/id\s*=\s*(["'])remainingReadout\1[^>]*>\s*Predict first\s*</i.test(html), "The outcome timing must remain gated before a prediction.");
expect(/logarithmic spiral/i.test(html), "The revealed explanation must name the logarithmic spiral.");
expect(/radial[\s\S]*?tangential/i.test(html), "The explanation must distinguish radial and tangential motion.");
expect(/R<sub>0<\/sub>[\s\S]*?sin/i.test(html), "The finite meeting-time formula is missing.");
expect(/path length/i.test(html), "The speed-independent path-length result is missing.");

for (const expectedSnippet of [
  "const INITIAL_RADIUS_METRES = 10",
  "Math.sin(halfVertexAngle)",
  "Math.cos(halfVertexAngle)",
  "INITIAL_RADIUS_METRES / (speed * inwardFactor)",
  "INITIAL_RADIUS_METRES * (1 - safeProgress)",
  "-Math.log1p(-boundedProgress)",
  "if (atProgress >= 1)",
  "requestAnimationFrame(animate)",
  "cancelAnimationFrame(animationFrame)",
  "new ResizeObserver",
  "prefers-reduced-motion: reduce",
  "visibilitychange",
  "event.key === \"ArrowRight\"",
  "event.key === \"ArrowLeft\"",
  "elements.explanationCard.hidden = false",
  "elements.explanationGate.hidden = true",
  "let explanationUnlocked = false",
  "explanationUnlocked = true",
  "function drawVelocityOverlay",
  "function velocityOverlayVisibility",
  "if (!elements.vectorToggle.checked || progress >= 1) return",
  "const velocityOverlayVisible = elements.vectorToggle.checked && velocityOverlayVisibility(radiusPixels) > 0",
  "if (velocityOverlayVisible && index === 0) return",
  "const inward = { x: -Math.cos(focusAngle), y: -Math.sin(focusAngle) }",
  "const tangent = { x: -Math.sin(focusAngle), y: Math.cos(focusAngle) }",
  "x: radial.x + tangential.x",
  "drawVelocityOverlay(context, model, positions, radiusPixels)",
  "elements.velocityLegend.hidden = !elements.vectorToggle.checked || progress >= 1",
  "model.radialSpeed.toFixed(2)",
  "model.tangentialSpeed.toFixed(2)",
]) {
  expect(script.includes(expectedSnippet), `Required pursuit behavior is missing: ${expectedSnippet}`);
}

expect(/let isPlaying = false;/.test(script), "The simulation must not autoplay before learner input.");
expect(!/Euler|Runge.Kutta|velocity\s*\*\s*delta/i.test(script), "The symmetric pursuit should use its exact solution, not numerical integration.");
expect(/@media\s*\(max-width:\s*1040px\)/i.test(style), "The layout needs a tablet breakpoint.");
expect(/@media\s*\(max-width:\s*760px\)/i.test(style), "The layout needs a narrow-tablet breakpoint.");
expect(/@media\s*\(max-width:\s*480px\)/i.test(style), "The layout needs a phone breakpoint.");
expect(/@media\s*\(prefers-reduced-motion:\s*reduce\)/i.test(style), "Reduced-motion preferences are not respected in CSS.");
expect(/\.simulation-layout\s*\{[\s\S]*?grid-template-columns:\s*1fr;/i.test(style), "The simulation layout must collapse to one column.");
expect(/\.display-options\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/i.test(style), "The four diagram options must use a readable two-column layout.");
expect(/\.velocity-legend\s*\{/i.test(style), "The velocity key is missing its styles.");
const velocityLegendRule = style.match(/\.velocity-legend\s*\{[^}]*\}/i)?.[0] ?? "";
expect(!/position\s*:\s*absolute/i.test(velocityLegendRule), "The velocity key must not cover the live drawing.");

for (const [count, expectedTime] of [
  [3, 5.773502691896258],
  [4, 7.0710678118654755],
  [5, 8.506508083520398],
  [6, 10],
  [12, 19.318516525781366],
]) {
  expectNear(pursuitModel(count, 2, 0).meetingTime, expectedTime, 1e-10, `Meeting-time fixture failed for N = ${count}`);
}

expectNear(pursuitModel(5, 2, 0.5).angleAdvance, 0.9540352475482768, 1e-12, "N = 5 halfway angular displacement is incorrect");
expectNear(pursuitModel(4, 2, 0.9).angleAdvance, 2.302585092994046, 1e-10, "N = 4 late angular displacement is incorrect");
expectNear(pursuitModel(5, 0.5, 0).pathLength, pursuitModel(5, 5, 0).pathLength, 1e-12, "Path length should not depend on speed");

const fivePersonComponents = velocityComponents(5, 2, -Math.PI / 2);
expectNear(fivePersonComponents.radial.x, 0, 1e-12, "N = 5 radial component x is incorrect");
expectNear(fivePersonComponents.radial.y, 1.1755705045849463, 1e-12, "N = 5 radial component y is incorrect");
expectNear(fivePersonComponents.tangential.x, 1.618033988749895, 1e-12, "N = 5 tangential component x is incorrect");
expectNear(fivePersonComponents.tangential.y, 0, 1e-12, "N = 5 tangential component y is incorrect");
expectNear(fivePersonComponents.resultant.x, 1.618033988749895, 1e-12, "N = 5 resultant x is incorrect");
expectNear(fivePersonComponents.resultant.y, 1.1755705045849463, 1e-12, "N = 5 resultant y is incorrect");

const twelvePersonComponents = velocityComponents(12, 2, 0);
expectNear(twelvePersonComponents.radial.x, -0.5176380902050415, 1e-12, "N = 12 radial component x is incorrect");
expectNear(twelvePersonComponents.radial.y, 0, 1e-12, "N = 12 radial component y is incorrect");
expectNear(twelvePersonComponents.tangential.x, 0, 1e-12, "N = 12 tangential component x is incorrect");
expectNear(twelvePersonComponents.tangential.y, 1.9318516525781366, 1e-12, "N = 12 tangential component y is incorrect");

for (const count of Array.from({ length: 10 }, (_, indexValue) => indexValue + 3)) {
  for (const progress of [0, 0.25, 0.5, 0.9, 0.99]) {
    const model = pursuitModel(count, 2.5, progress);
    const positions = pursuitPositions(count, 2.5, progress);
    const firstRadius = Math.hypot(positions[0].x, positions[0].y);
    const firstSide = Math.hypot(positions[1].x - positions[0].x, positions[1].y - positions[0].y);
    expectNear(firstRadius, model.radius, 1e-9, `Circumradius invariant failed for N = ${count}, q = ${progress}`);
    expectNear(firstSide, 2 * model.radius * Math.sin(Math.PI / count), 1e-9, `Regular-polygon invariant failed for N = ${count}, q = ${progress}`);
    expectNear(Math.hypot(model.radialSpeed, model.tangentialSpeed), 2.5, 1e-12, `Speed decomposition failed for N = ${count}`);

    const theta = -Math.PI / 2 + model.angleAdvance;
    const components = velocityComponents(count, 2.5, theta);
    const radialMagnitude = Math.hypot(components.radial.x, components.radial.y);
    const tangentialMagnitude = Math.hypot(components.tangential.x, components.tangential.y);
    const resultantMagnitude = Math.hypot(components.resultant.x, components.resultant.y);
    const componentDotProduct = components.radial.x * components.tangential.x + components.radial.y * components.tangential.y;
    const chord = {
      x: positions[1].x - positions[0].x,
      y: positions[1].y - positions[0].y,
    };
    const alignment = (components.resultant.x * chord.x + components.resultant.y * chord.y) / (resultantMagnitude * Math.hypot(chord.x, chord.y));
    expectNear(radialMagnitude, 2.5 * Math.sin(Math.PI / count), 1e-12, `Radial-vector magnitude failed for N = ${count}, q = ${progress}`);
    expectNear(tangentialMagnitude, 2.5 * Math.cos(Math.PI / count), 1e-12, `Tangential-vector magnitude failed for N = ${count}, q = ${progress}`);
    expectNear(componentDotProduct, 0, 1e-11, `Velocity components are not orthogonal for N = ${count}, q = ${progress}`);
    expectNear(resultantMagnitude, 2.5, 1e-12, `Resultant velocity magnitude failed for N = ${count}, q = ${progress}`);
    expectNear(alignment, 1, 1e-12, `Resultant does not point to the next person for N = ${count}, q = ${progress}`);
  }
}

const meetingPositions = pursuitPositions(12, 1, 1);
expect(meetingPositions.every((point) => point.x === 0 && point.y === 0), "All people must be placed exactly at the meeting point at q = 1.");

if (failures.length) {
  console.error(`N-body pursuit validation failed (${failures.length} issue${failures.length === 1 ? "" : "s"}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("N-body pursuit validation passed: structure, accessibility, responsiveness, and analytic physics fixtures are sound.");
