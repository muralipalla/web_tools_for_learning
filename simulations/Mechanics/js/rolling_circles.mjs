const TAU = Math.PI * 2;
const FIXED_RADIUS = 1;

const elements = {
  viewer: document.getElementById("rollingViewer"),
  canvas: document.getElementById("rollingCanvas"),
  progress: document.getElementById("orbitProgress"),
  progressValue: document.getElementById("orbitProgressValue"),
  radiusOptions: [...document.querySelectorAll('input[name="rollerRadius"]')],
  speed: document.getElementById("animationSpeed"),
  speedValue: document.getElementById("animationSpeedValue"),
  orbitReadout: document.getElementById("orbitReadout"),
  rotationReadout: document.getElementById("rotationReadout"),
  naiveReadout: document.getElementById("naiveReadout"),
  answerReadout: document.getElementById("answerReadout"),
  exampleEquation: document.getElementById("exampleEquation"),
  orientationNote: document.getElementById("orientationNote"),
  pathToggle: document.getElementById("pathToggle"),
  visualModeToggle: document.getElementById("visualModeToggle"),
  visualizationPicker: document.getElementById("visualizationPicker"),
  contactToggle: document.getElementById("contactToggle"),
  motionPhase: document.getElementById("motionPhase"),
  motionNarrative: document.getElementById("motionNarrative"),
  playPause: document.getElementById("playPause"),
  restart: document.getElementById("restartBtn"),
  step: document.getElementById("stepBtn"),
  predictionFeedback: document.getElementById("predictionFeedback"),
  solutionCompare: document.getElementById("solutionCompare"),
  naiveSolutionValue: document.getElementById("naiveSolutionValue"),
  naiveSolutionFormula: document.getElementById("naiveSolutionFormula"),
  actualSolutionValue: document.getElementById("actualSolutionValue"),
  actualSolutionFormula: document.getElementById("actualSolutionFormula"),
  explanationGate: document.getElementById("explanationGate"),
  explanationCard: document.getElementById("explanationCard"),
  simStatus: document.getElementById("simStatus"),
  rotationStatus: document.querySelector(".rotation-status")
};

const context = elements.canvas.getContext("2d");
let width = 0;
let height = 0;
let dpr = 1;
let playing = false;
let lastFrameTime = 0;
let lastWholeTurn = 0;
let pulseTimer = 0;
let animationFrameId = 0;
let explanationUnlocked = false;
let selectedPrediction = null;
const secondsPerLap = 7;
const predictionOptions = [...document.querySelectorAll("[data-prediction]")];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function readState() {
  const selectedRadius = elements.radiusOptions.find(option => option.checked) ?? elements.radiusOptions[0];
  const rollerRadius = Number(selectedRadius.value);
  const progress = Number(elements.progress.value) / Number(elements.progress.max);
  const radiusRatio = FIXED_RADIUS / rollerRadius;

  return {
    fixedRadius: FIXED_RADIUS,
    rollerRadius,
    radiusLabel: selectedRadius.dataset.radiusLabel,
    progress,
    radiusRatio,
    temptingTurnsPerOrbit: radiusRatio,
    actualTurnsPerOrbit: radiusRatio + 1,
    orbitAngle: progress * TAU
  };
}

function canvasPalette() {
  const styles = getComputedStyle(document.documentElement);
  return {
    text: styles.getPropertyValue("--text").trim(),
    cyan: styles.getPropertyValue("--cyan").trim(),
    ivory: styles.getPropertyValue("--ivory").trim(),
    coral: styles.getPropertyValue("--coral").trim(),
    gold: styles.getPropertyValue("--gold").trim(),
    faceInk: styles.getPropertyValue("--page").trim()
  };
}

function worldPoint(centerX, centerY, scale, x, y) {
  return { x: centerX + x * scale, y: centerY - y * scale };
}

function geometryAt(state, orbitAngle) {
  const startAngle = Math.PI / 2;
  const centreAngle = startAngle + orbitAngle;
  const centreDistance = state.fixedRadius + state.rollerRadius;
  const rollerX = centreDistance * Math.cos(centreAngle);
  const rollerY = centreDistance * Math.sin(centreAngle);
  const spinAngle = state.actualTurnsPerOrbit * orbitAngle;
  const markerAngle = startAngle + Math.PI + spinAngle;

  return {
    centreAngle,
    rollerX,
    rollerY,
    spinAngle,
    markerX: rollerX + state.rollerRadius * Math.cos(markerAngle),
    markerY: rollerY + state.rollerRadius * Math.sin(markerAngle),
    contactX: state.fixedRadius * Math.cos(centreAngle),
    contactY: state.fixedRadius * Math.sin(centreAngle)
  };
}

