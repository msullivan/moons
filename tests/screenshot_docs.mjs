import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join } from 'path';

const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.md':'text/plain' };
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

// Capture console messages
page.on('console', msg => console.log(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => console.log(`[pageerror] ${err.message}`));

// Screenshot the docs page
await page.goto(`http://localhost:${port}/docs.html?file=MOONS.md`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

const html = await page.evaluate(() => document.getElementById('content').innerHTML);
console.log('content innerHTML length:', html.length);

await page.screenshot({ path: '/tmp/docs_moons.png' });

// Scroll down to see a table
await page.evaluate(() => window.scrollBy(0, 600));
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/docs_moons_table.png' });

await browser.close();
server.close();
