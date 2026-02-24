import { G, Body } from './simulation.js';

// Physical constants used in initial condition setup
export const AU             = 1.496e11;  // meters (1 astronomical unit)
export const LUNAR_DIST     = 3.844e8;   // meters (Earth-Moon mean distance)

// Body physical data
export const M_SUN   = 1.989e30;  // kg
export const M_EARTH = 5.972e24;  // kg
export const M_MOON  = 7.342e22;  // kg
const R_SUN                     = 6.96e8;   // meters
export const R_EARTH            = 6.371e6;  // meters
export const R_MOON     = 1.737e6;  // meters

// Six-moon system stable past 1000 simulated years.
// Primus: geosynchronous prograde (magically anchored, ~0.11 LD), 0.001 LM, 2× lunar density.
// Inner three (all e=0.10): Secundus 0.04 LM at 0.30 LD (≈ 4.51 d) retrograde,
//   Tertius 0.25 LM at 0.45 LD (≈ 8.3 d) prograde, Quartus 1.00 LM at 1.00 LD (≈ 27.5 d) prograde.
// Outer two (retrograde): Sextus 0.01 LM at 1.65 LD (≈ 58.2 d), Septimus 0.01 LM at 2.1 LD (≈ 83.5 d).
export const QAIA_SIDEREAL_DAY = 86164;  // seconds — Qaia's sidereal rotation period

const M_PRIMUS       = M_MOON * 0.001;
const R_PRIMUS       = R_MOON * Math.cbrt(0.001 / 2);  // 2× lunar density
const PRIMUS_OMEGA   = 2 * Math.PI / QAIA_SIDEREAL_DAY;  // geosynchronous angular velocity
const PRIMUS_A       = Math.cbrt(G * M_EARTH / (PRIMUS_OMEGA * PRIMUS_OMEGA));  // ~42,160 km
const PRIMUS_PHASE   = Math.PI;  // initial angle in inertial frame (toward Sun side at t=0)

const M_SECUNDUS      = M_MOON * 0.04;
const R_SECUNDUS      = R_MOON * Math.cbrt(0.04 / 2);  // 2× lunar density
const SECUNDUS_E      = 0.10;
const SECUNDUS_A      = 0.30 * LUNAR_DIST;
const SECUNDUS_R_PERI = SECUNDUS_A * (1 - SECUNDUS_E);

const M_TERTIUS      = M_MOON / 4;
const R_TERTIUS      = R_MOON * Math.cbrt(0.25);
const TERTIUS_E      = 0.10;
const TERTIUS_A      = 0.45 * LUNAR_DIST;
const TERTIUS_R_PERI = TERTIUS_A * (1 - TERTIUS_E);

// Quartus: 1.00 LD, 1 lunar mass, prograde with slight inclination
const QUARTUS_INCLINATION = 5.14 * Math.PI / 180;

// Quintus: Sun-Qaia L4 trojan (60° ahead of Qaia)
// Mass set to trace particle (1 kg) to avoid perturbing the moon system.
const M_QUINTUS      = 1;
const R_QUINTUS      = R_MOON * Math.cbrt(0.1);

const M_SEXTUS       = M_MOON * 0.01;
const R_SEXTUS       = R_MOON * Math.cbrt(0.01);
const SEXTUS_E       = 0.10;
const SEXTUS_A       = 1.65 * LUNAR_DIST;
const SEXTUS_R_PERI  = SEXTUS_A * (1 - SEXTUS_E);

const M_SEPTIMUS      = M_MOON * 0.01;
const R_SEPTIMUS      = R_MOON * Math.cbrt(0.01);
const SEPTIMUS_E      = 0.10;
const SEPTIMUS_A      = 2.1 * LUNAR_DIST;
const SEPTIMUS_R_PERI = SEPTIMUS_A * (1 - SEPTIMUS_E);

