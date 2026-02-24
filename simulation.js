// Gravitational constant — used by both the integrator and bodies.js
export const G = 6.674e-11;  // m³ kg⁻¹ s⁻²

export class Body {
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
    // Anchor: magically lock body to a circular orbit around another body.
    // { toIndex: int, radius: m, omega: rad/s, phase: rad (angle at t=0) }
    this.anchor          = cfg.anchor || null;
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

export class Simulation {
  constructor(bodies) {
    this.dt     = 360;   // simulation timestep: 6 minutes in seconds
    this.time   = 0;     // elapsed simulation seconds
    this.bodies = bodies;
    // Cache anchored bodies to avoid scanning all bodies every step.
    this._anchors = bodies
      .filter(b => b.anchor)
      .map(b => ({ body: b, ref: bodies[b.anchor.toIndex], cfg: b.anchor }));
    this._enforceAnchors();
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

  // Override anchored bodies to exact geosynchronous positions and velocities.
  // Called at construction and after each Velocity Verlet step.
  _enforceAnchors() {
    const PI2 = 2 * Math.PI;
    for (const { body: b, ref, cfg } of this._anchors) {
      // Wrap angle to [0, 2π] to keep trig args small (avoids costly range reduction).
      const θ    = (cfg.phase + cfg.omega * this.time) % PI2;
      const cosθ = Math.cos(θ), sinθ = Math.sin(θ);
      // Apply orbital inclination (rotation around ascending-node axis, i.e. x-axis).
      const cosI = cfg.inclination ? Math.cos(cfg.inclination) : 1;
      const sinI = cfg.inclination ? Math.sin(cfg.inclination) : 0;
      b.x  = ref.x  + cfg.radius * cosθ;
      b.y  = ref.y  + cfg.radius * sinθ * cosI;
      b.z  = ref.z  + cfg.radius * sinθ * sinI;
      b.vx = ref.vx - cfg.radius * cfg.omega * sinθ;
      b.vy = ref.vy + cfg.radius * cfg.omega * cosθ * cosI;
      b.vz = ref.vz + cfg.radius * cfg.omega * cosθ * sinI;
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

    // Enforce anchors at t+dt so trails record exact positions.
    this._enforceAnchors();
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
