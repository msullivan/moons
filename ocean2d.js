// 2-D shallow-water tide model on the Qamis map grid (ocean_grid.js).
//
// Equations (depth H fixed, so linear apart from the friction):
//   ∂η/∂t = −∂(H u)/∂x − ∂(H v)/∂y
//   ∂u/∂t = −g ∂(η − η_eq)/∂x − f·v − r·u
//   ∂v/∂t = −g ∂(η − η_eq)/∂y + f·u − r·v
// with x east, y down the map (south), so f·u turns eastward flow south.
//   η_eq  equilibrium tide of the moons and Sun at each cell (Primus left out:
//         it's geosynchronous, so its tide is a static offset)
//   f     2Ω sin φ with Qaia's sidereal spin rate
//   r     quadratic bottom friction Cd·(|U| + U0)/H; U0 is a small floor
//
// Arakawa C grid: η at cell centres, transports U = H·u on the faces between
// columns and V = H·v on the faces between rows (transport form saves memory
// reads in the continuity update).  A face is open when the cells on both sides are
// sea; land faces stay at zero flow (walls).  Forward–backward time stepping
// (η first, then u and v with the new η), alternating the order of the u and
// v updates each step; friction is semi-implicit.
//
// Open boundary: the outermost ring of cells is held at η_eq, and a sponge
// relaxes η toward η_eq (and damps the flow) over the outer SPONGE cells, so
// waves leaving the domain are absorbed rather than reflected.  The padding
// in ocean_grid.js keeps the sponge outside the map.
//
// Gaps (sub-grid straits, OCEAN.gaps): a 1-D channel between two sea cells,
//   du/dt = g·Δ(η − η_eq)/length − (Cd/depth + loss/(2·length))·|u|·u
// with volume flux u·width·depth moved from one end's footprint (the sea cells
// within ~1.5 cells of the end) to the other's.
//
// Forcing comes from tide frames (tides.js tideFrame): [K, u1, u2, u3] per
// body in the body-fixed frame.  η_eq = Σ K·(1.5(ẑ·û)² − 0.5) = ẑᵀAẑ − c is a
// quadratic form in the cell's zenith ẑ, so each step needs only the six
// components of A (interpolated linearly between frames).  The η_eq field is
// refreshed every EQ_EVERY steps, evaluated mid-interval so it doesn't lag.
//
// No DOM or filesystem access.

import { SPIN_RATE } from './frame.js';
import { TIDE_BODY_NAMES } from './tides.js';

const G = 9.81;
const DEG = Math.PI / 180;
const PRIMUS = TIDE_BODY_NAMES.indexOf('Primus');

export const OCEAN_DEFAULTS = {
  dt: 40,          // s; CFL limit is ~42 s for 3000 m at 10 km cells (checked)
  eqEvery: 3,      // steps between η_eq refreshes
  cd: 0.0025,      // bottom drag coefficient
  u0: 0.05,        // m/s, friction speed floor
  sponge: 12,      // cells
  spongeRate: 1 / 1800,   // 1/s at the outer edge
};

// Equilibrium-tide tensor from a frame: [a11, a22, a33, 2a12, 2a13, 2a23, c],
// so that η_eq = a11 zx² + a22 zy² + a33 zz² + 2a12 zx zy + … − c.
export function forcingTensor(frame, out = new Float64Array(7), skip = PRIMUS) {
  out.fill(0);
  const n = frame.length / 4;
  for (let j = 0; j < n; j++) {
    if (j === skip) continue;
    const K = frame[4 * j], x = frame[4 * j + 1], y = frame[4 * j + 2], z = frame[4 * j + 3];
    const k = 1.5 * K;
    out[0] += k * x * x; out[1] += k * y * y; out[2] += k * z * z;
    out[3] += 2 * k * x * y; out[4] += 2 * k * x * z; out[5] += 2 * k * y * z;
    out[6] += 0.5 * K;
  }
  return out;
}

