// Location-specific tide model for Qaia.
//
// Two layers:
//
//  1. Equilibrium tide from the simulated geometry.  Each body raises
//       h_eq = K · P₂(cos z),   K = (M / M_Qaia) · (R / r)³ · R
//     at a site where it stands at zenith angle z.  P₂ splits exactly into
//     three species (φ = site latitude, δ = declination, H = hour angle):
//       semidiurnal   ¾ cos²φ · cos²δ · cos 2H
//       diurnal       ¾ sin2φ · sin2δ · cos H
//       long-period   ¼ (3sin²φ − 1)(3sin²δ − 1)
//     Using the sim's actual positions means eccentricity, declination
//     cycles, nodal/apsidal precession etc. all come along for free.
//
//  2. Local ocean response.  Two kinds of model, both linear time-domain
//     systems driven by the equilibrium forcing (so every sideband and
//     modulation is filtered correctly, with no harmonic bookkeeping):
//
//     - 'resonator' ports: per species, a damped harmonic oscillator
//           x'' + (ω₀/Q)·x' + ω₀²·x = G·ω₀²·F(t)
//       followed by a pure delay τ (propagation from the open ocean).
//       Omit T0 for a non-resonant species (x = G·F).  Long-period gain = 1.
//     - 'channel' ports: sit in a semi-enclosed sea modelled as a 1-D linear
//       shallow-water channel, closed at the head and open to the ocean at
//       the mouth, forced both at the mouth (ocean tide) and directly along
//       its length (equilibrium gradient).  Ports read the water level at a
//       fractional position s (0 = head, 1 = mouth).
//
// The ephemeris "frame" passed to the models is a Float64Array of
// [K, u1, u2, u3] per tide-raising body, where u is the body's unit
// direction in Qaia's body-fixed frame (see frame.js).  Build one with
// tideFrame().
//
// This module has no DOM or filesystem dependencies.

import { bodyFixedMatrix, apply } from './frame.js';

const DEG = Math.PI / 180;
const G_SURF = 9.81;   // m/s², Qaia's surface gravity (Earth mass and radius)

// Bodies whose tides we model.  Primus contributes only a static offset
// (it's geosynchronous and equatorial) but is included for completeness.
// Quintus (trace particle) and the planets are negligible (< 0.1 mm).
export const TIDE_BODY_NAMES = ['Sun', 'Primus', 'Secundus', 'Tertius', 'Quartus', 'Sextus', 'Septimus'];

export const SPECIES = { long: 0, diurnal: 1, semi: 2 };

// ── ephemeris frames ───────────────────────────────────────────────────

// Indices into sim.bodies for the tide bodies, plus Qaia.
export function tideBodyIndices(bodies) {
  const idx = name => {
    const i = bodies.findIndex(b => b.name === name);
    if (i < 0) throw new Error(`tides: no body named ${name}`);
    return i;
  };
  return { qaia: idx('Qaia'), bodies: TIDE_BODY_NAMES.map(idx) };
}

// Fill `out` (Float64Array, length 4·n) with [K, u1, u2, u3] per tide body at
// sim time t, from the current body positions.
export function tideFrame(bodies, indices, t, out = new Float64Array(4 * indices.bodies.length)) {
  const qaia = bodies[indices.qaia];
  const R = qaia.physicalRadius, M = qaia.mass;
  const A = bodyFixedMatrix(t);
  indices.bodies.forEach((bi, j) => {
    const b = bodies[bi];
    const dx = b.x - qaia.x, dy = b.y - qaia.y, dz = b.z - qaia.z;
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const [u1, u2, u3] = apply(A, dx / r, dy / r, dz / r);
    out[4 * j]     = (b.mass / M) * (R / r) ** 3 * R;
    out[4 * j + 1] = u1;
    out[4 * j + 2] = u2;
    out[4 * j + 3] = u3;
  });
  return out;
}

// ── equilibrium tide ───────────────────────────────────────────────────

