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
    this.albedo          = cfg.albedo || 0;
    this.parentName      = cfg.parentName || null;
  }

  // x, y default to this.x/y so existing callers still work;
  // Simulation.advance() passes typed-array values directly.
  recordTrail(refX = 0, refY = 0, x = this.x, y = this.y) {
    // Store position relative to the current reference body so trails render
    // correctly regardless of how far the reference body has moved since.
    const maxLen = this.trailMaxLen;
    if (this.trailCount < maxLen) {
      this.trailBuf.push({ x: x - refX, y: y - refY });
      this.trailCount++;
    } else {
      // Overwrite the oldest slot and advance the head pointer.
      const slot = this.trailBuf[this.trailHead];
      slot.x = x - refX;
      slot.y = y - refY;
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
    // Cache anchored bodies (by index) to avoid scanning all bodies every step.
    this._anchors = bodies
      .filter(b => b.anchor)
      .map(b => ({ idx: bodies.indexOf(b), refIdx: b.anchor.toIndex, cfg: b.anchor }));
    // Pre-allocated typed arrays — the hot physics loop never touches body objects.
    const n = bodies.length;
    this._n   = n;
    this._bx  = new Float64Array(n);   // positions
    this._by  = new Float64Array(n);
    this._bz  = new Float64Array(n);
    this._bvx = new Float64Array(n);   // velocities
    this._bvy = new Float64Array(n);
    this._bvz = new Float64Array(n);
    this._tax = new Float64Array(n);   // current accelerations (output of _computeAccelerations)
    this._tay = new Float64Array(n);
    this._taz = new Float64Array(n);
    this._ax0 = new Float64Array(n);   // saved accelerations for Velocity Verlet
    this._ay0 = new Float64Array(n);
    this._az0 = new Float64Array(n);
    this._mass = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      this._bx[i] = b.x;  this._by[i] = b.y;  this._bz[i] = b.z;
      this._bvx[i] = b.vx; this._bvy[i] = b.vy; this._bvz[i] = b.vz;
      this._mass[i] = b.mass;
    }
    this._enforceAnchors();
    this._computeAccelerations();
    this.initialEnergy = this.totalEnergy();
  }

  // Copy typed-array state back to body objects (called at end of advance()).
  _syncToObjects() {
    const n = this._n;
    const bx = this._bx, by = this._by, bz = this._bz;
    const bvx = this._bvx, bvy = this._bvy, bvz = this._bvz;
    const tax = this._tax, tay = this._tay, taz = this._taz;
    for (let i = 0; i < n; i++) {
      const b = this.bodies[i];
      b.x = bx[i];  b.y = by[i];  b.z = bz[i];
      b.vx = bvx[i]; b.vy = bvy[i]; b.vz = bvz[i];
      b.ax = tax[i]; b.ay = tay[i]; b.az = taz[i];
    }
  }

  _computeAccelerations() {
    const n    = this._n;
    const bx   = this._bx,  by   = this._by,  bz   = this._bz;
    const tax  = this._tax, tay  = this._tay, taz  = this._taz;
    const mass = this._mass;

    for (let i = 0; i < n; i++) tax[i] = tay[i] = taz[i] = 0;

    for (let i = 0; i < n; i++) {
      const xi = bx[i], yi = by[i], zi = bz[i], mi = mass[i];
      for (let j = i + 1; j < n; j++) {
        const dx = bx[j] - xi;
        const dy = by[j] - yi;
        const dz = bz[j] - zi;
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
    const bx = this._bx, by = this._by, bz = this._bz;
    const bvx = this._bvx, bvy = this._bvy, bvz = this._bvz;
    const mass = this._mass;
    for (const { idx, refIdx, cfg } of this._anchors) {
      const θ    = (cfg.phase + cfg.omega * this.time) % PI2;
      const cosθ = Math.cos(θ), sinθ = Math.sin(θ);
      const cosI = cfg.inclination ? Math.cos(cfg.inclination) : 1;
      const sinI = cfg.inclination ? Math.sin(cfg.inclination) : 0;

      const ox = bx[idx], oy = by[idx], oz = bz[idx];
      const ovx = bvx[idx], ovy = bvy[idx], ovz = bvz[idx];

      bx[idx]  = bx[refIdx]  + cfg.radius * cosθ * cosI;
      by[idx]  = by[refIdx]  + cfg.radius * sinθ;
      bz[idx]  = bz[refIdx]  - cfg.radius * cosθ * sinI;
      bvx[idx] = bvx[refIdx] - cfg.radius * cfg.omega * sinθ * cosI;
      bvy[idx] = bvy[refIdx] + cfg.radius * cfg.omega * cosθ;
      bvz[idx] = bvz[refIdx] + cfg.radius * cfg.omega * sinθ * sinI;

      // Conserve momentum: apply equal-and-opposite correction to reference body.
      const mr = mass[idx] / mass[refIdx];
      bx[refIdx]  -= mr * (bx[idx]  - ox);
      by[refIdx]  -= mr * (by[idx]  - oy);
      bz[refIdx]  -= mr * (bz[idx]  - oz);
      bvx[refIdx] -= mr * (bvx[idx] - ovx);
      bvy[refIdx] -= mr * (bvy[idx] - ovy);
      bvz[refIdx] -= mr * (bvz[idx] - ovz);
    }
  }

  // Velocity Verlet (symplectic, 2nd-order, conserves energy well for orbits).
  // NOTE: body objects are NOT updated here — call _syncToObjects() when needed.
  _step() {
    const dt   = this.dt;
    const dt2h = 0.5 * dt * dt;
    const n    = this._n;
    const bx   = this._bx,  by   = this._by,  bz   = this._bz;
    const bvx  = this._bvx, bvy  = this._bvy, bvz  = this._bvz;
    const tax  = this._tax, tay  = this._tay, taz  = this._taz;
    const ax0  = this._ax0, ay0  = this._ay0, az0  = this._az0;

    // Update positions: x(t+dt) = x(t) + v(t)*dt + 0.5*a(t)*dt²
    for (let i = 0; i < n; i++) {
      bx[i] += bvx[i] * dt + tax[i] * dt2h;
      by[i] += bvy[i] * dt + tay[i] * dt2h;
      bz[i] += bvz[i] * dt + taz[i] * dt2h;
    }

    // Save a(t) before overwriting with a(t+dt)
    ax0.set(tax);  ay0.set(tay);  az0.set(taz);

    // Compute new accelerations at x(t+dt) — results go into _tax/_tay/_taz
    this._computeAccelerations();

    // Update velocities: v(t+dt) = v(t) + 0.5*(a(t) + a(t+dt))*dt
    const dth = 0.5 * dt;
    for (let i = 0; i < n; i++) {
      bvx[i] += (ax0[i] + tax[i]) * dth;
      bvy[i] += (ay0[i] + tay[i]) * dth;
      bvz[i] += (az0[i] + taz[i]) * dth;
    }

    this.time += dt;

    // Enforce anchors at t+dt so trails record exact positions.
    this._enforceAnchors();
  }

  // Advance by n steps, recording trail every trailInterval steps.
  // refBodyIndex: index of the body to record positions relative to (null = CoM origin).
  advance(n, trailInterval = 10, refBodyIndex = null) {
    const bx = this._bx, by = this._by;
    for (let i = 0; i < n; i++) {
      this._step();
      if (i % trailInterval === 0) {
        // Sample ref position *after* the step so trail is internally consistent.
        const refX = refBodyIndex !== null ? bx[refBodyIndex] : 0;
        const refY = refBodyIndex !== null ? by[refBodyIndex] : 0;
        for (let j = 0; j < this._n; j++) {
          this.bodies[j].recordTrail(refX, refY, bx[j], by[j]);
        }
      }
    }
    // Sync all state back to body objects so callers see consistent state.
    this._syncToObjects();
  }

  clearTrails() {
    for (const b of this.bodies) b.clearTrail();
  }

  totalEnergy() {
    const n    = this._n;
    const bx   = this._bx,  by   = this._by,  bz   = this._bz;
    const bvx  = this._bvx, bvy  = this._bvy, bvz  = this._bvz;
    const mass = this._mass;
    let E = 0;
    for (let i = 0; i < n; i++) {
      E += 0.5 * mass[i] * (bvx[i] * bvx[i] + bvy[i] * bvy[i] + bvz[i] * bvz[i]);
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = bx[j] - bx[i], dy = by[j] - by[i], dz = bz[j] - bz[i];
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
        E -= G * mass[i] * mass[j] / r;
      }
    }
    return E;
  }

  // Relative energy drift from initial (should stay near 0 for good integration)
  energyError() {
    return (this.totalEnergy() - this.initialEnergy) / Math.abs(this.initialEnergy);
  }
}
