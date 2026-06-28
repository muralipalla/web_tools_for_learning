const PI = Math.PI;
const TWO_PI = 2 * Math.PI;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function factorial(n) {
  if (n < 0) return NaN;
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return result;
}

export function binomial(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= k; i += 1) {
    result *= (n - k + i) / i;
  }
  return result;
}

export function associatedLaguerre(k, alpha, x) {
  // L_k^alpha(x) = sum_i (-1)^i * C(k+alpha, k-i) * x^i / i!
  let sum = 0;
  for (let i = 0; i <= k; i += 1) {
    const sign = (i % 2 === 0) ? 1 : -1;
    sum += sign * binomial(k + alpha, k - i) * Math.pow(x, i) / factorial(i);
  }
  return sum;
}

export function associatedLegendre(l, m, x) {
  // Includes the Condon-Shortley phase (-1)^m.
  m = Math.abs(m);
  x = clamp(x, -1, 1);
  if (m > l) return 0;

  let pmm = 1;
  if (m > 0) {
    const somx2 = Math.sqrt(Math.max(0, 1 - x * x));
    let fact = 1;
    for (let i = 1; i <= m; i += 1) {
      pmm *= -fact * somx2;
      fact += 2;
    }
  }

  if (l === m) return pmm;

  let pmmp1 = x * (2 * m + 1) * pmm;
  if (l === m + 1) return pmmp1;

  let pll = 0;
  for (let ll = m + 2; ll <= l; ll += 1) {
    pll = ((2 * ll - 1) * x * pmmp1 - (ll + m - 1) * pmm) / (ll - m);
    pmm = pmmp1;
    pmmp1 = pll;
  }

  return pll;
}

export function radialR(n, l, r) {
  if (n < 1 || l < 0 || l > n - 1 || r < 0) return 0;
  const rho = (2 * r) / n; // a0 = 1
  const k = n - l - 1;
  const alpha = 2 * l + 1;
  const norm = Math.sqrt(Math.pow(2 / n, 3) * factorial(k) / (2 * n * factorial(n + l)));
  return norm * Math.exp(-rho / 2) * Math.pow(rho, l) * associatedLaguerre(k, alpha, rho);
}

export function realSphericalHarmonic(l, m, theta, phi) {
  const absM = Math.abs(m);
  if (absM > l) return 0;

  const x = Math.cos(theta);
  const p = associatedLegendre(l, absM, x);
  const norm = Math.sqrt(((2 * l + 1) / (4 * PI)) * factorial(l - absM) / factorial(l + absM));

  if (m === 0) return norm * p;
  if (m > 0) return Math.sqrt(2) * norm * p * Math.cos(absM * phi);
  return Math.sqrt(2) * norm * p * Math.sin(absM * phi);
}

export function psiValue(n, l, m, r, theta, phi) {
  return radialR(n, l, r) * realSphericalHarmonic(l, m, theta, phi);
}

export function psiDensity(n, l, m, r, theta, phi) {
  const psi = psiValue(n, l, m, r, theta, phi);
  return psi * psi;
}

export function radialProbability(n, l, r) {
  const rr = radialR(n, l, r);
  return r * r * rr * rr;
}

export function suggestedRMax(n) {
  // A teaching visualization bound in Bohr radii. Large enough to show outer lobes for n <= 6.
  return 3.2 * n * n + 8;
}

export function findRadialPeak(n, l, rMax = suggestedRMax(n)) {
  let bestR = 0;
  let best = -Infinity;
  const steps = 1200;
  for (let i = 0; i <= steps; i += 1) {
    const r = (i / steps) * rMax;
    const p = radialProbability(n, l, r);
    if (p > best) {
      best = p;
      bestR = r;
    }
  }
  return Math.max(bestR, 0.1);
}

function randomVolumePoint(rMax) {
  const r = rMax * Math.cbrt(Math.random());
  const u = 2 * Math.random() - 1;
  const theta = Math.acos(clamp(u, -1, 1));
  const phi = TWO_PI * Math.random();
  return { r, theta, phi };
}

