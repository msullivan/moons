import { G, Body } from './simulation.js';

// Physical constants used in initial condition setup
export const AU          = 1.496e11;   // meters (1 astronomical unit)
export const LUNAR_DIST  = 3.844e8;   // meters (Earth-Moon mean distance)

export const M_SUN   = 1.989e30;  // kg
export const M_EARTH = 5.972e24;  // kg
export const M_MOON  = 7.342e22;  // kg
const  R_SUN         = 6.96e8;    // meters
export const R_EARTH = 6.371e6;   // meters
export const R_MOON  = 1.737e6;   // meters

export const QAIA_SIDEREAL_DAY = 86164;  // seconds — Qaia's sidereal rotation period

// Primus orbital mechanics (geosynchronous anchor)
const PRIMUS_OMEGA        = 2 * Math.PI / QAIA_SIDEREAL_DAY;
export const PRIMUS_A     = Math.cbrt(G * M_EARTH / (PRIMUS_OMEGA ** 2));  // ~42,160 km
const PRIMUS_PHASE        = Math.PI;                    // initial angle (sunward at t=0)
export const PRIMUS_INCLINATION  = 23.5 * Math.PI / 180;
export const QUARTUS_INCLINATION =  5.14 * Math.PI / 180; // kept for external use; matches Quartus inc_deg

const _mu = G * M_EARTH;

// Moon parameter table — single source of truth for all physical and display properties.
//
// mass_frac:      M / M_MOON
// density_ratio:  ρ / ρ_MOON   (radius derived as R_MOON * cbrt(mass_frac / density_ratio))
// a_LD:           semi-major axis in lunar distances
// e:              eccentricity (for Quartus this is an approximate developed value; initial
//                 condition uses circular velocity — eccentricity grows from N-body perturbations)
// prograde:       true = counterclockwise (same as Qaia's orbit)
// isAnchor:       true = geosynchronous, position overridden each step (Primus only)
// inc_deg:        orbital inclination in degrees relative to the ecliptic.
//                 Inner prograde moons are small (tidally damped); outer retrograde moons
//                 are larger (likely captured objects with random initial inclinations).
// albedo:         geometric albedo (fraction of light reflected); iron-rich moons are darker
// color:          display and plot color
// trailMaxLen:    renderer trail buffer length (points)
//
// Derived fields added by the .map(): M (kg), R (m), a (m), T_d (days)
export const MOON_PARAMS = [
  { name: 'Primus',   mass_frac: 0.0001, density_ratio: 2, a_LD: PRIMUS_A / LUNAR_DIST, e: 0,    prograde: true,  isAnchor: true,  inc_deg: 23.5, albedo: 0.06, color: '#4466CC', trailMaxLen:  300 },
  { name: 'Secundus', mass_frac: 0.04,   density_ratio: 2, a_LD: 0.30,                  e: 0.10, prograde: false, isAnchor: false, inc_deg:  8.0, albedo: 0.06, color: '#88CCAA', trailMaxLen:  500 },
  { name: 'Tertius',  mass_frac: 0.25,   density_ratio: 1, a_LD: 0.45,                  e: 0.10, prograde: true,  isAnchor: false, inc_deg:  3.0, albedo: 0.12, color: '#CC9966', trailMaxLen: 1400 },
  { name: 'Quartus',  mass_frac: 1.00,   density_ratio: 1, a_LD: 1.00,                  e: 0.10, prograde: true,  isAnchor: false, inc_deg:  5.14,albedo: 0.12, color: '#CCCCCC', trailMaxLen: 1400 },
  { name: 'Sextus',   mass_frac: 0.01,   density_ratio: 1, a_LD: 1.60,                  e: 0.10, prograde: false, isAnchor: false, inc_deg: 18.0, albedo: 0.09, color: '#AA88FF', trailMaxLen: 1800 },
  { name: 'Septimus', mass_frac: 0.01,   density_ratio: 1, a_LD: 2.10,                  e: 0.10, prograde: false, isAnchor: false, inc_deg: 22.0, albedo: 0.09, color: '#FF88AA', trailMaxLen: 2200 },
].map(m => ({
  ...m,
  M:   m.mass_frac * M_MOON,
  R:   R_MOON * Math.cbrt(m.mass_frac / m.density_ratio),
  a:   m.a_LD * LUNAR_DIST,
  T_d: m.isAnchor
    ? QAIA_SIDEREAL_DAY / 86400
    : 2 * Math.PI * Math.sqrt((m.a_LD * LUNAR_DIST) ** 3 / _mu) / 86400,
}));

