// 2-D shallow-water tide model on the Qamis map grid (ocean_grid.js), run on
// the GPU with WebGL2.
//
// Equations (depth H fixed, so linear apart from the friction):
//   ∂η/∂t = −∂(H u)/∂x − ∂(H v)/∂y
//   ∂u/∂t = −g ∂(η − η_eq)/∂x − f·v − r·u
//   ∂v/∂t = −g ∂(η − η_eq)/∂y + f·u − r·v
// with x east, y down the map (south), so f·u turns eastward flow south.
//   η_eq  equilibrium tide of the moons and Sun at each cell (Primus left out:
//         it's geosynchronous, so its tide is a static offset)
//   f     2Ω sin φ with Qaia's sidereal spin rate
//   r     quadratic bottom friction Cd·(|U| + U0)/H; U0 is a small floor
//
// Arakawa C grid: η at cell centres, transports U = H·u on the faces between
// columns and V = H·v on the faces between rows.  A face is open when the
// cells on both sides are sea; land faces stay at zero flow (walls).
// Forward–backward time stepping (η first, then U and V with the new η),
// alternating the order of the U and V updates each step; friction is
// semi-implicit.
//
// Open boundary: the outermost ring of cells is held at η_eq, and a sponge
// relaxes η toward η_eq (and damps the flow) over the outer `sponge` cells, so
// waves leaving the domain are absorbed rather than reflected.  The padding
// in ocean_grid.js keeps the sponge outside the map.
//
// Gaps (sub-grid straits, OCEAN.gaps): a 1-D channel between two sea cells,
//   du/dt = g·Δ(η − η_eq)/length − (Cd/depth + loss/(2·length))·|u|·u
// with volume flux u·width·depth moved from one end's footprint (the sea cells
// within ~1.5 cells of the end) to the other's.
//
// Forcing comes from tide frames (tides.js tideFrame): [K, u1, u2, u3] per
// body in the body-fixed frame.  η_eq = Σ K·(1.5(ẑ·û)² − 0.5) = ẑᵀAẑ − c is a
// quadratic form in the cell's zenith ẑ, so each step needs only the six
// components of A (interpolated linearly between frames, evaluated at each
// step's midpoint).
//
// GPU layout.  Textures are (nx+1) × (ny+1), texel (i, j) = cell (i, j) and
// the faces to its left (U) and above it (V):
//   state  R η   G U (face left)   B V (face above)      — ping-ponged
//   M      g·H·dt/dx at the U face and at the V face, sponge rate σ, cell flag
//          (0 land, 1 sea, 2 boundary ring, 3 sea in a gap's footprint)
//   F      gap footprint weights (signed: −w at a gap's first end, +w at its
//          second), one channel per gap (up to 4)
//   (state column nx, R channel, rows 0–3: the gaps' currents)
//   hist   R32F texture array, one layer per history slot (η over a region),
//          so a point's recent history never needs a full readback
// One step = two passes: continuity (FS_ETA), then both velocities (FS_UV).
// Performance notes (240×313 grid): each WebGL pass has a fixed cost (~5 µs
// on a desktop GPU), so passes are few; the rest is texture reads, so η_eq
// (from the cell's lat/lon, linear in the grid), Coriolis and 1/H are
// computed rather than stored.  The static textures and both state textures
// stay bound to fixed units; a pass only picks its source unit.  (A fully
// fused one-pass step was tried: no faster on a desktop GPU, slower on an
// integrated one, because of the recomputation.)
//
// Needs WebGL2 with EXT_color_buffer_float (any browser from the last few
// years).  Node has no WebGL: analysis scripts run the model in headless
// Chromium (analysis/ocean_run.mjs).

import { SPIN_RATE } from './frame.js';
import { TIDE_BODY_NAMES } from './tides.js';

const G = 9.81;
const DEG = Math.PI / 180;
const PRIMUS = TIDE_BODY_NAMES.indexOf('Primus');
// Fixed texture units (state textures use 0 and 8).
const UNIT = { M: 1, F: 2, HIST: 7, PROBE: 7, SCRATCH: 15 };

