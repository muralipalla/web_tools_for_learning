const INITIAL_RADIUS_METRES = 10;
const TRAIL_RADIUS_FLOOR = 0.0025;
const STEP_FRACTION = 0.05;
const TAU = Math.PI * 2;

const elements = {
  viewer: document.getElementById("pursuitViewer"),
  canvas: document.getElementById("pursuitCanvas"),
  sceneDescription: document.getElementById("sceneDescription"),
  nCount: document.getElementById("nCount"),
  nCountValue: document.getElementById("nCountValue"),
  speed: document.getElementById("speed"),
  speedValue: document.getElementById("speedValue"),
  playbackSpeed: document.getElementById("playbackSpeed"),
  playbackSpeedValue: document.getElementById("playbackSpeedValue"),
  timeProgress: document.getElementById("timeProgress"),
  timeProgressValue: document.getElementById("timeProgressValue"),
  playPauseBtn: document.getElementById("playPauseBtn"),
  restartBtn: document.getElementById("restartBtn"),
  stepBtn: document.getElementById("stepBtn"),
  trailToggle: document.getElementById("trailToggle"),
  polygonToggle: document.getElementById("polygonToggle"),
  arrowToggle: document.getElementById("arrowToggle"),
  elapsedReadout: document.getElementById("elapsedReadout"),
  radiusReadout: document.getElementById("radiusReadout"),
  remainingReadout: document.getElementById("remainingReadout"),
  predictionFeedback: document.getElementById("predictionFeedback"),
  explanationCard: document.getElementById("explanationCard"),
  explanationGate: document.getElementById("explanationGate"),
  simStatus: document.getElementById("simStatus"),
};

const missingElement = Object.entries(elements).find(([, element]) => !element);
if (missingElement) {
  throw new Error(`N-body pursuit simulation is missing #${missingElement[0]}.`);
}

const context = elements.canvas.getContext("2d");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const colourPalette = ["#ff8a79", "#55dfc1", "#ffd166", "#70b7ff", "#b89cff", "#ff9bc6"];

let progress = 0;
let isPlaying = false;
let animationFrame = 0;
let previousTimestamp = null;
let canvasWidth = 0;
let canvasHeight = 0;
let lastAnnouncementBand = -1;
let explanationUnlocked = false;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function readModel(atProgress = progress) {
  const count = Number(elements.nCount.value);
  const speed = Number(elements.speed.value);
  const halfVertexAngle = Math.PI / count;
  const inwardFactor = Math.sin(halfVertexAngle);
  const tangentialFactor = Math.cos(halfVertexAngle);
  const meetingTime = INITIAL_RADIUS_METRES / (speed * inwardFactor);
  const safeProgress = clamp(atProgress, 0, 1);
  const elapsedTime = safeProgress * meetingTime;
  const radius = INITIAL_RADIUS_METRES * (1 - safeProgress);
  const totalPathLength = INITIAL_RADIUS_METRES / inwardFactor;

  return {
    count,
    speed,
    progress: safeProgress,
    halfVertexAngle,
    inwardFactor,
    tangentialFactor,
    cotangent: tangentialFactor / inwardFactor,
    meetingTime,
    elapsedTime,
    remainingTime: Math.max(0, meetingTime - elapsedTime),
    radius,
    totalPathLength,
    distanceWalked: speed * elapsedTime,
  };
}

function angleAdvance(model, atProgress = model.progress) {
  if (atProgress <= 0) return 0;
  const boundedProgress = Math.min(atProgress, 1 - Number.EPSILON);
  return model.cotangent * -Math.log1p(-boundedProgress);
}

function getPositions(model, centreX, centreY, radiusPixels, atProgress = model.progress) {
  if (atProgress >= 1) {
    return Array.from({ length: model.count }, () => ({ x: centreX, y: centreY }));
  }

  const radiusFraction = 1 - atProgress;
  const angleOffset = angleAdvance(model, atProgress);

  return Array.from({ length: model.count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * TAU) / model.count + angleOffset;
    return {
      x: centreX + radiusPixels * radiusFraction * Math.cos(angle),
      y: centreY + radiusPixels * radiusFraction * Math.sin(angle),
    };
  });
}

function roundedRectangle(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, safeRadius);
}

