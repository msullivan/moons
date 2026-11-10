// Main page control bar on phones: both rows visible, every button reachable
// (scrolling its row into view), panels above the bar not overlapping it.
//   node tests/mobile_controls_check.mjs   → /tmp/controls_*.png
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

for (const [name, w, h] of [['portrait', 390, 844], ['landscape', 844, 390], ['tablet', 768, 1024], ['desktop', 1280, 800]]) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => typeof sim !== 'undefined');
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const c = document.getElementById('controls').getBoundingClientRect();
    const ids = ['btn-play', 'btn-system', 'btn-trails', 'btn-sky'];
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const links = [...document.querySelectorAll('#doc-links a')].map(a => vis(a));
    const pp = document.getElementById('phase-panel').getBoundingClientRect();
    return { controlsTop: Math.round(c.top), controlsH: Math.round(c.height), phaseBottom: Math.round(pp.bottom),
             buttons: ids.map(id => vis(document.getElementById(id))), links,
             overflowX: document.documentElement.scrollWidth - innerWidth };
  });
  console.log(name, JSON.stringify(info));
  await page.screenshot({ path: `/tmp/controls_${name}.png` });
  if (name !== 'desktop') {
    await page.click('#btn-sky');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `/tmp/controls_${name}_sky.png` });
  }
  await page.close();
}
await browser.close();
server.close();
