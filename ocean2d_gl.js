// WebGL2 version of the 2-D tide solver (ocean2d.js): same equations, grid,
// boundary conditions and gap, run as fragment-shader passes on float
// textures.  Same interface as Ocean2D: reset(frame, t), advance(f0, f1, span),
// readEta / readSpeed (region of cells), gapCurrents(), time.
//
// Textures are (nx+1) × (ny+1), texel (i, j) = cell (i, j) and the faces to
// its left (U) and above it (V):
//   state  R η   G U (face left)   B V (face above)      — ping-ponged
//   P      gH·dt/dx and 1/H for the U face, then for the V face
//   Q      sponge rate σ, cell flag (0 land, 1 sea, 2 boundary ring), f·dt at
//          the U face row, f·dt at the V face
//   Z1, Z2 zenith quadratic terms (zx², zy², zz², zx·zy) and (zx·zz, zy·zz)
//   F      gap footprint weights (signed: −w at a gap's first end, +w at its
//          second), one channel per gap (up to 4)
//   gaps   4×1, R = gap current u — ping-ponged
//   hist   R32F texture array, one layer per history slot (η over a region),
//          so the page's 48 h history never needs a full readback
// One step = gap pass (momentum from the current levels), continuity pass
// (η, plus gap volume, sponge and ring), then the U and V passes, in
// alternating order.  η_eq is computed in the shaders from the tensor A,
// interpolated for every step.
//
// Needs WebGL2 with EXT_color_buffer_float.  createOcean() falls back to the
// CPU solver when that's missing.

import { Ocean2D, forcingTensor, OCEAN_DEFAULTS } from './ocean2d.js';

