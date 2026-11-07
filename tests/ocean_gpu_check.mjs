// Check the WebGL2 tide solver (ocean2d_gl.js) against the CPU one (ocean2d.js):
// same start, same forcing, compare water level over the map after N days.
//   node tests/ocean_gpu_check.mjs [days] [--headed] [--gpu]
// --gpu asks Chromium to use the real GPU (Vulkan) even when headless.
// Headless Chromium renders WebGL with SwiftShader (software), so its GPU
// timing is not representative; --headed uses the real GPU if there is one.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join } from 'path';

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json' };
const ROOT = new URL('..', import.meta.url).pathname;
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/blank') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>gpu check</title>'); return; }
  const file = join(ROOT, pathname);
  try { statSync(file); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'text/plain' });
  createReadStream(file).pipe(res);
}).listen(0);
const port = await new Promise(r => server.once('listening', () => r(server.address().port)));

const args = process.argv.slice(2);
const days = +(args.find(a => /^\d/.test(a)) ?? 1);
const gpuFlags = args.includes('--gpu') ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] : [];
const browser = await chromium.launch({ headless: !args.includes('--headed'), args: gpuFlags });
const page = await browser.newPage();
page.on('console', m => console.log(`[page ${m.type()}]`, m.text()));
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/blank`);

const result = await page.evaluate(async days => {
  const { buildOceanGrid } = await import('/ocean_grid.js');
  const { Ocean2D } = await import('/ocean2d.js');
  const { Ocean2DGL } = await import('/ocean2d_gl.js');
  const { recordEphemeris, parseLocalDate, DAY } = await import('/tide_analysis.js');
  const mask = await (await fetch('/ocean_mask.json')).json();
  const snap = await (await fetch('/state_200yr.json')).json();
  const grid = buildOceanGrid(mask);
  const t0 = parseLocalDate('2253-02-01', 30);
  const eph = recordEphemeris(snap, t0, t0 + days * DAY);
  const gl = new OffscreenCanvas(1, 1).getContext('webgl2');
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const region = { i0: grid.pad, j0: grid.pad, w: mask.width, h: mask.height };

  const run = ocean => {
    ocean.reset(eph.frame(0), eph.t0);
    const t = performance.now();
    for (let k = 1; k < eph.n; k++) ocean.advance(eph.frame(k - 1), eph.frame(k), eph.dt);
    const eta = ocean.readEta(region);                 // (forces the GPU to finish)
    return { eta, gaps: ocean.gapCurrents(), secPerDay: (performance.now() - t) / 1000 / days };
  };
  // eqEvery: 1 so the CPU refreshes η_eq every step, like the GPU.
  const cpu = run(new Ocean2D(grid, { eqEvery: 1 }));
  const gpu = run(new Ocean2DGL(grid, gl));
  let max = 0, rms = 0, n = 0, maxAt = -1, amp = 0;
  for (let m = 0; m < cpu.eta.length; m++) {
    const i = m % mask.width, j = Math.floor(m / mask.width);
    if (!grid.sea[(j + grid.pad) * grid.nx + i + grid.pad]) continue;
    const d = Math.abs(cpu.eta[m] - gpu.eta[m]);
    if (d > max) { max = d; maxAt = m; }
    rms += d * d; n++; amp = Math.max(amp, Math.abs(cpu.eta[m]));
  }
  return { renderer, cpuSec: cpu.secPerDay, gpuSec: gpu.secPerDay, max, rms: Math.sqrt(rms / n), amp,
           maxAt: [maxAt % mask.width, Math.floor(maxAt / mask.width)], gapCpu: cpu.gaps, gapGpu: gpu.gaps };
}, days);

console.log(`renderer: ${result.renderer}`);
console.log(`after ${days} day(s): max |η| ${result.amp.toFixed(2)} m; CPU vs GPU max diff ${(1000 * result.max).toFixed(4)} mm ` +
            `(at map cell ${result.maxAt}), rms ${(1000 * result.rms).toFixed(4)} mm`);
console.log(`gap current: CPU ${result.gapCpu.map(u => u.toFixed(6))} m/s, GPU ${result.gapGpu.map(u => u.toFixed(6))} m/s`);
console.log(`speed: CPU ${result.cpuSec.toFixed(2)} s/day, GPU ${result.gpuSec.toFixed(2)} s/day`);
await browser.close();
server.close();
