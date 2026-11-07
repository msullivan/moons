// Check that the tide pages open on the simulation's date (tide_links.js).
//   node tests/tide_links_check.mjs
// - index.html: the Tides / Tide map links carry the sim's date (PMT+2), and
//   follow it as the sim advances.
// - tidemap.html / tides.html: ?date= fills the date picker (clamped to its
//   range) and the nav links carry the page's date.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join } from 'path';

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css',
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
const base = `http://localhost:${port}`;

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };
const links = page => page.$$eval('a[href*="tide"]', as => as.map(a => a.getAttribute('href')).filter(h => /tides?map\.html|tides\.html/.test(h)));

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => { console.log('[pageerror]', e.message); failed++; });

// Simulation page.
await page.goto(`${base}/`);
await page.waitForFunction(() => typeof sim !== 'undefined' && sim.time > 0);
await page.waitForTimeout(500);
// Pause first so the clock can't tick between reading it and the links.
await page.click('#btn-play');
await page.waitForTimeout(200);
const simIso = await page.evaluate(async () => (await import('/calendar.js')).isoLocalDate(sim.renderTime, 30));
let hrefs = await links(page);
const mapLink = hrefs.find(h => h.startsWith('tidemap.html')), tidesLink = hrefs.find(h => h.startsWith('tides.html'));
check(tidesLink === `tides.html?date=${simIso}`, `index Tides link on the sim date: ${tidesLink}`);
check(new RegExp(`^tidemap\\.html\\?date=${simIso}&time=\\d\\d%3A\\d\\d$`).test(mapLink), `index Tide map link with the sim time: ${mapLink}`);
// Jump the sim forward a week; the links should follow.
await page.evaluate(() => { sim.advance(Math.round(7 * 86400 / sim.dt), 1e12, null); });
await page.waitForTimeout(500);
const later = await page.evaluate(async () => (await import('/calendar.js')).isoLocalDate(sim.renderTime, 30));
hrefs = await links(page);
check(later !== simIso && hrefs.every(h => h.includes(`?date=${later}`)), `index links follow the sim to ${later}`);

// Port tides: date from the URL, nav links carry it.
await page.goto(`${base}/tides.html?date=2260-03-05`);
await page.waitForTimeout(300);
check(await page.$eval('#date', d => d.value) === '2260-03-05', 'tides.html takes ?date=');
hrefs = await page.$$eval('nav a', as => as.map(a => a.getAttribute('href')));
check(hrefs.includes('tidemap.html?date=2260-03-05') && hrefs.includes('tides.html?date=2260-03-05'), `tides.html nav: ${hrefs.join(' ')}`);
await page.goto(`${base}/tides.html?date=2253-01-02`);
await page.waitForTimeout(300);
const tmin = await page.$eval('#date', d => d.min);
check(await page.$eval('#date', d => d.value) === tmin, `tides.html clamps an early date to ${tmin}`);

// Tide map: same, and the nav links follow its clock.
await page.goto(`${base}/tidemap.html?date=2253-01-02`);
const mmin = await page.$eval('#date', d => d.min);
check(await page.$eval('#date', d => d.value) === mmin, `tidemap.html clamps an early date to ${mmin}`);
await page.goto(`${base}/tidemap.html?date=2261-07-09&time=15:40`);
check(await page.$eval('#date', d => d.value) === '2261-07-09', 'tidemap.html takes ?date=');
await page.waitForFunction(() => /Jul 2261/.test(document.getElementById('clock').textContent), null, { timeout: 120000 });
const clock = await page.$eval('#clock', e => e.textContent);
check(/9 Jul 2261 15:4\d/.test(clock), `tidemap.html starts at ?time=: ${clock}`);
hrefs = await page.$$eval('nav a', as => as.map(a => a.getAttribute('href')));
check(hrefs.includes('tides.html?date=2261-07-09'), `tidemap.html nav: ${hrefs.join(' ')}`);

await browser.close();
server.close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
