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

const browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => typeof sim !== 'undefined');

// System view to see all planets including Fafnir
await page.evaluate(() => {
  renderer.followIndex = 0;
  renderer.panX = 0;
  renderer.panY = 0;
  renderer.scale = 2e9;
  sim.clearTrails();
});

// Run for a bit to build trails
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/sim_fafnir_system.png' });

// Now zoom in to see Fafnir's orbit more clearly
await page.evaluate(() => {
  renderer.scale = 5e8;
});
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/sim_fafnir_zoom.png' });

await browser.close();
server.close();
