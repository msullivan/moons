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

## Plan: 3D view

The simulation already tracks x/y/z. Rendering stays on the 2D canvas — spheres
project to circles, trail points project to 2D points, so `ctx.arc` and
`ctx.lineTo` continue to do all the drawing.

### Camera model

Add to `Renderer`:
- `camera.azimuth` — rotation around the z-axis (left/right drag)
- `camera.elevation` — rotation around the resulting x-axis (up/down drag)
- `camera.fov` — field-of-view angle (controls perspective strength; start ~60°)

Build a view matrix from azimuth + elevation (two `mat3` rotations composed).
No roll needed.

### New coordinate pipeline

Replace `worldToScreen(wx, wy)` with `worldToScreen(wx, wy, wz)`:

```
1. Translate: subtract reference body position (same as now, but include z)
2. Subtract panX/panY (pan stays in screen space, no panning in z)
3. Rotate: multiply by view matrix → (cx, cy, cz) in camera space
4. Project:
   - Perspective: divide cx/cy by (1 + cz / focalLength), where
     focalLength = (H/2) / tan(fov/2)  [in world units at scale 1:1]
   - Or orthographic: just drop cz (simplest, good for astronomical scales)
5. Scale to screen: sx = W/2 + cx / scale, sy = H/2 - cy / scale
```

For body radius: perspective divides physicalRadius by the same depth factor.
Orthographic keeps it as `max(minDisplayPx, physicalRadius / scale)` unchanged.

Start with **orthographic** — perspective adds little at solar-system scales and
complicates the scale bar. Add a toggle later if wanted.

### Changes required

**renderer.js only** (simulation is already 3D):

1. Add `camera = { azimuth: 0, elevation: Math.PI / 6 }` (slight tilt by default
   so the inclined orbit is immediately visible).
2. Add `_viewMatrix()` — returns a 3×3 rotation matrix from azimuth + elevation.
   Cache it at the start of each `render()` call.
3. Replace `worldToScreen(wx, wy)` → `worldToScreen(wx, wy, wz)` using the matrix.
4. Replace `_trailToScreen(rx, ry)` → `_trailToScreen(rx, ry, rz)`. Trail points
   need z stored — see below.
5. Depth-sort bodies before drawing: `bodies.slice().sort` by transformed cz,
   draw back-to-front so nearer bodies paint over farther ones.

**simulation.js** (small):

6. `recordTrail` should store z too: `{ x: …, y: …, z: this.z - refZ }`.
   Update ring-buffer slots accordingly.

**main.js** (small):

7. Wire up mouse drag to update `camera.azimuth` / `camera.elevation` instead
   of (or in addition to) pan. Could use: left-drag = rotate, middle/right-drag
   = pan. Or add a mode toggle button.
8. Keep the existing pan/zoom logic; just reset camera angles in view presets.

### What stays the same

- `_drawBody` draws `ctx.arc` — no change, just feeds it projected coordinates.
- `_drawTrail` draws `ctx.lineTo` — no change, just feeds projected points.
- `_drawScaleBar` — unchanged (orthographic keeps scale meaningful).
- All simulation code — unchanged.
- Energy error, HUD, speed presets, follow-body logic — all unchanged.

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
