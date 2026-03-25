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

// Mobile portrait (iPhone-like)
const page1 = await browser.newPage();
await page1.setViewportSize({ width: 390, height: 844 });
await page1.goto(`http://localhost:${port}/`);
await page1.waitForFunction(() => typeof sim !== 'undefined');
await page1.waitForTimeout(2000);
await page1.screenshot({ path: '/tmp/mobile_portrait.png' });

// Mobile landscape
const page2 = await browser.newPage();
await page2.setViewportSize({ width: 844, height: 390 });
await page2.goto(`http://localhost:${port}/`);
await page2.waitForFunction(() => typeof sim !== 'undefined');
await page2.waitForTimeout(2000);
await page2.screenshot({ path: '/tmp/mobile_landscape.png' });

// Tablet portrait
const page3 = await browser.newPage();
await page3.setViewportSize({ width: 768, height: 1024 });
await page3.goto(`http://localhost:${port}/`);
await page3.waitForFunction(() => typeof sim !== 'undefined');
await page3.waitForTimeout(2000);
await page3.screenshot({ path: '/tmp/tablet_portrait.png' });

await browser.close();
server.close();
