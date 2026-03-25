// resonance_check.mjs — verify Laplace resonance angle stays stable over 200 yr
// Run with: node tests/resonance_check.mjs

import { Simulation } from '../simulation.js';
import { createInitialBodies } from '../bodies.js';

const YEAR = 365.25 * 86400;
const sim  = new Simulation(createInitialBodies());

const tiamat = sim.bodies.find(b => b.name === 'Tiamat');
const red    = sim.bodies.find(b => b.name === 'Red');
const blue   = sim.bodies.find(b => b.name === 'Blue');
const green  = sim.bodies.find(b => b.name === 'Green');

function rawAngle(moon) {
  return Math.atan2(moon.y - tiamat.y, moon.x - tiamat.x);
}

// Track cumulative (unwrapped) angles so φ doesn't jump at ±180°
let cumRed   = rawAngle(red);
let cumBlue  = rawAngle(blue);
let cumGreen = rawAngle(green);
let prevRed  = cumRed, prevBlue = cumBlue, prevGreen = cumGreen;

function unwrap(prev, curr) {
  let d = curr - prev;
  if (d >  Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return prev + d;
}

function advanceAndUpdateAngles(steps) {
  // Sample every 40 steps (4 h) → Red moves ~34° per sample, safe to unwrap.
  // (400-step interval was wrong: Red's ~1.77-day period = ~424 steps, so
  //  each sample covered ~339° and the unwrapper aliased it to −21°.)
  const sampleInterval = 40;
  for (let i = 0; i < steps; i += sampleInterval) {
    const n = Math.min(sampleInterval, steps - i);
    sim.advance(n, n + 1);
    cumRed   = unwrap(prevRed,   rawAngle(red));
    cumBlue  = unwrap(prevBlue,  rawAngle(blue));
    cumGreen = unwrap(prevGreen, rawAngle(green));
    prevRed = cumRed; prevBlue = cumBlue; prevGreen = cumGreen;
  }
}

// φ = λ_Red − 3λ_Blue + 2λ_Green
function phi() { return cumRed - 3 * cumBlue + 2 * cumGreen; }

function wrap(a) {
  a = a % (2 * Math.PI);
  if (a >  Math.PI) a -= 2 * Math.PI;
  if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

const phi0 = phi();
const stepsPerYear = Math.round(YEAR / sim.dt);

console.log(`Initial φ = ${(wrap(phi0) * 180 / Math.PI).toFixed(2)}°`);
console.log(`\nYear    φ (deg)   Δφ (deg)`);

let maxDrift = 0;
for (let yr = 10; yr <= 200; yr += 10) {
  advanceAndUpdateAngles(stepsPerYear * 10);
  const p    = phi();
  const diff = wrap(p - phi0) * 180 / Math.PI;
  maxDrift   = Math.max(maxDrift, Math.abs(diff));
  console.log(`${String(yr).padStart(4)}    ${(wrap(p) * 180 / Math.PI).toFixed(2).padStart(7)}   ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`);
}

console.log(`\nMax drift over 200 yr: ${maxDrift.toFixed(2)}°`);
