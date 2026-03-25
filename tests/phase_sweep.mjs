// phase_sweep.mjs — test Inner2 with different starting phases and semi-major axes
// Also tests moving Inner2 to 0.20 LD as suggested in the plan.

const G = 6.674e-11;
const AU = 1.496e11;
const LUNAR_DIST = 3.844e8;
const M_SUN   = 1.989e30;
const M_EARTH = 5.972e24;
const M_MOON  = 7.342e22;

const M_INNER1        = M_MOON * 0.02;
const INNER1_E        = 0.10;
const INNER1_A        = 0.12 * LUNAR_DIST;
const INNER1_R_PERI   = INNER1_A * (1 - INNER1_E);

const M_INNER2        = M_MOON * 0.04;
const INNER2_E        = 0.10;

const M_SECUNDUS      = M_MOON / 4;
const SECUNDUS_E      = 0.10;
const SECUNDUS_A      = 0.45 * LUNAR_DIST;
const SECUNDUS_R_PERI = SECUNDUS_A * (1 - SECUNDUS_E);

const PRIMUS_INCLINATION = 5.14 * Math.PI / 180;

function createBodies(inner2_a, inner2_phase_deg) {
  const INNER2_A = inner2_a * LUNAR_DIST;
  const INNER2_R_PERI = INNER2_A * (1 - INNER2_E);

  const v_earth    = Math.sqrt(G * M_SUN   / AU);
  const v_moon_rel = Math.sqrt(G * M_EARTH / LUNAR_DIST);
  const v_inner1_peri = Math.sqrt(G * M_EARTH * (1 + INNER1_E) / INNER1_R_PERI);
  const v_inner2_peri = Math.sqrt(G * M_EARTH * (1 + INNER2_E) / INNER2_R_PERI);
  const v_sec_peri    = Math.sqrt(G * M_EARTH * (1 + SECUNDUS_E) / SECUNDUS_R_PERI);

  // Inner2 periapsis at a given phase angle from Qaia
  const phi = inner2_phase_deg * Math.PI / 180;
  // Periapsis direction unit vector
  const px = Math.cos(phi), py = Math.sin(phi);
  // Prograde tangential direction (perpendicular, rotated 90° CCW from periapsis)
  const tx = -Math.sin(phi), ty = Math.cos(phi);

  const bodies = [
    { name: 'Sun',     mass: M_SUN,      x: 0,                    y: 0,               z: 0, vx: 0, vy: 0,                                                   vz: 0 },
    { name: 'Qaia',    mass: M_EARTH,    x: AU,                   y: 0,               z: 0, vx: 0, vy: v_earth,                                              vz: 0 },
    { name: 'Primus',  mass: M_MOON,     x: AU + LUNAR_DIST,      y: 0,               z: 0, vx: 0, vy: v_earth + v_moon_rel * Math.cos(PRIMUS_INCLINATION),  vz: v_moon_rel * Math.sin(PRIMUS_INCLINATION) },
    { name: 'Secundus',mass: M_SECUNDUS, x: AU,                   y: SECUNDUS_R_PERI, z: 0, vx: -v_sec_peri, vy: v_earth,                                    vz: 0 },
    { name: 'Inner1',  mass: M_INNER1,   x: AU - INNER1_R_PERI,   y: 0,               z: 0, vx: 0, vy: v_earth - v_inner1_peri,                              vz: 0 },
    // Inner2 at periapsis in direction phi from Qaia
    { name: 'Inner2',  mass: M_INNER2,
      x: AU + INNER2_R_PERI * px,
      y:      INNER2_R_PERI * py,
      z: 0,
      vx: v_inner2_peri * tx,
      vy: v_earth + v_inner2_peri * ty,
      vz: 0 },
  ];

  for (const b of bodies) { b.ax = 0; b.ay = 0; b.az = 0; }

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

function bindingEnergy(moon, qaia) {
  const dx = moon.x - qaia.x, dy = moon.y - qaia.y, dz = moon.z - qaia.z;
  const r = Math.sqrt(dx*dx + dy*dy + dz*dz);
  const dvx = moon.vx - qaia.vx, dvy = moon.vy - qaia.vy, dvz = moon.vz - qaia.vz;
  return 0.5 * (dvx*dvx + dvy*dvy + dvz*dvz) - G * qaia.mass / r;
}

// Run to MAX_YEARS, return year at which Inner2 (or any moon) first becomes unbound,
// or MAX_YEARS if still bound at the end.
function testConfig(inner2_a_ld, phase_deg, maxYears) {
  const dt = 360;
  const YEAR = 365.25 * 86400;
  const checkIntervalYr = 5;
  const checkSteps = Math.round(checkIntervalYr * YEAR / dt);

  const bodies = createBodies(inner2_a_ld, phase_deg);
  computeAccelerations(bodies);

  const qaia = bodies[1];
  const moons = [bodies[2], bodies[3], bodies[4], bodies[5]]; // Primus, Secundus, Inner1, Inner2

  for (let yr = checkIntervalYr; yr <= maxYears; yr += checkIntervalYr) {
    for (let s = 0; s < checkSteps; s++) step(bodies, dt);
    for (const m of moons) {
      if (bindingEnergy(m, qaia) > 0) return { ejected: m.name, yr };
    }
  }
  return { ejected: null, yr: maxYears };
}

// 1. Phase sweep for Inner2 at 0.24 LD
console.log('=== Phase sweep: Inner2 a=0.24 LD, e=0.10 ===');
console.log('(testing every 45° starting phase, up to 200 yr)\n');
for (let phase = 0; phase < 360; phase += 45) {
  const r = testConfig(0.24, phase, 200);
  const status = r.ejected ? `${r.ejected} ejected yr ${r.yr}` : `all stable to 200 yr`;
  console.log(`  phase=${phase}°: ${status}`);
}

// 2. Sweep of semi-major axes at the current 270° phase
console.log('\n=== a sweep: Inner2 at current 270° phase, e=0.10 ===');
console.log('(up to 200 yr)\n');
for (const a of [0.18, 0.20, 0.22, 0.24, 0.26, 0.28, 0.30]) {
  const r = testConfig(a, 270, 200);
  const status = r.ejected ? `${r.ejected} ejected yr ${r.yr}` : `all stable to 200 yr`;
  console.log(`  a=${a} LD: ${status}`);
}

// 3. Best candidate from phase sweep at 0.20 LD
console.log('\n=== Phase sweep: Inner2 a=0.20 LD ===');
for (let phase = 0; phase < 360; phase += 45) {
  const r = testConfig(0.20, phase, 200);
  const status = r.ejected ? `${r.ejected} ejected yr ${r.yr}` : `all stable to 200 yr`;
  console.log(`  phase=${phase}°: ${status}`);
}
