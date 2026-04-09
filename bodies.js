import { G, Body } from './simulation.js';

// Physical constants used in initial condition setup
export const AU          = 1.49606e11; // meters — tuned so Kepler period matches Gregorian year
export const LUNAR_DIST  = 3.844e8;   // meters (Earth-Moon mean distance)

export const M_SUN   = 1.989e30;  // kg
export const M_EARTH = 5.972e24;  // kg
export const M_MOON  = 7.342e22;  // kg
const  R_SUN         = 6.96e8;    // meters
export const R_EARTH = 6.371e6;   // meters
export const R_MOON  = 1.737e6;   // meters

export const M_JUPITER = 1.898e27;  // kg
export const R_JUPITER = 7.149e7;   // m
export const M_SATURN  = 5.683e26;  // kg
export const R_SATURN  = 5.823e7;   // m

const QATURN_A = 0.10 * AU;         // hot Saturn — ~11-day orbit

// Orbital inclinations to ecliptic (degrees → radians)
const BAHAMUT_INC = 45.0 * Math.PI / 180;  // heavily inclined hot Saturn
const VRITRA_INC    = 1.85 * Math.PI / 180;  // Mars
const FAFNIR_INC  = 3.40 * Math.PI / 180;  // Venus
const TIAMAT_INC  = 1.30 * Math.PI / 180;  // Jupiter

// Fafnir: Venus-like planet at 0.723 AU (~225-day orbit)
const FAFNIR_A = 0.723 * AU;
export const M_VENUS = 4.867e24;   // kg
export const R_VENUS = 6.052e6;    // m

// Tiamat: Jupiter-mass planet 5% beyond Jupiter's 5.2 AU
const QUPITER_A = 5.46 * AU;

// Galilean moon clone distances in exact Laplace 1:2:4 resonance
const A_IO       = 4.218e8;                    // m (421,800 km — real Io semi-major axis)
const A_EUROPA   = A_IO * Math.pow(2, 2 / 3); // exact 2× Io period
const A_GANYMEDE = A_IO * Math.pow(4, 2 / 3); // exact 4× Io period
const A_CALLISTO = 1.8827e9;                   // m — outside the resonance (real Callisto)

const M_IO = 8.932e22;  const R_IO = 1.822e6;  // kg, m
const M_EUROPA = 4.800e22;  const R_EUROPA = 1.561e6;
const M_GANYMEDE = 1.482e23;  const R_GANYMEDE = 2.631e6;
const M_CALLISTO = 1.076e23;  const R_CALLISTO = 2.410e6;

export const QAIA_SIDEREAL_DAY = 86164;  // seconds — Qaia's sidereal rotation period
export const MEAN_SOLAR_DAY = 86399.905; // seconds — empirical, from sidereal day + orbital period (365.248 d)

