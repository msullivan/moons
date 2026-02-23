// Compute tidal periods and simulate tide heights for Qaia.
// Run with: node tests/tide_sim.mjs
// Re-run after changing any moon parameters in bodies.js.
//
// Assumes Qaia has a 24-hour solar day (matching Earth).
// Equilibrium tide half-amplitude formula: h = (3/4) * (M/M_planet) * (R_planet/a)^3 * R_planet
// Validated against Earth-Moon system (gives ~0.27 m, matching theory).

import { M_MOON, LUNAR_DIST, AU, M_EARTH, R_EARTH, M_SUN } from '../bodies.js';

const T_QAIA_H = 24; // Qaia solar day in hours (matches Earth)

const h_eq = (M, a) => (3/4) * (M / M_EARTH) * (R_EARTH / a)**3 * R_EARTH;

// Moon definitions — keep in sync with bodies.js
const bodies = [
  { name: 'Primus',   M: 0.02 * M_MOON, a: 0.12 * LUNAR_DIST, T_d: 1.14,   dir: -1 },
  { name: 'Secundus', M: 0.04 * M_MOON, a: 0.24 * LUNAR_DIST, T_d: 3.23,   dir: -1 },
  { name: 'Tertius',  M: 0.25 * M_MOON, a: 0.45 * LUNAR_DIST, T_d: 8.29,   dir:  1 },
  { name: 'Quartus',  M: 1.00 * M_MOON, a: 1.00 * LUNAR_DIST, T_d: 27.45,  dir:  1 },
  { name: 'Sun',      M: M_SUN,          a: AU,                 T_d: 365.25, dir:  1 },
];

// Tidal period as experienced on Qaia's surface.
// Prograde:   T_synodic = T_day * T_orb / (T_orb - T_day)
// Retrograde: T_synodic = T_day * T_orb / (T_orb + T_day)  (frequencies add)
// Tidal (semi-diurnal) period = T_synodic / 2
for (const b of bodies) {
  const T_orb_h = b.T_d * 24;
  b.T_syn_h  = T_QAIA_H * T_orb_h / (T_orb_h + T_QAIA_H * (-b.dir));
  b.T_tide_h = b.T_syn_h / 2;
  b.h        = h_eq(b.M, b.a);
}

console.log('=== Tidal periods and equilibrium amplitudes ===');
for (const b of bodies) {
  console.log(`  ${b.name.padEnd(10)} tidal ${b.T_tide_h.toFixed(2).padStart(6)}h  synodic ${b.T_syn_h.toFixed(2).padStart(6)}h  amp ±${(b.h*100).toFixed(0).padStart(4)}cm`);
}

console.log('\n=== Spring/neap beat periods ===');
const pairs = [
  ['Primus', 'Quartus'],
  ['Primus', 'Secundus'],
  ['Secundus', 'Tertius'],
  ['Tertius', 'Quartus'],
  ['Quartus', 'Sun'],
];
for (const [n1, n2] of pairs) {
  const b1 = bodies.find(b => b.name === n1);
  const b2 = bodies.find(b => b.name === n2);
  const beat_h = 1 / Math.abs(1/b1.T_tide_h - 1/b2.T_tide_h);
  console.log(`  ${n1} + ${n2}: beat every ${beat_h.toFixed(1)}h = ${(beat_h/24).toFixed(2)} days`);
}

// ── simulation ───────────────────────────────────────────────────────────────
const SIM_H = 720; // 30 days
const dt    = 0.25;

let maxH = -Infinity, minH = Infinity;
const heights = [];
for (let t = 0; t <= SIM_H; t += dt) {
  const h = bodies.reduce((s, b) => s + b.h * Math.cos(2*Math.PI * t / b.T_tide_h), 0);
  heights.push({ t, h });
  if (h > maxH) maxH = h;
  if (h < minH) minH = h;
}

console.log(`\n=== ${SIM_H/24}-day tide simulation (all moons at opposition, t=0) ===`);
console.log(`  Overall range: ${(minH*100).toFixed(0)} cm to +${(maxH*100).toFixed(0)} cm`);
console.log(`  Max single-cycle swing: ${((maxH-minH)*100).toFixed(0)} cm`);
console.log('\n  t(h)   tide');
for (let i = 0; i < heights.length; i += 4) { // 1h steps
  const { t, h } = heights[i];
  const bar = '█'.repeat(Math.round((h - minH) / (maxH - minH) * 30));
  const hStr = (h >= 0 ? '+' : '') + (h*100).toFixed(0);
  console.log(`  ${t.toFixed(0).padStart(4)}h  ${hStr.padStart(6)}cm  ${bar}`);
}