function drawCircle(x, y, radius, fill, stroke, lineWidth = 2) {
  context.beginPath();
  context.arc(x, y, radius, 0, TAU);
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = stroke;
  context.lineWidth = lineWidth;
  context.stroke();
}

function drawCartoonFace(roller, radius, spinAngle, colors) {
  const eyeOffset = radius * 0.27;
  const eyeY = -radius * 0.2;
  const eyeRadius = Math.max(1.8, radius * 0.09);

  context.save();
  context.translate(roller.x, roller.y);
  context.rotate(-spinAngle);

  context.fillStyle = colors.ivory;
  context.strokeStyle = colors.faceInk;
  context.lineWidth = Math.max(1.2, radius * 0.035);
  for (const eyeX of [-eyeOffset, eyeOffset]) {
    context.beginPath();
    context.arc(eyeX, eyeY, eyeRadius * 1.35, 0, TAU);
    context.fill();
    context.stroke();

    context.beginPath();
    context.arc(eyeX, eyeY + eyeRadius * 0.1, eyeRadius * 0.55, 0, TAU);
    context.fillStyle = colors.faceInk;
    context.fill();
    context.fillStyle = colors.ivory;
  }

  context.beginPath();
  context.arc(0, radius * 0.02, radius * 0.38, Math.PI * 0.18, Math.PI * 0.82);
  context.strokeStyle = colors.faceInk;
  context.lineWidth = Math.max(1.8, radius * 0.065);
  context.lineCap = "round";
  context.stroke();
  context.restore();
}

function drawRadiusArrow(roller, marker, radius, colors) {
  const dx = marker.x - roller.x;
  const dy = marker.y - roller.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const unitX = dx / length;
  const unitY = dy / length;
  const headLength = Math.max(7, Math.min(16, radius * 0.24));
  const headWidth = headLength * 0.58;
  const baseX = marker.x - unitX * headLength;
  const baseY = marker.y - unitY * headLength;

  context.save();
  context.strokeStyle = colors.gold;
  context.fillStyle = colors.gold;
  context.lineWidth = Math.max(2, radius * 0.055);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(roller.x, roller.y);
  context.lineTo(marker.x, marker.y);
  context.stroke();

  context.beginPath();
  context.moveTo(marker.x, marker.y);
  context.lineTo(baseX - unitY * headWidth, baseY + unitX * headWidth);
  context.lineTo(baseX + unitY * headWidth, baseY - unitX * headWidth);
  context.closePath();
  context.fill();
  context.restore();
}

function isArrowMode() {
  return elements.visualModeToggle.checked;
}

function activeOrientationCue() {
  return isArrowMode() ? "radius arrow" : "cartoon face";
}

function syncVisualizationMode() {
  elements.visualizationPicker.dataset.mode = isArrowMode() ? "arrow" : "smiley";
}

