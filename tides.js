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
//  2. Local ocean response: a response model per site (Munk & Cartwright
//     1966), fitted to the 2-D tide model (ocean2d.js) by
//     analysis/fit_port_response.mjs and stored in port_response.js.  The
//     water level is a fixed linear filter of the local forcing — weights on
//     each species' in-phase and quadrature equilibrium tide at lags of 0 to
//     120 h — plus a few non-linear terms for bottom friction.  Because the
//     filter acts on the actual forcing, eccentricity, declination cycles and
//     orbital drift all carry through with no harmonic bookkeeping.

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

// ── response model ─────────────────────────────────────────────────────

// Forcing series at a site over an ephemeris (eph.frame(k), k < eph.n):
// per species s (0 long, 1 diurnal, 2 semi) the in-phase C[s] and quadrature
// S[s] equilibrium tides, summed over the oscillating bodies.  Primus is left
// out: it is geosynchronous, so its tide is a static offset.  sel = { body,
// species } restricts the sum (either field may be omitted).
export function forcingSeries(eph, site, sel = null, k1 = eph.n) {
  const C = [0, 1, 2].map(() => new Float64Array(eph.n)), S = [0, 1, 2].map(() => new Float64Array(eph.n));
  const bodies = [];
  for (let j = 0; j < eph.nb; j++)
    if (eph.names[j] !== 'Primus' && (sel?.body == null || sel.body === j)) bodies.push(j);
  const species = [0, 1, 2].filter(s => sel?.species == null || sel.species === s);
  for (let k = 0; k < k1; k++) {
    const f = eph.frame(k);
    for (const j of bodies) for (const s of species) {
      C[s][k] += component(f, j, site, s);
      if (s) S[s][k] += component(f, j, site, s, true);
    }
  }
  return { C, S };
}

// Apply a fitted response (see port_response.js) to forcing series F:
//   h(t) = c + g·C₀(t) + Re[D(t) + S(t)] + Σ_j q_j·N_j(D(t), S(t))
// where the once-daily (D) and twice-daily (S) parts are linear filters of the
// forcing over the response's lags ℓ (hours, ≥ 0),
//   D(t) = Σ_ℓ (a − ib)·(C₁ + iS₁)(t − ℓ)       (likewise S from C₂, S₂)
// and N_j are the non-linear terms of NL_TERMS (friction mixing the two —
// e.g. D·S at three cycles a day).  Samples earlier than the longest lag
// reuse the first frame, so allow that much spin-up.  linear = true drops the
// N_j terms and c (for a single body's or species' partial tide).
export function applyResponse(resp, F, dt, { k1 = F.C[0].length, linear = false } = {}) {
  const n = F.C[0].length, h = new Float64Array(n);
  const parts = { 1: [new Float64Array(n), new Float64Array(n)], 2: [new Float64Array(n), new Float64Array(n)] };
  for (const [s, key] of [[1, 'diurnal'], [2, 'semi']]) {
    const C = F.C[s], S = F.S[s], [re, im] = parts[s];
    resp.lags.forEach((lagH, i) => {
      const L = Math.round(lagH * 3600 / dt), [a, b] = resp[key][i];
      for (let k = 0; k < k1; k++) { const m = Math.max(0, k - L); re[k] += a * C[m] + b * S[m]; im[k] += a * S[m] - b * C[m]; }
    });
  }
  const nl = !linear && resp.nl?.length ? resp.nl : null;
  for (let k = 0; k < k1; k++) {
    const dr = parts[1][0][k], di = parts[1][1][k], sr = parts[2][0][k], si = parts[2][1][k];
    let v = (linear ? 0 : resp.c ?? 0) + resp.long * F.C[0][k] + dr + sr;
    if (nl) { const t = NL_TERMS(dr, di, sr, si); for (let j = 0; j < nl.length; j++) v += nl[j] * t[j]; }
    h[k] = v;
  }
  h.parts = parts;
  return h;
}

// Non-linear terms of the response model, from the complex once-daily (D)
// and twice-daily (S) linear parts: real and imaginary parts of products
// that quadratic bottom friction generates.  Changing this list changes the
// meaning of port_response.js — refit after editing.
export function NL_TERMS(dr, di, sr, si) {
  const aD = Math.hypot(dr, di), aS = Math.hypot(sr, si), eps = 1e-9;
  const s2r = sr * sr - si * si, s2i = 2 * sr * si;
  return [
    dr * sr - di * si, dr * si + di * sr,          // D·S     3 cycles/day
    dr * sr + di * si, di * sr - dr * si,          // D·S̄     1
    s2r, s2i,                                      // S²      4
    dr * dr - di * di, 2 * dr * di,                // D²      2
    aS * sr, aS * si, aD * dr, aD * di,            // |S|S, |D|D: amplitude-dependent gain
    aS * dr, aS * di, aD * sr, aD * si,            // |S|D, |D|S
    (s2r * sr - s2i * si) / (aS + eps), (s2r * si + s2i * sr) / (aS + eps),   // S³/|S|  6
    (s2r * dr + s2i * di) / (aS + eps), (s2i * dr - s2r * di) / (aS + eps),   // S²D̄/|S| 3
  ];
}

// Current through an isthmus gap, from the water levels hA, hB at its two ends
// (and their forcing series FA, FB), with the 2-D model's strait equation
//   du/dt = g·Δ(η − η_eq)/length − drag·|u|·u
// (ocean2d.js).  Positive u runs from end A to end B.  strait = { length,
// drag } from port_response.js.  Starts from rest at sample 0.
export function gapCurrent(strait, hA, hB, FA, FB, dt) {
  const n = hA.length, u = new Float64Array(n), SUB = 9, h = dt / SUB;
  const d = k => (hA[k] - FA.C[0][k] - FA.C[1][k] - FA.C[2][k]) - (hB[k] - FB.C[0][k] - FB.C[1][k] - FB.C[2][k]);
  let v = 0, d0 = d(0);
  for (let k = 1; k < n; k++) {
    const d1 = d(k);
    for (let i = 1; i <= SUB; i++) {
      const dd = d0 + (d1 - d0) * (i - 0.5) / SUB;
      v = (v + h * G_SURF * dd / strait.length) / (1 + h * strait.drag * Math.abs(v));
    }
    u[k] = v; d0 = d1;
  }
  return u;
}

// ── high / low water detection ─────────────────────────────────────────

// Find high and low waters in a uniformly sampled series.  Each extremum is
// refined with a parabola through its three samples.  Wiggles smaller than
// minProminence (m) are absorbed, so highs and lows strictly alternate.  The
// default, 10 cm, is about what a tide table would bother to print: below it,
// a mixed tide's second high is a stand or a slight bump, not a high water.
// Returns [{ t, h, type: 'H' | 'L' }].
export function findExtrema(t0, dt, h, minProminence = 0.10) {
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