export function createInitialBodies() {
  const v_earth         = Math.sqrt(G * M_SUN   / AU);
  const v_moon_rel      = Math.sqrt(G * M_EARTH / LUNAR_DIST);
  // Periapsis speeds from vis-viva: v = sqrt(G M (1+e) / r_peri)
  const v_secundus_peri = Math.sqrt(G * M_EARTH * (1 + SECUNDUS_E) / SECUNDUS_R_PERI);
  const v_tertius_peri  = Math.sqrt(G * M_EARTH * (1 + TERTIUS_E)  / TERTIUS_R_PERI);
  const v_sextus_peri   = Math.sqrt(G * M_EARTH * (1 + SEXTUS_E)   / SEXTUS_R_PERI);
  const v_septimus_peri = Math.sqrt(G * M_EARTH * (1 + SEPTIMUS_E) / SEPTIMUS_R_PERI);

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
      trailMaxLen: 2500,
    }),
    new Body({
      name: 'Primus',
      mass: M_PRIMUS,
      // Geosynchronous prograde orbit — magically anchored to Qaia's sidereal rotation.
      // Initial position at PRIMUS_PHASE=π (sunward from Qaia); anchor overrides each step.
      x: AU - PRIMUS_A, y: 0, z: 0,
      vx: 0, vy: v_earth - PRIMUS_A * PRIMUS_OMEGA, vz: 0,
      physicalRadius: R_PRIMUS,
      minDisplayPx: 3,
      color: '#4466CC',
      trailColor: '#4466CC',
      trailMaxLen: 300,
      anchor: { toIndex: 1, radius: PRIMUS_A, omega: PRIMUS_OMEGA, phase: PRIMUS_PHASE },
    }),
    new Body({
      name: 'Secundus',
      mass: M_SECUNDUS,
      // Periapsis at 270° (in −y from Qaia). Retrograde v points in −x in Qaia's frame.
      x: AU, y: -SECUNDUS_R_PERI, z: 0,
      vx: -v_secundus_peri, vy: v_earth, vz: 0,
      physicalRadius: R_SECUNDUS,
      minDisplayPx: 3,
      color: '#88CCAA',
      trailColor: '#88CCAA',
      trailMaxLen: 500,
    }),
    new Body({
      name: 'Tertius',
      mass: M_TERTIUS,
      // Periapsis at 90° (in +y from Qaia). Prograde v points in −x in Qaia's frame.
      x: AU, y: TERTIUS_R_PERI, z: 0,
      vx: -v_tertius_peri, vy: v_earth, vz: 0,
      physicalRadius: R_TERTIUS,
      minDisplayPx: 3,
      color: '#CC9966',
      trailColor: '#CC9966',
      trailMaxLen: 1400,
    }),
    new Body({
      name: 'Quartus',
      mass: M_MOON,
      x: AU + LUNAR_DIST, y: 0, z: 0,
      vx: 0, vy: v_earth + v_moon_rel * Math.cos(QUARTUS_INCLINATION),
      vz: v_moon_rel * Math.sin(QUARTUS_INCLINATION),
      physicalRadius: R_MOON,
      minDisplayPx: 3,
      color: '#CCCCCC',
      trailColor: '#CCCCCC',
      // 1400 recorded points × 10 steps × 360 s/step ≈ 58 days → covers ~2 Quartus cycles
      trailMaxLen: 1400,
    }),
    new Body({
      name: 'Sextus',
      mass: M_SEXTUS,
      // Periapsis at 90° (in +y from Qaia). Retrograde v points in +x in Qaia's frame.
      x: AU, y: SEXTUS_R_PERI, z: 0,
      vx: v_sextus_peri, vy: v_earth, vz: 0,
      physicalRadius: R_SEXTUS,
      minDisplayPx: 3,
      color: '#AA88FF',
      trailColor: '#AA88FF',
      trailMaxLen: 1800,
    }),
    new Body({
      name: 'Septimus',
      mass: M_SEPTIMUS,
      // Periapsis at 270° (in −y from Qaia). Retrograde v points in −x in Qaia's frame.
      x: AU, y: -SEPTIMUS_R_PERI, z: 0,
      vx: -v_septimus_peri, vy: v_earth, vz: 0,
      physicalRadius: R_SEPTIMUS,
      minDisplayPx: 3,
      color: '#FF88AA',
      trailColor: '#FF88AA',
      trailMaxLen: 2200,
    }),
    new Body({
      name: 'Quintus',
      mass: M_QUINTUS,
      // Sun-Qaia L4 point: 60° ahead of Qaia in its orbit
      x: AU * Math.cos(Math.PI / 3), y: AU * Math.sin(Math.PI / 3),
      vx: -v_earth * Math.sin(Math.PI / 3), vy: v_earth * Math.cos(Math.PI / 3),
      physicalRadius: R_QUINTUS,
      minDisplayPx: 4,
      color: '#FFDD55',
      trailColor: '#FFDD55',
      trailMaxLen: 2500,
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
