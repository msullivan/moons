// stability_sweep.mjs — parameter sweep for Secundus/Tertius/Quartus stability
// Run with: node tests/stability_sweep.mjs [years]   (default 500)
//
// Tertius mass_frac is held at 0.18 or below.
// Varies: Secundus mass & distance, Tertius mass & distance, Quartus distance.
// Runs configs in parallel using worker threads (batch of 10).
//
// === Results (2000 yr, 2026-03-18) ===
// All 10 below stable past 2000 yr. Original: sec 0.04@0.30, ter 0.25@0.45, qrt@1.00.
//
//   #  sec_mf sec_a  ter_mf ter_a  qrt_a  notes
//   1) 0.04   0.25   0.18   0.45   1.00   minimal changes
//   2) 0.04   0.22   0.18   0.45   1.00   Sec further in
//   3) 0.04   0.25   0.15   0.45   1.00   Ter smaller
//   4) 0.04   0.22   0.15   0.45   1.00   Sec further in + Ter smaller
//   5) 0.04   0.25   0.125  0.45   1.00   Ter at half original mass
//   6) 0.06   0.25   0.125  0.45   1.00   heavier Sec compensates
//   7) 0.04   0.30   0.18   0.45   1.05   keep Sec@0.30 but push Qrt out
//   8) 0.04   0.30   0.18   0.43   1.00   keep Sec@0.30 but pull Ter in
//   9) 0.04   0.25   0.125  0.45   1.05   belt+suspenders
//  10) 0.06   0.25   0.125  0.45   1.05   belt+suspenders + heavier Sec
//
// #7 and #8 are the only ones keeping Secundus at 0.30 LD (require ter_mf=0.18).
// #1 is simplest: just move Sec to 0.25 LD, set Ter to 0.18.

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';
import { Simulation, G } from '../simulation.js';
import { M_MOON, R_MOON, M_EARTH, M_SUN, AU, LUNAR_DIST, QAIA_SIDEREAL_DAY, PRIMUS_A, PRIMUS_INCLINATION, QUARTUS_INCLINATION, M_JUPITER, R_JUPITER, M_SATURN, R_SATURN, R_EARTH } from '../bodies.js';
import { Body } from '../simulation.js';

const YEAR = 365.25 * 86400;
const CHECK_EVERY = 10;   // years
const MAX_YEARS   = parseInt(process.argv[2]) || 500;

