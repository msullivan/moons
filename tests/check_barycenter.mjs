// Compare angle of Qaia vs Qaia-Quartus barycenter over time
import { Simulation } from '../simulation.js';
import { createInitialBodies, M_EARTH, M_MOON } from '../bodies.js';

const YEAR = 365.25 * 86400;
const stepsPerYear = Math.round(YEAR / 360);

const sim = new Simulation(createInitialBodies());
const sun     = sim.bodies[0];
const qaia    = sim.bodies[1];
const quartus = sim.bodies[5];

const M_QQ = M_EARTH + M_MOON;

console.log('yr | Qaia angle | Barycenter angle | diff');
for (let yr = 0; yr <= 10; yr++) {
  if (yr > 0) for (let i = 0; i < stepsPerYear; i++) sim._step();

  const bx = (M_EARTH * qaia.x + M_MOON * quartus.x) / M_QQ;
  const by = (M_EARTH * qaia.y + M_MOON * quartus.y) / M_QQ;
  const qAngle = Math.atan2(qaia.y - sun.y, qaia.x - sun.x) * 180 / Math.PI;
  const bAngle = Math.atan2(by - sun.y, bx - sun.x) * 180 / Math.PI;

  console.log(`${yr.toString().padStart(3)} | ${qAngle.toFixed(4).padStart(10)} | ${bAngle.toFixed(4).padStart(16)} | ${(qAngle - bAngle).toFixed(4)}`);
}