// Primus orbital mechanics (geosynchronous anchor)
const PRIMUS_OMEGA        = 2 * Math.PI / QAIA_SIDEREAL_DAY;
export const PRIMUS_A     = Math.cbrt(G * M_EARTH / (PRIMUS_OMEGA ** 2));  // ~42,160 km
const PRIMUS_PHASE        = 0;                          // initial angle: anti-sunward = midnight (PMT) at t=0
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
  { name: 'Tertius',  mass_frac: 0.18,   density_ratio: 1.6, a_LD: 0.44,                  e: 0.10, prograde: true,  isAnchor: false, inc_deg:  3.0, albedo: 0.09, color: '#CC9966', trailMaxLen: 1400 },
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
  // Bahamut (Saturn-mass at 0.1 AU) yanks the Sun around in an 11-day
  // wobble.  The indirect tidal effect reduces the effective central
  // gravity felt by Qaia, requiring ~8 m/s less orbital velocity to
  // stay on a Keplerian year.  Without this correction the calendar
  // drifts ~55° over 200 years.
  const v_earth   = Math.sqrt(G * M_SUN / AU) - 3.8;
  const v_qupiter = Math.sqrt(G * M_SUN / QUPITER_A);
  const mu_J      = G * M_JUPITER;
  // Real Galilean eccentricities (forced by the Laplace resonance)
  const E_IO       = 0.0041;
  const E_EUROPA   = 0.0094;
  const E_GANYMEDE = 0.0013;
  const E_CALLISTO = 0.0074;
  // Periapsis speeds: v_peri = sqrt(mu * (1+e) / (a*(1-e)))
  const v_io  = Math.sqrt(mu_J * (1 + E_IO)       / (A_IO       * (1 - E_IO)));
  const v_eur = Math.sqrt(mu_J * (1 + E_EUROPA)   / (A_EUROPA   * (1 - E_EUROPA)));
  const v_gan = Math.sqrt(mu_J * (1 + E_GANYMEDE) / (A_GANYMEDE * (1 - E_GANYMEDE)));
  const v_cal = Math.sqrt(mu_J * (1 + E_CALLISTO) / (A_CALLISTO * (1 - E_CALLISTO)));
  // Starting phase angles for the outer planets (radians, CCW from +x)
  const FAFNIR_PHASE  = 300 * Math.PI / 180;
  const VRITRA_PHASE    =  40 * Math.PI / 180;
  const TIAMAT_PHASE  = 160 * Math.PI / 180;
  const BAHAMUT_PHASE = 240 * Math.PI / 180;
  const cosF = Math.cos(FAFNIR_PHASE), sinF = Math.sin(FAFNIR_PHASE);
  const cosT = Math.cos(TIAMAT_PHASE), sinT = Math.sin(TIAMAT_PHASE);

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
      color: mp.Primus.color, trailColor: mp.Primus.color, trailMaxLen: mp.Primus.trailMaxLen, albedo: mp.Primus.albedo,
      anchor: { toIndex: 1, radius: PRIMUS_A, omega: PRIMUS_OMEGA, phase: PRIMUS_PHASE, inclination: PRIMUS_INCLINATION },
      parentName: 'Qaia',
    }),
    // Secundus: retrograde, periapsis at −y from Qaia
    new Body({
      name: 'Secundus', mass: mp.Secundus.M,
      x: AU, y: -rp(mp.Secundus), z: 0,
      vx: -vp(mp.Secundus) * Math.cos(mp.Secundus.inc_deg * Math.PI / 180), vy: v_earth,
      vz: vp(mp.Secundus) * Math.sin(mp.Secundus.inc_deg * Math.PI / 180),
      physicalRadius: mp.Secundus.R, minDisplayPx: 3,
      color: mp.Secundus.color, trailColor: mp.Secundus.color, trailMaxLen: mp.Secundus.trailMaxLen, albedo: mp.Secundus.albedo,
      parentName: 'Qaia',
    }),
    // Tertius: prograde, periapsis at +y from Qaia
    new Body({
      name: 'Tertius', mass: mp.Tertius.M,
      x: AU, y: rp(mp.Tertius), z: 0,
      vx: -vp(mp.Tertius) * Math.cos(mp.Tertius.inc_deg * Math.PI / 180), vy: v_earth,
      vz: vp(mp.Tertius) * Math.sin(mp.Tertius.inc_deg * Math.PI / 180),
      physicalRadius: mp.Tertius.R, minDisplayPx: 3,
      color: mp.Tertius.color, trailColor: mp.Tertius.color, trailMaxLen: mp.Tertius.trailMaxLen, albedo: mp.Tertius.albedo,
      parentName: 'Qaia',
    }),
    // Quartus: prograde with inclination, starts at mean distance along +x from Qaia
    new Body({
      name: 'Quartus', mass: mp.Quartus.M,
      x: AU + mp.Quartus.a, y: 0, z: 0,
      vx: 0,
      vy: v_earth + Math.sqrt(_mu / mp.Quartus.a) * Math.cos(QUARTUS_INCLINATION),
      vz:             Math.sqrt(_mu / mp.Quartus.a) * Math.sin(QUARTUS_INCLINATION),
      physicalRadius: mp.Quartus.R, minDisplayPx: 3,
      color: mp.Quartus.color, trailColor: mp.Quartus.color, trailMaxLen: mp.Quartus.trailMaxLen, albedo: mp.Quartus.albedo,
      parentName: 'Qaia',
    }),
    // Sextus: retrograde, periapsis at +y from Qaia
    new Body({
      name: 'Sextus', mass: mp.Sextus.M,
      x: AU, y: rp(mp.Sextus), z: 0,
      vx: vp(mp.Sextus) * Math.cos(mp.Sextus.inc_deg * Math.PI / 180), vy: v_earth,
      vz: vp(mp.Sextus) * Math.sin(mp.Sextus.inc_deg * Math.PI / 180),
      physicalRadius: mp.Sextus.R, minDisplayPx: 3,
      color: mp.Sextus.color, trailColor: mp.Sextus.color, trailMaxLen: mp.Sextus.trailMaxLen, albedo: mp.Sextus.albedo,
      parentName: 'Qaia',
    }),
    // Septimus: retrograde, periapsis at −y from Qaia
    new Body({
      name: 'Septimus', mass: mp.Septimus.M,
      x: AU, y: -rp(mp.Septimus), z: 0,
      vx: -vp(mp.Septimus) * Math.cos(mp.Septimus.inc_deg * Math.PI / 180), vy: v_earth,
      vz: vp(mp.Septimus) * Math.sin(mp.Septimus.inc_deg * Math.PI / 180),
      physicalRadius: mp.Septimus.R, minDisplayPx: 3,
      color: mp.Septimus.color, trailColor: mp.Septimus.color, trailMaxLen: mp.Septimus.trailMaxLen, albedo: mp.Septimus.albedo,
      parentName: 'Qaia',
    }),
    // Quintus: trace particle at Sun-Qaia L5 (60° behind Qaia)
    new Body({
      name: 'Quintus', mass: M_QUINTUS,
      x:  AU * Math.cos(Math.PI / 3), y: -AU * Math.sin(Math.PI / 3),
      vx: v_earth * Math.sin(Math.PI / 3), vy:  v_earth * Math.cos(Math.PI / 3),
      physicalRadius: R_QUINTUS, minDisplayPx: 4,
      color: '#FFDD55', trailColor: '#FFDD55', trailMaxLen: 2500,
    }),
    // Qaturn (9): hot Saturn at 0.1 AU (~11-day orbit), inclined 45°
    new Body({
      name: 'Bahamut', mass: M_SATURN,
      x: QATURN_A * Math.cos(BAHAMUT_PHASE), y: QATURN_A * Math.sin(BAHAMUT_PHASE),
      vx: -Math.sqrt(G * M_SUN / QATURN_A) * Math.sin(BAHAMUT_PHASE) * Math.cos(BAHAMUT_INC),
      vy:  Math.sqrt(G * M_SUN / QATURN_A) * Math.cos(BAHAMUT_PHASE) * Math.cos(BAHAMUT_INC),
      vz:  Math.sqrt(G * M_SUN / QATURN_A) * Math.sin(BAHAMUT_INC),
      physicalRadius: R_SATURN, minDisplayPx: 8,
      color: '#E8D080', trailColor: '#E8D080', trailMaxLen: 800, albedo: 0.47,
    }),
    // Vritra (10): super-Earth at 1.52 AU (Mars position), inclined 1.85°
    new Body({
      name: 'Vritra', mass: 3 * M_EARTH,
      x: 1.52 * AU * Math.cos(VRITRA_PHASE), y: 1.52 * AU * Math.sin(VRITRA_PHASE),
      vx: -Math.sqrt(G * M_SUN / (1.52 * AU)) * Math.sin(VRITRA_PHASE) * Math.cos(VRITRA_INC),
      vy:  Math.sqrt(G * M_SUN / (1.52 * AU)) * Math.cos(VRITRA_PHASE) * Math.cos(VRITRA_INC),
      vz:  Math.sqrt(G * M_SUN / (1.52 * AU)) * Math.sin(VRITRA_INC),
      physicalRadius: R_EARTH * Math.pow(3, 1 / 3), minDisplayPx: 5,
      color: '#C1440E', trailColor: '#C1440E', trailMaxLen: 2000, albedo: 0.25,
    }),
    // Fafnir (11): Venus-like planet at 0.723 AU (~225-day orbit), inclined 3.4°
    new Body({
      name: 'Fafnir', mass: M_VENUS,
      x: FAFNIR_A * cosF, y: FAFNIR_A * sinF,
      vx: -Math.sqrt(G * M_SUN / FAFNIR_A) * sinF * Math.cos(FAFNIR_INC),
      vy:  Math.sqrt(G * M_SUN / FAFNIR_A) * cosF * Math.cos(FAFNIR_INC),
      vz:  Math.sqrt(G * M_SUN / FAFNIR_A) * Math.sin(FAFNIR_INC),
      physicalRadius: R_VENUS, minDisplayPx: 5,
      color: '#E8C87A', trailColor: '#E8C87A', trailMaxLen: 2000, albedo: 0.76,
    }),
    // Tiamat (12): Jupiter-mass planet at 5.46 AU, inclined 1.3°
    new Body({
      name: 'Tiamat', mass: M_JUPITER,
      x: QUPITER_A * cosT, y: QUPITER_A * sinT,
      vx: -v_qupiter * sinT * Math.cos(TIAMAT_INC),
      vy:  v_qupiter * cosT * Math.cos(TIAMAT_INC),
      vz:  v_qupiter * Math.sin(TIAMAT_INC),
      physicalRadius: R_JUPITER, minDisplayPx: 10,
      color: '#C88B3A', trailColor: '#C88B3A', trailMaxLen: 3000, albedo: 0.52,
    }),
    // Red (12), Blue (13), Green (14): in 1:2:4 Laplace resonance, 120° apart
    // White (15): outside the resonance. Black is missing.
    new Body({
      name: 'Red', mass: M_IO,
      x: QUPITER_A * cosT + A_IO * (1 - E_IO), y: QUPITER_A * sinT,
      vx: -v_qupiter * sinT, vy: v_qupiter * cosT + v_io,
      physicalRadius: R_IO, minDisplayPx: 3,
      color: '#CC3322', trailColor: '#CC3322', trailMaxLen: 400,
      parentName: 'Tiamat',
    }),
    new Body({
      name: 'Blue', mass: M_EUROPA,
      x: QUPITER_A * cosT + A_EUROPA * (1 - E_EUROPA), y: QUPITER_A * sinT,
      vx: -v_qupiter * sinT, vy: v_qupiter * cosT + v_eur,
      physicalRadius: R_EUROPA, minDisplayPx: 3,
      color: '#4488CC', trailColor: '#4488CC', trailMaxLen: 500,
      parentName: 'Tiamat',
    }),
    new Body({
      name: 'Green', mass: M_GANYMEDE,
      x: QUPITER_A * cosT, y: QUPITER_A * sinT + A_GANYMEDE * (1 - E_GANYMEDE),
      vx: -v_qupiter * sinT - v_gan, vy: v_qupiter * cosT,
      physicalRadius: R_GANYMEDE, minDisplayPx: 3,
      color: '#448833', trailColor: '#448833', trailMaxLen: 600,
      parentName: 'Tiamat',
    }),
    new Body({
      name: 'White', mass: M_CALLISTO,
      x: QUPITER_A * cosT - A_CALLISTO * (1 - E_CALLISTO), y: QUPITER_A * sinT,
      vx: -v_qupiter * sinT, vy: v_qupiter * cosT - v_cal,
      physicalRadius: R_CALLISTO, minDisplayPx: 3,
      color: '#DDDDEE', trailColor: '#DDDDEE', trailMaxLen: 700,
      parentName: 'Tiamat',
    }),
  ];

  // Apply Newton's 3rd-law recoil to each parent body so that the
  // parent+children subsystem COM is at the parent's initial position
  // and moves at the parent's initial velocity.
  const bodyByName = Object.fromEntries(bodies.map(b => [b.name, b]));
  const childrenOf = {};
  for (const b of bodies) {
    if (b.parentName) (childrenOf[b.parentName] ??= []).push(b);
  }
  for (const [parentName, children] of Object.entries(childrenOf)) {
    const parent = bodyByName[parentName];
    if (!parent) continue;
    const x0 = parent.x, y0 = parent.y, z0 = parent.z;
    const v0x = parent.vx, v0y = parent.vy, v0z = parent.vz;
    for (const child of children) {
      parent.x  -= (child.mass / parent.mass) * (child.x  - x0);
      parent.y  -= (child.mass / parent.mass) * (child.y  - y0);
      parent.z  -= (child.mass / parent.mass) * (child.z  - z0);
      parent.vx -= (child.mass / parent.mass) * (child.vx - v0x);
      parent.vy -= (child.mass / parent.mass) * (child.vy - v0y);
      parent.vz -= (child.mass / parent.mass) * (child.vz - v0z);
    }
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