export const OCEAN_DEFAULTS = {
  dt: 40,          // s; CFL limit is ~42 s for 3000 m at 10 km cells (checked)
  cd: 0.0025,      // bottom drag coefficient
  u0: 0.05,        // m/s, friction speed floor
  sponge: 12,      // cells
  spongeRate: 1 / 1800,   // 1/s at the outer edge
};

// Equilibrium-tide tensor from a frame: [a11, a22, a33, 2a12, 2a13, 2a23, c],
// so that η_eq = a11 zx² + a22 zy² + a33 zz² + 2a12 zx zy + … − c.
export function forcingTensor(frame, out = new Float64Array(7), skip = PRIMUS) {
  out.fill(0);
  const n = frame.length / 4;
  for (let j = 0; j < n; j++) {
    if (j === skip) continue;
    const K = frame[4 * j], x = frame[4 * j + 1], y = frame[4 * j + 2], z = frame[4 * j + 3];
    const k = 1.5 * K;
    out[0] += k * x * x; out[1] += k * y * y; out[2] += k * z * z;
    out[3] += 2 * k * x * y; out[4] += 2 * k * x * z; out[5] += 2 * k * y * z;
    out[6] += 0.5 * K;
  }
  return out;
}

// ── shaders ─────────────────────────────────────────────────────────────

const VS = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D S, M;
layout(std140) uniform Forcing { vec4 A0; vec4 A1; };   // A1.xyz used; one buffer update per step
uniform vec4 geo;         // lat(j) = geo.x + geo.y·j, lon(i) = geo.z + geo.w·i  (radians)
out vec4 o;
// Equilibrium tide at cell c, from the zenith of the cell's lat/lon (both
// linear in the grid), so it costs no texture reads.
float eqAt(ivec2 c) {
  float p = geo.x + geo.y * float(c.y), l = geo.z + geo.w * float(c.x);
  float cp = cos(p), zz = sin(p), zx = cp * cos(l), zy = cp * sin(l);
  return dot(vec4(zx * zx, zy * zy, zz * zz, zx * zy), A0) + zx * zz * A1.x + zy * zz * A1.y - A1.z;
}
`;

// The step.  M (static, per texel) = (g·H·dt/dx at the U face, the same at
// the V face, sponge rate σ, cell flag: 0 land, 1 sea, 2 boundary ring,
// 3 sea in a gap's footprint).  1/H is recovered as cg / (g·H·dt/dx), and the
// Coriolis term comes from the row's latitude, so a face costs few reads.
//
// Column nx of the state (otherwise only the right boundary's U face) holds
// gap n's current in texel (nx, n).r.
const STEP_COMMON = HEAD + `
uniform sampler2D F;
uniform int nGaps, gx;
uniform ivec2 gA[4]; uniform ivec2 gB[4];
uniform float gK[4];      // g·dt/length
uniform float gD[4];      // dt·drag
uniform vec4 gapVol;      // area·dt per gap
uniform float idx, dt, cd, u0, cg, f2dt;   // cg = g·dt/dx; f2dt = 2Ω·dt

