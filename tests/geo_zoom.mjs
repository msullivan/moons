import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join } from 'path';

const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css' };
const ROOT = new URL('..', import.meta.url).pathname;
const server = createServer((req, res) => {
  const file = join(ROOT, req.url === '/' ? 'index.html' : req.url);
  try { statSync(file); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'text/plain' });
  createReadStream(file).pipe(res);
}).listen(0);
const port = await new Promise(r => server.once('listening', () => r(server.address().port)));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => typeof sim !== 'undefined');
await page.waitForTimeout(500);

// Follow Qaia and zoom in a lot to see Primus orbit clearly
await page.evaluate(() => {
  followBodyIndex = 1;  // Qaia
});
// Zoom in 8 times
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(50);
}

// Advance a few days with trails on
await page.evaluate(() => {
  sim.advance(3 * 240, 10, 1);  // 3 days
  renderer.render();
});
await page.screenshot({ path: '/tmp/geo_primus_zoom.png' });

await browser.close();
server.close();
