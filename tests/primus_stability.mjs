// Test how far out Primus can be placed while the whole moon system stays stable.
// Sweeps PRIMUS_A in 0.01 LD steps; each run is 1000 years.
// Exits early if any moon escapes Qaia.

import { G, Simulation } from '../simulation.js';
import { createInitialBodies, LUNAR_DIST, M_EARTH } from '../bodies.js';

const YEARS        = 1000;
const SEC_PER_YEAR = 365.25 * 86400;
const SIM_SEC      = YEARS * SEC_PER_YEAR;

// Indices in createInitialBodies(): 0=Sun,1=Qaia,2=Primus,3=Secundus,4=Tertius,5=Quartus,6=Sextus,7=Septimus
const MOON_INDICES = [2, 3, 4, 5, 6, 7];

function bindingEnergy(moon, qaia) {
  const dx  = moon.x - qaia.x,  dy  = moon.y - qaia.y;
  const dvx = moon.vx - qaia.vx, dvy = moon.vy - qaia.vy;
  const r   = Math.sqrt(dx*dx + dy*dy);
  return 0.5 * (dvx*dvx + dvy*dvy) - G * M_EARTH / r;
}

function testPrimus(a_LD) {
  const bodies = createInitialBodies();
  const qaia   = bodies[1];
  const primus = bodies[2];

  // Place Primus on a retrograde orbit at the new semi-major axis (e=0.10).
  // Periapsis at −x from Qaia; retrograde velocity in +y.
  const e  = 0.10;
  const a  = a_LD * LUNAR_DIST;
  const rp = a * (1 - e);
  const vp = Math.sqrt(G * M_EARTH * (1 + e) / rp);
  primus.x  = qaia.x - rp;  primus.y  = qaia.y;  primus.z  = 0;
  primus.vx = qaia.vx;      primus.vy = qaia.vy + vp;  primus.vz = 0;

  const sim   = new Simulation(bodies);
  const steps = Math.ceil(SIM_SEC / sim.dt);

  for (let i = 0; i < steps; i++) {
    sim._step();
    for (const idx of MOON_INDICES) {
      if (bindingEnergy(bodies[idx], qaia) > 0) {
        return { escaped: bodies[idx].name, tEscape: sim.time / SEC_PER_YEAR };
      }
    }
  }
  return { escaped: null };
}

const TEST_A = [];
for (let a = 0.12; a <= 0.201; a += 0.01) TEST_A.push(+a.toFixed(2));

console.log(`Primus stability sweep — ${YEARS}-year runs, e=0.10, retrograde`);
console.log(`Checking all moons for escape.\n`);
console.log('  a (LD)   result');
for (const a of TEST_A) {
  const { escaped, tEscape } = testPrimus(a);
  const status = escaped
    ? `${escaped} escaped at ${tEscape.toFixed(1)} yr`
    : `all stable > ${YEARS} yr`;
  console.log(`  ${a.toFixed(2)} LD   ${status}`);
}