float gapU(int n) {
  float u = texelFetch(S, ivec2(gx, n), 0).r;
  float d = (texelFetch(S, gA[n], 0).r - eqAt(gA[n])) - (texelFetch(S, gB[n], 0).r - eqAt(gB[n]));
  return (u + gK[n] * d) / (1.0 + gD[n] * abs(u));
}
float fdt(float j) { return f2dt * sin(geo.x + geo.y * j); }   // f·dt at row j
`;

// η − η_eq at a cell after this step's continuity update, computed here.
const ETA_COMPUTED = `
float etaRel(ivec2 c) {
  vec4 s = texelFetch(S, c, 0), m = texelFetch(M, c, 0);
  float e = s.r - idx * (texelFetch(S, c + ivec2(1, 0), 0).g - s.g + texelFetch(S, c + ivec2(0, 1), 0).b - s.b);
  if (m.w == 3.0) {
    vec4 f = texelFetch(F, c, 0);
    for (int n = 0; n < 4; n++) { if (n >= nGaps) break; e += f[n] * gapU(n) * gapVol[n]; }
  }
  float eq = eqAt(c);
  e -= dt * m.z * (e - eq);
  if (m.w == 2.0) e = eq;
  return e - eq;
}
`;

// …or read from a texture that a continuity pass already wrote.
const ETA_FETCHED = `
float etaRel(ivec2 c) { return texelFetch(S, c, 0).r - eqAt(c); }
`;

const VEL = `
// U at the open face left of c and V at the open face above c, given the two
// new η − η_eq values either side and the cross-velocity average there.
float uE(ivec2 c, float gH, float eB, float eA, float vb) {
  float uq = texelFetch(S, c, 0).g, iH = cg / gH;
  float r = dt * (cd * (sqrt(uq * uq + vb * vb) * iH + u0) * iH + 0.5 * (texelFetch(M, c - ivec2(1, 0), 0).z + texelFetch(M, c, 0).z));
  return (uq - gH * (eB - eA) - fdt(float(c.y)) * vb) / (1.0 + r);
}
float vE(ivec2 c, float gH, float eB, float eA, float ub) {
  float vq = texelFetch(S, c, 0).b, iH = cg / gH;
  float r = dt * (cd * (sqrt(vq * vq + ub * ub) * iH + u0) * iH + 0.5 * (texelFetch(M, c - ivec2(0, 1), 0).z + texelFetch(M, c, 0).z));
  float j = float(c.y);
  return (vq - gH * (eB - eA) + 0.5 * (fdt(j - 1.0) + fdt(j)) * ub) / (1.0 + r);
}
// Face depth terms (0 = closed, also off the grid).
float gHu(ivec2 c) { return c.x >= 1 && c.y >= 0 ? texelFetch(M, c, 0).x : 0.0; }
float gHv(ivec2 c) { return c.x >= 0 && c.y >= 1 ? texelFetch(M, c, 0).y : 0.0; }
// Old-state averages of V at the U face c, and of U at the V face c.
float vbOld(ivec2 c) {
  ivec2 a = c - ivec2(1, 0);
  return 0.25 * (texelFetch(S, a, 0).b + texelFetch(S, c, 0).b + texelFetch(S, a + ivec2(0, 1), 0).b + texelFetch(S, c + ivec2(0, 1), 0).b);
}
float ubOld(ivec2 c) {
  ivec2 a = c - ivec2(0, 1);
  return 0.25 * (texelFetch(S, a, 0).g + texelFetch(S, a + ivec2(1, 0), 0).g + texelFetch(S, c, 0).g + texelFetch(S, c + ivec2(1, 0), 0).g);
}
`;

// Pass 1: continuity (η, and the gap currents in column nx).
const FS_ETA = STEP_COMMON + ETA_COMPUTED + `
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(S, c, 0);
  if (c.x == gx) { o = vec4(c.y < nGaps ? gapU(c.y) : 0.0, s.g, s.b, 0.0); return; }
  float e = texelFetch(M, c, 0).w == 0.0 ? 0.0 : etaRel(c) + eqAt(c);
  o = vec4(e, s.g, s.b, 0.0);
}`;

// Pass 2: both velocity components, the second using the new first at its 4
// neighbouring faces (recomputed here rather than in a third pass, which
// would cost more in per-pass overhead than the extra arithmetic).
const FS_UV = STEP_COMMON + ETA_FETCHED + VEL + `
float uFirst(ivec2 c) { float h = gHu(c); return h == 0.0 ? 0.0 : uE(c, h, etaRel(c), etaRel(c - ivec2(1, 0)), vbOld(c)); }
float vFirst(ivec2 c) { float h = gHv(c); return h == 0.0 ? 0.0 : vE(c, h, etaRel(c), etaRel(c - ivec2(0, 1)), ubOld(c)); }
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float e = texelFetch(S, c, 0).r;       // already updated (η, or a gap current in column nx)
  float U = 0.0, V = 0.0;
