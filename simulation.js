'use strict';

// Physical constants
const G = 6.674e-11;       // m³ kg⁻¹ s⁻²
const AU = 1.496e11;       // meters (1 astronomical unit)
const LUNAR_DIST = 3.844e8; // meters (Earth-Moon mean distance)

// Body physical data
const M_SUN   = 1.989e30;  // kg
const M_EARTH = 5.972e24;  // kg
const M_MOON  = 7.342e22;  // kg
const R_SUN   = 6.96e8;    // meters
const R_EARTH = 6.371e6;   // meters
const R_MOON  = 1.737e6;   // meters

// Secundus: quarter the mass of Primus, 1:2 resonance orbit with eccentricity 0.3
// Period ∝ a^(3/2), so a₂ = 2^(2/3) × LUNAR_DIST gives exactly T₂ = 2 × T_Primus.
// Eccentricity is set independently — it doesn't affect the period.
const M_SECUNDUS      = M_MOON / 4;
const R_SECUNDUS      = R_MOON * Math.cbrt(0.25);   // same density as Primus
const SECUNDUS_E      = 0.3;
const SECUNDUS_A      = Math.pow(2, 2 / 3) * LUNAR_DIST;
const SECUNDUS_R_PERI = SECUNDUS_A * (1 - SECUNDUS_E);

class Body {
  constructor(cfg) {
    this.name            = cfg.name;
    this.mass            = cfg.mass;
    this.x               = cfg.x;
    this.y               = cfg.y;
    this.z               = cfg.z  || 0;
    this.vx              = cfg.vx;
    this.vy              = cfg.vy;
    this.vz              = cfg.vz || 0;
    this.ax              = 0;
    this.ay              = 0;
    this.az              = 0;
    this.physicalRadius  = cfg.physicalRadius;
    this.minDisplayPx    = cfg.minDisplayPx || 4;
    this.color           = cfg.color;
    this.trailColor      = cfg.trailColor || cfg.color;
    this.trailMaxLen     = cfg.trailMaxLen || 2000;
    // Ring buffer — O(1) insert with no shifting.
    this.trailBuf        = [];
    this.trailHead       = 0;  // index of oldest point
    this.trailCount      = 0;  // number of valid points
  }

  recordTrail(refX = 0, refY = 0) {
    // Store position relative to the current reference body so trails render
    // correctly regardless of how far the reference body has moved since.
    const maxLen = this.trailMaxLen;
    if (this.trailCount < maxLen) {
      this.trailBuf.push({ x: this.x - refX, y: this.y - refY });
      this.trailCount++;
    } else {
      // Overwrite the oldest slot and advance the head pointer.
      const slot = this.trailBuf[this.trailHead];
      slot.x = this.x - refX;
      slot.y = this.y - refY;
      this.trailHead = (this.trailHead + 1) % maxLen;
    }
  }

  clearTrail() {
    this.trailBuf   = [];
    this.trailHead  = 0;
    this.trailCount = 0;
  }
}

class Simulation {
  constructor() {
    this.dt     = 360;   // simulation timestep: 6 minutes in seconds
    this.time   = 0;     // elapsed simulation seconds
    this.bodies = createInitialBodies();
    this._computeAccelerations();
    this.initialEnergy = this.totalEnergy();
  }

