// Sweep Primus mass from 0.002 to 0.020 M_moon.
// For each mass, run N_TRIALS with Primus starting at evenly-spaced orbital phases.
// Report how many trials remain stable over 1000 years.
// (Single runs are unreliable due to chaos; multiple phases give a better picture.)

import { G, Simulation } from '../simulation.js';
import { createInitialBodies, LUNAR_DIST, M_EARTH, M_MOON } from '../bodies.js';

const YEARS        = 1000;
const SEC_PER_YEAR = 365.25 * 86400;
const SIM_SEC      = YEARS * SEC_PER_YEAR;
const MOON_INDICES = [2, 3, 4, 5, 6, 7];
const N_TRIALS     = 4; // starting phases: 0°, 90°, 180°, 270°

function bindingEnergy(moon, qaia) {
  const dx = moon.x - qaia.x, dy = moon.y - qaia.y;
  const dvx = moon.vx - qaia.vx, dvy = moon.vy - qaia.vy;
  return 0.5 * (dvx*dvx + dvy*dvy) - G * M_EARTH / Math.sqrt(dx*dx + dy*dy);
}

function runTrial(massFrac, phaseRad) {
  const bodies = createInitialBodies();
  const qaia   = bodies[1];
  const primus = bodies[2];

  // Place Primus at the given orbital phase (angle from Qaia), retrograde, e=0.10
  const e  = 0.10;
  const a  = 0.12 * LUNAR_DIST;
  const rp = a * (1 - e);
  const vp = Math.sqrt(G * M_EARTH * (1 + e) / rp);

  primus.mass = massFrac * M_MOON;
  primus.x  = qaia.x + rp * Math.cos(phaseRad);
  primus.y  = qaia.y + rp * Math.sin(phaseRad);
  primus.z  = 0;
  // Retrograde circular velocity perpendicular to radius, clockwise
  primus.vx = qaia.vx + vp * Math.sin(phaseRad);
  primus.vy = qaia.vy - vp * Math.cos(phaseRad);
  primus.vz = 0;

  const sim   = new Simulation(bodies);
  const steps = Math.ceil(SIM_SEC / sim.dt);

  for (let i = 0; i < steps; i++) {
    sim._step();
    for (const idx of MOON_INDICES) {
      if (bindingEnergy(bodies[idx], qaia) > 0) {
        return { stable: false, escaped: bodies[idx].name, t: sim.time / SEC_PER_YEAR };
      }
    }
  }
  return { stable: true };
}

const masses = [];
for (let m = 0.002; m <= 0.0201; m += 0.002) masses.push(+m.toFixed(3));

console.log(`Primus mass sweep — ${YEARS}-year runs, ${N_TRIALS} phases each\n`);
console.log('  mass (M_moon)   stable/trials   notes');

for (const mf of masses) {
  const results = [];
  for (let t = 0; t < N_TRIALS; t++) {
    const phase = (2 * Math.PI * t) / N_TRIALS;
    results.push(runTrial(mf, phase));
  }
  const nStable = results.filter(r => r.stable).length;
  const escapes = results.filter(r => !r.stable)
    .map(r => `${r.escaped} @${r.t.toFixed(0)}yr`).join(', ');
  const notes = escapes || 'all clear';
  console.log(`  ${mf.toFixed(3)}           ${nStable}/${N_TRIALS}             ${notes}`);
}