#ifdef U_FIRST
  U = uFirst(c);
  float h = gHv(c);
  if (h != 0.0) {
    ivec2 a = c - ivec2(0, 1);
    V = vE(c, h, etaRel(c), etaRel(a), 0.25 * (uFirst(a) + uFirst(a + ivec2(1, 0)) + U + uFirst(c + ivec2(1, 0))));
  }
#else
  V = vFirst(c);
  float h = gHu(c);
  if (h != 0.0) {
    ivec2 a = c - ivec2(1, 0);
    U = uE(c, h, etaRel(c), etaRel(a), 0.25 * (vFirst(a) + V + vFirst(a + ivec2(0, 1)) + vFirst(c + ivec2(0, 1))));
  }
#endif
  o = vec4(e, U, V, 0.0);
}`;

const FS_HCOPY = HEAD + `
uniform ivec2 off;
void main() { o = vec4(texelFetch(S, ivec2(gl_FragCoord.xy) + off, 0).r, 0.0, 0.0, 0.0); }`;

const FS_HGATHER = `#version 300 es
precision highp float; precision highp int; precision highp sampler2DArray;
uniform sampler2DArray Hist; uniform ivec2 cell;
out vec4 o;
void main() { o = vec4(texelFetch(Hist, ivec3(cell, int(gl_FragCoord.x)), 0).r, 0.0, 0.0, 0.0); }`;

// Probe recorder: texel (n, slot) ← state R at probe n's texel (a cell's η,
// or a gap's current in column nx).
const FS_PROBE = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D S, C;
out vec4 o;
void main() {
  ivec2 ij = ivec2(texelFetch(C, ivec2(int(gl_FragCoord.x), 0), 0).xy);
  o = vec4(texelFetch(S, ij, 0).r, 0.0, 0.0, 0.0);
}`;

// ── solver ──────────────────────────────────────────────────────────────

export class Ocean2D {
  // gl: a WebGL2 context (createOcean() makes one on an OffscreenCanvas).
  constructor(grid, gl, opts = {}) {
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('WebGL2 float render targets are not supported here');
    const o = { ...OCEAN_DEFAULTS, ...opts };
    const { nx, ny, sea, depth, lat, lon } = grid, N = nx * ny, W = nx + 1, H = ny + 1, NX1 = nx + 1, dt = o.dt;
    let hMax = 0;
    for (let k = 0; k < depth.length; k++) hMax = Math.max(hMax, depth[k]);
    const dtMax = grid.dx / (Math.sqrt(G * hMax) * Math.SQRT2);
    if (dt > 0.98 * dtMax) throw new Error(`ocean dt ${dt} s exceeds the CFL limit ${dtMax.toFixed(1)} s`);
    Object.assign(this, { grid, gl, dt, nx, ny, W, H, time: 0, _step: 0 });

    // Static per-texel data M = (g·H·dt/dx at the U face, at the V face, σ,
    // flag), and 1/H per face (kept for readSpeed()).
    this.iHu = new Float32Array(NX1 * ny); this.iHv = new Float32Array(nx * H);
    const M = new Float32Array(4 * W * H), F = new Float32Array(4 * W * H);
    const c = G * dt / grid.dx;
    for (let j = 0; j < ny; j++)
      for (let i = 1; i < nx; i++) {
        const a = j * nx + i - 1, b = a + 1;
        if (!(sea[a] && sea[b])) continue;
        const h = 0.5 * (depth[a] + depth[b]);
        M[4 * (j * W + i)] = c * h; this.iHu[j * NX1 + i] = 1 / h;
      }
    for (let j = 1; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const a = (j - 1) * nx + i, b = a + nx;
        if (!(sea[a] && sea[b])) continue;
        const h = 0.5 * (depth[a] + depth[b]);
        M[4 * (j * W + i) + 1] = c * h; this.iHv[j * nx + i] = 1 / h;
      }
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i, t = 4 * (j * W + i);
        if (!sea[k]) continue;
        const d = Math.min(i, j, nx - 1 - i, ny - 1 - j);
        M[t + 2] = d < o.sponge ? o.spongeRate * (1 - d / o.sponge) ** 2 : 0;
        M[t + 3] = d === 0 ? 2 : 1;
      }
    // Latitude and longitude are linear in the grid (ocean_grid.js).
    this.geo = [lat[0] * DEG, (lat[nx] - lat[0]) * DEG, lon[0] * DEG, (lon[1] - lon[0]) * DEG];

