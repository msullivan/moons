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
    // Pre-allocated typed arrays for the hot physics loop.
    const n = bodies.length;
    this._n    = n;
    this._px   = new Float64Array(n);
    this._py   = new Float64Array(n);
    this._pz   = new Float64Array(n);
    this._tax  = new Float64Array(n);  // accumulator for _computeAccelerations
    this._tay  = new Float64Array(n);
    this._taz  = new Float64Array(n);
    this._ax0  = new Float64Array(n);  // saved accelerations for Velocity Verlet
    this._ay0  = new Float64Array(n);
    this._az0  = new Float64Array(n);
    this._mass = new Float64Array(n);
    for (let i = 0; i < n; i++) this._mass[i] = bodies[i].mass;
    this._enforceAnchors();
    this._computeAccelerations();
    this.initialEnergy = this.totalEnergy();
  }

  _computeAccelerations() {
    const bodies = this.bodies;
    const n   = this._n;
    const px  = this._px,  py  = this._py,  pz  = this._pz;
    const tax = this._tax, tay = this._tay, taz = this._taz;
    const mass = this._mass;

    for (let i = 0; i < n; i++) {
      px[i] = bodies[i].x;
      py[i] = bodies[i].y;
      pz[i] = bodies[i].z;
      tax[i] = tay[i] = taz[i] = 0;
    }
    for (let i = 0; i < n; i++) {
      const xi = px[i], yi = py[i], zi = pz[i], mi = mass[i];
      for (let j = i + 1; j < n; j++) {
        const dx = px[j] - xi;
        const dy = py[j] - yi;
        const dz = pz[j] - zi;
        const r2 = dx * dx + dy * dy + dz * dz;
        const f  = G / (r2 * Math.sqrt(r2));
        const fj = f * mass[j];
        const fi = f * mi;
        tax[i] += fj * dx;  tay[i] += fj * dy;  taz[i] += fj * dz;
        tax[j] -= fi * dx;  tay[j] -= fi * dy;  taz[j] -= fi * dz;
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
      // Apply orbital inclination (rotation around y-axis so that the ascending node
      // is on the ±y axis; at t=0 Qaia is on the x-axis → winter solstice).
      // North-pole direction = (+sinI, 0, cosI).
      const cosI = cfg.inclination ? Math.cos(cfg.inclination) : 1;
      const sinI = cfg.inclination ? Math.sin(cfg.inclination) : 0;
      b.x  = ref.x  + cfg.radius * cosθ * cosI;
      b.y  = ref.y  + cfg.radius * sinθ;
      b.z  = ref.z  - cfg.radius * cosθ * sinI;
      b.vx = ref.vx - cfg.radius * cfg.omega * sinθ * cosI;
      b.vy = ref.vy + cfg.radius * cfg.omega * cosθ;
      b.vz = ref.vz + cfg.radius * cfg.omega * sinθ * sinI;
    }
  }

  // Velocity Verlet (symplectic, 2nd-order, conserves energy well for orbits)
  _step() {
    const dt   = this.dt;
    const dt2h = 0.5 * dt * dt;
    const bodies = this.bodies;

    const n   = this._n;
    const tax = this._tax, tay = this._tay, taz = this._taz;
    const ax0 = this._ax0, ay0 = this._ay0, az0 = this._az0;

    // Update positions: x(t+dt) = x(t) + v(t)*dt + 0.5*a(t)*dt²
    // (current accelerations live in _tax/_tay/_taz from the previous step)
    for (let i = 0; i < n; i++) {
      bodies[i].x += bodies[i].vx * dt + tax[i] * dt2h;
      bodies[i].y += bodies[i].vy * dt + tay[i] * dt2h;
      bodies[i].z += bodies[i].vz * dt + taz[i] * dt2h;
    }

    // Save a(t) before overwriting with a(t+dt)
    ax0.set(tax);  ay0.set(tay);  az0.set(taz);

    // Compute new accelerations at x(t+dt) — results go into _tax/_tay/_taz
    this._computeAccelerations();

    // Update velocities: v(t+dt) = v(t) + 0.5*(a(t) + a(t+dt))*dt
    const dth = 0.5 * dt;
    for (let i = 0; i < n; i++) {
      bodies[i].vx += (ax0[i] + tax[i]) * dth;
      bodies[i].vy += (ay0[i] + tay[i]) * dth;
      bodies[i].vz += (az0[i] + taz[i]) * dth;
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
    // Sync accelerations back to body objects so callers see consistent state.
    for (let i = 0; i < this._n; i++) {
      this.bodies[i].ax = this._tax[i];
      this.bodies[i].ay = this._tay[i];
      this.bodies[i].az = this._taz[i];
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
