// Sweep Secundus semi-major axis to find stable configurations with geo-primus.
// Primus is at geosynchronous 0.11 LD, mass 0.002 M_moon (anchored).
// Tests 1000 years per config, checks all moons for escape.

import { G, Simulation } from '../simulation.js';
import { createInitialBodies, M_EARTH } from '../bodies.js';

const STEPS_PER_YEAR = Math.round(365.25 * 86400 / 360);
const CHECK_INTERVAL = 100;  // years
const MAX_YEARS = 1000;
const LUNAR_DIST = 3.844e8;

function isEscaped(b, qaia) {
  const dx = b.x - qaia.x, dy = b.y - qaia.y;
  const r  = Math.sqrt(dx*dx + dy*dy);
  const dvx = b.vx - qaia.vx, dvy = b.vy - qaia.vy;
  return 0.5*(dvx*dvx + dvy*dvy) - G*M_EARTH/r > 0;
}

for (const sec_a of [0.24, 0.26, 0.28, 0.30, 0.32, 0.34, 0.36, 0.38]) {
  const bodies = createInitialBodies().filter(b => b.name !== 'Quintus');
  const qaia   = bodies[1];
  const sec    = bodies.find(b => b.name === 'Secundus');

  // Reposition Secundus at new semi-major axis (e=0.10 retrograde, periapsis at -y from Qaia)
  const e  = 0.10;
  const a  = sec_a * LUNAR_DIST;
  const rp = a * (1 - e);
  const vp = Math.sqrt(G * M_EARTH * (1 + e) / rp);
  sec.x  = qaia.x;  sec.y  = qaia.y - rp;
  sec.vx = -vp;     sec.vy = qaia.vy;

  const sim   = new Simulation(bodies);
  const moons = bodies.filter(b => !['Sun','Qaia','Primus','Quintus'].includes(b.name));
  const escaped = {};

  for (let yr = CHECK_INTERVAL; yr <= MAX_YEARS; yr += CHECK_INTERVAL) {
    sim.advance(STEPS_PER_YEAR * CHECK_INTERVAL, 999999);
    for (const b of moons) {
      if (!escaped[b.name] && isEscaped(b, qaia)) escaped[b.name] = yr;
    }
    if (Object.keys(escaped).length === moons.length) break;
  }

  const status = moons.map(b =>
    escaped[b.name] ? `${b.name}:GONE@${escaped[b.name]}` : `${b.name}:ok`
  ).join('  ');
  console.log(`sec@${sec_a.toFixed(2)}  ${status}  drift:${sim.energyError().toExponential(1)}`);
}
