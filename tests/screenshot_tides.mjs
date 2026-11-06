// Screenshot tides.html (port tide predictions) and report console errors.
//   node tests/screenshot_tides.mjs [port] [date]
import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join } from 'path';

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/plain' };
const ROOT = new URL('..', import.meta.url).pathname;
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = join(ROOT, pathname === '/' ? 'index.html' : pathname);
  try { statSync(file); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'text/plain' });
  createReadStream(file).pipe(res);
}).listen(0);
const port = await new Promise(r => server.once('listening', () => r(server.address().port)));

const [tidePort = 'kard', date = '2253-02-01'] = process.argv.slice(2);
const browser = await chromium.launch();
for (const [w, h, name] of [[1280, 900, 'desktop'], [412, 915, 'mobile']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${name} ${m.type()}]`, m.text()); });
  page.on('pageerror', e => console.log(`[${name} pageerror]`, e.message));
  const t = Date.now();
  await page.goto(`http://localhost:${port}/tides.html?port=${tidePort}&date=${date}&days=14`);
  await page.waitForFunction(() => document.querySelector('#tidetable tbody'), null, { timeout: 30000 });
  console.log(`${name}: tide table after ${Date.now() - t} ms`);
  await page.waitForFunction(() => document.querySelector('#summary tbody'), null, { timeout: 60000 });
  console.log(`${name}: year overview after ${Date.now() - t} ms`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `/tmp/tides_${name}.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`${name}: horizontal overflow ${overflow}px`);
  await page.close();
}
await browser.close();
server.close();
console.log('Screenshots: /tmp/tides_desktop.png /tmp/tides_mobile.png');
