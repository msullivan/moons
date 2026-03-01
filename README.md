# Qaia Moon Simulation

A browser-based n-body gravitational simulator for Qaia, the Earth-like planet in my RPG
setting. Models Qaia's six-moon system with real physics and a live moon-phase panel.

Vibed up with Sonnet 4.6 ([transcript](https://gisthost.github.io/?e23f59fcafd23ae43f7821c5fdaec068/index.html)).

Requires a local HTTP server (ES modules are blocked on `file://` URLs in Chrome):

```
python3 -m http.server
```

Then open `http://localhost:8000`. No build step needed.

## The System

Six moons orbiting Qaia (an Earth-mass planet at 1 AU), plus the Sun and Quintus (a
trace-particle trojan at the Sun-Qaia L4 point):

| Moon | Distance | Period | Direction | Notes |
|---|---|---|---|---|
| Primus | 0.11 LD | 1.00 d | prograde | Geosynchronous, magically anchored |
| Secundus | 0.30 LD | 4.51 d | retrograde | Iron-density, slightly smaller than our Moon in the sky |
| Tertius | 0.45 LD | 8.29 d | prograde | Largest in sky (43.5′ vs Moon's 31′) |
| Quartus | 1.00 LD | 27.45 d | prograde | Identical to Earth's Moon |
| Sextus | 1.65 LD | 58.2 d | retrograde | Small disc, naked-eye visible |
| Septimus | 2.10 LD | 83.5 d | retrograde | Long-calendar body |

1 LD = 1 lunar distance = 384,400 km. All orbits verified stable past 1000 simulated years.

Primus is fixed in geosynchronous orbit by a magical anchor.
It never rises or sets for one hemisphere, enables longitude determination without a
chronometer, and raises a small permanent tidal bulge rather than oscillating tides.

See [MOONS.md](MOONS.md) for full physical stats and [TIDES.md](TIDES.md) for tidal analysis.

## Physics

- **Velocity Verlet integration** (symplectic, 2nd-order) — energy drift typically < 1×10⁻⁸
  over 1000 simulated years.
- Real SI units throughout. Initial conditions in the centre-of-mass frame.
- Primus anchor: position and velocity overridden each step to enforce circular
  geosynchronous orbit; non-conservative but negligible drift at 0.001 lunar masses.
- Energy error displayed live as a sanity check.

## Controls

| Input | Action |
|---|---|
| `Space` | Pause / resume |
| Scroll wheel | Zoom (cursor-anchored) |
| Click & drag | Pan |
| `+` / `-` | Zoom in / out |
| `R` | Reset simulation |
| `T` | Toggle trails |
| `L` | Toggle labels |

Speed presets: 6 h/s · 1 day/s · 1 wk/s · 1 mo/s · 1 yr/s · 10 yr/s · 100 yr/s

Follow dropdown tracks any body. Orbit panel (top-right) shows live orbital elements
for the selected body. Moon-phase panel (right) shows current phase and apparent size
for all six moons, updated every frame.

## Files

```
index.html          — HTML skeleton
style.css           — Dark space theme
simulation.js       — N-body physics (Velocity Verlet, anchor mechanism)
bodies.js           — Physical constants, moon parameters, createInitialBodies()
renderer.js         — Canvas rendering (trails, glow, Qaia continents, scale bar)
main.js             — Animation loop, UI, phase panel, keyboard handling
MOONS.md            — Physical and observational reference for all moons
TIDES.md            — Tidal period analysis and 30-day simulation
tests/              — Playwright stability and screenshot scripts
analysis/           — Headless analysis scripts
  moon_stats.mjs    — Regenerates MOONS.md data
  tide_sim.mjs      — Regenerates TIDES.md data and tide_plot.png
```
