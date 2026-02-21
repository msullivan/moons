# Moon Stability Notes

Testing methodology: standalone n-body integrator in `stability_test.mjs`,
Velocity Verlet at dt=360s, binding energy check (specific orbital energy relative
to Qaia < 0) sampled at 10–100 year intervals. All masses are fractions of
lunar mass (LM = 7.342e22 kg). Distances in lunar distances (LD = 3.844e8 m).
Qaia = 1 Earth mass, Sun = 1 solar mass, Qaia at 1 AU.

---

## Key physics constraints

- **Qaia's Hill sphere**: ~3.9 LD. Practical stability limit for prograde orbits
  is ~0.5 × r_Hill ≈ 1.9 LD (semi-major axis). Retrograde orbits stable further
  out, ~0.7 × r_Hill ≈ 2.7 LD.
- **Primus at 1.0 LD kills the outer prograde zone entirely.** Resonant kicks from
  Primus destabilize any outer prograde moon within a few decades regardless of
  starting parameters.
- **Spreading orbits doesn't help mutual stability** — mutual Hill radii scale
  with semi-major axis, so moving everything outward proportionally keeps the
  gaps in units of Hill radii the same.
- **Reducing Primus mass** reduces its Hill sphere as M^(1/3), a weak lever
  (8× mass reduction → 2× Hill sphere shrink).
- **The middle moon in a packed inner system is always the first to go.** It
  gets squeezed by its neighbours on both sides.
- **Low inner moon masses help significantly.** At 0.02–0.04 LM the mutual
  perturbations are weak enough to extend survival times substantially.

---

## Individual stability (single test moon + Primus at 1.0 LD)

These are stable past 200 years when tested alone:

| a (LD) | e    | Notes |
|--------|------|-------|
| 0.10   | 0.20 | Very fast, ~0.9 day period |
| 0.20   | 0.15 | ~2.6 day period |
| 0.30   | 0.20 | ~4.8 day period |
| 0.45   | 0.35 | Current Secundus, ~8.7 day period |
| 0.45   | 0.10 | More circular version |

Outer prograde (any a > ~1.1 LD): **all unstable** due to Primus resonances.

Retrograde outer (individually stable past 200 years):

| a (LD) | e    |
|--------|------|
| 1.5    | 0.10–0.25 |
| 2.0    | 0.10–0.25 |
| 2.5    | 0.10–0.25 |
| 3.0+   | unstable  |

---

## Mutual stability: 4 inner moons (Inner1 + Inner2 + Secundus + Primus)

### With standard masses (0.05 / 0.10 / 0.25 / 1.00 LM)

| Config | Primus a | e | Survival |
|--------|----------|---|----------|
| a=0.10/0.28/0.45/1.0 | 1.0 LD | 0.10 | **~500–600 yr** (best result with these masses) |
| a=0.20/0.40/0.65/1.5 | 1.5 LD | 0.15–0.25 | <100 yr (worse — moving out scaled the Hill radii up too) |

### With low inner masses (0.02 / 0.04 / 0.25 / 1.00 LM), Primus at 1.0 LD

Orbits scaled as 0.12/0.28/0.45 × primusA:

| e    | Survival | Notes |
|------|----------|-------|
| 0.10 | **~400 yr** — all 4 survive to yr300, Inner1+Inner2 gone at yr400 |
| 0.20 | Inner2 gone at yr100; Inner1+Secundus+Primus **stable past 1000 yr** |
| 0.30 | Inner2+Secundus gone at yr100; Inner1+Primus survive |

### With 1/8 Primus mass (0.125 LM)

Doesn't help — Inner1/Inner2 fail faster because Primus's gravity was actually
helping anchor the inner region.

---

## Promising configurations for 3 inner moons

### Option A — tight low-mass pack, originally ~300–400 yr

Inner2 at 0.28 LD had a near-resonance with Secundus (period ratio ≈ 0.39, near
7:2) that limited survival. A sweep of Inner2 semi-major axes found:

| Inner2 a | ratio to Sec | survival |
|----------|-------------|----------|
| 0.20 LD  | 0.30        | **all 4 ok to 1000 yr** |
| 0.22 LD  | 0.33 (3:1!) | Inner1 gone at yr400 |
| 0.24 LD  | 0.36        | **all 4 ok to 1000 yr** |
| 0.26 LD  | 0.39        | Inner1 gone at yr900 |
| 0.28 LD  | 0.42        | Inner1+2 gone at yr300–400 |
| 0.30–0.34| 0.45–0.56   | fail at yr100–200 |

