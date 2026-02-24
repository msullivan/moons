// Find all-new and all-full moon events in the first year.
// Run with: node analysis/phase_events.mjs
//
// Checks Secundus, Tertius, and Quartus (Primus is geosynchronous — fixed phase).
// Illumination fraction: f = (1 - cosElong) / 2
//   f = 1 → full (moon opposite Sun)
//   f = 0 → new  (moon between Qaia and Sun)

import { createInitialBodies } from '../bodies.js';
import { Simulation } from '../simulation.js';

const sim = new Simulation(createInitialBodies());

const SUN  = 0;
const QAIA = 1;
const MOONS = [3, 4, 5]; // Secundus, Tertius, Quartus
const MOON_NAMES = ['Secundus', 'Tertius', 'Quartus'];

const STEPS_PER_HOUR = Math.round(3600 / sim.dt); // 10 steps per hour
const SIM_DAYS = 365 * 50;

// Threshold for "essentially new/full": illumination within this of 0 or 1.
const THRESHOLDS = [0.01, 0.02, 0.05, 0.10, 0.15, 0.20];

function illumination(moonIdx) {
  const qaia = sim.bodies[QAIA];
  const sun  = sim.bodies[SUN];
  const moon = sim.bodies[moonIdx];
  const dmx = moon.x - qaia.x, dmy = moon.y - qaia.y;
  const dsx = sun.x  - qaia.x, dsy = sun.y  - qaia.y;
  const cosElong = (dmx*dsx + dmy*dsy) / (Math.hypot(dmx, dmy) * Math.hypot(dsx, dsy));
  return (1 - cosElong) / 2;
}

// Track events per threshold
const events = THRESHOLDS.map(() => []);
let inEvent  = THRESHOLDS.map(() => null); // null or { type, startDay, peak }

for (let h = 0; h <= SIM_DAYS * 24; h++) {
  const day = sim.time / 86400;
  const fracs = MOONS.map(illumination);

  for (let ti = 0; ti < THRESHOLDS.length; ti++) {
    const thr = THRESHOLDS[ti];
    const allFull = fracs.every(f => f >= 1 - thr);
    const allNew  = fracs.every(f => f <= thr);
    const active  = allFull ? 'FULL' : allNew ? 'NEW' : null;

    if (active && !inEvent[ti]) {
      inEvent[ti] = { type: active, startDay: day, bestFracs: [...fracs] };
    } else if (active && inEvent[ti] && inEvent[ti].type === active) {
      // Update with "most aligned" snapshot (min deviation from target)
      const cur = inEvent[ti];
      const target = active === 'FULL' ? 1 : 0;
      const curErr = cur.bestFracs.reduce((s,f) => s + Math.abs(f - target), 0);
      const newErr = fracs.reduce((s,f) => s + Math.abs(f - target), 0);
      if (newErr < curErr) cur.bestFracs = [...fracs];
    } else if (!active && inEvent[ti]) {
      events[ti].push({ ...inEvent[ti], endDay: day });
      inEvent[ti] = null;
    }
  }

  if (h < SIM_DAYS * 24) sim.advance(STEPS_PER_HOUR, STEPS_PER_HOUR + 1);
}
// Close any open events
for (let ti = 0; ti < THRESHOLDS.length; ti++) {
  if (inEvent[ti]) events[ti].push({ ...inEvent[ti], endDay: SIM_DAYS });
}

// Print tight thresholds (1%, 2%) with full detail; 5% as per-year summary only.
for (const PRINT_THR of [0.01, 0.02]) {
  const ti  = THRESHOLDS.indexOf(PRINT_THR);
  const evs = events[ti];
  console.log(`\n=== Threshold ±${(PRINT_THR*100).toFixed(0)}% — ${evs.length} events over ${SIM_DAYS/365} years ===`);
  if (evs.length === 0) {
    console.log('  (none)');
  } else {
    for (const e of evs) {
      const dur = (e.endDay - e.startDay) * 24;
      const yr  = Math.floor(e.startDay / 365.25) + 1;
      const fracStr = e.bestFracs.map((f,i) => `${MOON_NAMES[i]}=${f.toFixed(4)}`).join('  ');
      console.log(`  yr${String(yr).padStart(3)}  day ${e.startDay.toFixed(1).padStart(8)}  (${dur.toFixed(0).padStart(3)}h)  ${e.type}  ${fracStr}`);
    }
  }
}

// 5% threshold: per-year summary only
{
  const ti  = THRESHOLDS.indexOf(0.05);
  const evs = events[ti];
  const fullCount = evs.filter(e => e.type === 'FULL').length;
  const newCount  = evs.filter(e => e.type === 'NEW').length;
  console.log(`\n=== 5% threshold: ${evs.length} events (FULL: ${fullCount}  NEW: ${newCount}) — per-year summary ===`);
  const totalYears = Math.ceil(SIM_DAYS / 365.25);
  for (let yr = 1; yr <= totalYears; yr++) {
    const yEvs = evs.filter(e => Math.floor(e.startDay / 365.25) + 1 === yr);
    const f = yEvs.filter(e => e.type === 'FULL').length;
    const n = yEvs.filter(e => e.type === 'NEW').length;
    const bar = 'F'.repeat(f) + 'N'.repeat(n);
    console.log(`  yr ${String(yr).padStart(2)}  ${bar || '-'}`);
  }
}