export function estimateMaxDensity(n, l, m, rMax, trials = 8000) {
  let maxDensity = 0;
  for (let i = 0; i < trials; i += 1) {
    const { r, theta, phi } = randomVolumePoint(rMax);
    const d = psiDensity(n, l, m, r, theta, phi);
    if (d > maxDensity) maxDensity = d;
  }
  return Math.max(maxDensity * 1.2, 1e-30);
}

export function sampleOrbitalCloud({ n, l, m, count, rMax, visualScale }) {
  const positions = [];
  const colors = [];
  const densitySamples = [];
  const maxDensity = estimateMaxDensity(n, l, m, rMax);
  const coordinateScale = visualScale / rMax;

  let attempts = 0;
  const maxAttempts = count * 900;

  while (positions.length < count * 3 && attempts < maxAttempts) {
    attempts += 1;
    const { r, theta, phi } = randomVolumePoint(rMax);
    const psi = psiValue(n, l, m, r, theta, phi);
    const density = psi * psi;

    if (Math.random() * maxDensity <= density) {
      const sinTheta = Math.sin(theta);
      const x = r * sinTheta * Math.cos(phi) * coordinateScale;
      const y = r * Math.cos(theta) * coordinateScale;
      const z = r * sinTheta * Math.sin(phi) * coordinateScale;

      positions.push(x, y, z);
      densitySamples.push(density);

      // Color: sign of psi gives phase; intensity gives a mild density cue.
      const t = clamp(Math.sqrt(density / maxDensity), 0, 1);
      if (psi >= 0) {
        colors.push(0.18 + 0.45 * t, 0.48 + 0.35 * t, 0.88 + 0.12 * t);
      } else {
        colors.push(0.95 + 0.05 * t, 0.45 + 0.30 * t, 0.16 + 0.25 * t);
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    accepted: positions.length / 3,
    attempts,
    maxDensity,
    densitySamples
  };
}

export function makeOrbitalSurface({ n, l, m, visualScale, thetaSteps = 72, phiSteps = 144 }) {
  const vertices = [];
  const colors = [];
  const indices = [];

  const rMax = suggestedRMax(n);
  const radialPeak = findRadialPeak(n, l, rMax);
  const coordinateScale = visualScale / rMax;

  let maxAbsY = 0;
  for (let i = 0; i <= thetaSteps; i += 1) {
    const theta = (i / thetaSteps) * PI;
    for (let j = 0; j <= phiSteps; j += 1) {
      const phi = (j / phiSteps) * TWO_PI;
      maxAbsY = Math.max(maxAbsY, Math.abs(realSphericalHarmonic(l, m, theta, phi)));
    }
  }
  maxAbsY = Math.max(maxAbsY, 1e-12);

  for (let i = 0; i <= thetaSteps; i += 1) {
    const theta = (i / thetaSteps) * PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let j = 0; j <= phiSteps; j += 1) {
      const phi = (j / phiSteps) * TWO_PI;
      const ylm = realSphericalHarmonic(l, m, theta, phi);
      const angular = Math.abs(ylm) / maxAbsY;
      const envelope = Math.pow(angular, 0.72);

      // The minimum radius prevents singular seams at nodal surfaces while still showing thin waists.
      const radius = coordinateScale * radialPeak * (0.06 + 1.25 * envelope);
      const x = radius * sinTheta * Math.cos(phi);
      const y = radius * cosTheta;
      const z = radius * sinTheta * Math.sin(phi);
      vertices.push(x, y, z);

      const t = clamp(envelope, 0, 1);
      if (ylm >= 0) {
        colors.push(0.12 + 0.45 * t, 0.42 + 0.38 * t, 0.84 + 0.16 * t);
      } else {
        colors.push(0.93 + 0.07 * t, 0.38 + 0.34 * t, 0.12 + 0.20 * t);
      }
    }
  }

  for (let i = 0; i < thetaSteps; i += 1) {
    for (let j = 0; j < phiSteps; j += 1) {
      const a = i * (phiSteps + 1) + j;
      const b = a + phiSteps + 1;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
    radialPeak
  };
}

export function orbitalLabel(n, l, m) {
  const names = ['s', 'p', 'd', 'f', 'g', 'h'];
  return `${n}${names[l] ?? `l=${l}`}, m = ${m}`;
}
