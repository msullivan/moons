// Test stability with Primus mass reduced by 10× (0.002 M_moon).
// Runs for 1000 years, checks all moons for escape.

import { G, Simulation } from '../simulation.js';
import { createInitialBodies, M_EARTH } from '../bodies.js';

const YEARS        = 1000;
const SEC_PER_YEAR = 365.25 * 86400;
const SIM_SEC      = YEARS * SEC_PER_YEAR;
const MOON_INDICES = [2, 3, 4, 5, 6, 7];

function bindingEnergy(moon, qaia) {
  const dx = moon.x - qaia.x, dy = moon.y - qaia.y;
  const dvx = moon.vx - qaia.vx, dvy = moon.vy - qaia.vy;
  return 0.5 * (dvx*dvx + dvy*dvy) - G * M_EARTH / Math.sqrt(dx*dx + dy*dy);
}

const bodies = createInitialBodies();
const primus = bodies[2];
primus.mass /= 10;  // 0.02 → 0.002 M_moon
console.log(`Primus mass: 0.002 M_moon. Running ${YEARS} years...`);

const sim   = new Simulation(bodies);
const qaia  = bodies[1];
const steps = Math.ceil(SIM_SEC / sim.dt);

let result = `all stable > ${YEARS} yr`;
for (let i = 0; i < steps; i++) {
  sim._step();
  for (const idx of MOON_INDICES) {
    if (bindingEnergy(bodies[idx], qaia) > 0) {
      result = `${bodies[idx].name} escaped at ${(sim.time / SEC_PER_YEAR).toFixed(1)} yr`;
      break;
    }
  }
  if (result !== `all stable > ${YEARS} yr`) break;
}
console.log(result);
