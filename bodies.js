'use strict';

// Physical constants used in initial condition setup
const AU         = 1.496e11;       // meters (1 astronomical unit)
const LUNAR_DIST = 3.844e8;        // meters (Earth-Moon mean distance)

// Body physical data
const M_SUN   = 1.989e30;  // kg
const M_EARTH = 5.972e24;  // kg
const M_MOON  = 7.342e22;  // kg
const R_SUN   = 6.96e8;    // meters
const R_EARTH = 6.371e6;   // meters
const R_MOON  = 1.737e6;   // meters

// Four-moon system stable past 1000 simulated years.
// Masses 0.02 / 0.04 / 0.25 / 1.00 LM, all e=0.10.
// Quartus at 0.12 LD (period ≈ 1.14 d), Tertius at 0.24 LD (≈ 3.23 d),
// Secundus at 0.45 LD (≈ 8.3 d), Primus at 1.00 LD (≈ 27.5 d).
// Quartus and Tertius orbit retrograde (clockwise); Secundus and Primus prograde.
const M_QUARTUS      = M_MOON * 0.02;
const R_QUARTUS      = R_MOON * Math.cbrt(0.02);
const QUARTUS_E      = 0.10;
const QUARTUS_A      = 0.12 * LUNAR_DIST;
const QUARTUS_R_PERI = QUARTUS_A * (1 - QUARTUS_E);

const M_TERTIUS      = M_MOON * 0.04;
const R_TERTIUS      = R_MOON * Math.cbrt(0.04);
const TERTIUS_E      = 0.10;
const TERTIUS_A      = 0.24 * LUNAR_DIST;
const TERTIUS_R_PERI = TERTIUS_A * (1 - TERTIUS_E);

const M_SECUNDUS      = M_MOON / 4;
const R_SECUNDUS      = R_MOON * Math.cbrt(0.25);
const SECUNDUS_E      = 0.10;
const SECUNDUS_A      = 0.45 * LUNAR_DIST;
const SECUNDUS_R_PERI = SECUNDUS_A * (1 - SECUNDUS_E);

const PRIMUS_INCLINATION = 5.14 * Math.PI / 180; // orbital inclination relative to xy-plane

function createInitialBodies() {
  // Circular orbit speeds
  const v_earth    = Math.sqrt(G * M_SUN   / AU);
  const v_moon_rel = Math.sqrt(G * M_EARTH / LUNAR_DIST);
  // Periapsis speeds from vis-viva: v = sqrt(G M (1+e) / r_peri)
  const v_quartus_peri = Math.sqrt(G * M_EARTH * (1 + QUARTUS_E) / QUARTUS_R_PERI);
  const v_tertius_peri = Math.sqrt(G * M_EARTH * (1 + TERTIUS_E) / TERTIUS_R_PERI);
  const v_sec_peri     = Math.sqrt(G * M_EARTH * (1 + SECUNDUS_E) / SECUNDUS_R_PERI);

  const bodies = [
    new Body({
      name: 'Sun',
      mass: M_SUN,
      x: 0, y: 0,
      vx: 0, vy: 0,
      physicalRadius: R_SUN,
      minDisplayPx: 14,
      color: '#FFD700',
      trailColor: '#FFD70050',
      trailMaxLen: 600,
    }),
    new Body({
      name: 'Qaia',
      mass: M_EARTH,
      x: AU, y: 0,
      vx: 0, vy: v_earth,
      physicalRadius: R_EARTH,
      minDisplayPx: 6,
      color: '#4499FF',
      trailColor: '#4499FF',
      // 2500 recorded points × 10 steps × 360 s/step ≈ 104 days of trail
      trailMaxLen: 2500,
    }),
    new Body({
      name: 'Primus',
      mass: M_MOON,
      x: AU + LUNAR_DIST, y: 0, z: 0,
      vx: 0, vy: v_earth + v_moon_rel * Math.cos(PRIMUS_INCLINATION),
      vz: v_moon_rel * Math.sin(PRIMUS_INCLINATION),
      physicalRadius: R_MOON,
      minDisplayPx: 3,
      color: '#CCCCCC',
      trailColor: '#CCCCCC',
      // 1400 recorded points × 10 steps × 360 s/step ≈ 58 days → covers ~2 lunar cycles
      trailMaxLen: 1400,
    }),
    new Body({
      name: 'Secundus',
      mass: M_SECUNDUS,
      // Periapsis at 90° (in +y from Qaia). Prograde v points in −x in Qaia's frame.
      x: AU, y: SECUNDUS_R_PERI, z: 0,
      vx: -v_sec_peri, vy: v_earth, vz: 0,
      physicalRadius: R_SECUNDUS,
      minDisplayPx: 3,
      color: '#CC9966',
      trailColor: '#CC9966',
      // 1400 recorded points × 10 steps × 360 s/step ≈ 58 days ≈ 7 Secundus orbits
      trailMaxLen: 1400,
    }),
    new Body({
      name: 'Quartus',
      mass: M_QUARTUS,
      // Periapsis at 180° (in −x from Qaia). Retrograde v points in +y in Qaia's frame.
      x: AU - QUARTUS_R_PERI, y: 0, z: 0,
      vx: 0, vy: v_earth + v_quartus_peri, vz: 0,
      physicalRadius: R_QUARTUS,
      minDisplayPx: 3,
      color: '#FFAA66',
      trailColor: '#FFAA66',
      // 300 points × 10 × 360 s ≈ 12 days ≈ 10 Quartus orbits
      trailMaxLen: 300,
    }),
    new Body({
      name: 'Tertius',
      mass: M_TERTIUS,
      // Periapsis at 270° (in −y from Qaia). Retrograde v points in −x in Qaia's frame.
      x: AU, y: -TERTIUS_R_PERI, z: 0,
      vx: -v_tertius_peri, vy: v_earth, vz: 0,
      physicalRadius: R_TERTIUS,
      minDisplayPx: 3,
      color: '#88CCAA',
      trailColor: '#88CCAA',
      // 500 points × 10 × 360 s ≈ 20 days ≈ 6 Tertius orbits
      trailMaxLen: 500,
    }),
  ];

  // Shift to centre-of-mass frame (zero total momentum, origin at CoM)
  let totalMass = 0, cmX = 0, cmY = 0, cmZ = 0, cmVx = 0, cmVy = 0, cmVz = 0;
  for (const b of bodies) {
    totalMass += b.mass;
    cmX  += b.mass * b.x;
    cmY  += b.mass * b.y;
    cmZ  += b.mass * b.z;
    cmVx += b.mass * b.vx;
    cmVy += b.mass * b.vy;
    cmVz += b.mass * b.vz;
  }
  cmX /= totalMass; cmY /= totalMass; cmZ /= totalMass;
  cmVx /= totalMass; cmVy /= totalMass; cmVz /= totalMass;
  for (const b of bodies) {
    b.x  -= cmX;  b.y  -= cmY;  b.z  -= cmZ;
    b.vx -= cmVx; b.vy -= cmVy; b.vz -= cmVz;
  }

  return bodies;
}