function draw() {
  const state = readState();
  const colors = canvasPalette();
  const centreX = width / 2;
  const centreY = height / 2 + 12;
  const outerRadius = state.fixedRadius + state.rollerRadius * 2;
  const padding = width < 520 ? 47 : 66;
  const scale = Math.max(0.01, Math.min(width, height) - padding * 2) / (outerRadius * 2);
  const fixedPixels = state.fixedRadius * scale;
  const rollerPixels = state.rollerRadius * scale;
  const geometry = geometryAt(state, state.orbitAngle);
  const roller = worldPoint(centreX, centreY, scale, geometry.rollerX, geometry.rollerY);
  const arrowMode = isArrowMode();

  context.clearRect(0, 0, width, height);
  context.save();

  if (elements.pathToggle.checked) {
    context.save();
    context.setLineDash([7, 8]);
    context.strokeStyle = colors.cyan;
    context.globalAlpha = 0.58;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(centreX, centreY, (state.fixedRadius + state.rollerRadius) * scale, 0, TAU);
    context.stroke();
    context.restore();
  }

  if (arrowMode && state.progress > 0) {
    context.save();
    context.strokeStyle = colors.gold;
    context.globalAlpha = 0.72;
    context.lineWidth = 2;
    context.beginPath();
    const samples = Math.min(
      900,
      Math.max(2, Math.ceil(220 * state.progress * Math.max(1, state.actualTurnsPerOrbit / 4)))
    );
    for (let index = 0; index <= samples; index += 1) {
      const sampleAngle = state.orbitAngle * index / samples;
      const sample = geometryAt(state, sampleAngle);
      const point = worldPoint(centreX, centreY, scale, sample.markerX, sample.markerY);
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.stroke();
    context.restore();
  }

  drawCircle(centreX, centreY, fixedPixels, colors.ivory, "rgba(255,255,255,0.78)", 2.5);
  drawCircle(roller.x, roller.y, rollerPixels, colors.coral, "#fecdd3", 2.5);

  const marker = worldPoint(centreX, centreY, scale, geometry.markerX, geometry.markerY);
  if (arrowMode) {
    drawRadiusArrow(roller, marker, rollerPixels, colors);
  } else {
    drawCartoonFace(roller, rollerPixels, geometry.spinAngle, colors);
  }

  if (elements.contactToggle.checked) {
    const contact = worldPoint(centreX, centreY, scale, geometry.contactX, geometry.contactY);
    drawCircle(contact.x, contact.y, Math.max(3.5, rollerPixels * 0.09), colors.cyan, colors.text, 1.5);
  }
  context.restore();
}

function updateMotionCue(state) {
  const actualTurns = state.progress * state.actualTurnsPerOrbit;
  const temptingTurns = state.progress * state.temptingTurnsPerOrbit;

  if (!explanationUnlocked && state.progress > 0.001) {
    if (state.progress < 0.25) {
      elements.motionPhase.textContent = "The first quarter";
      elements.motionNarrative.textContent = "Notice how quickly the orientation cue turns along the curved path.";
    } else if (state.progress < 0.5) {
      elements.motionPhase.textContent = "A wider route";
      elements.motionNarrative.textContent = "The roller’s centre follows the dashed circle outside the fixed rim.";
    } else if (state.progress < 0.75) {
      elements.motionPhase.textContent = "Past halfway";
      elements.motionNarrative.textContent = "Keep your own count, but do not commit until the centre returns home.";
    } else if (state.progress < 0.999) {
      elements.motionPhase.textContent = "Closing the orbit";
      elements.motionNarrative.textContent = "The centre is nearly home. What is your final prediction?";
    } else {
      elements.motionPhase.textContent = "One orbit complete";
      elements.motionNarrative.textContent = "Choose a prediction in the challenge card to unlock the count and explanation.";
    }
    return;
  }

  if (state.progress <= 0.001) {
    elements.motionPhase.textContent = "Ready at the start";
    elements.motionNarrative.textContent = isArrowMode()
      ? "Follow the yellow arrow tip as it traces one point on the rim."
      : "Watch the face turn, not just the roller’s centre.";
  } else if (state.progress < 0.25) {
    elements.motionPhase.textContent = "The first quarter";
    elements.motionNarrative.textContent = `${actualTurns.toFixed(2)} actual turns so far; the circumference-only count is ${temptingTurns.toFixed(2)}.`;
  } else if (state.progress < 0.5) {
    elements.motionPhase.textContent = "A wider route";
    elements.motionNarrative.textContent = "The roller’s centre follows the dashed circle outside the fixed rim.";
  } else if (state.progress < 0.75) {
    elements.motionPhase.textContent = "Past halfway";
    elements.motionNarrative.textContent = `${actualTurns.toFixed(2)} turns counted in the room’s frame of reference.`;
  } else if (state.progress < 0.999) {
    elements.motionPhase.textContent = "Closing the orbit";
    elements.motionNarrative.textContent = isArrowMode()
      ? "The centre is nearly home. Check whether the arrow returns to its starting direction."
      : "The centre is nearly home. Check whether the face will return upright.";
  } else {
    elements.motionPhase.textContent = "One orbit complete";
    elements.motionNarrative.textContent = `${state.actualTurnsPerOrbit.toFixed(2)} actual turns, not ${state.temptingTurnsPerOrbit.toFixed(2)}—the centre path adds one.`;
  }
}

function formatTurnCount(value) {
  const nearestInteger = Math.round(value);
  return Math.abs(value - nearestInteger) < 1e-9 ? String(nearestInteger) : value.toFixed(2);
}

function updateReadouts() {
  const state = readState();
  const percent = state.progress * 100;
  const actualTurns = state.progress * state.actualTurnsPerOrbit;
  const temptingTurns = state.progress * state.temptingTurnsPerOrbit;
  const wholeTurn = Math.abs(state.actualTurnsPerOrbit - Math.round(state.actualTurnsPerOrbit)) < 1e-9;
  const temptingTotal = formatTurnCount(state.temptingTurnsPerOrbit);
  const actualTotal = formatTurnCount(state.actualTurnsPerOrbit);

  elements.speedValue.textContent = `${Number(elements.speed.value).toFixed(2)}×`;
  elements.progressValue.textContent = `${Math.round(percent)}%`;
  elements.orbitReadout.textContent = `${Math.round(percent)}%`;
  elements.rotationReadout.textContent = explanationUnlocked ? `${actualTurns.toFixed(2)} turns` : "Predict first";
  elements.naiveReadout.textContent = explanationUnlocked ? `${temptingTurns.toFixed(2)} turns` : "Predict first";
  elements.answerReadout.textContent = explanationUnlocked ? state.actualTurnsPerOrbit.toFixed(2) : "?";
  elements.naiveSolutionValue.textContent = `${temptingTotal} turns`;
  elements.naiveSolutionFormula.textContent = `R / r = 1 / ${state.radiusLabel} = ${temptingTotal}`;
  elements.actualSolutionValue.textContent = `${actualTotal} turns`;
  elements.actualSolutionFormula.textContent = `R / r + 1 = ${temptingTotal} + 1 = ${actualTotal}`;
  elements.exampleEquation.textContent = explanationUnlocked
    ? `N = 1 / ${state.radiusLabel} + 1 = ${state.actualTurnsPerOrbit.toFixed(2)} turns`
    : `N = 1 / ${state.radiusLabel} + 1 = ?`;
  elements.orientationNote.textContent = explanationUnlocked
    ? wholeTurn
      ? `After one lap, the ${activeOrientationCue()} returns to its starting orientation.`
      : `After one lap, the centre returns to the start but the ${activeOrientationCue()} does not.`
    : `Run one lap to see whether the ${activeOrientationCue()} returns to its starting orientation.`;
  updateMotionCue(state);
}

function render() {
  updateReadouts();
  draw();
}

function resizeCanvas() {
  const rect = elements.viewer.getBoundingClientRect();
  dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  width = Math.max(280, rect.width);
  height = Math.max(420, rect.height);
  elements.canvas.width = Math.round(width * dpr);
  elements.canvas.height = Math.round(height * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

function announce(message) {
  elements.simStatus.textContent = "";
  window.requestAnimationFrame(() => {
    elements.simStatus.textContent = message;
  });
}

function syncExplanationVisibility() {
  elements.solutionCompare.hidden = !explanationUnlocked;
  elements.explanationGate.hidden = explanationUnlocked;
  elements.explanationCard.hidden = !explanationUnlocked;
}

function unlockExplanation() {
  explanationUnlocked = true;
  syncExplanationVisibility();
  render();
}

function completionAnnouncement(state = readState()) {
  return explanationUnlocked
    ? `One centre orbit complete. The ${activeOrientationCue()} made ${state.actualTurnsPerOrbit.toFixed(2)} lab-frame turns.`
    : "One centre orbit complete. Choose a prediction in the challenge card to unlock the turn count and explanation.";
}

function updatePlayButton() {
  const atEnd = Number(elements.progress.value) >= Number(elements.progress.max);
  elements.playPause.textContent = playing
    ? "Pause"
    : atEnd
      ? "Replay one lap"
      : Number(elements.progress.value) > 0
        ? "Continue rolling"
        : "Roll one lap";
  elements.playPause.setAttribute("aria-pressed", String(playing));
}

function stopMotion(message = "") {
  playing = false;
  lastFrameTime = 0;
  if (animationFrameId) {
    window.cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
  }
  updatePlayButton();
  if (message) announce(message);
}

function resetMotion({ announceReset = true } = {}) {
  stopMotion();
  elements.progress.value = "0";
  lastWholeTurn = 0;
  syncExplanationVisibility();
  render();
  updatePlayButton();
  if (announceReset) announce("Experiment reset to the starting contact point.");
}

function startMotion() {
  if (Number(elements.progress.value) >= Number(elements.progress.max)) {
    elements.progress.value = "0";
    lastWholeTurn = 0;
    syncExplanationVisibility();
  }

  if (reducedMotion.matches) {
    elements.progress.value = elements.progress.max;
    revealResult();
    render();
    updatePlayButton();
    announce(explanationUnlocked
      ? "Reduced motion is enabled. The one-orbit result is shown without animation; use the slider or step button to inspect the motion."
      : "Reduced motion is enabled. The completed orbit is shown without animation; choose a prediction to unlock the result."
    );
    return;
  }

  playing = true;
  lastFrameTime = 0;
  updatePlayButton();
  announce("Rolling one complete centre orbit without slipping.");
  animationFrameId = window.requestAnimationFrame(animate);
}

function toggleMotion() {
  if (playing) {
    stopMotion("Motion paused.");
  } else {
    startMotion();
  }
}

function pulseTurnCounter() {
  window.clearTimeout(pulseTimer);
  elements.rotationStatus.classList.remove("pulse");
  void elements.rotationStatus.offsetWidth;
  elements.rotationStatus.classList.add("pulse");
  pulseTimer = window.setTimeout(() => elements.rotationStatus.classList.remove("pulse"), 420);
}

function moveProgressBy(delta) {
  const maximum = Number(elements.progress.max);
  const next = Math.max(0, Math.min(maximum, Number(elements.progress.value) + delta));
  stopMotion();
  elements.progress.value = String(next);
  const state = readState();
  const wholeTurn = Math.floor(state.progress * state.actualTurnsPerOrbit + 1e-9);
  if (wholeTurn !== lastWholeTurn && wholeTurn > 0) pulseTurnCounter();
  lastWholeTurn = wholeTurn;
  if (next >= maximum) revealResult(state);
  else syncExplanationVisibility();
  render();
  updatePlayButton();
}

function animate(timestamp) {
  if (!playing) {
    animationFrameId = 0;
    return;
  }

  if (!lastFrameTime) lastFrameTime = timestamp;
  const deltaSeconds = Math.min((timestamp - lastFrameTime) / 1000, 0.05);
  lastFrameTime = timestamp;

  const maximum = Number(elements.progress.max);
  const speed = Number(elements.speed.value);
  const next = Math.min(maximum, Number(elements.progress.value) + deltaSeconds * speed * maximum / secondsPerLap);
  elements.progress.value = String(next);

  const state = readState();
  const wholeTurn = Math.floor(state.progress * state.actualTurnsPerOrbit + 1e-9);
  if (wholeTurn > lastWholeTurn) pulseTurnCounter();
  lastWholeTurn = wholeTurn;
  if (next >= maximum) revealResult(state);
  render();

  if (next >= maximum) {
    playing = false;
    lastFrameTime = 0;
    animationFrameId = 0;
    updatePlayButton();
    announce(completionAnnouncement(state));
    return;
  }

  animationFrameId = window.requestAnimationFrame(animate);
}

function clearPrediction() {
  selectedPrediction = null;
  for (const option of predictionOptions) option.setAttribute("aria-pressed", "false");
}

function revealResult(state = readState()) {
  if (!explanationUnlocked) {
    syncExplanationVisibility();
    elements.predictionFeedback.classList.remove("correct");
    elements.predictionFeedback.textContent = "You watched the full lap. Now choose 3 turns, 4 turns, or I’m not sure to unlock the explanation.";
    return;
  }

  syncExplanationVisibility();
  const isClassic = Math.abs(state.rollerRadius - 1 / 3) < 1e-12;
  elements.predictionFeedback.classList.remove("correct");

  if (!isClassic) {
    elements.predictionFeedback.textContent = `Challenge resolved: ${state.actualTurnsPerOrbit.toFixed(2)} actual turns, while R / r alone gives ${state.temptingTurnsPerOrbit.toFixed(2)}.`;
  } else if (selectedPrediction === "4") {
    elements.predictionFeedback.textContent = "Correct: 4 lab-frame revolutions. The line of centres turns once while the circle rolls three times against the rim.";
    elements.predictionFeedback.classList.add("correct");
  } else if (selectedPrediction === "3") {
    elements.predictionFeedback.textContent = "The 3-turn solution counts R / r correctly, but it is incomplete: the rotating line of centres contributes one more revolution.";
  } else {
    elements.predictionFeedback.textContent = "The orientation cue confirms 4 complete lab-frame revolutions. Compare the two solutions below.";
  }
}

function applyClassicSetting({ announceChange = true } = {}) {
  for (const option of elements.radiusOptions) {
    option.checked = option.dataset.radiusLabel === "⅓";
  }
  clearPrediction();
  elements.predictionFeedback.classList.remove("correct");
  elements.predictionFeedback.textContent = "Classic 3 : 1 setup restored. Call it before it rolls.";
  resetMotion({ announceReset: false });
  if (announceChange) announce("Classic setting restored with r equal to one third of R.");
}

function handleRadiusChange() {
  clearPrediction();
  elements.predictionFeedback.classList.remove("correct");
  resetMotion({ announceReset: false });
  elements.predictionFeedback.textContent = "New radius selected. Estimate the turn count, then test it.";
  announce(`Rolling radius changed to ${readState().radiusLabel} times R. The experiment returned to its starting point.`);
}

function choosePrediction(option) {
  const prediction = option.dataset.prediction;
  applyClassicSetting({ announceChange: false });
  selectedPrediction = prediction;
  option.setAttribute("aria-pressed", "true");
  unlockExplanation();

  if (prediction === "4") {
    elements.predictionFeedback.textContent = "You chose 4 turns. The full solution is unlocked—watch the motion test your prediction.";
  } else if (prediction === "3") {
    elements.predictionFeedback.textContent = "You chose 3 turns. The full solution is unlocked—watch the motion test your prediction.";
  } else {
    elements.predictionFeedback.textContent = "The full solution is unlocked. Watch the motion, then compare both arguments below.";
  }

  startMotion();
}

for (const control of [elements.speed, elements.pathToggle, elements.contactToggle]) {
  control.addEventListener("input", render);
  control.addEventListener("change", render);
}

elements.visualModeToggle.addEventListener("change", () => {
  syncVisualizationMode();
  render();
  announce(isArrowMode()
    ? "Radius-arrow mode selected. The yellow trajectory traces the arrow tip."
    : "Smiley mode selected. The yellow arrow and trajectory are hidden."
  );
});

for (const option of elements.radiusOptions) {
  option.addEventListener("change", handleRadiusChange);
}
elements.progress.addEventListener("input", () => {
  stopMotion();
  const state = readState();
  const wholeTurn = Math.floor(state.progress * state.actualTurnsPerOrbit + 1e-9);
  if (wholeTurn !== lastWholeTurn && wholeTurn > 0) pulseTurnCounter();
  lastWholeTurn = wholeTurn;
  if (state.progress >= 0.999) revealResult(state);
  else syncExplanationVisibility();
  render();
  updatePlayButton();
});
elements.playPause.addEventListener("click", toggleMotion);
elements.restart.addEventListener("click", () => resetMotion());
elements.step.addEventListener("click", () => {
  const maximum = Number(elements.progress.max);
  if (Number(elements.progress.value) >= maximum) {
    elements.progress.value = "0";
    lastWholeTurn = 0;
  }
  moveProgressBy(maximum / 16);
  announce("Advanced the roller by one sixteenth of a centre orbit.");
});
for (const option of predictionOptions) {
  option.addEventListener("click", () => choosePrediction(option));
}

elements.viewer.addEventListener("keydown", event => {
  if (event.key === " " || event.code === "Space") {
    event.preventDefault();
    toggleMotion();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    moveProgressBy(Number(elements.progress.max) / 64);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveProgressBy(-Number(elements.progress.max) / 64);
  } else if (event.key === "Home") {
    event.preventDefault();
    resetMotion();
  } else if (event.key === "End") {
    event.preventDefault();
    stopMotion();
    elements.progress.value = elements.progress.max;
    revealResult();
    render();
    updatePlayButton();
    announce(completionAnnouncement());
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && playing) stopMotion("Motion paused while this page was in the background.");
});

reducedMotion.addEventListener?.("change", event => {
  if (event.matches && playing) {
    stopMotion("Motion paused because reduced motion was enabled. Use the slider or step button to continue manually.");
  }
});

const resizeObserver = new ResizeObserver(resizeCanvas);
resizeObserver.observe(elements.viewer);
syncVisualizationMode();
syncExplanationVisibility();
resizeCanvas();
updatePlayButton();
