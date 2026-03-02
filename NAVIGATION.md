# Navigation Guide: Latitude by Pole Star, Longitude by Primus

*A technical reference for celestial navigation on Qaia.*

---

## Overview

A Qaian navigator has two celestial anchors:

1. **The pole star** — its elevation above the horizon equals your geographic latitude.
2. **Primus** — the geostationary moon, which fixes longitude without a chronometer.

Together these reduce a position fix to two angle measurements, both available on any
clear night. Navigators on the far side of Qaia lack Primus and must rely on dead
reckoning or stellar methods alone — a significant asymmetry in navigational capability.

---

## I. Finding Latitude: The Pole Star

Qaia's rotational axis points toward a star near the celestial north pole. Because the
axis holds a fixed orientation relative to the stars, the pole star never rises or sets;
it hangs motionless at a constant elevation above the north horizon.

**Rule**: elevation of the pole star = geographic latitude φ.

*In the southern hemisphere*, use the south celestial pole and measure elevation above
the south horizon; the same rule applies.

*Precision*: 0.1° of arc corresponds to about 11 km north–south. A good astrolabe or
cross-staff achieves this routinely on calm water.

---

## II. Primus: A Fixed Point in the Sky

Primus orbits Qaia at 42,160 km in a circular orbit whose period exactly matches
Qaia's sidereal day (23 h 56 m). Its orbital inclination to the ecliptic — 23.5° —
equals Qaia's axial tilt exactly. These two tilts cancel: Primus's orbital plane
coincides with Qaia's equatorial plane.

The result is a truly **geostationary** moon. From anywhere on the near-side hemisphere,
Primus is a motionless fixed point in the sky. It never rises, never sets, never drifts.
It is as stationary as the pole star, but sits on the celestial equator instead of the
celestial pole.

**Orbital facts (from MOONS.md):**

| Parameter | Value |
|---|---|
| Orbital radius | 42,160 km from Qaia's center |
| Altitude above surface | ~35,800 km |
| Period | 1 Qaia sidereal day (23 h 56 m) — geostationary |
| Sub-satellite point | Fixed at latitude 0°, longitude 0° (the prime meridian) |
| Apparent diameter | 10.4 arcminutes |
| Magnitude at full | −9.6 |

Because Primus hangs motionless, there is no special time to observe it, no phase to
wait for, and no oscillation to track. Pick any clear night, look up, and measure.

**Visibility**: Primus is permanently above the horizon for observers within roughly
±80° of the prime meridian at the equator (narrowing toward higher latitudes). It is
permanently invisible from the far-side hemisphere.

---

## III. Finding Longitude: The Elevation Method

### Principle

The sub-Primus point is always at geographic position (0° N, 0° E) — on the equator,
at the prime meridian, never moving. Measuring Primus's **elevation** angle places you
on a cone of constant geocentric angular distance ψ from that fixed point. Your latitude
φ (already known from the pole star) places you on a circle of latitude. These two
surfaces intersect at most at two points; knowing whether Primus appears to the east or
west of your local meridian (its **azimuth**) resolves which one.

No chronometer is needed because the measurement is purely geometric — the position of
a fixed object relative to your horizon.

### The Calculation

**Symbols:**

| Symbol | Meaning |
|---|---|
| φ | Observer latitude (+ north, − south) |
| λ | Observer longitude (unknown; + east of prime meridian) |
| e | Measured elevation angle to Primus |
| ψ | Geocentric angular distance from observer to sub-Primus point |
| ρ | R_Qaia / r_Primus = 6371 / 42160 = **0.1511** |

**Step 1 — Solve for ψ from the measured elevation.**

The standard elevation formula for a body at orbital radius r_P:

```
tan(e) = (cos ψ − ρ) / sin ψ
```

Rearranging to invert directly from e:

```
cos ψ = ρ cos²e + sin(e) × sqrt(1 − ρ² cos²e)
```

The correction term ρ² cos²e ≤ 0.023; for rough fixes it can be dropped, giving the
simpler approximation `cos ψ ≈ ρ cos²e + sin(e)`.

**Step 2 — Recover longitude.**

Because the sub-Primus point is on the equator (latitude 0°), the spherical law of
cosines simplifies to:

```
cos ψ = cos φ × cos λ
```

Solving for λ:

```
cos λ = cos ψ / cos φ
λ = ± arccos( cos ψ / cos φ )
```

**Sign (east or west)**: if Primus appears to the **east** of due south (or due north),
you are **west** of the prime meridian. If Primus appears to the west, you are east.

---

## IV. Worked Example

**Observer**: latitude 30° N, Primus appearing slightly to the west. Measured elevation:
e = 42.2°.

**Step 1 — Solve for ψ:**
```
cos(42.2°) = 0.7408    cos²(42.2°) = 0.5488    sin(42.2°) = 0.6717

ρ cos²e        = 0.1511 × 0.5488 = 0.0829
ρ² cos²e       = 0.0228 × 0.5488 = 0.0125
sqrt(1 − 0.0125) = 0.9937

cos ψ = 0.0829 + 0.6717 × 0.9937 = 0.0829 + 0.6675 = 0.7504
ψ = 41.4°
```