Best config (**currently implemented in simulation.js**):
```
Inner1:   a=0.12 LD, e=0.10, mass=0.02 LM  (peri=0.108, apo=0.132)
Inner2:   a=0.24 LD, e=0.10, mass=0.04 LM  (peri=0.216, apo=0.264)
Secundus: a=0.45 LD, e=0.10, mass=0.25 LM  (peri=0.405, apo=0.495)
Primus:   a=1.00 LD, e=0.00, mass=1.00 LM
```
Non-crossing ✓. All four stable past 1000 years. The 0.24 LD choice is preferred
over 0.20 LD for better spacing (Inner1–Inner2 gap 0.084 LD vs 0.048 LD).

### Option B — skip Inner2, Inner1 barely there
```
Inner1:   a=0.12 LD, e=0.20, mass=0.02 LM  (peri=0.096, apo=0.144)
Secundus: a=0.45 LD, e=0.20, mass=0.25 LM  (peri=0.360, apo=0.540)
Primus:   a=1.00 LD, e=0.00, mass=1.00 LM
```
Only 3 moons total. Wide gap between Inner1 and Secundus means no crossing risk.
Likely very stable — worth testing to 1000 yr. Inner1 is small and fast (period
~1.3 days), Secundus is the main mid-range moon.

### Option C — two equal small inner moons, non-crossing
```
Inner1:   a=0.15 LD, e=0.10, mass=0.02 LM  (peri=0.135, apo=0.165)
Inner2:   a=0.30 LD, e=0.10, mass=0.02 LM  (peri=0.270, apo=0.330)
Secundus: a=0.45 LD, e=0.10, mass=0.25 LM  (peri=0.405, apo=0.495)
Primus:   a=1.00 LD, e=0.00, mass=1.00 LM
```
Equal low masses on Inner1/Inner2 reduces the asymmetric kicking that tends to
eject the lighter one. Gaps: I1→I2 = 0.105 LD, I2→Sec = 0.075 LD. Untested.

---

## Notes on retrograde outer moons

Individual retrograde moons at 1.5–2.5 LD are stable past 200 years on their own.
They were not tested together with inner moons. The main concern when combining them
is crossing orbits — e.g. Outer1 apoapsis must be less than Outer2 periapsis. With
e=0.10 at a=1.5/2.0/2.5 LD the orbits don't cross and separation is healthy. Mutual
stability with the inner system untested.

---

## What hasn't been tried yet

- Option B and Option C above
- Retrograde outer moons combined with the inner system
- Reducing Secundus mass (currently 0.25 LM — it dominates the inner zone)

---

## System-level levers for more moons

### Move Qaia further from the Sun
Hill sphere scales with orbital radius. At 1.5 AU it's 1.5× bigger. Moon orbital
speeds around Qaia are unchanged, surface gravity unchanged. Downside: less sunlight
(compensate with a slightly brighter star).

### Use a less massive star
r_Hill = a × (M_planet / 3M_star)^(1/3) — lighter star directly widens the Hill
sphere. A K-dwarf at 0.6 M_sun gives ~(1/0.6)^(1/3) ≈ 1.19× wider Hill sphere.
K-dwarfs are arguably better for habitability anyway (longer-lived, less UV).
Could combine with a closer orbit to keep temperature the same.

### Make Qaia more massive (super-Earth)
Heavier central body = bigger Hill sphere AND smaller moon/planet mass ratios
(weaker mutual perturbations). A 4× Earth-mass Qaia gives 4^(1/3) ≈ 1.59× wider
Hill sphere. Downsides for a habitable world: surface gravity ~1.6× Earth (rough
for humanoids), moons orbit faster.

### Reduce Primus's mass ("low-density fantasy moon")
Acceptable in a fantasy setting where moons don't have to follow Earth-like
densities. Reducing Primus to 1/8 LM shrinks its Hill sphere by 2× and weakens
its resonant kicks on the inner zone. Current tests show this helps Secundus but
not Inner1/Inner2 (they destabilize each other). More useful combined with other
changes.
