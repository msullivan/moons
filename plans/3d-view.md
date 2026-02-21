# Plan: 3D view

## The key intuition

The simulation already stores x/y/z for every body. Adding a 3D view doesn't
require a 3D rendering library — the 2D canvas is sufficient, because:

- Every body is a sphere. A sphere viewed from any angle is a circle. So
  `ctx.arc` is still the right drawing call; you just feed it a projected
  centre and a projected radius.
- Every trail is a sequence of points. Projected 3D points are still 2D points,
  so `ctx.lineTo` still does the work.
- With three bodies, depth sorting is trivial — sort by camera-space z, draw
  back-to-front.

The entire 3D upgrade is just a math layer that sits between world coordinates
and the existing canvas calls. Nothing about the drawing code itself needs to
change.

## Camera model

Add to `Renderer`:

```
camera.azimuth    — rotation around the world z-axis (left/right drag)
camera.elevation  — rotation around the resulting x-axis (up/down drag)
```

No roll needed. Build a 3×3 view matrix by composing two rotation matrices:
`R = Rx(elevation) * Rz(azimuth)`.

A good default: `azimuth = 0, elevation = π/6` (30° tilt) so the inclined orbit
is immediately visible on load.

## Projection: orthographic vs perspective

**Start with orthographic.** Just drop the camera-space z after rotation:

```
sx = W/2 + cx / scale
sy = H/2 - cy / scale
```

Perspective adds little value at astronomical scales — the Sun and Qaia are
never "close" to the camera in any meaningful sense — and it complicates the
scale bar (which assumes a fixed pixels-per-metre ratio). Add a perspective
toggle later if wanted.

If perspective is added: divide cx/cy by `(1 + cz / focalLength)` where
`focalLength = (H/2) / tan(fov/2)` in world units, and scale body display
radius by the same factor.

## New coordinate pipeline

Replace `worldToScreen(wx, wy)` with `worldToScreen(wx, wy, wz)`:

```
1. Translate: subtract reference body position (same as now, extended to z)
2. Apply pan offset (pan stays in screen/world xy, no z panning needed)
3. Rotate: multiply [tx, ty, tz] by view matrix → [cx, cy, cz]
4. Project orthographically: sx = W/2 + cx/scale, sy = H/2 - cy/scale
```

Same change for `_trailToScreen(rx, ry)` → `_trailToScreen(rx, ry, rz)`.

## Changes required

### renderer.js (main work)

1. Add `this.camera = { azimuth: 0, elevation: Math.PI / 6 }`.
2. Add `_viewMatrix()` — computes and returns the 3×3 rotation matrix.
   Cache it once at the top of `render()` to avoid recomputing per point.
3. `worldToScreen(wx, wy, wz)` — translate, rotate, project.
4. `_trailToScreen(rx, ry, rz)` — rotate, project (no translate, already relative).
5. Depth-sort bodies before drawing:
   `bodies.slice().sort((a, b) => cameraZ(a) - cameraZ(b))` (back-to-front).

### simulation.js (small)

6. `recordTrail` stores z: `{ x: …, y: …, z: this.z - refZ }`.
   Update ring-buffer slot writes to include z.

### main.js (small)

7. Mouse drag updates `camera.azimuth` / `camera.elevation` rather than pan.
   Simplest split: left-drag = rotate, right-drag (or ctrl+drag) = pan.
   Or add a mode toggle button in the control panel.
8. View presets reset camera angles alongside scale/follow.

## What stays the same

- `_drawBody` — still `ctx.arc`, just with projected coords.
- `_drawTrail` — still `ctx.lineTo`, just with projected points.
- `_drawScaleBar` — unchanged (orthographic preserves scale).
- All of `simulation.js` except the trail z field.
- Energy, HUD, speed presets, follow-body logic, zoom — all unchanged.
