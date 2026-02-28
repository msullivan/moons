// Verify that the website loads with the 200yr snapshot.
// Run with: node tests/verify_snapshot.mjs

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
await page.waitForTimeout(1500);

// Check that sim.time is set to the snapshot value (~200 years in seconds)
const simTime = await page.evaluate(() => sim.time);
const simDays = simTime / 86400;
console.log(`sim.time = ${simDays.toFixed(1)} days (expected ~73050)`);
console.log(simDays > 70000 ? 'PASS: snapshot loaded' : 'FAIL: snapshot not loaded');

await page.screenshot({ path: '/tmp/verify_snapshot.png' });
console.log('Screenshot saved to /tmp/verify_snapshot.png');

await browser.close();
server.close();
