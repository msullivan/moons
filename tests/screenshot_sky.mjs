import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join } from 'path';

const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.md':'text/plain', '.png':'image/png', '.json':'application/json' };
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
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => typeof sim !== 'undefined');
await page.waitForTimeout(1500);

// Open sky view
await page.click('#btn-sky');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/sky_full.png' });

// Advance ~6 hours to see different sky
await page.evaluate(() => { sim.advance(60, 10, renderer.followIndex); });
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/sky_6h.png' });

// Advance to nighttime (~12h total)
await page.evaluate(() => { sim.advance(60, 10, renderer.followIndex); });
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/sky_12h.png' });

await browser.close();
server.close();
