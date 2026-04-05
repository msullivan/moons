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
await page.setViewportSize({ width: 1200, height: 900 });
await page.goto(`http://localhost:${port}/starchart.html`);
await page.waitForTimeout(500);

// Find a bigger star in the band chart and hover it
const star = await page.locator('#band-chart [data-star]').nth(5);
await star.hover();
await page.waitForTimeout(200);

// Check how many elements got highlighted
const highlighted = await page.evaluate(() => {
  return document.querySelectorAll('[data-star][stroke]').length;
});
console.log(`Highlighted elements: ${highlighted}`);

await page.screenshot({ path: '/tmp/starchart_hover.png' });

await browser.close();
server.close();