const VS = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D S, P, Q, Z1, Z2;
uniform vec4 A0; uniform vec3 A1;
out vec4 o;
float eqAt(ivec2 c) {
  vec4 z1 = texelFetch(Z1, c, 0); vec4 z2 = texelFetch(Z2, c, 0);
  return dot(z1, A0) + z2.x * A1.x + z2.y * A1.y - A1.z;
}
`;

const FS_GAP = HEAD + `
uniform sampler2D GAPS;
uniform int nGaps; uniform ivec2 gA[4]; uniform ivec2 gB[4];
uniform float gK[4];      // g·dt/length
uniform float gD[4];      // dt·drag
void main() {
  int n = int(gl_FragCoord.x);
  if (n >= nGaps) { o = vec4(0.0); return; }
  float u = texelFetch(GAPS, ivec2(n, 0), 0).r;
  float d = (texelFetch(S, gA[n], 0).r - eqAt(gA[n])) - (texelFetch(S, gB[n], 0).r - eqAt(gB[n]));
  o = vec4((u + gK[n] * d) / (1.0 + gD[n] * abs(u)), 0.0, 0.0, 0.0);
}`;

const FS_CONT = HEAD + `
uniform sampler2D F, GAPS;
uniform vec4 gapVol;      // area·dt per gap
uniform float idx, dt;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(S, c, 0), q = texelFetch(Q, c, 0);
  if (q.y == 0.0) { o = vec4(0.0, s.g, s.b, 0.0); return; }
  float e = s.r - idx * (texelFetch(S, c + ivec2(1, 0), 0).g - s.g + texelFetch(S, c + ivec2(0, 1), 0).b - s.b);
  vec4 gu = vec4(texelFetch(GAPS, ivec2(0, 0), 0).r, texelFetch(GAPS, ivec2(1, 0), 0).r,
                 texelFetch(GAPS, ivec2(2, 0), 0).r, texelFetch(GAPS, ivec2(3, 0), 0).r);
  e += dot(texelFetch(F, c, 0), gu * gapVol);
  float eq = eqAt(c);
  e -= dt * q.x * (e - eq);
  if (q.y == 2.0) e = eq;
  o = vec4(e, s.g, s.b, 0.0);
}`;

const FS_U = HEAD + `
uniform float dt, cd, u0;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(S, c, 0), p = texelFetch(P, c, 0);
  if (p.x == 0.0) { o = vec4(s.r, 0.0, s.b, 0.0); return; }
  ivec2 a = c - ivec2(1, 0);
  vec4 sa = texelFetch(S, a, 0);
  float vb = 0.25 * (sa.b + s.b + texelFetch(S, a + ivec2(0, 1), 0).b + texelFetch(S, c + ivec2(0, 1), 0).b);
  float uq = s.g, iH = p.y;
  vec4 qa = texelFetch(Q, a, 0), qb = texelFetch(Q, c, 0);
  float r = dt * (cd * (sqrt(uq * uq + vb * vb) * iH + u0) * iH + 0.5 * (qa.x + qb.x));
  float U = (uq - p.x * ((s.r - eqAt(c)) - (sa.r - eqAt(a))) - qb.z * vb) / (1.0 + r);
  o = vec4(s.r, U, s.b, 0.0);
}`;

const FS_V = HEAD + `
uniform float dt, cd, u0;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(S, c, 0), p = texelFetch(P, c, 0);
  if (p.z == 0.0) { o = vec4(s.r, s.g, 0.0, 0.0); return; }
  ivec2 a = c - ivec2(0, 1);
  vec4 sa = texelFetch(S, a, 0);
  float ub = 0.25 * (sa.g + texelFetch(S, a + ivec2(1, 0), 0).g + s.g + texelFetch(S, c + ivec2(1, 0), 0).g);
  float vq = s.b, iH = p.w;
  vec4 qa = texelFetch(Q, a, 0), qb = texelFetch(Q, c, 0);
  float r = dt * (cd * (sqrt(vq * vq + ub * ub) * iH + u0) * iH + 0.5 * (qa.x + qb.x));
  float V = (vq - p.z * ((s.r - eqAt(c)) - (sa.r - eqAt(a))) + qb.w * ub) / (1.0 + r);
  o = vec4(s.r, s.g, V, 0.0);
}`;

const FS_HCOPY = HEAD + `
uniform ivec2 off;
void main() { o = vec4(texelFetch(S, ivec2(gl_FragCoord.xy) + off, 0).r, 0.0, 0.0, 0.0); }`;

const FS_HGATHER = `#version 300 es
precision highp float; precision highp int; precision highp sampler2DArray;
uniform sampler2DArray Hist; uniform ivec2 cell;
out vec4 o;
void main() { o = vec4(texelFetch(Hist, ivec3(cell, int(gl_FragCoord.x)), 0).r, 0.0, 0.0, 0.0); }`;

export class Ocean2DGL {
  // gl: a WebGL2 context (e.g. from new OffscreenCanvas(1, 1)).
  constructor(grid, gl, opts = {}) {
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('WebGL2 float render targets not supported');
    // The CPU solver builds all the per-cell and per-face coefficients.
    const cpu = new Ocean2D(grid, opts);
    if (cpu.gaps.length > 4) throw new Error('Ocean2DGL supports at most 4 gaps');
    Object.assign(this, { grid, gl, cpu, dt: cpu.dt, nx: cpu.nx, ny: cpu.ny, time: 0, _step: 0 });
    const { nx, ny } = this, W = nx + 1, H = ny + 1, NX1 = nx + 1;
    this.W = W; this.H = H;

    // Static textures.
    const P = new Float32Array(4 * W * H), Q = new Float32Array(4 * W * H);
    const Z1 = new Float32Array(4 * W * H), Z2 = new Float32Array(4 * W * H), F = new Float32Array(4 * W * H);
    const ringSet = new Set(cpu.ring);
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const t = 4 * (j * W + i);
        if (j < ny) { P[t] = cpu.gHu[j * NX1 + i]; P[t + 1] = cpu.iHu[j * NX1 + i]; }
        if (i < nx) { P[t + 2] = cpu.gHv[j * nx + i]; P[t + 3] = cpu.iHv[j * nx + i]; }
        if (i < nx && j < ny) {
          const k = j * nx + i;
          Q[t] = cpu.sigma[k];
          Q[t + 1] = grid.sea[k] ? (ringSet.has(k) ? 2 : 1) : 0;
          const zq = cpu.zq.subarray(6 * k, 6 * k + 6);
          Z1.set([zq[0], zq[1], zq[2], zq[3]], t); Z2[t] = zq[4]; Z2[t + 1] = zq[5];
        }
        if (j < ny) Q[t + 2] = cpu.fRow[j] * this.dt;
        if (j >= 1 && j < ny) Q[t + 3] = 0.5 * (cpu.fRow[j - 1] + cpu.fRow[j]) * this.dt;
      }
    cpu.gaps.forEach((gp, n) => {
      gp.foot.forEach((foot, end) => {
        for (const [k, w] of foot) {
          const i = k % nx, j = (k - i) / nx;
          F[4 * (j * W + i) + n] += end ? w : -w;
        }
      });
    });

    this._quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.tex = {
      P: this._texture(W, H, P), Q: this._texture(W, H, Q), Z1: this._texture(W, H, Z1),
      Z2: this._texture(W, H, Z2), F: this._texture(W, H, F),
    };
    this.state = [this._target(W, H), this._target(W, H)];
    this.gapState = [this._target(4, 1), this._target(4, 1)];

    const o = { ...OCEAN_DEFAULTS, ...opts };
    this.prog = {
      gap: this._program(FS_GAP), cont: this._program(FS_CONT), u: this._program(FS_U), v: this._program(FS_V),
    };
    const G = 9.81, gaps = cpu.gaps;
    this._use(this.prog.gap, {
      nGaps: ['1i', gaps.length],
      gA: ['2iv', flat(gaps.map(gp => cellXY(gp.cells[0], nx)), 4)],
      gB: ['2iv', flat(gaps.map(gp => cellXY(gp.cells[1], nx)), 4)],
      gK: ['1fv', pad4(gaps.map(gp => G * this.dt / gp.length))],
      gD: ['1fv', pad4(gaps.map(gp => this.dt * gp.drag))],
    });
    this._use(this.prog.cont, {
      gapVol: ['4fv', pad4(gaps.map(gp => gp.area * this.dt))], idx: ['1f', this.dt / grid.dx], dt: ['1f', this.dt],
    });
    for (const pr of [this.prog.u, this.prog.v]) this._use(pr, { dt: ['1f', this.dt], cd: ['1f', o.cd], u0: ['1f', o.u0] });

    this._A = new Float64Array(7); this._A0 = new Float64Array(7); this._A1 = new Float64Array(7);
    this._readBuf = null; this._readStep = -1; this._readRegion = null;
  }

  // ── setup helpers ──
  _texture(w, h, data) {
    const gl = this.gl, t = gl.createTexture();
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
    const u = {};
    for (const name of ['S', 'P', 'Q', 'Z1', 'Z2', 'F', 'GAPS', 'A0', 'A1']) u[name] = loc(name);
    return { p, u, loc };
  }

  _use(pr, uniforms) {
    const gl = this.gl;
    gl.useProgram(pr.p);
    for (const [name, [kind, v]] of Object.entries(uniforms)) gl[`uniform${kind}`](pr.loc(name), v);
  }

  // ── state ──
  reset(frame, t = 0) {
    const gl = this.gl, { W, H, nx, ny } = this;
    this.cpu.reset(frame, t);
    const data = new Float32Array(4 * W * H);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) data[4 * (j * W + i)] = this.cpu.eta[j * nx + i];
    gl.bindTexture(gl.TEXTURE_2D, this.state[0].tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, H, 0, gl.RGBA, gl.FLOAT, data);
    gl.bindTexture(gl.TEXTURE_2D, this.gapState[0].tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, 1, 0, gl.RGBA, gl.FLOAT, new Float32Array(16));
    this.time = t; this._step = 0; this._readStep = -1;
  }

  advance(frame0, frame1, span, s0 = 0, s1 = null) {
    forcingTensor(frame0, this._A0);
    forcingTensor(frame1, this._A1);
    const n = Math.round(span / this.dt);
    if (Math.abs(n * this.dt - span) > 1e-6) throw new Error(`advance: span ${span} s is not a multiple of dt ${this.dt} s`);
    const gl = this.gl, A = this._A;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    for (let s = s0; s < (s1 ?? n); s++) {
      const w = (s + 0.5) / n;                       // forcing at the step's midpoint
      for (let c = 0; c < 7; c++) A[c] = this._A0[c] + (this._A1[c] - this._A0[c]) * w;
      this._stepOnce(A);
    }
  }

  _pass(pr, target, A) {
    const gl = this.gl, t = this.tex, u = pr.u;
    gl.useProgram(pr.p);
    const bind = (unit, name, tex) => {
      if (!u[name]) return;
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u[name], unit);
    };
    bind(0, 'S', this.state[0].tex); bind(1, 'P', t.P); bind(2, 'Q', t.Q); bind(3, 'Z1', t.Z1);
    bind(4, 'Z2', t.Z2); bind(5, 'F', t.F); bind(6, 'GAPS', this.gapState[0].tex);
    gl.uniform4f(u.A0, A[0], A[1], A[2], A[3]);
    gl.uniform3f(u.A1, A[4], A[5], A[6]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.w, target.h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  _stepOnce(A) {
    const st = this.state, gs = this.gapState;
    this._pass(this.prog.gap, gs[1], A); gs.reverse();
    this._pass(this.prog.cont, st[1], A); st.reverse();
    const order = this._step++ & 1 ? [this.prog.v, this.prog.u] : [this.prog.u, this.prog.v];
    for (const pr of order) { this._pass(pr, st[1], A); st.reverse(); }
    this.time += this.dt;
  }

  // ── readout ──
  // Read the state over a region of cells (one extra column and row, for the
  // faces on its right and bottom edges), cached until the next step.
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

  readSpeed(region, out = new Float32Array(region.w * region.h)) {
    const b = this._read(region), w = b.w, { nx, cpu } = this, NX1 = nx + 1;
    for (let j = 0; j < region.h; j++)
      for (let i = 0; i < region.w; i++) {
        const gi = region.i0 + i, gj = region.j0 + j, t = 4 * (j * w + i);
        const uc = 0.5 * (b[t + 1] * cpu.iHu[gj * NX1 + gi] + b[t + 5] * cpu.iHu[gj * NX1 + gi + 1]);
        const vc = 0.5 * (b[t + 2] * cpu.iHv[gj * nx + gi] + b[t + 4 * w + 2] * cpu.iHv[(gj + 1) * nx + gi]);
        out[j * region.w + i] = Math.hypot(uc, vc);
      }
    return out;
  }

  // ── water-level history, kept on the GPU ──
  initHistory(region, len) {
    const gl = this.gl, tex = gl.createTexture();
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
    this.hist = { region, len, tex, fbs, gather: this._target(len, 1), buf: new Float32Array(4 * len) };
  }

  recordHistory(slot) {
    const gl = this.gl, { region, fbs } = this.hist, pr = this.prog.hcopy;
    gl.useProgram(pr.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.state[0].tex); gl.uniform1i(pr.u.S, 0);
    gl.uniform2i(pr.loc('off'), region.i0, region.j0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbs[slot]);
    gl.viewport(0, 0, region.w, region.h);
    this._drawQuad();
  }

  readHistory(m) {
    const gl = this.gl, { region, len, tex, gather, buf } = this.hist, pr = this.prog.hgather;
    gl.useProgram(pr.p);
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex); gl.uniform1i(pr.loc('Hist'), 7);
    gl.uniform2i(pr.loc('cell'), m % region.w, Math.floor(m / region.w));
    gl.bindFramebuffer(gl.FRAMEBUFFER, gather.fb);
    gl.viewport(0, 0, len, 1);
    this._drawQuad();
    gl.readPixels(0, 0, len, 1, gl.RGBA, gl.FLOAT, buf);
    return Float32Array.from({ length: len }, (_, s) => buf[4 * s]);
  }

  _drawQuad() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  gapCurrents() {
    const gl = this.gl, buf = new Float32Array(16);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.gapState[0].fb);
    gl.readPixels(0, 0, 4, 1, gl.RGBA, gl.FLOAT, buf);
    return this.cpu.gaps.map((_, n) => buf[4 * n]);
  }
}

// GPU solver when WebGL2 float targets are available, else the CPU one.
// engine: 'auto' | 'gpu' | 'cpu'.  Returns { ocean, engine }.
export function createOcean(grid, { engine = 'auto', ...opts } = {}) {
  if (engine !== 'cpu' && typeof OffscreenCanvas !== 'undefined') {
    try {
      const gl = new OffscreenCanvas(1, 1).getContext('webgl2', { antialias: false, depth: false, stencil: false });
      if (gl) return { ocean: new Ocean2DGL(grid, gl, opts), engine: 'gpu' };
    } catch (err) {
      if (engine === 'gpu') throw err;
    }
    if (engine === 'gpu') throw new Error('WebGL2 is not available');
  }
  return { ocean: new Ocean2D(grid, opts), engine: 'cpu' };
}

const cellXY = (k, nx) => [k % nx, Math.floor(k / nx)];
const pad4 = a => Float32Array.from({ length: 4 }, (_, n) => a[n] ?? 0);
const flat = (pairs, n) => Int32Array.from({ length: 2 * n }, (_, m) => pairs[m >> 1]?.[m & 1] ?? 0);
