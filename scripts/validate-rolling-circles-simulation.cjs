const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "simulations", "Mechanics", "rolling_circles.html");
const stylePath = path.join(root, "simulations", "Mechanics", "css", "rolling_circles.css");
const scriptPath = path.join(root, "simulations", "Mechanics", "js", "rolling_circles.mjs");
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
    .map(match => match[0])
    .find(tag => new RegExp(`\\bid\\s*=\\s*(["'])${escapedId}\\1`, "i").test(tag)) || "";
}

function attributeValue(tag, name) {
  const match = tag.match(new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2] ?? "";
}

function temptingTurnsPerOrbit(rollerRadius) {
  return 1 / rollerRadius;
}

function actualTurnsPerOrbit(rollerRadius) {
  return temptingTurnsPerOrbit(rollerRadius) + 1;
}

function geometryAt(rollerRadius, orbitAngle) {
  const fixedRadius = 1;
  const ratio = fixedRadius / rollerRadius;
  const startAngle = Math.PI / 2;
  const centreAngle = startAngle + orbitAngle;
  const centreDistance = fixedRadius + rollerRadius;
  const rollerX = centreDistance * Math.cos(centreAngle);
  const rollerY = centreDistance * Math.sin(centreAngle);
  const markerAngle = startAngle + Math.PI + (ratio + 1) * orbitAngle;

  return {
    rollerX,
    rollerY,
    markerX: rollerX + rollerRadius * Math.cos(markerAngle),
    markerY: rollerY + rollerRadius * Math.sin(markerAngle),
    contactX: fixedRadius * Math.cos(centreAngle),
    contactY: fixedRadius * Math.sin(centreAngle)
  };
}

const html = requireFile(htmlPath);
const style = requireFile(stylePath);
const script = requireFile(scriptPath);
const index = requireFile(indexPath);

