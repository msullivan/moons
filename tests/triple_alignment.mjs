// triple_alignment.mjs — find triple-moon alignment dates (Secundus+Tertius+Quartus)
// for 10 years starting from the 2253 snapshot.
// Run with: node tests/triple_alignment.mjs

import { readFileSync } from 'fs';
import { Simulation } from '../simulation.js';
import { createInitialBodies, applySnapshot } from '../bodies.js';

const START_DATE = new Date('2253-01-01T00:00:00Z');
const years      = Number(process.argv[2] ?? 10);
const DURATION   = years * 365.25 * 86400;  // seconds

const snapshot = JSON.parse(readFileSync(new URL('../state_200yr.json', import.meta.url)));
const bodies   = createInitialBodies();
applySnapshot(bodies, snapshot);
const sim = new Simulation(bodies);

// Body indices
const SUN = 0, QAIA = 1, SEC = 3, TER = 4, QUA = 5;

function elongation(moon, qaia, sun) {
  const dmx = moon.x - qaia.x, dmy = moon.y - qaia.y;
  const dsx = sun.x  - qaia.x, dsy = sun.y  - qaia.y;
  const cos = Math.max(-1, Math.min(1,
    (dmx*dsx + dmy*dsy) / (Math.hypot(dmx, dmy) * Math.hypot(dsx, dsy))
  ));
  return Math.acos(cos); // 0 = new, π = full
}

// Illuminated fraction: 0 = new moon, 1 = full moon
function illum(elong) { return (1 - Math.cos(elong)) / 2; }

// Distance from nearest syzygy: 0 = perfect new/full, 0.5 = quarter
function syzDev(f) { return Math.min(f, 1 - f); }

const SAMPLE_S       = 6 * 3600;              // sample every 6 hours
const stepsPerSample = Math.round(SAMPLE_S / sim.dt);

const records = [];
let elapsed = 0;

while (elapsed < DURATION) {
  sim.advance(stepsPerSample, stepsPerSample + 1, null);
  elapsed += SAMPLE_S;

  const sun = sim.bodies[SUN], qaia = sim.bodies[QAIA];
  const fS = illum(elongation(sim.bodies[SEC], qaia, sun));
  const fT = illum(elongation(sim.bodies[TER], qaia, sun));
  const fQ = illum(elongation(sim.bodies[QUA], qaia, sun));

  // Overall score: worst individual distance from nearest syzygy
  const score = Math.max(syzDev(fS), syzDev(fT), syzDev(fQ));
  records.push({ elapsed, score, fS, fT, fQ });
}

// Find local minima below 5% threshold
const THRESHOLD = 0.05;
const events = [];

for (let i = 1; i < records.length - 1; i++) {
  const r = records[i];
  if (r.score < THRESHOLD &&
      r.score <= records[i-1].score &&
      r.score <= records[i+1].score) {

    const date = new Date(START_DATE.getTime() + r.elapsed * 1000);
    const nFull = [r.fS, r.fT, r.fQ].filter(f => f >= 0.5).length;
    const type  = nFull === 3 ? 'full' : nFull === 0 ? 'new' : 'mixed';
    events.push({ date, type, score: r.score, fS: r.fS, fT: r.fT, fQ: r.fQ });
  }
}

// Print
const endYear = 2253 + years;
console.log(`Triple-moon alignments (Secundus + Tertius + Quartus), 2253–${endYear}`);
console.log('All three moons within 5% of full or new  (** = within 1%)\n');
console.log('Date        Type   Score   Sec     Ter     Qua');
console.log('─'.repeat(56));

for (const e of events.filter(e => e.type !== 'mixed')) {
  const mark = e.score < 0.01 ? '**' : '  ';
  const ds   = e.date.toISOString().slice(0, 10);
  const fmtF = f => (f * 100).toFixed(1).padStart(5) + '%';
  console.log(`${mark}${ds}  ${e.type.padEnd(5)}  ${e.score.toFixed(4)}  ${fmtF(e.fS)}  ${fmtF(e.fT)}  ${fmtF(e.fQ)}`);
}

const nFull  = events.filter(e => e.type === 'full').length;
const nNew   = events.filter(e => e.type === 'new').length;
const nMixed = events.filter(e => e.type === 'mixed').length;
const nBest  = events.filter(e => e.score < 0.01).length;
console.log(`\n${events.length} events total: ${nFull} all-full, ${nNew} all-new, ${nMixed} mixed  (${nBest} within 1%)`);
