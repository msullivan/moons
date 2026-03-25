import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join } from 'path';

const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json' };
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
await page.waitForTimeout(1000);

// Open the goto popup
await page.click('#btn-goto');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/goto_open.png' });

// Set target date (June 15, 2253 = ~165 days into year 200)
await page.fill('#goto-date', '2253-06-15');
await page.click('#goto-go');

// Wait for seek to complete
const EPOCH_MS = Date.UTC(2053, 0, 1);
const targetMs = Date.UTC(2253, 5, 15);  // June=5 (0-indexed)
const targetSec = (targetMs - EPOCH_MS) / 1000;
await page.waitForFunction(
  target => window.sim && window.sim.time >= target,
  targetSec,
  { timeout: 15000 }
);

const date = await page.evaluate(() => document.getElementById('hud-date').textContent);
console.log('Date after seek:', date);
await page.screenshot({ path: '/tmp/goto_after.png' });

await browser.close();
server.close();