expect(
  /<link\b(?=[^>]*\bhref\s*=\s*(["'])css\/rolling_circles\.css\1)[^>]*>/i.test(html),
  "The rolling-circle page does not link its stylesheet."
);
expect(
  /<script\b(?=[^>]*\bsrc\s*=\s*(["'])js\/rolling_circles\.mjs\1)[^>]*>/i.test(html),
  "The rolling-circle page does not load its JavaScript module."
);
expect(
  /<a\b(?=[^>]*\bhref\s*=\s*(["'])\.\.\/\.\.\/index\.html#physics\1)[^>]*>/i.test(html),
  "The simulation is missing its back link to Physics."
);

const physicsSection = index.match(
  /<article\b[^>]*\bid\s*=\s*(["'])physics\1[^>]*>[\s\S]*?(?=<article\b[^>]*\bid\s*=|<\/section>)/i
)?.[0] ?? "";
expect(physicsSection, "The homepage Physics section is missing.");
expect(
  /<h3\b[^>]*>\s*Mechanics\s*<\/h3>[\s\S]*?<a\b(?=[^>]*\bhref\s*=\s*(["'])simulations\/Mechanics\/rolling_circles\.html\1)[^>]*>/i.test(physicsSection),
  "Physics → Mechanics does not link to the rolling-circle simulation."
);

const htmlIds = [...html.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map(match => match[2]);
const duplicates = [...new Set(htmlIds.filter((id, indexValue) => htmlIds.indexOf(id) !== indexValue))];
expect(duplicates.length === 0, `Duplicate HTML IDs: ${duplicates.join(", ") || "none"}.`);

const queriedIds = [...script.matchAll(/\bgetElementById\(\s*(["'])([^"']+)\1\s*\)/g)].map(match => match[2]);
expect(queriedIds.length > 0, "The simulation module does not bind any page elements.");
for (const id of [...new Set(queriedIds)]) {
  expect(htmlIds.includes(id), `JavaScript queries missing HTML ID: ${id}`);
}

const viewerTag = openingTagWithId(html, "rollingViewer");
expect(attributeValue(viewerTag, "role") === "region", "The simulation viewer must expose region semantics.");
expect(attributeValue(viewerTag, "tabindex") === "0", "The simulation viewer must be keyboard focusable.");
expect(
  attributeValue(viewerTag, "aria-describedby").split(/\s+/).includes("sceneDescription"),
  "The viewer must reference its accessible scene description."
);
expect(
  /id\s*=\s*(["'])sceneDescription\1[^>]*>[\s\S]*?fixed[\s\S]*?roller[\s\S]*?contact point/i.test(html),
  "The scene description must explain the fixed circle, roller, and contact point."
);

for (const id of ["animationSpeed", "orbitProgress"]) {
  const tag = openingTagWithId(html, id);
  expect(/^<input\b/i.test(tag), `${id} must be a native input.`);
  expect(attributeValue(tag, "type") === "range", `${id} must be a range control.`);
}

const visualModeTag = openingTagWithId(html, "visualModeToggle");
expect(/^<input\b/i.test(visualModeTag), "The visualization toggle must be a native input.");
expect(attributeValue(visualModeTag, "type") === "checkbox", "The visualization toggle must have two states.");
expect(attributeValue(visualModeTag, "role") === "switch", "The visualization toggle must expose switch semantics.");
expect(!/\bchecked\b/i.test(visualModeTag), "Smiley mode must be the default visualization.");
expect(!htmlIds.includes("traceToggle"), "The old independent trajectory checkbox must be removed.");
expect(/Smiley[\s\S]*?Radius arrow \+ trajectory/i.test(html), "Both visualization modes must be labelled.");

for (const removedId of ["fixedDiameter", "rollerDiameter", "classicPreset"]) {
  expect(!htmlIds.includes(removedId), `Removed control is still present: ${removedId}`);
}

const radiusOptionIds = ["radiusOneThird", "radiusOneHalf", "radiusOne", "radiusTwo", "radiusThree"];
const expectedRadiusValues = [1 / 3, 1 / 2, 1, 2, 3];
for (const [indexValue, id] of radiusOptionIds.entries()) {
  const tag = openingTagWithId(html, id);
  expect(/^<input\b/i.test(tag), `${id} must be a native input.`);
  expect(attributeValue(tag, "type") === "radio", `${id} must be a radio choice.`);
  expect(attributeValue(tag, "name") === "rollerRadius", `${id} must belong to the rollerRadius group.`);
  expectNear(Number(attributeValue(tag, "value")), expectedRadiusValues[indexValue], 1e-12, `${id} has the wrong radius value`);
}
expect(/id\s*=\s*(["'])radiusOneThird\1[^>]*\bchecked\b/i.test(html), "r = ⅓ R must be selected by default.");
expect(/Fixed radius R\s*=\s*1/i.test(html), "The fixed unit radius must be stated beside the choices.");

for (const id of ["playPause", "restartBtn", "stepBtn"]) {
  expect(/^<button\b/i.test(openingTagWithId(html, id)), `${id} must be a button.`);
}

const predictionValues = [...html.matchAll(/\bdata-prediction\s*=\s*(["'])([^"']+)\1/gi)].map(match => match[2]);
expect(
  JSON.stringify(predictionValues.sort()) === JSON.stringify(["3", "4", "unsure"]),
  `Prediction choices are incomplete: ${predictionValues.join(", ") || "none"}.`
);
expect(/1982 SAT/i.test(html), "The curiosity-led SAT context is missing.");
expect(/rolling without slipping/i.test(html), "The no-slip model is not stated clearly.");
expect(!/<title>[^<]*Extra Turn/i.test(html), "The browser title must not reveal the extra-turn result before the quiz.");
expect(!/<h2\b[^>]*\bid\s*=\s*(["'])labTitle\1[^>]*>[^<]*extra.?turn/i.test(html), "The lab heading must not spoil the result.");
expect(!/<header\b[\s\S]*?one more[\s\S]*?<\/header>/i.test(html), "The introductory copy must not imply the +1 answer.");
expect(/id\s*=\s*(["'])rotationReadout\1[^>]*>\s*Predict first\s*</i.test(html), "The initial actual-turn readout must be gated.");
expect(/id\s*=\s*(["'])naiveReadout\1[^>]*>\s*Predict first\s*</i.test(html), "The initial comparison readout must be gated.");
const rotationInsetTag = openingTagWithId(html, "rotationInset");
expect(/^<output\b/i.test(rotationInsetTag), "The simulation inset must be a numeric output.");
expect(attributeValue(rotationInsetTag, "aria-live") === "off", "The per-frame inset must not flood screen readers with live updates.");
expect(/id\s*=\s*(["'])rotationInset\1[^>]*>\s*\?\s*</i.test(html), "The inset must remain gated before a prediction.");
expect(!htmlIds.includes("motionPhase") && !htmlIds.includes("motionNarrative"), "The explanatory inset text must be removed.");
expect(
  /<h1\b[^>]*\bid\s*=\s*(["'])pageTitle\1[^>]*>\s*The Coin Rotation Paradox: How Many Spins in One Orbit\?\s*<\/h1>/i.test(html),
  "The requested Coin Rotation Paradox page title is missing."
);
expect(
  /When a circle rolls without slipping around another\s*<var>N<\/var>\s*times larger,\s*how many full turns does it make in one orbit\?/i.test(html),
  "The requested N-times-larger hero description is missing."
);
expect(
  /The Coin Rotation Paradox[\s\S]*?How many spins in one orbit\?/i.test(index),
  "The homepage link must use the requested Coin Rotation Paradox title."
);
expect(/<i>R<\/i>[\s\S]*?<i>r<\/i>/i.test(html), "The extra-turn formula must use the fixed radius R and rolling radius r.");
expect(/Actual lab-frame rotations/i.test(html), "The correct lab-frame rotation counter is not clearly labelled.");
expect(/Circumference-only count/i.test(html), "The tempting R / r count is not available for comparison.");
expect(/id\s*=\s*(["'])solutionCompare\1[^>]*\bhidden\b/i.test(html), "The two solutions must remain hidden until the challenge is resolved.");
expect(/Tempting solution[\s\S]*?Correct solution/i.test(html), "The challenge does not reveal both the incomplete and correct solutions.");
expect(/id\s*=\s*(["'])explanationCard\1[^>]*\bhidden\b/i.test(html), "The full explanation must be hidden before a prediction.");
expect(!/id\s*=\s*(["'])explanationGate\1[^>]*\bhidden\b/i.test(html), "The prediction gate must be visible initially.");

for (const expectedSnippet of [
  "const FIXED_RADIUS = 1",
  "let explanationUnlocked = false",
  "temptingTurnsPerOrbit: radiusRatio",
  "actualTurnsPerOrbit: radiusRatio + 1",
  "state.actualTurnsPerOrbit * orbitAngle",
  "state.progress * state.actualTurnsPerOrbit",
  "state.progress * state.temptingTurnsPerOrbit",
  "state.fixedRadius + state.rollerRadius",
  "state.fixedRadius + state.rollerRadius * 2",
  "function drawCartoonFace",
  "context.rotate(-spinAngle)",
  "drawCartoonFace(roller, rollerPixels, geometry.spinAngle, colors)",
  "function drawRadiusArrow",
  "drawRadiusArrow(roller, marker, rollerPixels, colors)",
  "if (arrowMode && state.progress > 0)",
  "const arrowMode = isArrowMode()",
  "function unlockExplanation",
  "unlockExplanation();",
  "if (!explanationUnlocked)",
  "new ResizeObserver",
  "window.requestAnimationFrame(animate)",
  "window.cancelAnimationFrame(animationFrameId)",
  "window.matchMedia(\"(prefers-reduced-motion: reduce)\")",
  "visibilitychange",
  "event.key === \"ArrowRight\"",
  "event.key === \"ArrowLeft\""
]) {
  expect(script.includes(expectedSnippet), `Required rolling behavior is missing: ${expectedSnippet}`);
}

expect(/let playing = false;/.test(script), "The simulation must not autoplay before the learner chooses to roll.");
expect(!script.includes("createRadialGradient"), "The diagram circles must use plain fills, not gradients.");
expect(!script.includes("fillText("), "The diagram must not label the circles or add canvas text.");
expect(/cartoon face/i.test(html), "The rolling circle needs a visible cartoon-face orientation cue.");
expect(!script.includes("elements.traceToggle"), "The removed independent trajectory control is still referenced.");
expect(!script.includes("answerRevealed"), "Answer visibility must be controlled only by the prediction gate.");
expect(!script.includes("updateMotionCue") && !script.includes("motionNarrative"), "The old narrative inset logic must be removed.");
expect(script.includes('elements.rotationInset.textContent = explanationUnlocked ? actualTurns.toFixed(2) : "?"'), "The inset must show only the gated small-circle rotation count.");
expect(/\.rotation-inset\s*\{[\s\S]*?font-variant-numeric:\s*tabular-nums/i.test(style), "The numeric rotation inset styles are missing.");
expect(
  (script.match(/explanationUnlocked\s*=\s*true/g) || []).length === 1,
  "Only the quiz-selection unlock function may reveal the explanation."
);
expect(
  /function choosePrediction\([\s\S]*?unlockExplanation\(\);[\s\S]*?startMotion\(\);/i.test(script),
  "Every quiz choice must unlock the explanation before the demonstration begins."
);
expect(
  /if \(arrowMode\) \{[\s\S]*?drawRadiusArrow\(roller, marker, rollerPixels, colors\);[\s\S]*?\} else \{[\s\S]*?drawCartoonFace\(roller, rollerPixels, geometry\.spinAngle, colors\);/i.test(script),
  "The toggle must switch exclusively between the radius arrow and smiley."
);
expect(!/for\s*\(let\s+radius\s*=/.test(script), "Decorative background rings are still being drawn.");
expect(!/\.hero::before\s*\{/i.test(style), "Decorative hero rings are still present.");
expect(!html.includes("hero-orbit-ring"), "The hero must not show an orbit trajectory.");
expect(!/\.hero-orbit-ring\b/i.test(style), "The removed hero trajectory still has styles.");
expect((html.match(/class\s*=\s*(["'])hero-gear-dot\1/g) || []).length === 10, "The hero roller must have ten identical gear-like dots.");
expect(/class\s*=\s*(["'])hero-orbit-motion\1[\s\S]*?class\s*=\s*(["'])hero-roller-circle\2/i.test(html), "The hero roller must move on an orbit wrapper.");
expect(!/\.hero-roller-circle::(?:before|after)/i.test(style), "The hero smiley must be removed.");
expect(/animation:\s*hero-centre-orbit\s+9s\s+linear\s+infinite/i.test(style), "The hero centre-orbit animation is missing.");
expect(/animation:\s*hero-body-roll\s+9s\s+linear\s+infinite/i.test(style), "The hero rolling animation is missing.");
expect(/@keyframes\s+hero-centre-orbit\s*\{[\s\S]*?rotate\(1turn\)/i.test(style), "The hero centre must complete one orbit per cycle.");
expect(/@keyframes\s+hero-body-roll\s*\{[\s\S]*?rotate\(3turn\)/i.test(style), "The hero roller must add three relative turns for the 3:1 setup.");
for (const [dotIndex, angle] of [0, 36, 72, 108, 144, 180, 216, 252, 288, 324].entries()) {
  expect(
    new RegExp(`\\.hero-gear-dot:nth-child\\(${dotIndex + 1}\\)\\s*\\{\\s*--gear-angle:\\s*${angle}deg;\\s*\\}`, "i").test(style),
    `Hero gear dot ${dotIndex + 1} is not evenly spaced.`
  );
}
expect(/\.radius-options\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5,/i.test(style), "The five rolling-radius choices must be shown as discrete peers.");
expect(/@media\s*\(max-width:\s*1040px\)/i.test(style), "The desktop layout needs a tablet breakpoint.");
expect(/@media\s*\(max-width:\s*480px\)/i.test(style), "The layout needs a phone breakpoint.");
expect(/@media\s*\(prefers-reduced-motion:\s*reduce\)/i.test(style), "Reduced-motion preferences are not respected.");
expect(/\.simulation-layout\s*\{[\s\S]*?grid-template-columns:\s*1fr;/i.test(style), "The simulation layout must collapse to one column.");

for (const [rollerRadius, expectedTempting, expectedActual] of [
  [1 / 3, 3, 4],
  [1 / 2, 2, 3],
  [1, 1, 2],
  [2, 1 / 2, 3 / 2],
  [3, 1 / 3, 4 / 3]
]) {
  expectNear(
    temptingTurnsPerOrbit(rollerRadius),
    expectedTempting,
    1e-12,
    `Tempting-count fixture failed for r = ${rollerRadius} R`
  );
  expectNear(
    actualTurnsPerOrbit(rollerRadius),
    expectedActual,
    1e-12,
    `Actual-turn fixture failed for r = ${rollerRadius} R`
  );
}

for (const rollerRadius of expectedRadiusValues) {
  const turns = actualTurnsPerOrbit(rollerRadius);
  const contactVelocity = (1 + rollerRadius) - rollerRadius * turns;
  expectNear(contactVelocity, 0, 1e-10, `No-slip velocity failed for r = ${rollerRadius} R`);
}

for (const ratio of [1, 2, 3]) {
  const cuspAngle = TAU / ratio;
  const point = geometryAt(1 / ratio, cuspAngle);
  expectNear(point.markerX, point.contactX, 1e-9, `Cusp x-coordinate failed for ratio ${ratio}:1`);
  expectNear(point.markerY, point.contactY, 1e-9, `Cusp y-coordinate failed for ratio ${ratio}:1`);
}

const classicStart = geometryAt(1 / 3, 0);
const classicQuarter = geometryAt(1 / 3, Math.PI / 2);
const classicFinish = geometryAt(1 / 3, TAU);
expectNear(classicQuarter.markerX, -4 / 3, 1e-9, "The quarter-orbit marker is not following the four-turn solution");
expectNear(classicQuarter.markerY, -1 / 3, 1e-9, "The quarter-orbit marker orientation incorrectly follows the three-turn solution");
expectNear(classicFinish.rollerX, classicStart.rollerX, 1e-9, "Classic roller centre does not close after one orbit");
expectNear(classicFinish.rollerY, classicStart.rollerY, 1e-9, "Classic roller centre y does not close after one orbit");
expectNear(classicFinish.markerX, classicStart.markerX, 1e-9, "Classic rim marker does not close after four turns");
expectNear(classicFinish.markerY, classicStart.markerY, 1e-9, "Classic rim marker y does not close after four turns");

if (failures.length) {
  console.error(`Rolling-circle validation failed (${failures.length} issue${failures.length === 1 ? "" : "s"}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Rolling-circle simulation validation passed: structure, accessibility, responsiveness, and physics fixtures are sound.");