// Precompute site trig.  lat/lon in degrees (lon east of sub-Primus meridian).
export function makeSite(lat, lon) {
  const p = lat * DEG, l = lon * DEG;
  const cP = Math.cos(p), sP = Math.sin(p);
  return {
    lat, lon, cL: Math.cos(l), sL: Math.sin(l),
    zx: cP * Math.cos(l), zy: cP * Math.sin(l), zz: sP,   // zenith, body-fixed
    semiF: 0.75 * cP * cP,           // ¾ cos²φ
    diurF: 0.75 * 2 * sP * cP,       // ¾ sin2φ
    longF: 0.25 * (3 * sP * sP - 1), // ¼ (3sin²φ − 1)
  };
}

// One body's species component at a site.
//   species: 0 long, 1 diurnal, 2 semi.   quad: return the quadrature
//   (sin mH) partner instead — used for harmonic fitting.
// With p = cosδ·cosH and q = cosδ·sinH (no trig needed):
//   cos²δ·cos2H = p² − q²      cos²δ·sin2H = 2pq
//   sin2δ·cosH  = 2·u3·p       sin2δ·sinH  = 2·u3·q
export function component(frame, j, site, species, quad = false) {
  const K = frame[4 * j], u1 = frame[4 * j + 1], u2 = frame[4 * j + 2], u3 = frame[4 * j + 3];
  if (species === 0) return quad ? 0 : K * site.longF * (3 * u3 * u3 - 1);
  const p = site.cL * u1 + site.sL * u2;
  const q = site.sL * u1 - site.cL * u2;
  if (species === 1) return K * site.diurF * 2 * u3 * (quad ? q : p);
  return K * site.semiF * (quad ? 2 * p * q : p * p - q * q);
}

// Forcing at a site, optionally restricted by sel = { body: j, species: s }
// (either field may be omitted).  Returns [long, diurnal, semi].
export function speciesForcing(frame, site, sel = null) {
  const out = [0, 0, 0];
  const n = frame.length / 4;
  for (let j = 0; j < n; j++) {
    if (sel?.body != null && sel.body !== j) continue;
    for (let s = 0; s < 3; s++) {
      if (sel?.species != null && sel.species !== s) continue;
      out[s] += component(frame, j, site, s);
    }
  }
  return out;
}

// Total forcing.  Without a species filter this is K·P₂(cos z) directly,
// which equals the sum of the three species but is much cheaper.
export function totalForcing(frame, site, sel = null) {
  if (sel?.species != null) {
    const f = speciesForcing(frame, site, sel);
    return f[0] + f[1] + f[2];
  }
  let sum = 0;
  const n = frame.length / 4;
  for (let j = 0; j < n; j++) {
    if (sel?.body != null && sel.body !== j) continue;
    const c = site.zx * frame[4 * j + 1] + site.zy * frame[4 * j + 2] + site.zz * frame[4 * j + 3];
    sum += frame[4 * j] * (1.5 * c * c - 0.5);
  }
  return sum;
}

// ── delay line ─────────────────────────────────────────────────────────

class Delay {
  constructor(tauSec, dt) {
    this.lag = Math.max(0, tauSec / dt);
    this.buf = new Float64Array(Math.ceil(this.lag) + 2);
    this.k = -1;
  }
  push(v) {
    if (this.k < 0) this.buf.fill(v);
    this.k++;
    this.buf[this.k % this.buf.length] = v;
    // Value at (k − lag), linearly interpolated.
    const pos = this.k - this.lag;
    const i0 = Math.floor(pos), f = pos - i0;
    const n = this.buf.length;
    const a = this.buf[((i0 % n) + n) % n], b = this.buf[(((i0 + 1) % n) + n) % n];
    return a + (b - a) * f;
  }
}

// ── resonator model ────────────────────────────────────────────────────

