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

// Mobile portrait - crop just the bottom area
const page = await browser.newPage();
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => typeof sim !== 'undefined');
await page.waitForTimeout(2000);

// Full screenshot
await page.screenshot({ path: '/tmp/mobile_full.png' });

// Crop just the bottom phase+controls area
await page.screenshot({
  path: '/tmp/mobile_bottom.png',
  clip: { x: 0, y: 680, width: 390, height: 164 }
});

await browser.close();
server.close();
