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

// Click a few bright stars in the north chart to draw a constellation
// Stars 264, 83, 43 form a nice triangle near the pole

// Find star positions
async function getStarPos(chart, starIdx) {
  return page.evaluate(({chart, starIdx}) => {
    const container = document.getElementById(chart + '-chart');
    const svg = container.querySelector('svg');
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const star = container.querySelector(`[data-star="${starIdx}"]`);
    if (!star) return null;
    const cx = parseFloat(star.getAttribute('cx'));
    const cy = parseFloat(star.getAttribute('cy'));
    // Convert SVG coords to page coords
    const scaleX = rect.width / vb.width;
    const scaleY = rect.height / vb.height;
    return {
      x: rect.left + cx * scaleX,
      y: rect.top + cy * scaleY
    };
  }, {chart, starIdx});
}

// Draw a triangle: 264 → 83 → 43 → 264
const stars = [264, 83, 43, 52, 166, 500, 264];
for (const idx of stars) {
  const pos = await getStarPos('north', idx);
  if (!pos) { console.log(`Star ${idx} not found`); continue; }
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(100);
}

// Click empty space to deselect
await page.mouse.click(10, 10);
await page.waitForTimeout(200);

// Check the URL hash
const url = await page.url();
console.log('URL after drawing:', url);

// Count drawn lines
const lineCount = await page.evaluate(() => {
  return document.querySelectorAll('.constellation-lines line:not(.line-hit)').length;
});
console.log(`Visible lines drawn: ${lineCount}`);

// Screenshot
const north = page.locator('#north-chart');
await north.screenshot({ path: '/tmp/starchart_draw_north.png' });

const band = page.locator('#band-chart');
await band.screenshot({ path: '/tmp/starchart_draw_band.png' });

// Test undo
await page.click('text=Undo');
await page.waitForTimeout(100);

const lineCountAfterUndo = await page.evaluate(() => {
  return document.querySelectorAll('.constellation-lines line:not(.line-hit)').length;
});
console.log(`Lines after undo: ${lineCountAfterUndo}`);

// Test loading from URL hash
const hash = new URL(await page.url()).hash;
console.log('Hash after undo:', hash);

// Screenshot after undo
await north.screenshot({ path: '/tmp/starchart_draw_undo.png' });

await browser.close();
server.close();
