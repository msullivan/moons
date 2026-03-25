import { Simulation } from '../simulation.js';
import { createInitialBodies, AU, M_SUN } from '../bodies.js';
import { G } from '../simulation.js';

const YEAR = 365.25 * 86400;

const sim = new Simulation(createInitialBodies());
const bodies = sim.bodies;

// Track Qaia (index 1) position over time
const qaia = bodies[1];
const sun  = bodies[0];

// Find crossing: when Qaia passes through y=0 heading in +y direction (one orbit)
// We'll record the angle after each simulated year
const stepsPerYear = Math.round(YEAR / sim.dt);
console.log('steps per year:', stepsPerYear);
console.log('dt:', sim.dt, 's');
console.log('T_keplerian:', (2 * Math.PI * Math.sqrt(AU**3 / (G * M_SUN)) / 86400).toFixed(4), 'days');

for (let yr = 1; yr <= 205; yr++) {
  for (let i = 0; i < stepsPerYear; i++) sim._step();
  const dx = qaia.x - sun.x, dy = qaia.y - sun.y;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  if (yr <= 5 || yr % 50 === 0 || yr >= 198) {
    console.log(`Year ${yr}: angle ${angle.toFixed(2)}°, r=${Math.hypot(dx,dy).toExponential(3)}`);
  }
}