// Build a full system with custom Secundus/Tertius params
function makeSystem({ sec_mf, sec_a, ter_mf, ter_a, qrt_a }) {
  // Override MOON_PARAMS for the three moons we're tweaking
  const overrides = {
    Secundus: { mass_frac: sec_mf, a_LD: sec_a },
    Tertius:  { mass_frac: ter_mf, a_LD: ter_a },
    Quartus:  { mass_frac: 1.00,   a_LD: qrt_a },
  };

  const _mu = G * M_EARTH;

  // Rebuild MOON_PARAMS with overrides
  const baseParams = [
    { name: 'Primus',   mass_frac: 0.0001, density_ratio: 2, a_LD: PRIMUS_A / LUNAR_DIST, e: 0,    prograde: true,  isAnchor: true,  inc_deg: 23.5, albedo: 0.06, color: '#4466CC', trailMaxLen: 300 },
    { name: 'Secundus', mass_frac: sec_mf, density_ratio: 2, a_LD: sec_a,                  e: 0.10, prograde: false, isAnchor: false, inc_deg:  8.0, albedo: 0.06, color: '#88CCAA', trailMaxLen: 500 },
    { name: 'Tertius',  mass_frac: ter_mf, density_ratio: 1.4, a_LD: ter_a,                e: 0.10, prograde: true,  isAnchor: false, inc_deg:  3.0, albedo: 0.12, color: '#CC9966', trailMaxLen: 1400 },
    { name: 'Quartus',  mass_frac: 1.00,   density_ratio: 1, a_LD: qrt_a,                  e: 0.10, prograde: true,  isAnchor: false, inc_deg:  5.14,albedo: 0.12, color: '#CCCCCC', trailMaxLen: 1400 },
    { name: 'Sextus',   mass_frac: 0.01,   density_ratio: 1, a_LD: 1.60,                   e: 0.10, prograde: false, isAnchor: false, inc_deg: 18.0, albedo: 0.09, color: '#AA88FF', trailMaxLen: 1800 },
    { name: 'Septimus', mass_frac: 0.01,   density_ratio: 1, a_LD: 2.10,                   e: 0.10, prograde: false, isAnchor: false, inc_deg: 22.0, albedo: 0.09, color: '#FF88AA', trailMaxLen: 2200 },
  ].map(m => ({
    ...m,
    M: m.mass_frac * M_MOON,
    R: R_MOON * Math.cbrt(m.mass_frac / m.density_ratio),
    a: m.a_LD * LUNAR_DIST,
    T_d: m.isAnchor
      ? QAIA_SIDEREAL_DAY / 86400
      : 2 * Math.PI * Math.sqrt((m.a_LD * LUNAR_DIST) ** 3 / _mu) / 86400,
  }));

  const mp = Object.fromEntries(baseParams.map(m => [m.name, m]));
  const vp = m => Math.sqrt(_mu * (1 + m.e) / (m.a * (1 - m.e)));
  const rp = m => m.a * (1 - m.e);
  const v_earth = Math.sqrt(G * M_SUN / AU);

  const PRIMUS_OMEGA = 2 * Math.PI / QAIA_SIDEREAL_DAY;
  const PRIMUS_PHASE = 0;
  const R_SUN = 6.96e8;

  const QATURN_A = 0.10 * AU;
  const QUPITER_A = 5.46 * AU;
  const v_qupiter = Math.sqrt(G * M_SUN / QUPITER_A);
  const mu_J = G * M_JUPITER;

  const A_IO = 4.218e8;
  const A_EUROPA = A_IO * Math.pow(2, 2/3);
  const A_GANYMEDE = A_IO * Math.pow(4, 2/3);
  const A_CALLISTO = 1.8827e9;
  const E_IO = 0.0041, E_EUROPA = 0.0094, E_GANYMEDE = 0.0013, E_CALLISTO = 0.0074;
  const v_io  = Math.sqrt(mu_J * (1+E_IO)/(A_IO*(1-E_IO)));
  const v_eur = Math.sqrt(mu_J * (1+E_EUROPA)/(A_EUROPA*(1-E_EUROPA)));
  const v_gan = Math.sqrt(mu_J * (1+E_GANYMEDE)/(A_GANYMEDE*(1-E_GANYMEDE)));
  const v_cal = Math.sqrt(mu_J * (1+E_CALLISTO)/(A_CALLISTO*(1-E_CALLISTO)));

  const VRITRA_PHASE = 40 * Math.PI / 180;
  const TIAMAT_PHASE = 160 * Math.PI / 180;
  const BAHAMUT_PHASE = 240 * Math.PI / 180;
  const cosT = Math.cos(TIAMAT_PHASE), sinT = Math.sin(TIAMAT_PHASE);
  const PI23 = 2 * Math.PI / 3;
  const M_QUINTUS = 1;
  const R_QUINTUS = R_MOON * Math.cbrt(0.1);
  const QI = QUARTUS_INCLINATION;

  const M_IO_kg = 8.932e22, R_IO_m = 1.822e6;
  const M_EUROPA_kg = 4.800e22, R_EUROPA_m = 1.561e6;
  const M_GANYMEDE_kg = 1.482e23, R_GANYMEDE_m = 2.631e6;
  const M_CALLISTO_kg = 1.076e23, R_CALLISTO_m = 2.410e6;

  const bodies = [
    new Body({ name: 'Sun', mass: M_SUN, x: 0, y: 0, vx: 0, vy: 0, physicalRadius: R_SUN, minDisplayPx: 14, color: '#FFD700', trailColor: '#FFD70050', trailMaxLen: 600 }),
    new Body({ name: 'Qaia', mass: M_EARTH, x: AU, y: 0, vx: 0, vy: v_earth, physicalRadius: R_EARTH, minDisplayPx: 6, color: '#4499FF', trailColor: '#4499FF', trailMaxLen: 2500 }),
    new Body({ name: 'Primus', mass: mp.Primus.M,
      x: AU + PRIMUS_A * Math.cos(PRIMUS_PHASE) * Math.cos(PRIMUS_INCLINATION),
      y: PRIMUS_A * Math.sin(PRIMUS_PHASE),
      z: -PRIMUS_A * Math.cos(PRIMUS_PHASE) * Math.sin(PRIMUS_INCLINATION),
      vx: -PRIMUS_A * PRIMUS_OMEGA * Math.sin(PRIMUS_PHASE) * Math.cos(PRIMUS_INCLINATION),
      vy: v_earth + PRIMUS_A * PRIMUS_OMEGA * Math.cos(PRIMUS_PHASE),
      vz: PRIMUS_A * PRIMUS_OMEGA * Math.sin(PRIMUS_PHASE) * Math.sin(PRIMUS_INCLINATION),
      physicalRadius: mp.Primus.R, minDisplayPx: 3, color: mp.Primus.color, trailColor: mp.Primus.color, trailMaxLen: mp.Primus.trailMaxLen,
      anchor: { toIndex: 1, radius: PRIMUS_A, omega: PRIMUS_OMEGA, phase: PRIMUS_PHASE, inclination: PRIMUS_INCLINATION }, parentName: 'Qaia' }),
    new Body({ name: 'Secundus', mass: mp.Secundus.M,
      x: AU, y: -rp(mp.Secundus), z: 0,
      vx: -vp(mp.Secundus) * Math.cos(mp.Secundus.inc_deg * Math.PI / 180), vy: v_earth,
      vz: vp(mp.Secundus) * Math.sin(mp.Secundus.inc_deg * Math.PI / 180),
      physicalRadius: mp.Secundus.R, minDisplayPx: 3, color: mp.Secundus.color, trailColor: mp.Secundus.color, trailMaxLen: mp.Secundus.trailMaxLen, parentName: 'Qaia' }),
    new Body({ name: 'Tertius', mass: mp.Tertius.M,
      x: AU, y: rp(mp.Tertius), z: 0,
      vx: -vp(mp.Tertius) * Math.cos(mp.Tertius.inc_deg * Math.PI / 180), vy: v_earth,
      vz: vp(mp.Tertius) * Math.sin(mp.Tertius.inc_deg * Math.PI / 180),
      physicalRadius: mp.Tertius.R, minDisplayPx: 3, color: mp.Tertius.color, trailColor: mp.Tertius.color, trailMaxLen: mp.Tertius.trailMaxLen, parentName: 'Qaia' }),
    new Body({ name: 'Quartus', mass: mp.Quartus.M,
      x: AU + mp.Quartus.a, y: 0, z: 0,
      vx: 0, vy: v_earth + Math.sqrt(_mu / mp.Quartus.a) * Math.cos(QI),
      vz: Math.sqrt(_mu / mp.Quartus.a) * Math.sin(QI),
      physicalRadius: mp.Quartus.R, minDisplayPx: 3, color: mp.Quartus.color, trailColor: mp.Quartus.color, trailMaxLen: mp.Quartus.trailMaxLen, parentName: 'Qaia' }),
    new Body({ name: 'Sextus', mass: mp.Sextus.M,
      x: AU, y: rp(mp.Sextus), z: 0,
      vx: vp(mp.Sextus) * Math.cos(mp.Sextus.inc_deg * Math.PI / 180), vy: v_earth,
      vz: vp(mp.Sextus) * Math.sin(mp.Sextus.inc_deg * Math.PI / 180),
      physicalRadius: mp.Sextus.R, minDisplayPx: 3, color: mp.Sextus.color, trailColor: mp.Sextus.color, trailMaxLen: mp.Sextus.trailMaxLen, parentName: 'Qaia' }),
    new Body({ name: 'Septimus', mass: mp.Septimus.M,
      x: AU, y: -rp(mp.Septimus), z: 0,
      vx: -vp(mp.Septimus) * Math.cos(mp.Septimus.inc_deg * Math.PI / 180), vy: v_earth,
      vz: vp(mp.Septimus) * Math.sin(mp.Septimus.inc_deg * Math.PI / 180),
      physicalRadius: mp.Septimus.R, minDisplayPx: 3, color: mp.Septimus.color, trailColor: mp.Septimus.color, trailMaxLen: mp.Septimus.trailMaxLen, parentName: 'Qaia' }),
    new Body({ name: 'Quintus', mass: M_QUINTUS,
      x: AU * Math.cos(Math.PI/3), y: -AU * Math.sin(Math.PI/3),
      vx: v_earth * Math.sin(Math.PI/3), vy: v_earth * Math.cos(Math.PI/3),
      physicalRadius: R_QUINTUS, minDisplayPx: 4, color: '#FFDD55', trailColor: '#FFDD55', trailMaxLen: 2500 }),
    new Body({ name: 'Bahamut', mass: M_SATURN,
      x: QATURN_A * Math.cos(BAHAMUT_PHASE), y: QATURN_A * Math.sin(BAHAMUT_PHASE),
      vx: -Math.sqrt(G * M_SUN / QATURN_A) * Math.sin(BAHAMUT_PHASE),
      vy: Math.sqrt(G * M_SUN / QATURN_A) * Math.cos(BAHAMUT_PHASE),
      physicalRadius: R_SATURN, minDisplayPx: 8, color: '#E8D080', trailColor: '#E8D080', trailMaxLen: 800 }),
    new Body({ name: 'Vritra', mass: 3 * M_EARTH,
      x: 1.52 * AU * Math.cos(VRITRA_PHASE), y: 1.52 * AU * Math.sin(VRITRA_PHASE),
      vx: -Math.sqrt(G * M_SUN / (1.52 * AU)) * Math.sin(VRITRA_PHASE),
      vy: Math.sqrt(G * M_SUN / (1.52 * AU)) * Math.cos(VRITRA_PHASE),
      physicalRadius: R_EARTH * Math.pow(3, 1/3), minDisplayPx: 5, color: '#C1440E', trailColor: '#C1440E', trailMaxLen: 2000 }),
    new Body({ name: 'Tiamat', mass: M_JUPITER,
      x: QUPITER_A * cosT, y: QUPITER_A * sinT,
      vx: -v_qupiter * sinT, vy: v_qupiter * cosT,
      physicalRadius: R_JUPITER, minDisplayPx: 10, color: '#C88B3A', trailColor: '#C88B3A', trailMaxLen: 3000 }),
    new Body({ name: 'Red', mass: M_IO_kg,
      x: QUPITER_A * cosT + A_IO * (1-E_IO), y: QUPITER_A * sinT,
      vx: -v_qupiter * sinT, vy: v_qupiter * cosT + v_io,
      physicalRadius: R_IO_m, minDisplayPx: 3, color: '#CC3322', trailColor: '#CC3322', trailMaxLen: 400, parentName: 'Tiamat' }),
    new Body({ name: 'Blue', mass: M_EUROPA_kg,
      x: QUPITER_A * cosT + A_EUROPA * (1-E_EUROPA), y: QUPITER_A * sinT,
      vx: -v_qupiter * sinT, vy: v_qupiter * cosT + v_eur,
      physicalRadius: R_EUROPA_m, minDisplayPx: 3, color: '#4488CC', trailColor: '#4488CC', trailMaxLen: 500, parentName: 'Tiamat' }),
    new Body({ name: 'Green', mass: M_GANYMEDE_kg,
      x: QUPITER_A * cosT, y: QUPITER_A * sinT + A_GANYMEDE * (1-E_GANYMEDE),
      vx: -v_qupiter * sinT - v_gan, vy: v_qupiter * cosT,
      physicalRadius: R_GANYMEDE_m, minDisplayPx: 3, color: '#448833', trailColor: '#448833', trailMaxLen: 600, parentName: 'Tiamat' }),
    new Body({ name: 'White', mass: M_CALLISTO_kg,
      x: QUPITER_A * cosT - A_CALLISTO * (1-E_CALLISTO), y: QUPITER_A * sinT,
      vx: -v_qupiter * sinT, vy: v_qupiter * cosT - v_cal,
      physicalRadius: R_CALLISTO_m, minDisplayPx: 3, color: '#DDDDEE', trailColor: '#DDDDEE', trailMaxLen: 700, parentName: 'Tiamat' }),
  ];

  // Parent recoil
  const bodyByName = Object.fromEntries(bodies.map(b => [b.name, b]));
  const childrenOf = {};
  for (const b of bodies) {
    if (b.parentName) (childrenOf[b.parentName] ??= []).push(b);
  }
  for (const [parentName, children] of Object.entries(childrenOf)) {
    const parent = bodyByName[parentName];
    if (!parent) continue;
    const v0x = parent.vx, v0y = parent.vy, v0z = parent.vz;
    for (const child of children) {
      parent.vx -= (child.mass / parent.mass) * (child.vx - v0x);
      parent.vy -= (child.mass / parent.mass) * (child.vy - v0y);
      parent.vz -= (child.mass / parent.mass) * (child.vz - v0z);
    }
  }

  // COM frame
  let totalMass = 0, cmX = 0, cmY = 0, cmZ = 0, cmVx = 0, cmVy = 0, cmVz = 0;
  for (const b of bodies) {
    totalMass += b.mass; cmX += b.mass * b.x; cmY += b.mass * b.y; cmZ += b.mass * b.z;
    cmVx += b.mass * b.vx; cmVy += b.mass * b.vy; cmVz += b.mass * b.vz;
  }
  cmX /= totalMass; cmY /= totalMass; cmZ /= totalMass;
  cmVx /= totalMass; cmVy /= totalMass; cmVz /= totalMass;
  for (const b of bodies) {
    b.x -= cmX; b.y -= cmY; b.z -= cmZ;
    b.vx -= cmVx; b.vy -= cmVy; b.vz -= cmVz;
  }

  return bodies;
}

