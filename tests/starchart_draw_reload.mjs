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

// Load page with pre-existing constellation in hash
await page.goto(`http://localhost:${port}/starchart.html#264-83,83-43,43-52,52-166,166-500,500-264`);
await page.waitForTimeout(500);

// Verify lines loaded from hash
const lineCount = await page.evaluate(() => {
  return document.querySelectorAll('.constellation-lines line:not(.line-hit)').length;
});
console.log(`Lines loaded from hash: ${lineCount}`);

// Screenshot to verify
const north = page.locator('#north-chart');
await north.screenshot({ path: '/tmp/starchart_hash_load.png' });

// Test right-click delete on a line
const linePos = await page.evaluate(() => {
  const hit = document.querySelector('.line-hit');
  if (!hit) return null;
  const svg = hit.closest('svg');
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const x1 = parseFloat(hit.getAttribute('x1'));
  const y1 = parseFloat(hit.getAttribute('y1'));
  const x2 = parseFloat(hit.getAttribute('x2'));
  const y2 = parseFloat(hit.getAttribute('y2'));
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  return {
    x: rect.left + cx * rect.width / vb.width,
    y: rect.top + cy * rect.height / vb.height,
    key: hit.dataset.line,
  };
});

if (linePos) {
  console.log(`Right-clicking line "${linePos.key}" at (${linePos.x.toFixed(0)}, ${linePos.y.toFixed(0)})`);
  await page.mouse.click(linePos.x, linePos.y, { button: 'right' });
  await page.waitForTimeout(200);

  const afterDelete = await page.evaluate(() => {
    return document.querySelectorAll('.constellation-lines line:not(.line-hit)').length;
  });
  console.log(`Lines after right-click delete: ${afterDelete}`);

  const url = page.url();
  console.log('URL after delete:', url);
}

await north.screenshot({ path: '/tmp/starchart_after_delete.png' });

// Test Clear All
await page.click('text=Clear All');
await page.waitForTimeout(200);
const afterClear = await page.evaluate(() => {
  return document.querySelectorAll('.constellation-lines line:not(.line-hit)').length;
});
console.log(`Lines after Clear All: ${afterClear}`);
console.log('URL after clear:', page.url());

await browser.close();
server.close();
