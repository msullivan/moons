# Qaia Moon Simulation

A browser-based n-body gravitational simulator with eventual
applications for my RPG setting.

Vibed up with Sonnet 4.6 ([initial transcript](https://gisthost.github.io/?387d19e00351e1b50ffcf47e880c5ef1/)).

Requires a local HTTP server (ES modules are blocked on `file://` URLs in Chrome).
The simplest option:

```
python3 -m http.server
```

Then open `http://localhost:8000` in a browser. No build step needed.

## Physics

- **Velocity Verlet integration** (symplectic, 2nd-order) — conserves energy far
  better than RK4 for long orbital runs. Energy drift is typically < 1e-8 over
  decades of simulated time.
- Real physical constants: SI units throughout (metres, kilograms, seconds).
- Initial conditions in the centre-of-mass frame with correct circular orbit
  velocities for Earth and Moon.
- Energy error displayed live in the HUD as a sanity check.

## Controls

| Input | Action |
|---|---|
| `Space` | Pause / resume |
| Scroll wheel | Zoom (cursor-anchored) |
| Click & drag | Pan |
| `+` / `-` | Zoom in / out |
| `R` | Reset simulation |
| `T` | Toggle trails |

The control panel also has speed presets (1 day/s → 100 yr/s), view presets
(Solar System / Earth-Moon), a Follow dropdown, and zoom buttons.

## Files

```
index.html      — HTML skeleton
style.css       — Dark space theme
simulation.js   — N-body physics (Velocity Verlet, initial conditions)
renderer.js     — Canvas rendering (trails, glow, scale bar)
main.js         — Animation loop, UI, zoom/pan, keyboard handling
```

## Sonnet's ideas for next steps

- **More moons** — the n-body engine already handles arbitrary N; just needs UI
  to add and configure additional moons
- **Configurable initial conditions** — set moon mass, orbital radius, and
  eccentricity interactively
- **Eccentric / inclined orbits** — non-circular starting velocities, out-of-plane
  inclination for a 3D view
- **3D view** — render with perspective, allow rotating the orbital plane
- **Lagrange points / stability visualization** — mark L1–L5, colour-code regions
  by stability
- **Long-run stability stats** — plot energy error over time, track orbital
  elements (semi-major axis, eccentricity) to watch for secular drift
