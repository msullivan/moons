# CLAUDE.md

## Visually inspecting the simulation

Use Playwright to take screenshots rather than asking the user to open a browser.
Playwright is a dev dependency — run `npm install` once if `node_modules/` is missing,
then run scripts from the project root:

```bash
node - << 'EOF'
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto('file:///home/sully/src/moons/index.html');

// Wait for the animation to run (1 real second ≈ 1 simulated year at default speed)
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/sim_solar.png' });

// Switch views, interact with buttons
await page.click('text=Earth-Moon');
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/sim_earthmoon.png' });

await browser.close();
EOF
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
await page.click('text=Earth-Moon');
await page.click('text=Reset');

// Click by CSS selector
await page.click('#btn-play');

// Scroll to zoom (on the canvas)
await page.mouse.wheel(0, -300);   // scroll up = zoom in

// Evaluate JS in the page context
const time = await page.evaluate(() => sim.time / 86400); // elapsed days
const energyErr = await page.evaluate(() => sim.energyError());
```
