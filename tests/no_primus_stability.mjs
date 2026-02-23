// Test system stability with Primus removed entirely.
// Runs 1000 years, checks all remaining moons for escape.

import { G, Simulation } from '../simulation.js';
import { createInitialBodies, M_EARTH } from '../bodies.js';

const YEARS        = 1000;
const SEC_PER_YEAR = 365.25 * 86400;
const SIM_SEC      = YEARS * SEC_PER_YEAR;

function bindingEnergy(moon, qaia) {
  const dx = moon.x - qaia.x, dy = moon.y - qaia.y;
  const dvx = moon.vx - qaia.vx, dvy = moon.vy - qaia.vy;
  return 0.5 * (dvx*dvx + dvy*dvy) - G * M_EARTH / Math.sqrt(dx*dx + dy*dy);
}

const bodies  = createInitialBodies();
const qaia    = bodies[1];
// Remove Primus (index 2) by zeroing its mass so forces are negligible
// (splicing would shift indices; zeroing is cleaner)
bodies[2].mass = 0;

const moonIndices = [3, 4, 5, 6, 7]; // Secundus through Septimus

console.log(`Running ${YEARS} years without Primus...`);

const sim   = new Simulation(bodies);
const steps = Math.ceil(SIM_SEC / sim.dt);

let result = `all stable > ${YEARS} yr`;
for (let i = 0; i < steps; i++) {
  sim._step();
  for (const idx of moonIndices) {
    if (bindingEnergy(bodies[idx], qaia) > 0) {
      result = `${bodies[idx].name} escaped at ${(sim.time / SEC_PER_YEAR).toFixed(1)} yr`;
      break;
    }
  }
  if (result !== `all stable > ${YEARS} yr`) break;
}
console.log(result);