// Tertius at 0.44 LD (~8-day period) variations
const configs = [
  // Sec inward, various Ter masses, Qrt at 1.00
  { sec_mf: 0.04, sec_a: 0.25, ter_mf: 0.18,  ter_a: 0.44, qrt_a: 1.00 },
  { sec_mf: 0.04, sec_a: 0.25, ter_mf: 0.15,  ter_a: 0.44, qrt_a: 1.00 },
  { sec_mf: 0.04, sec_a: 0.25, ter_mf: 0.125, ter_a: 0.44, qrt_a: 1.00 },
  { sec_mf: 0.04, sec_a: 0.22, ter_mf: 0.18,  ter_a: 0.44, qrt_a: 1.00 },
  { sec_mf: 0.04, sec_a: 0.22, ter_mf: 0.15,  ter_a: 0.44, qrt_a: 1.00 },
  { sec_mf: 0.04, sec_a: 0.22, ter_mf: 0.125, ter_a: 0.44, qrt_a: 1.00 },
  // Heavier Sec
  { sec_mf: 0.06, sec_a: 0.25, ter_mf: 0.18,  ter_a: 0.44, qrt_a: 1.00 },
  { sec_mf: 0.06, sec_a: 0.25, ter_mf: 0.15,  ter_a: 0.44, qrt_a: 1.00 },
  { sec_mf: 0.06, sec_a: 0.25, ter_mf: 0.125, ter_a: 0.44, qrt_a: 1.00 },
  // Sec at original 0.30 (need Qrt out or Ter heavier)
  { sec_mf: 0.04, sec_a: 0.30, ter_mf: 0.18,  ter_a: 0.44, qrt_a: 1.00 },
  { sec_mf: 0.04, sec_a: 0.30, ter_mf: 0.18,  ter_a: 0.44, qrt_a: 1.05 },
  { sec_mf: 0.04, sec_a: 0.30, ter_mf: 0.15,  ter_a: 0.44, qrt_a: 1.05 },
  // Qrt out combos
  { sec_mf: 0.04, sec_a: 0.25, ter_mf: 0.18,  ter_a: 0.44, qrt_a: 1.05 },
  { sec_mf: 0.04, sec_a: 0.25, ter_mf: 0.15,  ter_a: 0.44, qrt_a: 1.05 },
  { sec_mf: 0.04, sec_a: 0.25, ter_mf: 0.125, ter_a: 0.44, qrt_a: 1.05 },
  // Sec at 0.28 (splitting the difference)
  { sec_mf: 0.04, sec_a: 0.28, ter_mf: 0.18,  ter_a: 0.44, qrt_a: 1.00 },
  { sec_mf: 0.04, sec_a: 0.28, ter_mf: 0.15,  ter_a: 0.44, qrt_a: 1.00 },
  { sec_mf: 0.04, sec_a: 0.28, ter_mf: 0.125, ter_a: 0.44, qrt_a: 1.00 },
  { sec_mf: 0.06, sec_a: 0.28, ter_mf: 0.18,  ter_a: 0.44, qrt_a: 1.00 },
  { sec_mf: 0.06, sec_a: 0.28, ter_mf: 0.15,  ter_a: 0.44, qrt_a: 1.00 },
];

