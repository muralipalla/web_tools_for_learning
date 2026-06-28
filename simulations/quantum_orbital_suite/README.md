# Hydrogen Orbital Probability Visualizer

A static HTML + Three.js website for visualizing hydrogen-like atomic orbitals.

## What it shows

- Quantum number controls for `n`, `l`, and `m`.
- A true probability cloud sampled from `|psi(r, theta, phi)|^2`.
- A textbook-style orbital surface showing angular lobes and phase.
- Radial distribution plot: `r^2 |R_nl(r)|^2`.
- Angular distribution heatmap: `|Y_l^m(theta, phi)|^2`.
- Mouse camera controls and X/Y/Z orbital orientation sliders.
- PNG snapshot export.

## Run locally

Because the app uses ES modules, run it through a tiny local server instead of double-clicking the file:

```bash
cd quantum_orbital_suite
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Deploy on GitHub Pages

Upload the folder contents to your repository and enable GitHub Pages. No build step is required.

## Notes for teaching

The probability cloud is the more faithful visualization of `|psi|^2` in 3D space. The surface is a simplified angular envelope, useful for recognizing familiar s, p, d, and f orbital shapes.

The code uses dimensionless Bohr radius units with `a0 = 1`.
