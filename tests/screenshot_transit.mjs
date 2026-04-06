import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join } from 'path';

const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.md':'text/plain', '.json':'application/json' };
const ROOT = new URL('..', import.meta.url).pathname;
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = join(ROOT, pathname === '/' ? 'index.html' : pathname);
  try { statSync(file); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'text/plain' });
  createReadStream(file).pipe(res);
}).listen(0);
const port = await new Promise(r => server.once('listening', () => r(server.address().port)));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 800, height: 800 });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => typeof sim !== 'undefined');

// Advance to a Bahamut transit (world-space angular sep < 0.3°, closer than Sun)
const result = await page.evaluate(() => {
  const bahIdx = sim.bodies.findIndex(b => b.name === 'Bahamut');
  for (let i = 0; i < 500000; i++) {
    sim.advance(1, 0, 1);
    const q = sim.bodies[1], s = sim.bodies[0], b = sim.bodies[bahIdx];
    const dsx = s.x - q.x, dsy = s.y - q.y;
    const dbx = b.x - q.x, dby = b.y - q.y;
    const sd = Math.sqrt(dsx*dsx + dsy*dsy);
    const bd = Math.sqrt(dbx*dbx + dby*dby);
    const dot = (dsx*dbx + dsy*dby) / (sd * bd);
    const ang = Math.acos(Math.min(1, Math.max(-1, dot)));
    if (bd < sd && ang < 0.005) return { days: sim.time / 86400, angDeg: ang * 180 / Math.PI };
  }
  return null;
});
console.log('Transit:', result);

if (result) {
  await page.click('button:has-text("Sky")');
  await page.waitForTimeout(300);
  await page.evaluate(() => { skyView.syncMode = 'solar'; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/sky_transit.png' });
}

await browser.close();
server.close();
