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

class Body {
  constructor(cfg) {
    this.name            = cfg.name;
    this.mass            = cfg.mass;
    this.x               = cfg.x;
    this.y               = cfg.y;
    this.vx              = cfg.vx;
    this.vy              = cfg.vy;
    this.ax              = 0;
    this.ay              = 0;
    this.physicalRadius  = cfg.physicalRadius;
    this.minDisplayPx    = cfg.minDisplayPx || 4;
    this.color           = cfg.color;
    this.trailColor      = cfg.trailColor || cfg.color;
    this.trailMaxLen     = cfg.trailMaxLen || 2000;
    this.trail           = []; // array of {x, y}
  }

  recordTrail(refX = 0, refY = 0) {
    // Store position relative to the current reference body so trails render
    // correctly regardless of how far the reference body has moved since.
    this.trail.push({ x: this.x - refX, y: this.y - refY });
    if (this.trail.length > this.trailMaxLen) {
      this.trail.shift();
    }
  }
}

class Simulation {
  constructor() {
    this.dt     = 3600;  // simulation timestep: 1 hour in seconds
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
    }
    const n = bodies.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const bi = bodies[i];
        const bj = bodies[j];
        const dx = bj.x - bi.x;
        const dy = bj.y - bi.y;
        const r2 = dx * dx + dy * dy;
        const r3 = r2 * Math.sqrt(r2);
        const f  = G / r3;
        bi.ax += f * bj.mass * dx;
        bi.ay += f * bj.mass * dy;
        bj.ax -= f * bi.mass * dx;
        bj.ay -= f * bi.mass * dy;
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
    }

    // Save old accelerations
    const ax0 = bodies.map(b => b.ax);
    const ay0 = bodies.map(b => b.ay);

    // Compute new accelerations at x(t+dt)
    this._computeAccelerations();

    // Update velocities: v(t+dt) = v(t) + 0.5*(a(t) + a(t+dt))*dt
    for (let i = 0; i < bodies.length; i++) {
      bodies[i].vx += 0.5 * (ax0[i] + bodies[i].ax) * dt;
      bodies[i].vy += 0.5 * (ay0[i] + bodies[i].ay) * dt;
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
    for (const b of this.bodies) b.trail = [];
  }

  totalEnergy() {
    let E = 0;
    const bodies = this.bodies;
    for (const b of bodies) {
      E += 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy);
    }
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const bi = bodies[i], bj = bodies[j];
        const dx = bj.x - bi.x, dy = bj.y - bi.y;
        const r = Math.sqrt(dx * dx + dy * dy);
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

function createInitialBodies() {
  // Circular orbit speeds
  const v_earth    = Math.sqrt(G * M_SUN   / AU);
  const v_moon_rel = Math.sqrt(G * M_EARTH / LUNAR_DIST);

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
      name: 'Earth',
      mass: M_EARTH,
      x: AU, y: 0,
      vx: 0, vy: v_earth,
      physicalRadius: R_EARTH,
      minDisplayPx: 6,
      color: '#4499FF',
      trailColor: '#4499FF',
      // 9000 steps × 3600 s/step = 375 days → covers one full Earth orbit
      trailMaxLen: 9000,
    }),
    new Body({
      name: 'Moon',
      mass: M_MOON,
      x: AU + LUNAR_DIST, y: 0,
      vx: 0, vy: v_earth + v_moon_rel,
      physicalRadius: R_MOON,
      minDisplayPx: 3,
      color: '#CCCCCC',
      trailColor: '#CCCCCC',
      // 700 steps × 3600 s/step ≈ 29 days → covers one lunar cycle
      trailMaxLen: 700,
    }),
  ];

  // Shift to centre-of-mass frame (zero total momentum, origin at CoM)
  let totalMass = 0, cmX = 0, cmY = 0, cmVx = 0, cmVy = 0;
  for (const b of bodies) {
    totalMass += b.mass;
    cmX  += b.mass * b.x;
    cmY  += b.mass * b.y;
    cmVx += b.mass * b.vx;
    cmVy += b.mass * b.vy;
  }
  cmX /= totalMass; cmY /= totalMass;
  cmVx /= totalMass; cmVy /= totalMass;
  for (const b of bodies) {
    b.x  -= cmX;  b.y  -= cmY;
    b.vx -= cmVx; b.vy -= cmVy;
  }

  return bodies;
}