export class Ocean2D {
  constructor(grid, opts = {}) {
    const o = { ...OCEAN_DEFAULTS, ...opts };
    Object.assign(this, { grid, dt: o.dt, cd: o.cd, u0: o.u0, eqEvery: o.eqEvery });
    const { nx, ny, sea, depth, lat, lon } = grid;
    let hMax = 0;
    for (let k = 0; k < depth.length; k++) hMax = Math.max(hMax, depth[k]);
    const dtMax = grid.dx / (Math.sqrt(G * hMax) * Math.SQRT2);
    if (o.dt > 0.98 * dtMax) throw new Error(`ocean dt ${o.dt} s exceeds the CFL limit ${dtMax.toFixed(1)} s`);
    const N = nx * ny;
    this.nx = nx; this.ny = ny; this.dx = grid.dx;
    this.eta = new Float64Array(N);
    this.eq = new Float64Array(N);
    this.U = new Float64Array((nx + 1) * ny);      // face left of cell (i, j): j·(nx+1) + i
    this.V = new Float64Array(nx * (ny + 1));      // face above cell (i, j): j·nx + i
    this.time = 0;

    // Face coefficients: g·H·dt/dx and 1/H (both 0 = closed face).
    this.gHu = new Float64Array((nx + 1) * ny); this.iHu = new Float64Array((nx + 1) * ny);
    this.gHv = new Float64Array(nx * (ny + 1)); this.iHv = new Float64Array(nx * (ny + 1));
    const c = G * o.dt / grid.dx;
    for (let j = 0; j < ny; j++)
      for (let i = 1; i < nx; i++) {
        const a = j * nx + i - 1, b = a + 1, q = j * (nx + 1) + i;
        if (sea[a] && sea[b]) { const H = 0.5 * (depth[a] + depth[b]); this.gHu[q] = c * H; this.iHu[q] = 1 / H; }
      }
    for (let j = 1; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const a = (j - 1) * nx + i, b = a + nx, q = j * nx + i;
        if (sea[a] && sea[b]) { const H = 0.5 * (depth[a] + depth[b]); this.gHv[q] = c * H; this.iHv[q] = 1 / H; }
      }
    // Per row, the span of columns holding sea (rows of land are skipped).
    this.rowLo = new Int32Array(ny); this.rowHi = new Int32Array(ny);
    for (let j = 0; j < ny; j++) {
      let lo = nx, hi = -1;
      for (let i = 0; i < nx; i++) if (sea[j * nx + i]) { lo = Math.min(lo, i); hi = i; }
      this.rowLo[j] = lo; this.rowHi[j] = hi;
    }

    // Zenith quadratic terms per cell: zx², zy², zz², zx·zy, zx·zz, zy·zz.
    this.zq = new Float64Array(6 * N);
    for (let k = 0; k < N; k++) {
      const p = lat[k] * DEG, l = lon[k] * DEG;
      const zx = Math.cos(p) * Math.cos(l), zy = Math.cos(p) * Math.sin(l), zz = Math.sin(p);
      this.zq.set([zx * zx, zy * zy, zz * zz, zx * zy, zx * zz, zy * zz], 6 * k);
    }
    // Coriolis per row (lat depends only on the row).
    this.fRow = new Float64Array(ny);
    for (let j = 0; j < ny; j++) this.fRow[j] = 2 * SPIN_RATE * Math.sin(lat[j * nx] * DEG);

    // Sponge rate per cell, and the Dirichlet ring.
    this.sigma = new Float64Array(N);
    this.ring = [];
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!sea[k]) continue;
        const d = Math.min(i, j, nx - 1 - i, ny - 1 - j);
        if (d === 0) this.ring.push(k);
        if (d < o.sponge) this.sigma[k] = o.spongeRate * (1 - d / o.sponge) ** 2;
      }
    this.ring = Int32Array.from(this.ring);
    this.spongeCells = Int32Array.from(this.sigma.reduce((a, s, k) => (s > 0 && a.push(k), a), []));

    // Gaps.
    this.gaps = grid.gaps.map(gp => ({
      ...gp, u: 0,
      foot: gp.cells.map(k => footprint(grid, k, 1.5)),
      drag: o.cd / gp.depth + gp.loss / (2 * gp.length),
    }));

    this._A = new Float64Array(7); this._A0 = new Float64Array(7); this._A1 = new Float64Array(7);
    this._step = 0;
  }

  // Static start: η = η_eq, still water.
  reset(frame, t = 0) {
    forcingTensor(frame, this._A);
    this._eqField(this._A);
    this.eta.set(this.eq);
    for (let k = 0; k < this.eta.length; k++) if (!this.grid.sea[k]) this.eta[k] = 0;
    this.U.fill(0); this.V.fill(0);
    for (const gp of this.gaps) gp.u = 0;
    this.time = t;
    this._step = 0;
  }

  // Integrate across the interval from frame0 to frame1 (span seconds),
  // interpolating the forcing linearly.  span must be a multiple of dt.  By
  // default runs the whole interval; steps [s0, s1) run only part of it (the
  // caller tracks where it is), so playback isn't tied to the frame spacing.
  advance(frame0, frame1, span, s0 = 0, s1 = null) {
    forcingTensor(frame0, this._A0);
    forcingTensor(frame1, this._A1);
    const n = Math.round(span / this.dt), E = this.eqEvery;
    if (Math.abs(n * this.dt - span) > 1e-6) throw new Error(`advance: span ${span} s is not a multiple of dt ${this.dt} s`);
    const A = this._A;
    for (let s = s0; s < (s1 ?? n); s++) {
      if (this._step % E === 0) {
        // η_eq for the next E steps, evaluated at their midpoint.
        const w = Math.min(1, (s + E / 2) / n);
        for (let c = 0; c < 7; c++) A[c] = this._A0[c] + (this._A1[c] - this._A0[c]) * w;
        this._eqField(A);
      }
      this._stepOnce();
    }
  }

  _eqField(A) {
    const zq = this.zq, eq = this.eq, N = eq.length;
    const a0 = A[0], a1 = A[1], a2 = A[2], a3 = A[3], a4 = A[4], a5 = A[5], c = A[6];
    for (let k = 0, q = 0; k < N; k++, q += 6)
      eq[k] = a0 * zq[q] + a1 * zq[q + 1] + a2 * zq[q + 2] + a3 * zq[q + 3] + a4 * zq[q + 4] + a5 * zq[q + 5] - c;
  }

  _stepOnce() {
    const { nx, ny, dt, dx, eta, eq, U, V, rowLo, rowHi } = this;
    const NX1 = nx + 1;

    // Gap momentum, from the levels at the start of the step (the GPU solver
    // does the same, in a pass before continuity).
    for (const gp of this.gaps) {
      const [kA, kB] = gp.cells;
      const d = (eta[kA] - eq[kA]) - (eta[kB] - eq[kB]);
      gp.u = (gp.u + dt * G * d / gp.length) / (1 + dt * gp.drag * Math.abs(gp.u));
    }

    // Continuity (closed faces carry zero transport).
    const idx = dt / dx;
    for (let j = 0; j < ny; j++) {
      const ru = j * NX1, rc = j * nx;
      for (let i = rowLo[j], hi = rowHi[j]; i <= hi; i++)
        eta[rc + i] -= idx * (U[ru + i + 1] - U[ru + i] + V[rc + nx + i] - V[rc + i]);
    }

    // Gaps: move the volume.
    for (const gp of this.gaps) {
      const vol = gp.u * gp.area * dt;
      for (const [k, w] of gp.foot[0]) eta[k] -= vol * w;
      for (const [k, w] of gp.foot[1]) eta[k] += vol * w;
    }

    // Open boundary: sponge toward η_eq, ring held at η_eq.
    const sigma = this.sigma;
    for (const k of this.spongeCells) eta[k] -= dt * sigma[k] * (eta[k] - eq[k]);
    for (const k of this.ring) eta[k] = eq[k];

    if (this._step++ & 1) { this._updateV(); this._updateU(); }
    else { this._updateU(); this._updateV(); }
    this.time += dt;
  }

  _updateU() {
    const { nx, ny, dt, eta, eq, U, V, gHu, iHu, cd, u0, fRow, sigma, rowLo, rowHi } = this;
    const NX1 = nx + 1;
    for (let j = 0; j < ny; j++) {
      const f = fRow[j] * dt;
      for (let i = Math.max(1, rowLo[j] + 1), hi = rowHi[j]; i <= hi; i++) {
        const q = j * NX1 + i, gH = gHu[q];
        if (gH === 0) continue;
        const a = j * nx + i - 1, b = a + 1, iH = iHu[q];
        // V at the U face: mean of the four surrounding V faces.
        const vb = 0.25 * (V[a] + V[b] + V[a + nx] + V[b + nx]);
        const uq = U[q];
        const r = dt * (cd * (Math.sqrt(uq * uq + vb * vb) * iH + u0) * iH + 0.5 * (sigma[a] + sigma[b]));
        U[q] = (uq - gH * ((eta[b] - eq[b]) - (eta[a] - eq[a])) - f * vb) / (1 + r);
      }
    }
  }

  _updateV() {
    const { nx, ny, dt, eta, eq, U, V, gHv, iHv, cd, u0, fRow, sigma, rowLo, rowHi } = this;
    const NX1 = nx + 1;
    for (let j = 1; j < ny; j++) {
      const f = 0.5 * (fRow[j - 1] + fRow[j]) * dt;
      const lo = Math.max(rowLo[j - 1], rowLo[j]), hi = Math.min(rowHi[j - 1], rowHi[j]);
      for (let i = lo; i <= hi; i++) {
        const q = j * nx + i, gH = gHv[q];
        if (gH === 0) continue;
        const a = q - nx, b = q, iH = iHv[q];
        const ub = 0.25 * (U[(j - 1) * NX1 + i] + U[(j - 1) * NX1 + i + 1] + U[j * NX1 + i] + U[j * NX1 + i + 1]);
        const vq = V[q];
        const r = dt * (cd * (Math.sqrt(vq * vq + ub * ub) * iH + u0) * iH + 0.5 * (sigma[a] + sigma[b]));
        V[q] = (vq - gH * ((eta[b] - eq[b]) - (eta[a] - eq[a])) + f * ub) / (1 + r);
      }
    }
  }

  // Current speed (m/s) at cell centres, into out (Float32Array, length N).
  speed(out = new Float32Array(this.eta.length)) {
    const { nx, ny, U, V, iHu, iHv } = this, NX1 = nx + 1;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const uc = 0.5 * (U[j * NX1 + i] * iHu[j * NX1 + i] + U[j * NX1 + i + 1] * iHu[j * NX1 + i + 1]);
        const vc = 0.5 * (V[j * nx + i] * iHv[j * nx + i] + V[(j + 1) * nx + i] * iHv[(j + 1) * nx + i]);
        out[j * nx + i] = Math.hypot(uc, vc);
      }
    return out;
  }

  // ── readout (shared with Ocean2DGL) ──
  // Region { i0, j0, w, h } of cells; out[j·w + i] for cell (i0 + i, j0 + j).
  readEta(region, out = new Float32Array(region.w * region.h)) {
    const { nx, eta } = this;
    for (let j = 0; j < region.h; j++)
      for (let i = 0; i < region.w; i++) out[j * region.w + i] = eta[(region.j0 + j) * nx + region.i0 + i];
    return out;
  }

  readSpeed(region, out = new Float32Array(region.w * region.h)) {
    const sp = this.speed();
    for (let j = 0; j < region.h; j++)
      for (let i = 0; i < region.w; i++) out[j * region.w + i] = sp[(region.j0 + j) * this.nx + region.i0 + i];
    return out;
  }

  gapCurrents() { return this.gaps.map(gp => gp.u); }

  // ── water-level history (shared with Ocean2DGL) ──
  // A ring of `len` snapshots of η over a region; the caller picks the slot.
  initHistory(region, len) {
    this.hist = { region, len, data: new Int16Array(len * region.w * region.h) };   // cm
  }

  recordHistory(slot) {
    const { region, data } = this.hist, n = region.w * region.h, base = slot * n, { nx, eta } = this;
    for (let j = 0; j < region.h; j++)
      for (let i = 0; i < region.w; i++) data[base + j * region.w + i] = Math.round(100 * eta[(region.j0 + j) * nx + region.i0 + i]);
  }

  // η (m) at region cell m in every slot, indexed by slot.
  readHistory(m) {
    const { region, len, data } = this.hist, n = region.w * region.h, out = new Float32Array(len);
    for (let s = 0; s < len; s++) out[s] = data[s * n + m] / 100;
    return out;
  }

  // Total volume anomaly (m³) over sea cells — for conservation checks.
  volume() {
    let s = 0;
    for (let k = 0; k < this.eta.length; k++) if (this.grid.sea[k]) s += this.eta[k];
    return s * this.dx * this.dx;
  }
}

// Sea cells within radius r (cells) of cell k, weighted by 1/area so the
// weights sum to 1 / (total area): adding vol·w to each η adds vol in total.
function footprint(grid, k, r) {
  const { nx, ny, sea, dx } = grid;
  const i0 = k % nx, j0 = (k - i0) / nx, R = Math.ceil(r), cells = [];
  for (let j = j0 - R; j <= j0 + R; j++)
    for (let i = i0 - R; i <= i0 + R; i++) {
      if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
      const m = j * nx + i;
      if (sea[m] && (i - i0) ** 2 + (j - j0) ** 2 <= r * r) cells.push(m);
    }
  const w = 1 / (cells.length * dx * dx);
  return cells.map(m => [m, w]);
}
