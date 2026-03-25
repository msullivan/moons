// stability_check.mjs — run with: node stability_check.mjs
// Replicates the exact initial conditions from simulation.js and checks
// binding energy of each moon relative to Qaia at regular intervals.

const G = 6.674e-11;
const AU = 1.496e11;
const LUNAR_DIST = 3.844e8;
const M_SUN   = 1.989e30;
const M_EARTH = 5.972e24;
const M_MOON  = 7.342e22;
const R_SUN   = 6.96e8;
const R_EARTH = 6.371e6;
const R_MOON  = 1.737e6;

const M_INNER1        = M_MOON * 0.02;
const INNER1_E        = 0.10;
const INNER1_A        = 0.12 * LUNAR_DIST;
const INNER1_R_PERI   = INNER1_A * (1 - INNER1_E);

const M_INNER2        = M_MOON * 0.04;
const INNER2_E        = 0.10;
const INNER2_A        = 0.24 * LUNAR_DIST;
const INNER2_R_PERI   = INNER2_A * (1 - INNER2_E);

const M_SECUNDUS      = M_MOON / 4;
const SECUNDUS_E      = 0.10;
const SECUNDUS_A      = 0.45 * LUNAR_DIST;
const SECUNDUS_R_PERI = SECUNDUS_A * (1 - SECUNDUS_E);

const PRIMUS_INCLINATION = 5.14 * Math.PI / 180;

function createBodies() {
  const v_earth    = Math.sqrt(G * M_SUN   / AU);
  const v_moon_rel = Math.sqrt(G * M_EARTH / LUNAR_DIST);
  const v_inner1_peri = Math.sqrt(G * M_EARTH * (1 + INNER1_E) / INNER1_R_PERI);
  const v_inner2_peri = Math.sqrt(G * M_EARTH * (1 + INNER2_E) / INNER2_R_PERI);
  const v_sec_peri    = Math.sqrt(G * M_EARTH * (1 + SECUNDUS_E) / SECUNDUS_R_PERI);

  const bodies = [
    { name: 'Sun',     mass: M_SUN,      x: 0,                    y: 0,               z: 0, vx: 0, vy: 0,                                                  vz: 0 },
    { name: 'Qaia',    mass: M_EARTH,    x: AU,                   y: 0,               z: 0, vx: 0, vy: v_earth,                                             vz: 0 },
    { name: 'Primus',  mass: M_MOON,     x: AU + LUNAR_DIST,      y: 0,               z: 0, vx: 0, vy: v_earth + v_moon_rel * Math.cos(PRIMUS_INCLINATION), vz: v_moon_rel * Math.sin(PRIMUS_INCLINATION) },
    { name: 'Secundus',mass: M_SECUNDUS, x: AU,                   y: SECUNDUS_R_PERI, z: 0, vx: -v_sec_peri, vy: v_earth,                                   vz: 0 },
    { name: 'Inner1',  mass: M_INNER1,   x: AU - INNER1_R_PERI,   y: 0,               z: 0, vx: 0, vy: v_earth - v_inner1_peri,                             vz: 0 },
    { name: 'Inner2',  mass: M_INNER2,   x: AU,                   y: -INNER2_R_PERI,  z: 0, vx: v_inner2_peri, vy: v_earth,                                 vz: 0 },
  ];

  for (const b of bodies) { b.ax = 0; b.ay = 0; b.az = 0; }

  // Shift to CoM frame
  let totalMass = 0, cmX = 0, cmY = 0, cmZ = 0, cmVx = 0, cmVy = 0, cmVz = 0;
  for (const b of bodies) {
    totalMass += b.mass;
    cmX  += b.mass * b.x;  cmY  += b.mass * b.y;  cmZ  += b.mass * b.z;
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

function computeAccelerations(bodies) {
  for (const b of bodies) { b.ax = 0; b.ay = 0; b.az = 0; }
  const n = bodies.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const bi = bodies[i], bj = bodies[j];
      const dx = bj.x - bi.x, dy = bj.y - bi.y, dz = bj.z - bi.z;
      const r2 = dx*dx + dy*dy + dz*dz;
      const r3 = r2 * Math.sqrt(r2);
      const f = G / r3;
      bi.ax += f * bj.mass * dx; bi.ay += f * bj.mass * dy; bi.az += f * bj.mass * dz;
      bj.ax -= f * bi.mass * dx; bj.ay -= f * bi.mass * dy; bj.az -= f * bi.mass * dz;
    }
  }
}