export function createInitialBodies() {
  const v_earth = Math.sqrt(G * M_SUN / AU);

  // Index MOON_PARAMS by name for convenient lookup
  const mp = Object.fromEntries(MOON_PARAMS.map(m => [m.name, m]));

  // Vis-viva periapsis speed: v = sqrt(G M_E (1+e) / r_peri)
  const vp = m => Math.sqrt(_mu * (1 + m.e) / (m.a * (1 - m.e)));
  const rp = m => m.a * (1 - m.e);

  // Quintus trace particle
  const M_QUINTUS = 1;
  const R_QUINTUS = R_MOON * Math.cbrt(0.1);

  const bodies = [
    new Body({
      name: 'Sun', mass: M_SUN,
      x: 0, y: 0, vx: 0, vy: 0,
      physicalRadius: R_SUN, minDisplayPx: 14,
      color: '#FFD700', trailColor: '#FFD70050', trailMaxLen: 600,
    }),
    new Body({
      name: 'Qaia', mass: M_EARTH,
      x: AU, y: 0, vx: 0, vy: v_earth,
      physicalRadius: R_EARTH, minDisplayPx: 6,
      color: '#4499FF', trailColor: '#4499FF', trailMaxLen: 2500,
    }),
    // Primus: geosynchronous prograde — anchor overrides position each step.
    // Initial conditions derived from _enforceAnchors() at θ = PRIMUS_PHASE.
    new Body({
      name: 'Primus', mass: mp.Primus.M,
      x: AU + PRIMUS_A * Math.cos(PRIMUS_PHASE) * Math.cos(PRIMUS_INCLINATION),
      y:      PRIMUS_A * Math.sin(PRIMUS_PHASE),
      z:    - PRIMUS_A * Math.cos(PRIMUS_PHASE) * Math.sin(PRIMUS_INCLINATION),
      vx:           - PRIMUS_A * PRIMUS_OMEGA * Math.sin(PRIMUS_PHASE) * Math.cos(PRIMUS_INCLINATION),
      vy: v_earth   + PRIMUS_A * PRIMUS_OMEGA * Math.cos(PRIMUS_PHASE),
      vz:             PRIMUS_A * PRIMUS_OMEGA * Math.sin(PRIMUS_PHASE) * Math.sin(PRIMUS_INCLINATION),
      physicalRadius: mp.Primus.R, minDisplayPx: 3,
      color: mp.Primus.color, trailColor: mp.Primus.color, trailMaxLen: mp.Primus.trailMaxLen,
      anchor: { toIndex: 1, radius: PRIMUS_A, omega: PRIMUS_OMEGA, phase: PRIMUS_PHASE, inclination: PRIMUS_INCLINATION },
    }),
    // Secundus: retrograde, periapsis at −y from Qaia
    new Body({
      name: 'Secundus', mass: mp.Secundus.M,
      x: AU, y: -rp(mp.Secundus), z: 0,
      vx: -vp(mp.Secundus) * Math.cos(mp.Secundus.inc_deg * Math.PI / 180), vy: v_earth,
      vz: vp(mp.Secundus) * Math.sin(mp.Secundus.inc_deg * Math.PI / 180),
      physicalRadius: mp.Secundus.R, minDisplayPx: 3,
      color: mp.Secundus.color, trailColor: mp.Secundus.color, trailMaxLen: mp.Secundus.trailMaxLen,
    }),
    // Tertius: prograde, periapsis at +y from Qaia
    new Body({
      name: 'Tertius', mass: mp.Tertius.M,
      x: AU, y: rp(mp.Tertius), z: 0,
      vx: -vp(mp.Tertius) * Math.cos(mp.Tertius.inc_deg * Math.PI / 180), vy: v_earth,
      vz: vp(mp.Tertius) * Math.sin(mp.Tertius.inc_deg * Math.PI / 180),
      physicalRadius: mp.Tertius.R, minDisplayPx: 3,
      color: mp.Tertius.color, trailColor: mp.Tertius.color, trailMaxLen: mp.Tertius.trailMaxLen,
    }),
    // Quartus: prograde with inclination, starts at mean distance along +x from Qaia
    new Body({
      name: 'Quartus', mass: mp.Quartus.M,
      x: AU + mp.Quartus.a, y: 0, z: 0,
      vx: 0,
      vy: v_earth + Math.sqrt(_mu / mp.Quartus.a) * Math.cos(QUARTUS_INCLINATION),
      vz:             Math.sqrt(_mu / mp.Quartus.a) * Math.sin(QUARTUS_INCLINATION),
      physicalRadius: mp.Quartus.R, minDisplayPx: 3,
      color: mp.Quartus.color, trailColor: mp.Quartus.color, trailMaxLen: mp.Quartus.trailMaxLen,
    }),
    // Sextus: retrograde, periapsis at +y from Qaia
    new Body({
      name: 'Sextus', mass: mp.Sextus.M,
      x: AU, y: rp(mp.Sextus), z: 0,
      vx: vp(mp.Sextus) * Math.cos(mp.Sextus.inc_deg * Math.PI / 180), vy: v_earth,
      vz: vp(mp.Sextus) * Math.sin(mp.Sextus.inc_deg * Math.PI / 180),
      physicalRadius: mp.Sextus.R, minDisplayPx: 3,
      color: mp.Sextus.color, trailColor: mp.Sextus.color, trailMaxLen: mp.Sextus.trailMaxLen,
    }),
    // Septimus: retrograde, periapsis at −y from Qaia
    new Body({
      name: 'Septimus', mass: mp.Septimus.M,
      x: AU, y: -rp(mp.Septimus), z: 0,
      vx: -vp(mp.Septimus) * Math.cos(mp.Septimus.inc_deg * Math.PI / 180), vy: v_earth,
      vz: vp(mp.Septimus) * Math.sin(mp.Septimus.inc_deg * Math.PI / 180),
      physicalRadius: mp.Septimus.R, minDisplayPx: 3,
      color: mp.Septimus.color, trailColor: mp.Septimus.color, trailMaxLen: mp.Septimus.trailMaxLen,
    }),
    // Quintus: trace particle at Sun-Qaia L4 (60° ahead of Qaia)
    new Body({
      name: 'Quintus', mass: M_QUINTUS,
      x: AU * Math.cos(Math.PI / 3), y: AU * Math.sin(Math.PI / 3),
      vx: -v_earth * Math.sin(Math.PI / 3), vy: v_earth * Math.cos(Math.PI / 3),
      physicalRadius: R_QUINTUS, minDisplayPx: 4,
      color: '#FFDD55', trailColor: '#FFDD55', trailMaxLen: 2500,
    }),
  ];

  // Apply Newton's 3rd-law recoil to Qaia so the Qaia+moons barycenter has the
  // correct circular heliocentric velocity.  Each moon whose vy differs from
  // v_earth (i.e. has a tangential velocity component relative to Qaia in the
  // heliocentric y-direction) pushes back on Qaia by that fraction of its mass.
  // Currently only Quartus starts at +x with vy = v_earth + v_orbit, so it is
  // the only meaningful contributor, but the loop is general.
  const qaia = bodies[1];
  for (const b of bodies) {
    if (b === qaia || b.name === 'Sun' || b.name === 'Quintus') continue;
    qaia.vy -= (b.mass / M_EARTH) * (b.vy - v_earth);
  }

  // Shift to centre-of-mass frame
  let totalMass = 0, cmX = 0, cmY = 0, cmZ = 0, cmVx = 0, cmVy = 0, cmVz = 0;
  for (const b of bodies) {
    totalMass += b.mass;
    cmX  += b.mass * b.x;  cmY  += b.mass * b.y;  cmZ  += b.mass * b.z;
    cmVx += b.mass * b.vx; cmVy += b.mass * b.vy; cmVz += b.mass * b.vz;
  }
  cmX /= totalMass; cmY /= totalMass; cmZ /= totalMass;
  cmVx /= totalMass; cmVy /= totalMass; cmVz /= totalMass;
  for (const b of bodies) {
    b.x  -= cmX;  b.y  -= cmY;  b.z  -= cmZ;
    b.vx -= cmVx; b.vy -= cmVy; b.vz -= cmVz;
  }

  return bodies;
}

// Overlay positions and velocities from a saved snapshot onto a bodies array.
// Physical properties (mass, radius, color, etc.) stay from createInitialBodies();
// only kinematics are replaced.  Returns the same bodies array.
export function applySnapshot(bodies, snapshot) {
  const byName = Object.fromEntries(snapshot.bodies.map(s => [s.name, s]));
  for (const b of bodies) {
    const s = byName[b.name];
    if (s) {
      b.x = s.x; b.y = s.y; b.z = s.z;
      b.vx = s.vx; b.vy = s.vy; b.vz = s.vz;
    }
  }
  return bodies;
}
