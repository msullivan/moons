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

## Night-side shadow in 3D (the tricky part)

The current shadow is a linear gradient from the lit edge to the dark edge,
clipped to the body disc. This works in 2D because the sun is always in the
camera plane, so the terminator (lit/dark boundary) projects as a straight
diameter. In 3D with camera elevation, this is no longer true.

### Why the terminator becomes an ellipse

A point `p` on the sphere is on the terminator when its outward surface normal
is perpendicular to the sun direction — i.e. `p · sun = 0` (on a unit sphere
the normal equals p). This defines a great circle, not a single point. In
orthographic projection (drop the camera-space z), that great circle projects
as a conic section. Substituting `z = sqrt(r²−x²−y²)` into `p·sun = 0` and
squaring gives the projected terminator equation:

```
x²(sx²+sz²) + 2xy·sx·sy + y²(sy²+sz²) = sz²·r²
```

where `(sx, sy, sz)` is the unit sun direction in camera space.

### Deriving the ellipse parameters (principal axis theorem)

This is a quadratic form `xᵀMx = D` with symmetric matrix:

```
M = [[sx²+sz²,  sx·sy],
     [sx·sy,  sy²+sz²]]
```

The eigenvalues of M determine the semi-axes. They satisfy
`λ² − (1+sz²)λ + sz² = 0`, which factors as `(λ−1)(λ−sz²) = 0`.
So the eigenvalues are exactly **1** and **sz²**, with corresponding semi-axes:

```
λ = sz²  →  semi-axis = sqrt(sz²r² / sz²) = r          (major axis)
λ = 1    →  semi-axis = sqrt(sz²r² / 1)   = |sz|·r     (minor axis)
```

The eigenvectors give the axis directions:
- major axis (length r): direction **(-sy, sx)** — perpendicular to the sun's
  screen projection
- minor axis (length |sz|·r): direction **(sx, sy)** — along the sun's screen
  projection

See: [Principal axis theorem — Wikipedia](https://en.wikipedia.org/wiki/Principal_axis_theorem)

### The ctx.ellipse() call

```javascript
const rotation = Math.atan2(sx_sun, -sy_sun); // angle of major axis in screen space
ctx.ellipse(cx, cy,
    r,                // radiusX = major semi-axis
    Math.abs(sz) * r, // radiusY = minor semi-axis
    rotation,
    Math.PI, 2 * Math.PI); // lit half only (see below)
```

The `[π, 2π]` arc selects the lit half. With `rotation` defined as above, the
minor-axis tip at t=3π/2 has screen-space dot product `|sz|·(sx²+sy²)/len > 0`
with the sun direction, confirming it is always on the sun-facing side.

### Drawing the shadow region

Replace the current linear gradient with:

1. Save state; clip to body disc (`ctx.arc`)
2. Fill entire clipped rect dark (shadow base)
3. Begin path: draw lit half of terminator ellipse (`ctx.ellipse`, π→2π),
   then close with the major arc of the disc back to the start point
4. Fill that path with body color (punches out the lit region)
5. Restore

This degrades gracefully: when `sz = 0` (sun in the camera plane) `|sz|·r = 0`
and the ellipse collapses to a straight line — matching the current 2D behaviour.

### Continent texture

The continent polygons (Qaia only) are defined in body-local 2D and currently
rendered by clipping to the disc and filling rotated polygons. In 3D, each
polygon vertex `(cx, cy)` lives on the sphere surface at 3D position
`r·(cx·cosφ − cy·sinφ·sinI, cx·sinφ + cy·cosφ·sinI, cy·cosI)` (roughly),
where φ is the rotation angle and I is the axial tilt. After applying the view
matrix you project and draw as before, but you must cull vertices on the back
hemisphere (camera-space z < 0). This is the second non-trivial piece of the
3D upgrade.

## What stays the same

- `_drawBody` — still `ctx.arc`, just with projected coords.
- `_drawTrail` — still `ctx.lineTo`, just with projected points.
- `_drawScaleBar` — unchanged (orthographic preserves scale).
- All of `simulation.js` except the trail z field.
- Energy, HUD, speed presets, follow-body logic, zoom — all unchanged.
