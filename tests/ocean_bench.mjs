// Benchmark the 2-D tide model in headless Chromium on the GPU.
//   node tests/ocean_bench.mjs [days]      (OCEAN_GL=vulkan|egl|swiftshader, default vulkan)
// Times the ocean stepping alone (fixed forcing frames), the N-body sim alone,
// and the two together, in seconds per simulated day.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join } from 'path';
import { GL_FLAGS } from '../analysis/ocean_browser.mjs';

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json' };
const ROOT = new URL('..', import.meta.url).pathname;
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/blank') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>bench</title>'); return; }
  const file = join(ROOT, pathname);
  try { statSync(file); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'text/plain' });
  createReadStream(file).pipe(res);
}).listen(0);
const port = await new Promise(r => server.once('listening', () => r(server.address().port)));

const days = +(process.argv[2] ?? 3);
const browser = await chromium.launch({ args: GL_FLAGS[process.env.OCEAN_GL ?? 'vulkan'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[page]', m.text()); });
await page.goto(`http://localhost:${port}/blank`);
const r = await page.evaluate(async days => {
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
  const ind = tideBodyIndices(sim.bodies);
  const ocean = createOcean(grid);
  const gl = ocean.gl, dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const framesPerDay = 86400 / sim.dt;
  const f0 = tideFrame(sim.bodies, ind, sim.time);
  sim.advance(1, 1e12, null);
  const f1 = tideFrame(sim.bodies, ind, sim.time);
  ocean.reset(f0, sim.time);

  // Ocean alone (warm up, then time; the readback at the end waits for the GPU).
  for (let k = 0; k < 50; k++) ocean.advance(f0, f1, sim.dt);
  ocean.gapCurrents();
  let t = performance.now();
  for (let k = 0; k < days * framesPerDay; k++) ocean.advance(f0, f1, sim.dt);
  const issued = (performance.now() - t) / 1000 / days;      // CPU time to issue the commands
  ocean.gapCurrents();
  const oceanOnly = (performance.now() - t) / 1000 / days;

  // N-body alone.
  const out = new Float64Array(f0.length);
  t = performance.now();
  for (let k = 0; k < days * framesPerDay; k++) { sim.advance(1, 1e12, null); tideFrame(sim.bodies, ind, sim.time, out); }
  const nbody = (performance.now() - t) / 1000 / days;

  // Together, as the page and ocean_run do it.
  let frame = tideFrame(sim.bodies, ind, sim.time), next = new Float64Array(frame.length);
  t = performance.now();
  for (let k = 0; k < days * framesPerDay; k++) {
    sim.advance(1, 1e12, null); tideFrame(sim.bodies, ind, sim.time, next);
    ocean.advance(frame, next, sim.dt);
    [frame, next] = [next, frame];
  }
  const u = ocean.gapCurrents();
  const both = (performance.now() - t) / 1000 / days;
  return { issued, renderer, oceanOnly, nbody, both, stepsPerDay: 86400 / ocean.dt, gapU: u[0] };
}, days);
console.log(`renderer: ${r.renderer}`);
console.log(`ocean only: ${r.oceanOnly.toFixed(4)} s/day (${(1e6 * r.oceanOnly / r.stepsPerDay).toFixed(1)} µs per step; issuing the commands took ${(1e6 * r.issued / r.stepsPerDay).toFixed(1)} µs of it)`);
console.log(`N-body only: ${r.nbody.toFixed(4)} s/day`);
console.log(`together: ${r.both.toFixed(4)} s/day → ${(86400 / r.both / 3600).toFixed(0)} sim hours per wall second (gap u ${r.gapU.toFixed(3)})`);
await browser.close();
server.close();
