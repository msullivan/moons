// Run the 2-D tide model (ocean2d.js, WebGL2) from Node, in headless Chromium.
//
//   const r = await runOceanInBrowser({ t0, t1, cells, every })
// runs the N-body sim and the ocean from t0 (static start) to t1 (sim
// seconds), sampling η at the given grid cells every `every` frames (sim
// steps of 6 min).  Returns { t: Float64Array, eta: [Float32Array per cell],
// gaps: [Float32Array per gap], secPerDay, renderer }.
//
// GPU: by default Chromium is asked to use the real GPU through Vulkan
// (headless otherwise falls back to SwiftShader, a slow software renderer).
// OCEAN_GL=swiftshader forces software; OCEAN_GL=egl uses ANGLE's GL/EGL path.

import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join } from 'path';

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json' };
const ROOT = new URL('..', import.meta.url).pathname;

export const GL_FLAGS = {
  vulkan: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'],
  egl: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl-egl'],
  swiftshader: [],
};

export async function runOceanInBrowser({ t0, t1, cells = [], every = 1, log = () => {} }) {
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/blank') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>ocean</title>'); return; }
    const file = join(ROOT, pathname);
    try { statSync(file); } catch { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'text/plain' });
    createReadStream(file).pipe(res);
  }).listen(0);
  const port = await new Promise(r => server.once('listening', () => r(server.address().port)));
  const browser = await chromium.launch({ args: GL_FLAGS[process.env.OCEAN_GL ?? 'vulkan'] });
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => log(`[pageerror] ${e.message}`));
    page.on('console', m => { if (m.text().startsWith('PROGRESS')) log(m.text().slice(9)); });
    await page.goto(`http://localhost:${port}/blank`);
    const r = await page.evaluate(async ({ t0, t1, cells, every }) => {
      const { buildOceanGrid } = await import('/ocean_grid.js');
      const { createOcean } = await import('/ocean2d.js');
      const { createInitialBodies, applySnapshot } = await import('/bodies.js');
      const { Simulation } = await import('/simulation.js');
      const { tideBodyIndices, tideFrame } = await import('/tides.js');
      const grid = buildOceanGrid(await (await fetch('/ocean_mask.json')).json());
      const snap = await (await fetch('/state_200yr.json')).json();
      const bodies = createInitialBodies();
      applySnapshot(bodies, snap);
      const sim = new Simulation(bodies);
      sim.time = snap.time;
      const skip = Math.floor((t0 - sim.time) / sim.dt);
      if (skip < 0) throw new Error('t0 is before the 200-yr snapshot');
      if (skip) sim.advance(skip, 1e12, null);
      const ind = tideBodyIndices(sim.bodies);
      const ocean = createOcean(grid);
      const gl = ocean.gl, dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      let frame = tideFrame(sim.bodies, ind, sim.time), next = new Float64Array(frame.length);
      ocean.reset(frame, sim.time);
      const nFrames = Math.ceil((t1 - sim.time) / sim.dt), nOut = Math.floor(nFrames / every) + 1;
      const t = new Float64Array(nOut), eta = cells.map(() => new Float32Array(nOut)), gaps = ocean.gaps.map(() => new Float32Array(nOut));
      // Samples are recorded on the GPU and read back CHUNK rows at a time.
      const CHUNK = 512, nc = cells.length;
      ocean.initProbes([...cells.map(cell => ({ cell })), ...ocean.gaps.map((_, gap) => ({ gap }))], CHUNK);
      let pending = 0, base = 0;
      const flush = () => {
        ocean.readProbes(pending).forEach((row, r) => {
          for (let c = 0; c < nc; c++) eta[c][base + r] = row[c];
          gaps.forEach((g, n) => { g[base + r] = row[nc + n]; });
        });
        base += pending; pending = 0;
      };
      const sample = n => {
        t[n] = ocean.time;
        ocean.recordProbes(pending++);
        if (pending === CHUNK) flush();
      };
      sample(0);
      const start = performance.now();
      for (let k = 1, n = 1; k <= nFrames; k++) {
        sim.advance(1, 1e12, null);
        tideFrame(sim.bodies, ind, sim.time, next);
        ocean.advance(frame, next, sim.dt);
        [frame, next] = [next, frame];
        if (k % every === 0) sample(n++);
        if (k % 2400 === 0) console.log(`PROGRESS ${(k * sim.dt / 86400).toFixed(0)} of ${(nFrames * sim.dt / 86400).toFixed(0)} days`);
      }
      if (pending) flush();
      const secPerDay = (performance.now() - start) / 1000 / (nFrames * sim.dt / 86400);
      return { t: Array.from(t), eta: eta.map(a => Array.from(a)), gaps: gaps.map(a => Array.from(a)), secPerDay, renderer };
    }, { t0, t1, cells, every });
    return { ...r, t: Float64Array.from(r.t), eta: r.eta.map(a => Float32Array.from(a)), gaps: r.gaps.map(a => Float32Array.from(a)) };
  } finally {
    await browser.close();
    server.close();
  }
}