function step(bodies, dt) {
  const dt2h = 0.5 * dt * dt;
  for (const b of bodies) {
    b.x += b.vx * dt + b.ax * dt2h;
    b.y += b.vy * dt + b.ay * dt2h;
    b.z += b.vz * dt + b.az * dt2h;
  }
  const ax0 = bodies.map(b => b.ax);
  const ay0 = bodies.map(b => b.ay);
  const az0 = bodies.map(b => b.az);
  computeAccelerations(bodies);
  for (let i = 0; i < bodies.length; i++) {
    bodies[i].vx += 0.5 * (ax0[i] + bodies[i].ax) * dt;
    bodies[i].vy += 0.5 * (ay0[i] + bodies[i].ay) * dt;
    bodies[i].vz += 0.5 * (az0[i] + bodies[i].az) * dt;
  }
}

// Specific orbital energy of moon relative to Qaia (eps < 0 → bound)
function bindingEnergy(moon, qaia) {
  const dx = moon.x - qaia.x, dy = moon.y - qaia.y, dz = moon.z - qaia.z;
  const r = Math.sqrt(dx*dx + dy*dy + dz*dz);
  const dvx = moon.vx - qaia.vx, dvy = moon.vy - qaia.vy, dvz = moon.vz - qaia.vz;
  const v2 = dvx*dvx + dvy*dvy + dvz*dvz;
  return 0.5 * v2 - G * qaia.mass / r;
}

const dt = 360; // 6 minutes
const YEAR = 365.25 * 86400;
const CHECK_INTERVAL_YR = 10;
const CHECK_STEPS = Math.round(CHECK_INTERVAL_YR * YEAR / dt);
const MAX_YEARS = 200;

const bodies = createBodies();
computeAccelerations(bodies);

const qaia   = bodies[1];
const moons  = [bodies[2], bodies[3], bodies[4], bodies[5]]; // Primus, Secundus, Inner1, Inner2

let ejected = {};
let time = 0;

console.log('Starting stability check...');
console.log(`dt=${dt}s, check every ${CHECK_INTERVAL_YR} yr, up to ${MAX_YEARS} yr`);
console.log('');

// Print initial semi-major axes as sanity check
for (const m of moons) {
  const eps = bindingEnergy(m, qaia);
  const dx = m.x - qaia.x, dy = m.y - qaia.y, dz = m.z - qaia.z;
  const r = Math.sqrt(dx*dx + dy*dy + dz*dz) / LUNAR_DIST;
  console.log(`  ${m.name}: r=${r.toFixed(3)} LD, eps=${eps.toExponential(2)} (${eps < 0 ? 'bound' : 'UNBOUND'})`);
}
console.log('');

for (let yr = CHECK_INTERVAL_YR; yr <= MAX_YEARS; yr += CHECK_INTERVAL_YR) {
  for (let s = 0; s < CHECK_STEPS; s++) {
    step(bodies, dt);
  }
  time += CHECK_INTERVAL_YR * YEAR;

  let allBound = true;
  for (const m of moons) {
    if (ejected[m.name]) continue;
    const eps = bindingEnergy(m, qaia);
    const dx = m.x - qaia.x, dy = m.y - qaia.y, dz = m.z - qaia.z;
    const r = Math.sqrt(dx*dx + dy*dy + dz*dz) / LUNAR_DIST;
    if (eps > 0) {
      console.log(`yr ${yr}: ${m.name} EJECTED  r=${r.toFixed(3)} LD eps=${eps.toExponential(2)}`);
      ejected[m.name] = yr;
    } else {
      allBound = false || allBound; // keep going
    }
  }

  const remainingMoons = moons.filter(m => !ejected[m.name]);
  if (remainingMoons.length > 0) {
    const moonStr = remainingMoons.map(m => {
      const eps = bindingEnergy(m, qaia);
      const dx = m.x - qaia.x, dy = m.y - qaia.y, dz = m.z - qaia.z;
      const r = Math.sqrt(dx*dx + dy*dy + dz*dz) / LUNAR_DIST;
      return `${m.name}:${r.toFixed(2)}LD`;
    }).join(', ');
    if (yr % 50 === 0) console.log(`yr ${yr}: bound: ${moonStr}`);
  }

  if (Object.keys(ejected).length === moons.length) {
    console.log('All moons ejected, stopping early.');
    break;
  }
}

console.log('\nSummary:');
for (const m of moons) {
  if (ejected[m.name]) {
    console.log(`  ${m.name}: ejected at ~yr ${ejected[m.name]}`);
  } else {
    console.log(`  ${m.name}: stable past ${MAX_YEARS} yr`);
  }
}