**Step 2 — Solve for longitude:**
```
cos λ = cos ψ / cos φ = 0.7504 / cos(30°) = 0.7504 / 0.8660 = 0.8666
λ = arccos(0.8666) = 30°
```

Primus appears to the west → observer is at **30° East** of the prime meridian.

*(Check: cos ψ = cos 30° × cos 30° = 0.8660 × 0.8660 = 0.750 ✓; tan e = (0.750 − 0.151) / sin 41.4° = 0.599 / 0.661 = 0.906; e = 42.2° ✓)*

---

## V. Practical Considerations

### Navigation tables

The calculation reduces to three lookups in a single cosine table and one division.
Sine and cosine are the same function offset by 90° (`sin x = cos(90° − x)`), so a
cosine table alone covers every step:

| Step | Operation | Table use |
|---|---|---|
| 1a | look up `cos e` and `cos²e` | direct lookup at angle `e` |
| 1b | look up `sin e` | lookup at `90° − e` |
| 1c | compute `cos ψ` | arithmetic on the above values |
| 2a | look up `cos φ` | direct lookup at angle `φ` |
| 2b | divide `cos ψ / cos φ` → `cos λ` | one division |
| 2c | reverse-lookup `cos λ` → `λ` | read table backwards |

Step 1c is the only arithmetic beyond simple lookups, and for rough fixes the small
correction term `ρ² cos²e` (at most 2.3%) can be dropped entirely, leaving:

```
cos ψ ≈ ρ cos²e + sin e
```

which is two table lookups, one multiplication by the constant 0.1511, and one addition.

For a pre-printed almanac, Step 1 can be eliminated entirely by tabulating `cos ψ`
directly against `e` — a single column that is computed once and never changes, since
it depends only on the fixed ratio ρ = R_Qaia / r_Primus:

| Elevation e | cos ψ |
|---|---|
| 5° | 0.279 |
| 10° | 0.398 |
| 20° | 0.565 |
| 30° | 0.693 |
| 45° | 0.837 |
| 60° | 0.927 |
| 75° | 0.981 |
| 90° | 1.000 |

With this table in hand, the complete at-sea procedure is: measure `e`, look up `cos ψ`,
divide by `cos φ` (looked up from the same cosine table at angle φ), reverse-lookup to
get `λ`. A 1° × 0.5° version of the `e → cos ψ` column covers every useful elevation
in under 200 entries. The two-variable `(e, φ) → λ` table that eliminates all
arithmetic fits the full near-side hemisphere in roughly 30,000 entries — standard
nautical almanac size.

### Accuracy

Longitude precision scales directly with elevation-measurement precision:

| Instrument | Latitude accuracy | Longitude accuracy |
|---|---|---|
| Simple astrolabe (~0.5°) | ~55 km | ~55–70 km |
| Good cross-staff (~0.1°) | ~11 km | ~11–14 km |
| Careful sextant (~0.05°) | ~6 km | ~6–7 km |

Sensitivity varies by location: it is highest near the equator and prime meridian
(Primus overhead, large elevation change per degree of longitude) and lowest near the
visibility boundary (Primus near the horizon, shallow geometry).

### Horizon visibility limits

The maximum angular separation at which Primus remains above the horizon is
ψ_max = arccos(ρ) ≈ **81.3°**. In practical terms:

- From the **equator**, Primus is visible to roughly ±81° longitude from the prime meridian.
- From **higher latitudes**, the longitude range narrows. At 60° latitude, only
  observers within roughly ±72° longitude can see Primus.
- Near the visibility boundary, Primus is low on the horizon; atmospheric refraction is
  significant and precision is reduced.

### The prime meridian

The sub-Primus point defines longitude 0° — the most natural prime meridian choice on
Qaia. It requires no inter-national agreement, no reference observatory, and no
historical convention: any navigator anywhere in the near hemisphere can identify it
with a plumb line and a clear sky.

### Far-side hemisphere

Primus is permanently below the horizon for the far-side hemisphere. Navigation there
requires dead reckoning, stellar transit observations, or lunar-distance methods (using
Secundus or Quartus against a star catalogue) — a substantially harder problem, exactly
analogous to Earth's pre-chronometer longitude difficulty.

---

## VI. Summary

| Step | Observation | Result |
|---|---|---|
| 1 | Pole star elevation above north horizon | Latitude φ |
| 2 | Primus elevation above horizon | Longitude magnitude (via formula or table) |
| 3 | Primus azimuth (east or west of due south) | Longitude sign (E or W) |

Two angle measurements, no clock, no reference port, no lunar tables. Qaian navigators
solved the longitude problem not by building better chronometers, but by being born on
the right hemisphere of a world with a geostationary moon.
