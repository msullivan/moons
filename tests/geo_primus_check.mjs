import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join } from 'path';

const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css' };
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
await page.waitForTimeout(1000);

// Screenshot at t=0 (Primus should be visible near Qaia, sunward side)
await page.screenshot({ path: '/tmp/geo_primus_t0.png' });

// Advance 1 day worth of simulation to see Primus complete one orbit
await page.evaluate(() => {
  const stepsPerDay = 86400 / 360;  // 240 steps
  sim.advance(stepsPerDay, 10, 1);
});
await page.evaluate(() => renderer.render());
await page.screenshot({ path: '/tmp/geo_primus_1day.png' });

// Advance 10 more days and zoom in on Qaia
await page.evaluate(() => {
  sim.advance(10 * 240, 10, 1);
});
await page.evaluate(() => renderer.render());
await page.screenshot({ path: '/tmp/geo_primus_10days.png' });

// Check Primus distance from Qaia stays constant
const dist = await page.evaluate(() => {
  const qaia   = sim.bodies[1];
  const primus = sim.bodies[2];
  const dx = primus.x - qaia.x;
  const dy = primus.y - qaia.y;
  return Math.sqrt(dx*dx + dy*dy) / 3.844e8;  // in LD
});
console.log('Primus distance from Qaia (should be ~0.110 LD):', dist.toFixed(4), 'LD');

await browser.close();
server.close();
