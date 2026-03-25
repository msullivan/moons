import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join } from 'path';

const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.md':'text/plain', '.png':'image/png' };
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

const target = process.argv[2] || 'MOONS.md';
await page.goto(`http://localhost:${port}/docs.html?file=${target}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/docs_top.png' });

// Scroll to find the image if TIDES
if (target === 'TIDES.md') {
  await page.evaluate(() => {
    const img = document.querySelector('#content img');
    if (img) img.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/docs_chart.png' });
}

await browser.close();
server.close();
