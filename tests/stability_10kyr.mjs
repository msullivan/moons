// stability_10kyr.mjs — 10,000-year stability run using the live sim classes
// Run with: node tests/stability_10kyr.mjs

import { Simulation, G } from '../simulation.js';
import { createInitialBodies, LUNAR_DIST } from '../bodies.js';

const YEAR          = 365.25 * 86400;
const MAX_YEARS     = 10_000;
const CHECK_EVERY   = 10;   // years between binding-energy checks
const PRINT_EVERY   = 100;  // years between progress lines

const sim = new Simulation(createInitialBodies());

const stepsPerCheck = Math.round(CHECK_EVERY * YEAR / sim.dt);
const totalSteps    = Math.round(MAX_YEARS  * YEAR / sim.dt);

const qaia  = sim.bodies[1];
// Primus (idx 2) is magically anchored — skip.  Quintus (idx 8) is a trace particle — skip.
const moons = [
  sim.bodies[3],  // Secundus  0.30 LD retrograde
  sim.bodies[4],  // Tertius   0.45 LD prograde
  sim.bodies[5],  // Quartus   1.00 LD prograde
  sim.bodies[6],  // Sextus    1.65 LD retrograde
  sim.bodies[7],  // Septimus  2.10 LD retrograde
];

function eps(moon) {
  const dx = moon.x - qaia.x, dy = moon.y - qaia.y, dz = moon.z - qaia.z;
  const r  = Math.sqrt(dx*dx + dy*dy + dz*dz);
  const dvx = moon.vx - qaia.vx, dvy = moon.vy - qaia.vy, dvz = moon.vz - qaia.vz;
  return 0.5*(dvx*dvx + dvy*dvy + dvz*dvz) - G*qaia.mass/r;
}

function dist_LD(moon) {
  const dx = moon.x - qaia.x, dy = moon.y - qaia.y, dz = moon.z - qaia.z;
  return Math.sqrt(dx*dx + dy*dy + dz*dz) / LUNAR_DIST;
}

console.log(`=== 10,000-year stability simulation ===`);
console.log(`dt=${sim.dt}s (${sim.dt/60} min)  check every ${CHECK_EVERY} yr`);
console.log(`total steps: ${totalSteps.toLocaleString()}\n`);

console.log('Initial state:');
for (const m of moons) {
  const e = eps(m);
  console.log(`  ${m.name.padEnd(10)} r=${dist_LD(m).toFixed(3)} LD  eps=${e.toExponential(3)}  ${e < 0 ? 'bound' : 'UNBOUND!'}`);
}
console.log('');

const escaped = {};   // name → year of escape
const t0 = Date.now();

for (let yr = CHECK_EVERY; yr <= MAX_YEARS; yr += CHECK_EVERY) {
  for (let s = 0; s < stepsPerCheck; s++) sim._step();

  // Check each still-bound moon
  for (const m of moons) {
    if (escaped[m.name] !== undefined) continue;
    if (eps(m) > 0) {
      console.log(`yr ${String(yr).padStart(5)}: ${m.name} ESCAPED  r=${dist_LD(m).toFixed(2)} LD`);
      escaped[m.name] = yr;
    }
  }

  // Periodic progress line
  if (yr % PRINT_EVERY === 0) {
    const sec  = ((Date.now() - t0) / 1000).toFixed(0);
    const live = moons.filter(m => escaped[m.name] === undefined);
    const str  = live.map(m => `${m.name}:${dist_LD(m).toFixed(2)}LD`).join('  ');
    console.log(`yr ${String(yr).padStart(5)}  [${sec}s]  ${str || '(none left)'}`);
  }

  if (Object.keys(escaped).length === moons.length) {
    console.log('\nAll moons escaped — stopping early.');
    break;
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\nFinished in ${elapsed}s\n`);

console.log('=== Summary ===');
for (const m of moons) {
  if (escaped[m.name] !== undefined) {
    console.log(`  ${m.name.padEnd(10)}: escaped ~yr ${escaped[m.name]}`);
  } else {
    console.log(`  ${m.name.padEnd(10)}: stable past ${MAX_YEARS} yr ✓`);
  }
}
