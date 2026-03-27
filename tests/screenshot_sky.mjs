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

// Pause and open sky view
await page.keyboard.press('Space');
await page.waitForTimeout(500);
await page.click('#btn-sky');
await page.waitForTimeout(500);

// Advance to nighttime to see moons and stars
await page.evaluate(() => { sim.advance(100, 10, null); skyView.render(); });
await page.screenshot({ path: '/tmp/sky_normal.png' });

// Enable "Disable sun glare" — should show stars in daytime
await page.evaluate(() => { sim.advance(-100, 10, null); }); // can't go back, just toggle glare
await page.click('#sky-no-glare');
await page.waitForTimeout(200);
await page.evaluate(() => skyView.render());
await page.screenshot({ path: '/tmp/sky_noglare.png' });

// Enable "Hide moons"
await page.click('#sky-hide-moons');
await page.waitForTimeout(200);
await page.evaluate(() => skyView.render());
await page.screenshot({ path: '/tmp/sky_nomoons.png' });

console.log('Screenshots saved');
await browser.close();
server.close();
