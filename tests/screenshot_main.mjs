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
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => typeof renderer !== 'undefined');
await page.waitForTimeout(500);

await page.screenshot({ path: '/tmp/sim_main.png' });

// Zoom into Qaia-Primus view
const btn = page.locator('button', { hasText: 'Qaia-Primus' });
if (await btn.count()) {
  await btn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/sim_qaia.png' });
}

await browser.close();
server.close();