function drawBackdrop(ctx, width, height) {
  const backdrop = ctx.createRadialGradient(width * 0.5, height * 0.45, 20, width * 0.5, height * 0.5, Math.max(width, height) * 0.72);
  backdrop.addColorStop(0, "#102c43");
  backdrop.addColorStop(0.55, "#091d33");
  backdrop.addColorStop(1, "#061525");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#b9e6df";
  for (let row = 0; row < height; row += 28) {
    for (let column = (row / 28) % 2 ? 14 : 0; column < width; column += 28) {
      ctx.beginPath();
      ctx.arc(column, row, 1, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawStartingPolygon(ctx, model, centreX, centreY, radiusPixels) {
  const startingPositions = getPositions(model, centreX, centreY, radiusPixels, 0);
  ctx.save();
  ctx.strokeStyle = "rgba(190, 223, 231, 0.24)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 7]);
  ctx.beginPath();
  startingPositions.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawTrails(ctx, model, centreX, centreY, radiusPixels) {
  if (!elements.trailToggle.checked || progress <= 0) return;

  const renderedProgress = Math.min(progress, 1 - TRAIL_RADIUS_FLOOR);
  const logExtent = -Math.log1p(-renderedProgress);
  const segments = Math.max(36, Math.min(300, Math.ceil(44 + logExtent * model.cotangent * 34)));

  ctx.save();
  ctx.lineWidth = Math.max(1.5, Math.min(2.4, radiusPixels / 150));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let person = 0; person < model.count; person += 1) {
    ctx.strokeStyle = colourPalette[person % colourPalette.length];
    ctx.globalAlpha = 0.58;
    ctx.beginPath();

    for (let sample = 0; sample <= segments; sample += 1) {
      const logarithmicPosition = logExtent * (sample / segments);
      const sampleProgress = 1 - Math.exp(-logarithmicPosition);
      const point = getPositions(model, centreX, centreY, radiusPixels, sampleProgress)[person];
      if (sample === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }

    ctx.stroke();
  }
  ctx.restore();
}

function drawCurrentPolygon(ctx, positions) {
  if (!elements.polygonToggle.checked || progress >= 1) return;
  ctx.save();
  ctx.strokeStyle = "rgba(229, 247, 244, 0.68)";
  ctx.lineWidth = 1.4;
  ctx.setLineDash([3, 6]);
  ctx.beginPath();
  positions.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawArrow(ctx, start, end, colour) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 8) return;

  const unitX = dx / distance;
  const unitY = dy / distance;
  const tokenGap = Math.min(18, distance * 0.16);
  const arrowLength = Math.max(8, distance - tokenGap * 2);
  const startX = start.x + unitX * tokenGap;
  const startY = start.y + unitY * tokenGap;
  const endX = startX + unitX * arrowLength;
  const endY = startY + unitY * arrowLength;
  const headLength = clamp(distance * 0.11, 6, 11);

  ctx.save();
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.globalAlpha = 0.84;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  const arrowAngle = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - headLength * Math.cos(arrowAngle - Math.PI / 6), endY - headLength * Math.sin(arrowAngle - Math.PI / 6));
  ctx.lineTo(endX - headLength * Math.cos(arrowAngle + Math.PI / 6), endY - headLength * Math.sin(arrowAngle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawDirectionArrows(ctx, positions) {
  if (!elements.arrowToggle.checked || progress >= 1) return;
  positions.forEach((point, index) => {
    drawArrow(ctx, point, positions[(index + 1) % positions.length], colourPalette[index % colourPalette.length]);
  });
}

function drawCentre(ctx, centreX, centreY, radiusPixels) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 209, 102, 0.62)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(centreX, centreY, Math.max(5, radiusPixels * 0.025), 0, TAU);
  ctx.stroke();
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.arc(centreX, centreY, 2.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawPeople(ctx, model, positions, radiusPixels) {
  if (progress >= 1) {
    const finalRadius = clamp(radiusPixels * 0.06, 18, 27);
    const centre = positions[0];
    ctx.save();
    ctx.shadowColor = "rgba(85, 223, 193, 0.45)";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#55dfc1";
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, finalRadius, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#062033";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${clamp(finalRadius * 0.72, 12, 18)}px system-ui, sans-serif`;
    ctx.fillText(`${model.count}`, centre.x, centre.y);
    ctx.restore();
    return;
  }

  const radiusFraction = 1 - progress;
  const scaleNearCentre = 0.35 + 0.65 * clamp(radiusFraction / 0.12, 0, 1);
  const tokenRadius = clamp(radiusPixels * 0.047, 11, 18) * scaleNearCentre;

  positions.forEach((point, index) => {
    const colour = colourPalette[index % colourPalette.length];
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.36)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(point.x, point.y, tokenRadius, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
    ctx.lineWidth = Math.max(1, tokenRadius * 0.08);
    ctx.stroke();

    if (tokenRadius > 7) {
      ctx.fillStyle = "#061a2a";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${clamp(tokenRadius * 0.82, 9, 14)}px system-ui, sans-serif`;
      ctx.fillText(String(index + 1), point.x, point.y + 0.5);
    }
    ctx.restore();
  });
}

function drawCanvasLabels(ctx, model, width, height) {
  const padding = clamp(width * 0.035, 14, 26);
  const compact = width < 520;
  const labelWidth = compact ? 116 : 138;
  const labelHeight = 35;

  ctx.save();
  roundedRectangle(ctx, padding, padding, labelWidth, labelHeight, 12);
  ctx.fillStyle = "rgba(4, 19, 33, 0.72)";
  ctx.fill();
  ctx.fillStyle = "#d9f2ee";
  ctx.font = `700 ${compact ? 12 : 13}px system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(`N = ${model.count} people`, padding + 13, padding + labelHeight / 2);

  const speedText = `v = ${model.speed.toFixed(1)} m/s`;
  ctx.font = `700 ${compact ? 12 : 13}px system-ui, sans-serif`;
  const speedWidth = ctx.measureText(speedText).width + 26;
  roundedRectangle(ctx, width - padding - speedWidth, padding, speedWidth, labelHeight, 12);
  ctx.fillStyle = "rgba(4, 19, 33, 0.72)";
  ctx.fill();
  ctx.fillStyle = "#d9f2ee";
  ctx.fillText(speedText, width - padding - speedWidth + 13, padding + labelHeight / 2);

  if (progress >= 1) {
    const message = "They meet";
    ctx.font = "800 14px system-ui, sans-serif";
    const messageWidth = ctx.measureText(message).width + 28;
    roundedRectangle(ctx, (width - messageWidth) / 2, height - padding - 38, messageWidth, 38, 13);
    ctx.fillStyle = "rgba(85, 223, 193, 0.94)";
    ctx.fill();
    ctx.fillStyle = "#052033";
    ctx.textAlign = "center";
    ctx.fillText(message, width / 2, height - padding - 19);
  }
  ctx.restore();
}

function renderCanvas() {
  if (!canvasWidth || !canvasHeight) return;
  const model = readModel();
  const compact = canvasWidth < 620;
  const centreX = canvasWidth / 2;
  const centreY = canvasHeight * (compact ? 0.53 : 0.535);
  const radiusPixels = Math.min(canvasWidth * (compact ? 0.36 : 0.38), canvasHeight * 0.37);
  const positions = getPositions(model, centreX, centreY, radiusPixels);

  context.clearRect(0, 0, canvasWidth, canvasHeight);
  drawBackdrop(context, canvasWidth, canvasHeight);
  drawStartingPolygon(context, model, centreX, centreY, radiusPixels);
  drawTrails(context, model, centreX, centreY, radiusPixels);
  drawCurrentPolygon(context, positions);
  drawCentre(context, centreX, centreY, radiusPixels);
  drawDirectionArrows(context, positions);
  drawPeople(context, model, positions, radiusPixels);
  drawCanvasLabels(context, model, canvasWidth, canvasHeight);
}

function formatSeconds(seconds) {
  if (seconds < 10) return `${seconds.toFixed(2)} s`;
  return `${seconds.toFixed(1)} s`;
}

function updateSceneDescription(model) {
  const stage = progress >= 1
    ? "All people have met at the centre."
    : progress === 0
      ? "They are at their starting vertices."
      : explanationUnlocked
        ? `They are ${Math.round(progress * 100)} percent of the way to their meeting time and the polygon radius is ${model.radius.toFixed(2)} metres.`
        : `They are ${Math.round(progress * 100)} percent through the displayed chase and the polygon radius is ${model.radius.toFixed(2)} metres.`;

  const pathDescription = explanationUnlocked ? "logarithmic spiral paths" : "displayed paths";
  elements.sceneDescription.textContent = `${model.count} numbered people form a regular polygon of circumradius ${INITIAL_RADIUS_METRES} metres. Each person moves at ${model.speed.toFixed(1)} metres per second toward the next person. ${stage} Coloured curves show their ${pathDescription} when trails are enabled.`;
}

function updateInterface({ announce = false } = {}) {
  const model = readModel();
  const percentage = Math.round(progress * 100);

  elements.nCountValue.value = `${model.count}`;
  elements.nCountValue.textContent = `${model.count}`;
  elements.speedValue.value = `${model.speed.toFixed(1)} m/s`;
  elements.speedValue.textContent = `${model.speed.toFixed(1)} m/s`;
  elements.playbackSpeedValue.value = `${Number(elements.playbackSpeed.value).toFixed(1)}×`;
  elements.playbackSpeedValue.textContent = `${Number(elements.playbackSpeed.value).toFixed(1)}×`;
  elements.timeProgress.value = String(Math.round(progress * 1000));
  elements.timeProgressValue.value = `${percentage}%`;
  elements.timeProgressValue.textContent = `${percentage}%`;
  elements.elapsedReadout.textContent = explanationUnlocked
    ? `${formatSeconds(model.elapsedTime)} / ${formatSeconds(model.meetingTime)}`
    : formatSeconds(model.elapsedTime);
  elements.radiusReadout.textContent = `${model.radius.toFixed(2)} m`;
  elements.remainingReadout.textContent = explanationUnlocked ? formatSeconds(model.remainingTime) : "Predict first";
  elements.playPauseBtn.textContent = isPlaying ? "Pause chase" : progress >= 1 ? "Replay chase" : progress > 0 ? "Continue chase" : "Start chase";
  elements.playPauseBtn.setAttribute("aria-pressed", String(isPlaying));
  elements.timeProgress.setAttribute(
    "aria-valuetext",
    explanationUnlocked ? `${percentage} percent of the meeting time` : `${percentage} percent through the displayed chase`
  );
  elements.nCount.setAttribute("aria-valuetext", `${model.count} people`);
  elements.speed.setAttribute("aria-valuetext", `${model.speed.toFixed(1)} metres per second`);
  elements.playbackSpeed.setAttribute("aria-valuetext", `${Number(elements.playbackSpeed.value).toFixed(1)} times playback speed`);
  updateSceneDescription(model);
  renderCanvas();

  if (announce) {
    elements.simStatus.textContent = progress >= 1
      ? explanationUnlocked
        ? `The ${model.count} people meet after ${model.meetingTime.toFixed(2)} seconds. Each walks ${model.totalPathLength.toFixed(2)} metres.`
        : `The displayed chase has reached its outcome: all ${model.count} people are together at the centre.`
      : explanationUnlocked
        ? `Chase at ${percentage} percent. Polygon radius ${model.radius.toFixed(2)} metres; ${model.remainingTime.toFixed(2)} seconds remain.`
        : `Chase at ${percentage} percent. Polygon radius ${model.radius.toFixed(2)} metres.`;
  }
}

function stopAnimation() {
  isPlaying = false;
  previousTimestamp = null;
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }
}

function completeImmediatelyForReducedMotion() {
  stopAnimation();
  progress = 1;
  updateInterface({ announce: true });
}

function animate(timestamp) {
  if (!isPlaying) return;
  if (previousTimestamp === null) previousTimestamp = timestamp;
  const deltaSeconds = Math.min((timestamp - previousTimestamp) / 1000, 0.1);
  previousTimestamp = timestamp;

  const model = readModel();
  const playbackMultiplier = Number(elements.playbackSpeed.value);
  progress = clamp(progress + (deltaSeconds * playbackMultiplier) / model.meetingTime, 0, 1);

  const announcementBand = Math.floor(progress * 4);
  const shouldAnnounce = announcementBand !== lastAnnouncementBand && announcementBand > 0;
  if (shouldAnnounce) lastAnnouncementBand = announcementBand;
  updateInterface({ announce: shouldAnnounce || progress >= 1 });

  if (progress >= 1) {
    stopAnimation();
    updateInterface({ announce: true });
    return;
  }

  animationFrame = requestAnimationFrame(animate);
}

function startAnimation() {
  if (reducedMotionQuery.matches) {
    completeImmediatelyForReducedMotion();
    return;
  }
  if (progress >= 1) progress = 0;
  if (isPlaying) return;
  isPlaying = true;
  previousTimestamp = null;
  lastAnnouncementBand = Math.floor(progress * 4);
  updateInterface();
  animationFrame = requestAnimationFrame(animate);
}

function toggleAnimation() {
  if (isPlaying) {
    stopAnimation();
    updateInterface({ announce: true });
  } else {
    startAnimation();
  }
}

function restart({ announce = true } = {}) {
  stopAnimation();
  progress = 0;
  lastAnnouncementBand = -1;
  updateInterface({ announce });
}

function stepBy(amount) {
  stopAnimation();
  progress = clamp(progress + amount, 0, 1);
  updateInterface({ announce: true });
}

function handleModelChange() {
  restart({ announce: false });
  const model = readModel();
  elements.simStatus.textContent = explanationUnlocked
    ? `New setup: ${model.count} people, speed ${model.speed.toFixed(1)} metres per second. They will meet after ${model.meetingTime.toFixed(2)} seconds.`
    : `New setup: ${model.count} people, speed ${model.speed.toFixed(1)} metres per second. Predict the outcome or run the chase to test it.`;
}

function handlePrediction(button) {
  document.querySelectorAll(".prediction-option").forEach((option) => {
    option.setAttribute("aria-pressed", String(option === button));
    option.removeAttribute("data-result");
    if (option.dataset.prediction === "spiral") option.dataset.result = "correct";
    else if (option === button && option.dataset.prediction !== "unsure") option.dataset.result = "incorrect";
  });

  const messages = {
    straight: "A compelling first thought—but each target keeps sliding sideways, so the direction of motion keeps turning.",
    spiral: "Yes. Symmetry keeps the polygon regular while every vertex winds inward along a logarithmic spiral.",
    forever: "The chase looks endless near the centre, but the inward speed stays constant. They meet in finite time.",
    unsure: "Good scientific instinct: make the uncertainty visible, then test it. Watch how the pursuit direction turns.",
  };

  explanationUnlocked = true;
  elements.predictionFeedback.textContent = messages[button.dataset.prediction] || messages.unsure;
  elements.predictionFeedback.dataset.result = button.dataset.prediction === "spiral" ? "correct" : button.dataset.prediction === "unsure" ? "" : "incorrect";
  elements.explanationCard.hidden = false;
  elements.explanationGate.hidden = true;
  elements.simStatus.textContent = progress === 0
    ? "Prediction recorded. The explanation is now unlocked and the chase has begun."
    : "Prediction recorded. The explanation and outcome timing are now unlocked.";
  updateInterface();
  if (progress === 0 && !isPlaying) startAnimation();
}

function resizeCanvas() {
  const rectangle = elements.canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvasWidth = Math.max(1, rectangle.width);
  canvasHeight = Math.max(1, rectangle.height);
  elements.canvas.width = Math.round(canvasWidth * dpr);
  elements.canvas.height = Math.round(canvasHeight * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderCanvas();
}

elements.playPauseBtn.addEventListener("click", toggleAnimation);
elements.restartBtn.addEventListener("click", () => restart());
elements.stepBtn.addEventListener("click", () => stepBy(STEP_FRACTION));

elements.nCount.addEventListener("input", handleModelChange);
elements.speed.addEventListener("input", handleModelChange);
elements.playbackSpeed.addEventListener("input", () => updateInterface());

elements.timeProgress.addEventListener("input", () => {
  stopAnimation();
  progress = Number(elements.timeProgress.value) / 1000;
  updateInterface();
});
elements.timeProgress.addEventListener("change", () => updateInterface({ announce: true }));

[elements.trailToggle, elements.polygonToggle, elements.arrowToggle].forEach((toggle) => {
  toggle.addEventListener("change", () => updateInterface());
});

document.querySelectorAll(".prediction-option").forEach((button) => {
  button.addEventListener("click", () => handlePrediction(button));
});

elements.viewer.addEventListener("keydown", (event) => {
  if (event.key === " " || event.code === "Space") {
    event.preventDefault();
    toggleAnimation();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    stepBy(STEP_FRACTION);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    stepBy(-STEP_FRACTION);
  } else if (event.key === "Home") {
    event.preventDefault();
    restart();
  } else if (event.key === "End") {
    event.preventDefault();
    stopAnimation();
    progress = 1;
    updateInterface({ announce: true });
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && isPlaying) {
    stopAnimation();
    updateInterface();
  }
});

reducedMotionQuery.addEventListener?.("change", () => {
  if (reducedMotionQuery.matches && isPlaying) completeImmediatelyForReducedMotion();
});

const resizeObserver = new ResizeObserver(resizeCanvas);
resizeObserver.observe(elements.canvas);

updateInterface();
resizeCanvas();