const stepsPerCheck = Math.round(CHECK_EVERY * YEAR / 360);

function runOne(c) {
  const bodies = makeSystem(c);
  const sim = new Simulation(bodies);
  const qaia = sim.bodies[1];
  const targets = [
    { body: sim.bodies[3], name: 'Sec' },
    { body: sim.bodies[4], name: 'Ter' },
    { body: sim.bodies[5], name: 'Qrt' },
  ];

  let escaped = null;
  for (let yr = CHECK_EVERY; yr <= MAX_YEARS; yr += CHECK_EVERY) {
    sim.advance(stepsPerCheck, stepsPerCheck + 1);
    for (const t of targets) {
      const dx = t.body.x - qaia.x, dy = t.body.y - qaia.y, dz = t.body.z - qaia.z;
      const r = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const dvx = t.body.vx - qaia.vx, dvy = t.body.vy - qaia.vy, dvz = t.body.vz - qaia.vz;
      const eps = 0.5*(dvx*dvx+dvy*dvy+dvz*dvz) - G*qaia.mass/r;
      if (eps > 0 && !escaped) {
        escaped = { name: t.name, yr };
      }
    }
    if (escaped) break;
  }
  return escaped;
}

// Worker thread mode
if (!isMainThread) {
  const { idx, config } = workerData;
  const escaped = runOne(config);
  parentPort.postMessage({ idx, escaped });
  process.exit(0);
}