  _computeAccelerations() {
    const bodies = this.bodies;
    for (const b of bodies) {
      b.ax = 0;
      b.ay = 0;
      b.az = 0;
    }
    const n = bodies.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const bi = bodies[i];
        const bj = bodies[j];
        const dx = bj.x - bi.x;
        const dy = bj.y - bi.y;
        const dz = bj.z - bi.z;
        const r2 = dx * dx + dy * dy + dz * dz;
        const r3 = r2 * Math.sqrt(r2);
        const f  = G / r3;
        bi.ax += f * bj.mass * dx;
        bi.ay += f * bj.mass * dy;
        bi.az += f * bj.mass * dz;
        bj.ax -= f * bi.mass * dx;
        bj.ay -= f * bi.mass * dy;
        bj.az -= f * bi.mass * dz;
      }
    }
  }

  // Velocity Verlet (symplectic, 2nd-order, conserves energy well for orbits)
  _step() {
    const dt   = this.dt;
    const dt2h = 0.5 * dt * dt;
    const bodies = this.bodies;

    // Update positions: x(t+dt) = x(t) + v(t)*dt + 0.5*a(t)*dt²
    for (const b of bodies) {
      b.x += b.vx * dt + b.ax * dt2h;
      b.y += b.vy * dt + b.ay * dt2h;
      b.z += b.vz * dt + b.az * dt2h;
    }

    // Save old accelerations
    const ax0 = bodies.map(b => b.ax);
    const ay0 = bodies.map(b => b.ay);
    const az0 = bodies.map(b => b.az);

    // Compute new accelerations at x(t+dt)
    this._computeAccelerations();

    // Update velocities: v(t+dt) = v(t) + 0.5*(a(t) + a(t+dt))*dt
    for (let i = 0; i < bodies.length; i++) {
      bodies[i].vx += 0.5 * (ax0[i] + bodies[i].ax) * dt;
      bodies[i].vy += 0.5 * (ay0[i] + bodies[i].ay) * dt;
      bodies[i].vz += 0.5 * (az0[i] + bodies[i].az) * dt;
    }

    this.time += dt;
  }

  // Advance by n steps, recording trail every trailInterval steps.
  // refBodyIndex: index of the body to record positions relative to (null = CoM origin).
  advance(n, trailInterval = 10, refBodyIndex = null) {
    for (let i = 0; i < n; i++) {
      this._step();
      if (i % trailInterval === 0) {
        // Sample ref position *after* the step so trail is internally consistent.
        const refX = refBodyIndex !== null ? this.bodies[refBodyIndex].x : 0;
        const refY = refBodyIndex !== null ? this.bodies[refBodyIndex].y : 0;
        for (const b of this.bodies) b.recordTrail(refX, refY);
      }
    }
  }

  clearTrails() {
    for (const b of this.bodies) b.clearTrail();
  }

  totalEnergy() {
    let E = 0;
    const bodies = this.bodies;
    for (const b of bodies) {
      E += 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
    }
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const bi = bodies[i], bj = bodies[j];
        const dx = bj.x - bi.x, dy = bj.y - bi.y, dz = bj.z - bi.z;
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
        E -= G * bi.mass * bj.mass / r;
      }
    }
    return E;
  }

  // Relative energy drift from initial (should stay near 0 for good integration)
  energyError() {
    return (this.totalEnergy() - this.initialEnergy) / Math.abs(this.initialEnergy);
  }
}

const PRIMUS_INCLINATION = 5.14 * Math.PI / 180; // orbital inclination relative to xy-plane

function createInitialBodies() {
  // Circular orbit speeds
  const v_earth    = Math.sqrt(G * M_SUN   / AU);
  const v_moon_rel = Math.sqrt(G * M_EARTH / LUNAR_DIST);
  // Secundus periapsis velocity from vis-viva: v = sqrt(G M (1+e) / r_peri)
  const v_sec_peri = Math.sqrt(G * M_EARTH * (1 + SECUNDUS_E) / SECUNDUS_R_PERI);

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
      // Start at periapsis, 90° ahead of Primus (in +y from Qaia) to avoid overlap.
      // Prograde velocity at periapsis is perpendicular to radius: −x in Qaia's frame.
      x: AU, y: SECUNDUS_R_PERI, z: 0,
      vx: -v_sec_peri, vy: v_earth, vz: 0,
      physicalRadius: R_SECUNDUS,
      minDisplayPx: 3,
      color: '#CC9966',
      trailColor: '#CC9966',
      // 1400 recorded points × 10 steps × 360 s/step ≈ 58 days ≈ 1 Secundus orbit
      trailMaxLen: 1400,
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