    // Gaps.
    if (grid.gaps.length > 4) throw new Error('the ocean model supports at most 4 gaps');
    this.gaps = grid.gaps.map((gp, n) => {
      gp.cells.forEach((k, end) => {
        for (const [m, w] of footprint(grid, k, 1.5)) {
          const i = m % nx, j = (m - i) / nx;
          F[4 * (j * W + i) + n] += end ? w : -w;
          M[4 * (j * W + i) + 3] = 3;               // in a gap's footprint
        }
      });
      return { ...gp, drag: o.cd / gp.depth + gp.loss / (2 * gp.length) };
    });

    // GL objects.
    this._quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.tex = { M: this._texture(W, H, M), F: this._texture(W, H, F) };
    this.state = [this._target(W, H), this._target(W, H)];
    this.state[0].unit = 0; this.state[1].unit = 8;
    for (const [name, unit] of Object.entries({ M: UNIT.M, F: UNIT.F })) {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, this.tex[name]);
    }
    for (const st of this.state) { gl.activeTexture(gl.TEXTURE0 + st.unit); gl.bindTexture(gl.TEXTURE_2D, st.tex); }
    const uFirst = src => src.replace('\n', '\n#define U_FIRST\n');
    this.prog = { eta: this._program(FS_ETA), uvU: this._program(uFirst(FS_UV)), uvV: this._program(FS_UV) };
    // The forcing tensor lives in a uniform buffer shared by every program.
    this._ubo = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, this._ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, 32, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this._ubo);
    this._uboData = new Float32Array(8);
    // A step is continuity (reads state[0], writes state[1]) then velocities
    // (reads state[1], writes state[0]), so the textures are back in place
    // after every step and each program's source unit never changes.
    this._stateA = this.state[0];
    gl.useProgram(this.prog.eta.p); gl.uniform1i(this.prog.eta.u.S, this.state[0].unit);
    for (const pr of [this.prog.uvU, this.prog.uvV]) { gl.useProgram(pr.p); gl.uniform1i(pr.u.S, this.state[1].unit); }
    const gaps = this.gaps;
    for (const pr of Object.values(this.prog)) this._use(pr, {
      nGaps: ['1i', gaps.length], gx: ['1i', nx],
      gA: ['2iv', flat(gaps.map(gp => cellXY(gp.cells[0], nx)), 4)],
      gB: ['2iv', flat(gaps.map(gp => cellXY(gp.cells[1], nx)), 4)],
      gK: ['1fv', pad4(gaps.map(gp => G * dt / gp.length))],
      gD: ['1fv', pad4(gaps.map(gp => dt * gp.drag))],
      gapVol: ['4fv', pad4(gaps.map(gp => gp.area * dt))], idx: ['1f', dt / grid.dx], dt: ['1f', dt],
      cd: ['1f', o.cd], u0: ['1f', o.u0], cg: ['1f', c], f2dt: ['1f', 2 * SPIN_RATE * dt],
      geo: ['4fv', Float32Array.from(this.geo)],
    });

    this._A = new Float64Array(7); this._A0 = new Float64Array(7); this._A1 = new Float64Array(7);
    this._readBuf = null; this._readStep = -1; this._readRegion = null;
  }

  // Static start: η = η_eq, still water.
  reset(frame, t = 0) {
    const gl = this.gl, { W, H, nx, ny, grid, geo } = this, A = forcingTensor(frame, this._A);
    const data = new Float32Array(4 * W * H);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        if (!grid.sea[j * nx + i]) continue;
        const p = geo[0] + geo[1] * j, l = geo[2] + geo[3] * i;
        const zx = Math.cos(p) * Math.cos(l), zy = Math.cos(p) * Math.sin(l), zz = Math.sin(p);
        data[4 * (j * W + i)] = A[0] * zx * zx + A[1] * zy * zy + A[2] * zz * zz + A[3] * zx * zy + A[4] * zx * zz + A[5] * zy * zz - A[6];
      }
    gl.activeTexture(gl.TEXTURE0 + this.state[0].unit);           // (its own unit: binding unchanged)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, H, 0, gl.RGBA, gl.FLOAT, data);   // gap currents (column nx) = 0
    this.time = t; this._step = 0; this._readStep = -1;
  }

  // Integrate across the interval from frame0 to frame1 (span seconds),
  // interpolating the forcing linearly.  span must be a multiple of dt.  By
  // default runs the whole interval; steps [s0, s1) run only part of it (the
  // caller tracks where it is), so playback isn't tied to the frame spacing.
  advance(frame0, frame1, span, s0 = 0, s1 = null) {
    forcingTensor(frame0, this._A0);
    forcingTensor(frame1, this._A1);
    const n = Math.round(span / this.dt);
    if (Math.abs(n * this.dt - span) > 1e-6) throw new Error(`advance: span ${span} s is not a multiple of dt ${this.dt} s`);
    const A = this._A, gl = this.gl;
    this._bindQuad();
    gl.viewport(0, 0, this.W, this.H);
    gl.bindBuffer(gl.UNIFORM_BUFFER, this._ubo);
    for (let s = s0; s < (s1 ?? n); s++) {
      const w = (s + 0.5) / n;                       // forcing at the step's midpoint
      for (let c = 0; c < 7; c++) A[c] = this._A0[c] + (this._A1[c] - this._A0[c]) * w;
      this._stepOnce(A);
    }
  }

  _stepOnce(A) {
    const gl = this.gl, pr = this.prog, st = this.state, d = this._uboData;
    if (st[0] !== this._stateA) throw new Error('ocean state textures out of step');
    d[0] = A[0]; d[1] = A[1]; d[2] = A[2]; d[3] = A[3]; d[4] = A[4]; d[5] = A[5]; d[6] = A[6];
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, d);
    gl.useProgram(pr.eta.p);                                   // continuity: state[0] → state[1]
    gl.bindFramebuffer(gl.FRAMEBUFFER, st[1].fb);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.useProgram((this._step++ & 1 ? pr.uvV : pr.uvU).p);     // velocities (alternating U/V order): state[1] → state[0]
    gl.bindFramebuffer(gl.FRAMEBUFFER, st[0].fb);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.time += this.dt;
  }

  // ── readout ──
  // Region { i0, j0, w, h } of cells; out[j·w + i] for cell (i0 + i, j0 + j).
  // The state is read once per step (with one extra column and row, for the
  // faces on the region's right and bottom edges) and cached.
  _read(region) {
    const r = this._readRegion;
    if (this._readStep === this._step && r && r.i0 === region.i0 && r.j0 === region.j0 && r.w === region.w && r.h === region.h)
      return this._readBuf;
    const gl = this.gl, w = Math.min(region.w + 1, this.W - region.i0), h = Math.min(region.h + 1, this.H - region.j0);
    if (!this._readBuf || this._readBuf.length !== 4 * w * h) this._readBuf = new Float32Array(4 * w * h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.state[0].fb);
    gl.readPixels(region.i0, region.j0, w, h, gl.RGBA, gl.FLOAT, this._readBuf);
    this._readBuf.w = w;
    this._readStep = this._step; this._readRegion = { ...region };
    return this._readBuf;
  }

  readEta(region, out = new Float32Array(region.w * region.h)) {
    const b = this._read(region), w = b.w;
    for (let j = 0; j < region.h; j++)
      for (let i = 0; i < region.w; i++) out[j * region.w + i] = b[4 * (j * w + i)];
    return out;
  }

  // Current speed (m/s) at cell centres.
  readSpeed(region, out = new Float32Array(region.w * region.h)) {
    const b = this._read(region), w = b.w, { nx, iHu, iHv } = this, NX1 = nx + 1;
    for (let j = 0; j < region.h; j++)
      for (let i = 0; i < region.w; i++) {
        const gi = region.i0 + i, gj = region.j0 + j, t = 4 * (j * w + i);
        const uc = 0.5 * (b[t + 1] * iHu[gj * NX1 + gi] + b[t + 5] * iHu[gj * NX1 + gi + 1]);
        const vc = 0.5 * (b[t + 2] * iHv[gj * nx + gi] + b[t + 4 * w + 2] * iHv[(gj + 1) * nx + gi]);
        out[j * region.w + i] = Math.hypot(uc, vc);
      }
    return out;
  }

  gapCurrents() {
    const gl = this.gl, n = this.gaps.length;
    if (!n) return [];
    const buf = new Float32Array(4 * n);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.state[0].fb);
    gl.readPixels(this.nx, 0, 1, n, gl.RGBA, gl.FLOAT, buf);
    return Array.from({ length: n }, (_, m) => buf[4 * m]);
  }

  // ── water-level history, kept on the GPU ──
  // A ring of `len` snapshots of η over a region; the caller picks the slot.
  initHistory(region, len) {
    const gl = this.gl, tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + UNIT.HIST);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.R32F, region.w, region.h, len);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const fbs = Array.from({ length: len }, (_, layer) => {
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, 0, layer);
      return fb;
    });
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('history framebuffer incomplete');
    this.prog.hcopy ??= this._program(FS_HCOPY);
    this.prog.hgather ??= this._program(FS_HGATHER);
    gl.useProgram(this.prog.hgather.p); gl.uniform1i(this.prog.hgather.loc('Hist'), UNIT.HIST);
    this.hist = { region, len, tex, fbs, gather: this._target(len, 1), buf: new Float32Array(4 * len) };
  }

  recordHistory(slot) {
    const gl = this.gl, { region, fbs } = this.hist, pr = this.prog.hcopy;
    gl.useProgram(pr.p);
    gl.uniform1i(pr.u.S, this.state[0].unit);
    gl.uniform2i(pr.loc('off'), region.i0, region.j0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbs[slot]);
    gl.viewport(0, 0, region.w, region.h);
    this._bindQuad();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // η (m) at region cell m in every slot, indexed by slot.
  readHistory(m) {
    const gl = this.gl, { region, len, tex, gather, buf } = this.hist, pr = this.prog.hgather;
    gl.useProgram(pr.p);
    gl.activeTexture(gl.TEXTURE0 + UNIT.HIST); gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.uniform2i(pr.loc('cell'), m % region.w, Math.floor(m / region.w));
    gl.bindFramebuffer(gl.FRAMEBUFFER, gather.fb);
    gl.viewport(0, 0, len, 1);
    this._bindQuad();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.readPixels(0, 0, len, 1, gl.RGBA, gl.FLOAT, buf);
    return Float32Array.from({ length: len }, (_, s) => buf[4 * s]);
  }

  // ── probes: time series at a few points, recorded on the GPU ──
  // probes: [{ cell: k } | { gap: n }]; len = rows buffered before a readback.
  initProbes(probes, len) {
    const gl = this.gl, n = probes.length, C = new Float32Array(4 * n);
    probes.forEach((p, m) => {
      if (p.gap != null) C.set([this.nx, p.gap, 0, 0], 4 * m);          // gap currents live in column nx
      else C.set([p.cell % this.nx, Math.floor(p.cell / this.nx), 0, 0], 4 * m);
    });
    this.prog.probe ??= this._program(FS_PROBE);
    this.probes = { n, len, C: this._texture(n, 1, C), target: this._target(n, len), buf: new Float32Array(4 * n * len) };
  }

  recordProbes(slot) {
    const gl = this.gl, pb = this.probes, pr = this.prog.probe;
    gl.useProgram(pr.p);
    gl.uniform1i(pr.u.S, this.state[0].unit);
    gl.activeTexture(gl.TEXTURE0 + UNIT.PROBE); gl.bindTexture(gl.TEXTURE_2D, pb.C); gl.uniform1i(pr.loc('C'), UNIT.PROBE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pb.target.fb);
    gl.viewport(0, slot, pb.n, 1);
    this._bindQuad();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Rows [0, rows) → [row][probe] values (one readback).
  readProbes(rows) {
    const gl = this.gl, pb = this.probes;
    gl.bindFramebuffer(gl.FRAMEBUFFER, pb.target.fb);
    gl.readPixels(0, 0, pb.n, rows, gl.RGBA, gl.FLOAT, pb.buf);
    return Array.from({ length: rows }, (_, r) => Float32Array.from({ length: pb.n }, (_, m) => pb.buf[4 * (r * pb.n + m)]));
  }

  // ── GL helpers ──
  _bindQuad() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }

  _texture(w, h, data) {
    const gl = this.gl, t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + UNIT.SCRATCH);       // never disturb the fixed units
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
                          [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]])
      gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  }

  _target(w, h) {
    const gl = this.gl, tex = this._texture(w, h, null), fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('float framebuffer incomplete');
    return { tex, fb, w, h };
  }

  _program(fs) {
    const gl = this.gl, sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`program: ${gl.getProgramInfoLog(p)}`);
    const loc = name => gl.getUniformLocation(p, name);
    const u = { S: loc('S') };
    const block = gl.getUniformBlockIndex(p, 'Forcing');
    if (block !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, block, 0);
    gl.useProgram(p);
    for (const name of ['M', 'F']) { const l = loc(name); if (l) gl.uniform1i(l, UNIT[name]); }
    return { p, u, loc };
  }

  _use(pr, uniforms) {
    const gl = this.gl;
    gl.useProgram(pr.p);
    for (const [name, [kind, v]] of Object.entries(uniforms)) gl[`uniform${kind}`](pr.loc(name), v);
  }
}

