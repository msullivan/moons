import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, statSync, writeFileSync } from 'fs';
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

// Screenshot just the band chart
const band = page.locator('#band-chart');
await band.screenshot({ path: '/tmp/starchart_band.png' });

// Screenshot the north chart
const north = page.locator('#north-chart');
await north.screenshot({ path: '/tmp/starchart_north.png' });

// Screenshot the south chart
const south = page.locator('#south-chart');
await south.screenshot({ path: '/tmp/starchart_south.png' });

// Extract all star data from the SVGs
const starData = await page.evaluate(() => {
  const stars = document.querySelectorAll('[data-star]');
  const result = {};
  for (const s of stars) {
    const idx = s.dataset.star;
    const cx = parseFloat(s.getAttribute('cx'));
    const cy = parseFloat(s.getAttribute('cy'));
    const r = parseFloat(s.getAttribute('r'));
    const fill = s.getAttribute('fill');
    const parent = s.closest('svg');
    const chart = parent.closest('#band-chart') ? 'band' :
                  parent.closest('#north-chart') ? 'north' : 'south';
    if (!result[idx]) result[idx] = [];
    result[idx].push({ chart, cx, cy, r, fill });
  }
  return result;
});

writeFileSync('/tmp/star_positions.json', JSON.stringify(starData, null, 2));
console.log(`Extracted ${Object.keys(starData).length} unique stars`);

await browser.close();
server.close();
