import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join } from 'path';

const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json' };
const ROOT = new URL('..', import.meta.url).pathname;
const server = createServer((req, res) => {
  const file = join(ROOT, req.url === '/' ? 'index.html' : req.url);
  try { statSync(file); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'text/plain' });
  createReadStream(file).pipe(res);
}).listen(0);
const port = await new Promise(r => server.once('listening', () => r(server.address().port)));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => typeof sim !== 'undefined');
await page.waitForTimeout(500);

// Switch to following nothing (Sun), zoom out to see solar system
await page.evaluate(() => {
  renderer.followIndex = 0;  // follow Sun
  renderer.panX = 0;
  renderer.panY = 0;
});

// Zoom out to see Qaia's full orbit
await page.evaluate(() => {
  renderer.scale = 1.8e9;  // ~83 px per AU
  renderer.render();
});

// Log world positions and screen positions
const info = await page.evaluate(() => {
  const sun  = sim.bodies[0];
  const qaia = sim.bodies[1];
  const ss = renderer.worldToScreen(sun.x,  sun.y);
  const qs = renderer.worldToScreen(qaia.x, qaia.y);
  return {
    sun:  { wx: sun.x,  wy: sun.y,  sx: ss.sx, sy: ss.sy },
    qaia: { wx: qaia.x, wy: qaia.y, sx: qs.sx, sy: qs.sy },
  };
});
console.log('Sun  world:', info.sun.wx.toExponential(3),  info.sun.wy.toExponential(3),
            '→ screen:', info.sun.sx.toFixed(1), info.sun.sy.toFixed(1));
console.log('Qaia world:', info.qaia.wx.toExponential(3), info.qaia.wy.toExponential(3),
            '→ screen:', info.qaia.sx.toFixed(1), info.qaia.sy.toFixed(1));

await page.screenshot({ path: '/tmp/layout.png' });

await browser.close();
server.close();