// Damped oscillator x'' + γx' + ω₀²x = G·ω₀²·F(t), RK4 with F linearly
// interpolated across each step.  T0 / tau in hours.
export class Resonator {
  constructor({ G = 1, T0 = null, Q = 3, tau = 0 }, dt) {
    this.G = G; this.dt = dt;
    this.w0 = T0 ? 2 * Math.PI / (T0 * 3600) : null;
    this.gam = T0 ? this.w0 / Q : 0;
    this.delay = new Delay(tau * 3600, dt);
    this.x = null; this.v = 0; this.Fprev = 0;
  }
  step(F) {
    if (!this.w0) return this.delay.push(this.G * F);
    if (this.x === null) { this.x = this.G * F; this.Fprev = F; return this.delay.push(this.x); }
    const { w0, gam, G, dt } = this, w2 = w0 * w0, F0 = this.Fprev;
    const acc = (x, v, f) => G * w2 * f - gam * v - w2 * x;
    const Fm = 0.5 * (F0 + F);
    let x = this.x, v = this.v;
    const k1x = v,               k1v = acc(x, v, F0);
    const k2x = v + 0.5*dt*k1v,  k2v = acc(x + 0.5*dt*k1x, v + 0.5*dt*k1v, Fm);
    const k3x = v + 0.5*dt*k2v,  k3v = acc(x + 0.5*dt*k2x, v + 0.5*dt*k2v, Fm);
    const k4x = v + dt*k3v,      k4v = acc(x + dt*k3x, v + dt*k3v, F);
    this.x = x + dt / 6 * (k1x + 2*k2x + 2*k3x + k4x);
    this.v = v + dt / 6 * (k1v + 2*k2v + 2*k3v + k4v);
    this.Fprev = F;
    return this.delay.push(this.x);
  }
}

// ── channel model ──────────────────────────────────────────────────────

