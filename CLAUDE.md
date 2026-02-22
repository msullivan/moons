# CLAUDE.md

## Visually inspecting the simulation

Use Playwright to take screenshots rather than asking the user to open a browser.
Playwright is a dev dependency — run `npm install` once if `node_modules/` is missing.

**Important**: write scripts to a `.mjs` file in `tests/` and run them with
`node tests/script.mjs`. Do NOT use heredocs with Playwright scripts — Claude Code's shell
parser flags `${obj.property}` as bad substitutions even inside single-quoted heredocs.
Scripts must live under the project directory so Node can resolve `node_modules/playwright`.

```javascript
// screenshot.mjs (run with: node screenshot.mjs)
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto('file:///home/sully/src/moons/index.html');
await page.waitForFunction(() => typeof renderer !== 'undefined');

await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/sim_solar.png' });

// Switch views, interact with buttons
await page.click('text=Qaia-Primus');
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/sim_qaia.png' });

await browser.close();
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

// Evaluate JS in the page context
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
simulation.js  — Body class, Simulation class, Velocity Verlet integrator, G constant
bodies.js      — Physical constants (AU, masses, radii), moon orbital params, createInitialBodies()
renderer.js    — Canvas rendering (trails, glow, shadow, scale bar)
main.js        — Animation loop, UI, zoom/pan, keyboard handling
tests/         — Standalone Node.js stability and screenshot scripts
```

`simulation.js` loads first (defines `G` and `Body`), then `bodies.js` (uses both).
To add or change a moon, edit `bodies.js` only.

### What we learned about stability

- Outer prograde moons (outside Primus at 1 LD) are very hard to keep stable. Primus
  perturbs them via resonances and they escape within years even if initially bound.
- Inner moons (inside Primus's orbit, a ≤ 0.45 LD) are individually stable.
- Current 4-moon system (all e=0.10): Quartus a=0.12, Tertius a=0.24, Secundus a=0.45,
  Primus a=1.00 LD — all stable past 1000 simulated years. See plans/moon-stability.md.