// Main thread — run in batches of 10
const BATCH = 10;
const thisFile = fileURLToPath(import.meta.url);

console.log(`Testing ${configs.length} configurations, ${MAX_YEARS} yr each, ${BATCH} parallel\n`);
console.log('  #  sec_mf sec_a  ter_mf ter_a  qrt_a  | result');
console.log('---- ------ ------ ------ ------ ------ | ------');

const results = new Array(configs.length);

for (let batch = 0; batch < configs.length; batch += BATCH) {
  const end = Math.min(batch + BATCH, configs.length);
  const promises = [];
  for (let i = batch; i < end; i++) {
    promises.push(new Promise((resolve, reject) => {
      const w = new Worker(thisFile, { workerData: { idx: i, config: configs[i] } });
      w.on('message', msg => { results[msg.idx] = msg; resolve(); });
      w.on('error', reject);
    }));
  }
  await Promise.all(promises);

  // Print results for this batch
  for (let i = batch; i < end; i++) {
    const c = configs[i];
    const escaped = results[i].escaped;
    const tag = escaped
      ? `${escaped.name} escaped yr ${escaped.yr}`
      : `STABLE past ${MAX_YEARS} yr`;
    console.log(`${String(i+1).padStart(3)}) ${c.sec_mf.toFixed(3)}  ${c.sec_a.toFixed(2)}   ${c.ter_mf.toFixed(3)}  ${c.ter_a.toFixed(2)}   ${c.qrt_a.toFixed(2)}   | ${tag}`);
  }
}

console.log('\n=== STABLE CONFIGURATIONS ===');
const stable = results.filter(r => !r.escaped);
if (stable.length === 0) {
  console.log('  (none)');
} else {
  for (const r of stable) {
    const c = configs[r.idx];
    console.log(`  #${r.idx+1}: sec=${c.sec_mf}@${c.sec_a}LD  ter=${c.ter_mf}@${c.ter_a}LD  qrt@${c.qrt_a}LD`);
  }
}