// Great-circle distance between two {lat, lon} points, in metres.
function gcDist(a, b, R) {
  const p1 = a.lat * DEG, p2 = b.lat * DEG, dl = (b.lon - a.lon) * DEG;
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Linear shallow-water channel on a staggered grid (η at cell centres,
// u at faces).  Head (x = 0) is a wall; the mouth (x = L) is held at the
// ocean tide, oceanG·η_eq(mouth) delayed by ocean.tau hours.
//   ∂u/∂t = −g ∂(η − η_eq)/∂x − u/T_damp
//   ∂η/∂t = −h ∂u/∂x
// Quarter-wave fundamental period ≈ 4L / √(g·h).
export class Channel {
  constructor(basin, dt, R) {
    const { head, mouth, depth, damping, cells = 40, ocean = {} } = basin;
    this.N = cells; this.h = depth; this.dt = dt;
    this.L = gcDist(head, mouth, R);
    // Cell centres at (i + ½)·dx; the ocean ghost cell's centre is the mouth.
    this.dx = this.L / (cells + 0.5);
    this.r = 1 / (damping * 3600);
    const c = Math.sqrt(G_SURF * depth);
    this.nsub = Math.max(1, Math.ceil(dt / (0.5 * this.dx / c)));
    this.oceanG = ocean.G ?? 1;
    this.oceanDelay = new Delay((ocean.tau ?? 0) * 3600, dt);
    // Sites at cell centres, plus index N = the mouth.
    this.sites = [];
    for (let i = 0; i <= cells; i++) {
      const f = (i + 0.5) / (cells + 0.5);
      this.sites.push(makeSite(head.lat + f * (mouth.lat - head.lat), head.lon + f * (mouth.lon - head.lon)));
    }
    this.eta = new Float64Array(cells + 1);   // [N] = ocean ghost
    this.u   = new Float64Array(cells + 1);   // faces 0..N; u[0] = 0 (wall)
    this.eq0 = new Float64Array(cells + 1);
    this.eq1 = new Float64Array(cells + 1);
    this.ocean0 = 0; this.ocean1 = 0;
    this.started = false;
  }

  // Equilibrium forcing at cell i (N = mouth).  Overridable for tests.
  forcingAt(frame, i, sel) { return totalForcing(frame, this.sites[i], sel); }

  get fundamentalPeriodHours() {
    return 4 * this.L / Math.sqrt(G_SURF * this.h) / 3600;
  }

  step(frame, sel = null) {
    const N = this.N;
    for (let i = 0; i <= N; i++) this.eq1[i] = this.forcingAt(frame, i, sel);
    this.ocean1 = this.oceanDelay.push(this.oceanG * this.eq1[N]);
    if (!this.started) {
      // Start from the static solution: no flow, surface follows forcing.
      for (let i = 0; i < N; i++) this.eta[i] = this.eq1[i] + (this.ocean1 - this.eq1[N]);
      this.eq0.set(this.eq1); this.ocean0 = this.ocean1;
      this.started = true;
      return;
    }
    const { eta, u, dx, h, r } = this, g = G_SURF;
    const sdt = this.dt / this.nsub;
    for (let s = 1; s <= this.nsub; s++) {
      const f = s / this.nsub;
      const eqAt = i => this.eq0[i] + f * (this.eq1[i] - this.eq0[i]);
      eta[N] = this.ocean0 + f * (this.ocean1 - this.ocean0);
      // Momentum (semi-implicit friction), faces 1..N.
      let dPrev = eta[0] - eqAt(0);
      for (let i = 1; i <= N; i++) {
        const d = eta[i] - eqAt(i);
        u[i] = (u[i] - sdt * g * (d - dPrev) / dx) / (1 + r * sdt);
        dPrev = d;
      }
      // Continuity, cells 0..N−1.
      for (let i = 0; i < N; i++) eta[i] -= sdt * h * (u[i + 1] - u[i]) / dx;
    }
    this.eq0.set(this.eq1); this.ocean0 = this.ocean1;
  }

  // Water level at fractional position s along the channel (0 head, 1 mouth).
  heightAt(s) {
    const x = Math.min(this.N, Math.max(0, s * (this.N + 0.5) - 0.5));
    const i = Math.min(this.N - 1, Math.floor(x)), f = x - i;
    return this.eta[i] + f * (this.eta[i + 1] - this.eta[i]);
  }
}

// ── port model ─────────────────────────────────────────────────────────

// A stepper producing the water level at a port, one sample per call.
//   port   — entry from ports.js
//   basins — BASINS from ports.js
//   dt     — sample interval, s
//   R      — Qaia radius, m
// step(frame, sel) returns the height (m) relative to the undisturbed
// geoid; subtract a long-run mean to get heights relative to MSL.
export function createPortModel(port, basins, dt, R) {
  const site = makeSite(port.lat, port.lon);
  if (port.basin) {
    const basin = basins[port.basin];
    if (!basin) throw new Error(`port ${port.id}: unknown basin ${port.basin}`);
    const ch = new Channel(basin, dt, R);
    return {
      site, channel: ch,
      step(frame, sel = null) { ch.step(frame, sel); return ch.heightAt(port.s ?? 0); },
    };
  }
  const fsite = port.forcing ? makeSite(port.forcing.lat, port.forcing.lon) : site;
  const semi = new Resonator(port.semi ?? {}, dt);
  const diur = new Resonator(port.diurnal ?? {}, dt);
  return {
    site,
    step(frame, sel = null) {
      const f = speciesForcing(frame, fsite, sel);
      const long = sel?.species == null || sel.species === 0
        ? speciesForcing(frame, site, { ...sel, species: 0 })[0] : 0;
      return semi.step(f[2]) + diur.step(f[1]) + long;
    },
  };
}

// ── high / low water detection ─────────────────────────────────────────

// Find high and low waters in a uniformly sampled series.  Each extremum is
// refined with a parabola through its three samples.  Wiggles smaller than
// minProminence (m) are absorbed, so highs and lows strictly alternate.
// Returns [{ t, h, type: 'H' | 'L' }].
export function findExtrema(t0, dt, h, minProminence = 0.02) {
  const raw = [];
  for (let k = 1; k < h.length - 1; k++) {
    const a = h[k - 1], b = h[k], c = h[k + 1];
    const isMax = b > a && b >= c, isMin = b < a && b <= c;
    if (!isMax && !isMin) continue;
    const den = a - 2 * b + c;
    const off = den !== 0 ? 0.5 * (a - c) / den : 0;
    raw.push({ t: t0 + (k + off) * dt, h: b - 0.25 * (a - c) * off, type: isMax ? 'H' : 'L' });
  }
  const out = [];
  for (const e of raw) {
    const last = out[out.length - 1];
    if (!last) { out.push(e); continue; }
    if (e.type === last.type) {
      if (e.type === 'H' ? e.h > last.h : e.h < last.h) out[out.length - 1] = e;
      continue;
    }
    if (Math.abs(e.h - last.h) < minProminence) continue;
    out.push(e);
  }
  return out;
}
