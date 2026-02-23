import { writeFileSync } from 'fs';
import { Simulation } from '../simulation.js';
import { createInitialBodies } from '../bodies.js';

const YEARS = 300;
const OUT   = '/tmp/sim_state_300yr.json';

const sim   = new Simulation(createInitialBodies());
const steps = Math.round(YEARS * 365.25 * 86400 / sim.dt);

console.log(`Advancing ${steps.toLocaleString()} steps (${YEARS} years)…`);
sim.advance(steps, 1000, null);

const state = {
  time_years: sim.time / (365.25 * 86400),
  dt: sim.dt,
  bodies: sim.bodies.map(b => ({
    name: b.name, mass: b.mass,
    x: b.x, y: b.y, z: b.z,
    vx: b.vx, vy: b.vy, vz: b.vz,
  })),
};

writeFileSync(OUT, JSON.stringify(state, null, 2));
console.log(`Saved state at ${state.time_years.toFixed(2)} years to ${OUT}`);
state.bodies.forEach(b =>
  console.log(`  ${b.name.padEnd(10)} x=${b.x.toExponential(4)}  y=${b.y.toExponential(4)}  vx=${b.vx.toExponential(4)}  vy=${b.vy.toExponential(4)}`)
);
