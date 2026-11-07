// Check tidemap.html playback keeps up with each speed setting.
//   node tests/tidemap_rate_check.mjs [--gpu] [--engine=cpu|gpu]
// For each speed, plays 6 s and compares sim time covered with speed × wall time.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join } from 'path';

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.jpeg': 'image/jpeg' };
const ROOT = new URL('..', import.meta.url).pathname;
const server = createServer((req, res) => {
  const file = join(ROOT, new URL(req.url, 'http://localhost').pathname);
  try { statSync(file); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'text/plain' });
  createReadStream(file).pipe(res);
}).listen(0);
const port = await new Promise(r => server.once('listening', () => r(server.address().port)));

const args = process.argv.slice(2);
const gpuFlags = args.includes('--gpu') ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] : [];
const engine = args.find(a => a.startsWith('--engine='))?.slice(9) ?? 'auto';
const browser = await chromium.launch({ args: gpuFlags });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/tidemap.html?date=2253-02-01&engine=${engine}`);
await page.waitForFunction(() => document.getElementById('overlay').hidden, null, { timeout: 180000 });
const simT = () => page.evaluate(() => window.__tidemapTime?.() ?? null);
const speeds = (await page.$$eval('#speed option', os => os.map(o => +o.value)));
await page.click('#play');
for (const sp of speeds) {
  await page.selectOption('#speed', String(sp));
  await page.waitForTimeout(1000);                       // settle
  const [w0, t0] = [Date.now(), await simT()];
  await page.waitForTimeout(6000);
  const [w1, t1] = [Date.now(), await simT()];
  const got = (t1 - t0) / 3600 / ((w1 - w0) / 1000);
  console.log(`speed ${String(sp).padStart(3)} h/s: achieved ${got.toFixed(2)} h/s (${(100 * got / sp).toFixed(0)}%) — panel says "${await page.textContent('#rate')}"`);
}
await browser.close();
server.close();
