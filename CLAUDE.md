# CLAUDE.md

## Visually inspecting the simulation

Use Playwright to take screenshots rather than asking the user to open a browser.
Playwright is a dev dependency — run `npm install` once if `node_modules/` is missing.

**Important**: write scripts to a `.mjs` file in `tests/` and run them with
`node tests/script.mjs`. Do NOT use heredocs with Playwright scripts — Claude Code's shell
parser flags `${obj.property}` as bad substitutions even inside single-quoted heredocs.
Scripts must live under the project directory so Node can resolve `node_modules/playwright`.

The project uses ES modules, so Playwright must serve the files over HTTP (Chrome blocks
module imports on `file://` URLs). Spin up a server in the script itself:

```javascript
// screenshot.mjs (run with: node tests/screenshot.mjs)
import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join } from 'path';

const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css' };
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
await page.screenshot({ path: '/tmp/sim_solar.png' });

await browser.close();
server.close();
```

Then read the screenshots with the Read tool to view them.

### First-time setup

```bash
npm install                   # install playwright
npx playwright install chromium  # download browser bundle (cached in ~/.cache/ms-playwright/)
```

### Useful Playwright interactions

```javascript
// Click a button by text
await page.click('text=Qaia-Primus');
await page.click('text=Reset');

// Click by CSS selector
await page.click('#btn-play');

// Scroll to zoom (on the canvas)
await page.mouse.wheel(0, -300);   // scroll up = zoom in

// Evaluate JS in the page context (sim and renderer are exposed on window)
const time = await page.evaluate(() => sim.time / 86400); // elapsed days
const energyErr = await page.evaluate(() => sim.energyError());

// Force a render without waiting for RAF (useful in headless mode)
await page.evaluate(() => renderer.render());
```

## Testing orbital stability

To check if a moon orbit is stable, use `page.evaluate` to run the simulation forward
and test whether the specific orbital energy relative to Qaia stays negative:

```javascript
// Check binding energy — if positive, the moon has escaped Qaia's gravity
const dx = sec.x - qaia.x, dy = sec.y - qaia.y;
const r = Math.sqrt(dx*dx + dy*dy);
const dvx = sec.vx - qaia.vx, dvy = sec.vy - qaia.vy;
const eps = 0.5 * (dvx*dvx + dvy*dvy) - G * M_EARTH / r;
// eps < 0 → bound; eps > 0 → escaped
```

**Do not** just check distance at a few snapshot times — an escaped moon in a nearby
solar orbit can pass close to Qaia by coincidence, giving a false "stable" reading.

## File structure

```
simulation.js   — Body class, Simulation class, Velocity Verlet integrator, G constant
bodies.js       — Physical constants (AU, masses, radii), moon orbital params, createInitialBodies()
renderer.js     — Canvas rendering (trails, glow, shadow, scale bar)
main.js         — Animation loop, UI, zoom/pan, keyboard handling
tests/          — Playwright screenshot and stability scripts
analysis/       — Node.js analysis scripts (no browser needed)
  moon_stats.mjs  — Physical/observational stats for all moons → MOONS.md
  tide_sim.mjs    — Tidal periods and 72h simulation → TIDES.md
```

Files use ES modules — imports are explicit. To add or change a moon, edit `bodies.js` only.
For running the simulation headlessly (no browser), use `tests/save_state_node.mjs`.

## Updating MOONS.md and TIDES.md after parameter changes

After editing any moon parameters in `bodies.js` (mass, radius/density, semi-major axis,
eccentricity), regenerate the reference docs:

```bash
node analysis/moon_stats.mjs   # recompute physical/observational stats
node analysis/tide_sim.mjs     # recompute tidal periods and simulation
```

Then update `MOONS.md` and `TIDES.md` with the new output. The scripts read directly from
`bodies.js` exports, so the numbers stay in sync as long as the exported constants
(`M_MOON`, `R_MOON`, `LUNAR_DIST`, `M_EARTH`, `R_EARTH`, `M_SUN`, `AU`) are kept current.

The moon definitions inside each analysis script (mass fraction, density ratio, semi-major
axis) are **duplicated** from `bodies.js` and must be kept in sync by hand — they are not
automatically read from `createInitialBodies()`. If you change a moon's mass or density,
update the corresponding entry in `analysis/moon_stats.mjs` and `analysis/tide_sim.mjs`.

### What we learned about stability

- Outer prograde moons (outside Quartus at 1 LD) are very hard to keep stable. Quartus
  perturbs them via resonances and they escape within years even if initially bound.
- Inner moons (inside Quartus's orbit, a ≤ 0.45 LD) are individually stable.
- Current naming by distance from Qaia: Primus 0.12 LD, Secundus 0.24 LD, Tertius 0.45 LD,
  Quartus 1.00 LD, Sextus 1.9 LD, Septimus 2.2 LD — all stable past 1000 simulated years.
- Quintus is a trace particle (1 kg) at the Sun-Qaia L4 point; librates ~45–80° over ~2000 yr.
