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

// Screenshot default location (Sub-Primus)
await page.screenshot({ path: '/tmp/sky_subprimus.png' });

// Switch to Qarangil (45°N, 30°W)
await page.selectOption('#sky-location-select', '1');
await page.waitForTimeout(300);
await page.evaluate(() => skyView.render());
await page.screenshot({ path: '/tmp/sky_qarangil.png' });

// Switch to Peχavn (25°S, 5°E)
await page.selectOption('#sky-location-select', '4');
await page.waitForTimeout(300);
await page.evaluate(() => skyView.render());
await page.screenshot({ path: '/tmp/sky_pexavn.png' });

console.log('Screenshots saved to /tmp/sky_*.png');
await browser.close();
server.close();
