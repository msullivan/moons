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

// Emulate a real Android phone (similar to user's device)
const context = await browser.newContext({
  viewport: { width: 393, height: 851 },
  deviceScaleFactor: 2.75,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => typeof sim !== 'undefined');
await page.waitForTimeout(2500);

// Full page
await page.screenshot({ path: '/tmp/mobile_real.png' });

// Zoomed bottom section
await page.screenshot({
  path: '/tmp/mobile_real_bottom.png',
  clip: { x: 0, y: 700, width: 393, height: 151 }
});

// Check actual computed sizes
const info = await page.evaluate(() => {
  const panel = document.getElementById('phase-panel');
  const cs = getComputedStyle(panel);
  const rect = panel.getBoundingClientRect();
  const canvases = document.querySelectorAll('.phase-canvas');
  const canvasInfo = [];
  canvases.forEach(c => {
    const cr = c.getBoundingClientRect();
    canvasInfo.push({
      id: c.id,
      width: c.width, height: c.height,
      cssWidth: cr.width, cssHeight: cr.height,
      top: cr.top, bottom: cr.bottom
    });
  });
  return {
    panelRect: { top: rect.top, bottom: rect.bottom, height: rect.height },
    panelOverflow: cs.overflow,
    panelOverflowY: cs.overflowY,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    canvases: canvasInfo
  };
});
console.log(JSON.stringify(info, null, 2));

await browser.close();
server.close();
