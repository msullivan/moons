// Screenshot tidemap.html (2-D tide model over the map) and report console errors.
//   node tests/screenshot_tidemap.mjs [date] [--mobile]
// Waits for the spin-up, screenshots, plays for a few seconds, screenshots again.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join } from 'path';

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
               '.md': 'text/plain', '.jpeg': 'image/jpeg', '.png': 'image/png' };
const ROOT = new URL('..', import.meta.url).pathname;
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = join(ROOT, pathname === '/' ? 'index.html' : pathname);
  try { statSync(file); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'text/plain' });
  createReadStream(file).pipe(res);
}).listen(0);
const port = await new Promise(r => server.once('listening', () => r(server.address().port)));

const args = process.argv.slice(2);
const mobile = args.includes('--mobile');
const date = args.find(a => /^\d{4}-/.test(a)) ?? '2253-02-01';
const views = mobile ? [[412, 915, 'mobile']] : [[1280, 900, 'desktop'], [412, 915, 'mobile']];

const browser = await chromium.launch();
for (const [w, h, name] of views) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${name} ${m.type()}]`, m.text()); });
  page.on('pageerror', e => console.log(`[${name} pageerror]`, e.message));
  const t = Date.now();
  await page.goto(`http://localhost:${port}/tidemap.html?date=${date}`);
  await page.waitForFunction(() => document.getElementById('overlay').hidden ||
                                   document.getElementById('overlay-msg').classList.contains('error'), null, { timeout: 180000 });
  const err = await page.evaluate(() => document.getElementById('overlay').hidden ? null : document.getElementById('overlay-msg').textContent);
  if (err) { console.log(`${name}: error overlay: ${err}`); await page.screenshot({ path: `/tmp/tidemap_${name}.png` }); continue; }
  console.log(`${name}: ready after ${((Date.now() - t) / 1000).toFixed(1)} s`);
  await page.screenshot({ path: `/tmp/tidemap_${name}_start.png`, fullPage: !mobile && name === 'desktop' ? false : true });
  await page.click('#play');
  await page.waitForTimeout(5000);
  console.log(`${name}: ${await page.textContent('#clock')} — ${await page.textContent('#rate')}`);
  await page.screenshot({ path: `/tmp/tidemap_${name}.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`${name}: horizontal overflow ${overflow}px`);
  await page.close();
}
await browser.close();
server.close();
console.log('Screenshots: /tmp/tidemap_desktop.png /tmp/tidemap_mobile.png (and *_start.png)');
