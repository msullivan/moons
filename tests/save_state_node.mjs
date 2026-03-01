import { writeFileSync } from 'fs';
import { Simulation } from '../simulation.js';
import { createInitialBodies } from '../bodies.js';

// Target exactly Jan 1, 2253 (200 Gregorian years after the Jan 1, 2053 epoch).
const EPOCH     = new Date('2053-01-01T00:00:00Z');
const TARGET    = new Date('2253-01-01T00:00:00Z');
const TARGET_S  = (TARGET - EPOCH) / 1000;  // 6,311,347,200 s = 73,048 days
const OUT       = new URL('../state_200yr.json', import.meta.url).pathname;

const sim   = new Simulation(createInitialBodies());
const steps = Math.round(TARGET_S / sim.dt);

console.log(`Advancing ${steps.toLocaleString()} steps (${(TARGET_S/86400).toFixed(0)} days → ${TARGET.toISOString().slice(0,10)})…`);
sim.advance(steps, 1000, null);

const state = {
  years: TARGET_S / (365.25 * 86400),
  time:  sim.time,
  bodies: sim.bodies.map(b => ({
    name: b.name, x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz,
  })),
};

writeFileSync(OUT, JSON.stringify(state));
console.log(`Saved state at ${state.years.toFixed(4)} Julian years (sim.time=${sim.time}) to ${OUT}`);
state.bodies.forEach(b =>
  console.log(`  ${b.name.padEnd(10)} x=${b.x.toExponential(4)}  y=${b.y.toExponential(4)}  vx=${b.vx.toExponential(4)}  vy=${b.vy.toExponential(4)}`)
);