// An Ocean2D on its own offscreen WebGL2 context (works in workers too).
export function createOcean(grid, opts = {}) {
  if (typeof OffscreenCanvas === 'undefined') throw new Error('This browser has no OffscreenCanvas, which the tide model needs.');
  const gl = new OffscreenCanvas(1, 1).getContext('webgl2', { antialias: false, depth: false, stencil: false });
  if (!gl) throw new Error('The tide model needs WebGL2, which this browser does not provide.');
  return new Ocean2D(grid, gl, opts);
}

// Sea cells within radius r (cells) of cell k, weighted by 1/area so the
// weights sum to 1 / (total area): adding vol·w to each η adds vol in total.
function footprint(grid, k, r) {
  const { nx, ny, sea, dx } = grid;
  const i0 = k % nx, j0 = (k - i0) / nx, R = Math.ceil(r), cells = [];
  for (let j = j0 - R; j <= j0 + R; j++)
    for (let i = i0 - R; i <= i0 + R; i++) {
      if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
      const m = j * nx + i;
      if (sea[m] && (i - i0) ** 2 + (j - j0) ** 2 <= r * r) cells.push(m);
    }
  const w = 1 / (cells.length * dx * dx);
  return cells.map(m => [m, w]);
}

const cellXY = (k, nx) => [k % nx, Math.floor(k / nx)];
const pad4 = a => Float32Array.from({ length: 4 }, (_, n) => a[n] ?? 0);
const flat = (pairs, n) => Int32Array.from({ length: 2 * n }, (_, m) => pairs[m >> 1]?.[m & 1] ?? 0);
