// screenshot_qupiter.mjs — verify Qupiter renders correctly
import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join } from 'path';

const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json' };
const ROOT = new URL('..', import.meta.url).pathname;
const server = createServer((req, res) => {
  const file = join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  try { statSync(file); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'text/plain' });
  createReadStream(file).pipe(res);
}).listen(0);
const port = await new Promise(r => server.once('listening', () => r(server.address().port)));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => typeof sim !== 'undefined');
await page.waitForTimeout(500);

// Zoom out far enough to see Qupiter at 5.46 AU
// Default scale is 2e6 m/px; Qupiter is at ~8.2e11 m from Sun, need to zoom way out.
// Zoom out ~500× from default: scale → ~1e9 m/px so 5 AU ≈ 750 px
await page.evaluate(() => renderer.scale = 2e9);
await page.evaluate(() => renderer.followIndex = 0); // follow Sun
await page.evaluate(() => renderer.render());
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/qupiter_full.png' });
console.log('Full system: /tmp/qupiter_full.png');

// Run 5 years at 10 yr/s, then screenshot to see trails
await page.evaluate(() => {
  sim.advance(5 * 365.25 * 86400 / sim.dt, 50, 0);
});
await page.evaluate(() => renderer.render());
await page.screenshot({ path: '/tmp/qupiter_5yr.png' });
console.log('5-year run: /tmp/qupiter_5yr.png');

// Zoom in on Qupiter
const qupiterPos = await page.evaluate(() => {
  const q = sim.bodies.find(b => b.name === 'Tiamat');
  return { x: q.x, y: q.y };
});
await page.evaluate((pos) => {
  renderer.followIndex = sim.bodies.findIndex(b => b.name === 'Tiamat');
  renderer.panX = 0; renderer.panY = 0;
  renderer.scale = 2e6; // zoom into Qupiter's moon system
  renderer.render();
}, qupiterPos);
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/qupiter_zoom.png' });
console.log('Zoomed on Qupiter: /tmp/qupiter_zoom.png');

await browser.close();
server.close();
