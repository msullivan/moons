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
await page.setViewportSize({ width: 1400, height: 1800 });
await page.goto(`http://localhost:${port}/starchart.html`);
await page.waitForTimeout(500);

// Annotate bright stars with their index numbers
await page.evaluate(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const stars = document.querySelectorAll('[data-star]');
  for (const s of stars) {
    const r = parseFloat(s.getAttribute('r'));
    const fill = s.getAttribute('fill');
    const opacity = parseFloat(fill.match(/[\d.]+\)$/)[0]);
    // Only label stars with brightness > 1.5 (r * opacity)
    if (r * opacity < 1.5) continue;
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', parseFloat(s.getAttribute('cx')) + r + 3);
    label.setAttribute('y', parseFloat(s.getAttribute('cy')) - r - 1);
    label.setAttribute('fill', '#ff8');
    label.setAttribute('font-family', 'Courier New, monospace');
    label.setAttribute('font-size', '9');
    label.textContent = s.dataset.star;
    s.parentNode.appendChild(label);
  }
});

const band = page.locator('#band-chart');
await band.screenshot({ path: '/tmp/starchart_band_annotated.png' });

const north = page.locator('#north-chart');
await north.screenshot({ path: '/tmp/starchart_north_annotated.png' });

const south = page.locator('#south-chart');
await south.screenshot({ path: '/tmp/starchart_south_annotated.png' });

await browser.close();
server.close();
