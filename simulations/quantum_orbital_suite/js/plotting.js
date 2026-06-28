import { radialProbability, suggestedRMax, realSphericalHarmonic } from './orbital-math.js';

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || canvas.width;
  const cssHeight = cssWidth * (canvas.height / canvas.width);
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: cssWidth, height: cssHeight };
}

function drawAxes(ctx, width, height, padding, xlabel, ylabel) {
  ctx.strokeStyle = 'rgba(232, 238, 248, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.stroke();

  ctx.fillStyle = 'rgba(232, 238, 248, 0.72)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(xlabel, (width + padding.left - padding.right) / 2, height - 8);

  ctx.save();
  ctx.translate(13, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(ylabel, 0, 0);
  ctx.restore();
}

export function drawRadialPlot(canvas, n, l) {
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  const padding = { left: 42, right: 16, top: 18, bottom: 34 };
  const rMax = suggestedRMax(n);
  const samples = 450;
  const values = [];
  let maxY = 0;

  for (let i = 0; i <= samples; i += 1) {
    const r = (i / samples) * rMax;
    const y = radialProbability(n, l, r);
    values.push({ r, y });
    maxY = Math.max(maxY, y);
  }
  maxY = Math.max(maxY, 1e-30);

  drawAxes(ctx, width, height, padding, 'r / a₀', 'r² |R|²');

  ctx.strokeStyle = 'rgba(145, 199, 255, 0.25)';
  ctx.lineWidth = 1;
  for (let k = 0; k <= 4; k += 1) {
    const y = padding.top + k * ((height - padding.top - padding.bottom) / 4);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  ctx.strokeStyle = '#91c7ff';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  values.forEach((point, index) => {
    const x = padding.left + (point.r / rMax) * (width - padding.left - padding.right);
    const y = height - padding.bottom - (point.y / maxY) * (height - padding.top - padding.bottom);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = 'rgba(232, 238, 248, 0.72)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(rMax.toFixed(1), width - padding.right, height - padding.bottom + 17);
  ctx.textAlign = 'left';
  ctx.fillText('0', padding.left, height - padding.bottom + 17);
}

function heatColor(t) {
  // Calm dark-blue to light-blue/orange ramp, returned as CSS rgba.
  t = Math.max(0, Math.min(1, t));
  const r = Math.round(26 + 210 * Math.pow(t, 0.9));
  const g = Math.round(40 + 145 * Math.pow(t, 0.75));
  const b = Math.round(64 + 150 * (1 - Math.pow(t, 1.4)));
  return `rgb(${r}, ${g}, ${b})`;
}

export function drawAngularPlot(canvas, l, m) {
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  const padding = { left: 42, right: 16, top: 18, bottom: 32 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const cols = 120;
  const rows = 60;

  let max = 0;
  const data = [];
  for (let row = 0; row < rows; row += 1) {
    const theta = (row / (rows - 1)) * Math.PI;
    for (let col = 0; col < cols; col += 1) {
      const phi = (col / (cols - 1)) * 2 * Math.PI;
      const y = realSphericalHarmonic(l, m, theta, phi);
      const v = y * y;
      data.push(v);
      max = Math.max(max, v);
    }
  }
  max = Math.max(max, 1e-30);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const v = data[row * cols + col] / max;
      ctx.fillStyle = heatColor(v);
      const x = padding.left + (col / cols) * plotW;
      const y = padding.top + (row / rows) * plotH;
      ctx.fillRect(x, y, Math.ceil(plotW / cols) + 1, Math.ceil(plotH / rows) + 1);
    }
  }

  drawAxes(ctx, width, height, padding, 'φ: 0 → 2π', 'θ: 0 → π');

  ctx.strokeStyle = 'rgba(232, 238, 248, 0.55)';
  ctx.strokeRect(padding.left, padding.top, plotW, plotH);
}
