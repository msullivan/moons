// 1000-year stability test for the geo-primus system.
// Uses the real Simulation and createInitialBodies so the anchor is enforced.
import { G, Simulation } from '../simulation.js';
import { createInitialBodies, M_EARTH } from '../bodies.js';

const STEPS_PER_YEAR = Math.round(365.25 * 86400 / 360);  // 87,660
const CHECK_EVERY    = 100;  // years between reports
const MAX_YEARS      = 1000;

const bodies = createInitialBodies().filter(b => b.name !== 'Quintus');
const sim    = new Simulation(bodies);
const qaia   = bodies[1];

// Moons to check (skip Sun, Qaia, and anchored Primus)
const checkBodies = bodies.filter(b => !['Sun','Qaia','Primus','Quintus'].includes(b.name));

const escaped = {};

console.log('Testing', checkBodies.map(b => b.name).join(', '));
console.log('Steps per year:', STEPS_PER_YEAR.toLocaleString());
console.log();

const t0 = Date.now();
for (let yr = CHECK_EVERY; yr <= MAX_YEARS; yr += CHECK_EVERY) {
  sim.advance(STEPS_PER_YEAR * CHECK_EVERY, 999999);  // no trail recording

  for (const b of checkBodies) {
    if (escaped[b.name]) continue;
    const dx = b.x - qaia.x, dy = b.y - qaia.y, dz = b.z - qaia.z;
    const r  = Math.sqrt(dx*dx + dy*dy + dz*dz);
    const dvx = b.vx - qaia.vx, dvy = b.vy - qaia.vy, dvz = b.vz - qaia.vz;
    const eps = 0.5*(dvx*dvx + dvy*dvy + dvz*dvz) - G*M_EARTH/r;
    b._lastDist = r / 3.844e8;  // in LD
    b._lastEps  = eps;
    if (eps > 0) escaped[b.name] = yr;
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(0) + 's';
  const status  = checkBodies.map(b => {
    if (escaped[b.name]) return `ESCAPED@${escaped[b.name]}yr(${b._lastDist.toFixed(2)}LD)`;
    return 'ok';
  }).join('  ');
  console.log(`yr ${String(yr).padStart(4)}  [${elapsed}]  ${status}`);

  if (Object.keys(escaped).length === checkBodies.length) break;
}

console.log();
console.log('Energy drift:', sim.energyError().toExponential(2));
