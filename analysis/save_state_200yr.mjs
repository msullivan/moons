// Run the simulation headlessly for 200 years and save all body
// positions/velocities to state_200yr.json in the project root.
// Run with: node analysis/save_state_200yr.mjs

import { Simulation } from '../simulation.js';
import { createInitialBodies } from '../bodies.js';
import { writeFileSync } from 'fs';

const YEAR  = 365.25 * 86400;
const YEARS = 200;

const sim   = new Simulation(createInitialBodies());
const steps = Math.round(YEARS * YEAR / sim.dt);

console.log(`Running ${YEARS} years (${steps.toLocaleString()} steps)...`);
const t0 = Date.now();
for (let i = 0; i < steps; i++) sim._step();
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);

const state = {
  years: YEARS,
  time:  sim.time,
  bodies: sim.bodies.map(b => ({
    name: b.name,
    x: b.x, y: b.y, z: b.z,
    vx: b.vx, vy: b.vy, vz: b.vz,
  })),
};

const outPath = new URL('../state_200yr.json', import.meta.url).pathname;
writeFileSync(outPath, JSON.stringify(state));
console.log(`Saved to ${outPath}`);
