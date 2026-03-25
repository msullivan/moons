// Check: sample at 1/4-year intervals to see if drift is secular or aliased oscillation
import { Simulation } from '../simulation.js';
import { createInitialBodies } from '../bodies.js';

const YEAR = 365.25 * 86400;
const dt = 360;
const stepsPerYear = Math.round(YEAR / dt);
const stepsPerQtr  = Math.round(YEAR / 4 / dt);

const sim = new Simulation(createInitialBodies());
const qaia = sim.bodies[1], sun = sim.bodies[0];

console.log('Sampling at 0.25-year intervals for 10 years:');
for (let i = 0; i <= 40; i++) {
  if (i > 0) for (let s = 0; s < stepsPerQtr; s++) sim._step();
  const dx = qaia.x - sun.x, dy = qaia.y - sun.y;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  console.log(`t=${( i * 0.25).toFixed(2).padStart(5)}yr: ${angle.toFixed(4)}°`);
}
