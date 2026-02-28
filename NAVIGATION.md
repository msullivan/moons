# Navigation Guide: Latitude by Pole Star, Longitude by Primus

*A technical reference for celestial navigation on Qaia.*

---

## Overview

A Qaian navigator has two celestial anchors:

1. **The pole star** — its elevation above the horizon equals your geographic latitude.
2. **Primus** — the geosynchronous moon, which fixes longitude without a chronometer.

Together these reduce a position fix to two angle measurements, both available on any
clear night. Navigators on the far side of Qaia lack Primus and must use dead reckoning
or stellar methods alone — a significant asymmetry in navigational capability.

---

## I. Finding Latitude: The Pole Star

Qaia's rotational axis points toward a star near the celestial north pole. Because the
axis holds a fixed orientation relative to the stars, the pole star never rises or sets;
it hangs motionless at a constant elevation above the north horizon.

**Rule**: elevation of the pole star = geographic latitude φ.

*In the southern hemisphere*, use the south celestial pole and measure elevation above
the south horizon; the same rule applies. Observers near the equator see the pole star
near the horizon; observers at high latitudes see it high overhead.

*Precision*: 0.1° of arc corresponds to about 11 km north–south. A good astrolabe or
cross-staff achieves this routinely on calm water.

*Axial tilt*: Qaia is tilted 23.5° (same as Earth). The pole star is 23.5° away from the
ecliptic pole, and precession slowly shifts it over millennia — but on the timescale of a
human life, its position is effectively fixed.

---

## II. Primus's Daily Figure-Eight

Understanding the longitude method requires understanding how Primus moves.

**Orbital facts (from MOONS.md):**

| Parameter | Value |
|---|---|
| Orbital radius | 42,160 km from Qaia's center |
| Period | 1.000 Qaia sidereal days (23 h 56 m) — exactly geosynchronous |
| Inclination to equator | 23.5° |
| Eccentricity | 0 (perfectly circular) |
| Apparent diameter | 10.4 arcminutes |
| Magnitude at full | −9.6 |

Because Primus's orbital period exactly matches Qaia's rotation, **its sub-satellite
longitude never changes** — it always hangs above the same meridian, defined as 0°
(Qaia's prime meridian). The 23.5° inclination causes its sub-satellite *latitude* to
oscillate sinusoidally between +23.5° N and −23.5° S once per sidereal day.

From the ground this produces a **figure-eight analemma**:

- Primus swings northward to its daily extreme (+23.5° N latitude), then southward to
  its southern extreme (−23.5° S), and back — one full cycle per day.
- From a location **on the sub-Primus meridian** (longitude 0°), Primus moves straight
  up and down in the sky — a vertical north–south oscillation, no east–west motion.
- From locations **east or west** of that meridian, the path tilts: Primus appears to
  trace a tilted, looping figure-eight in azimuth vs. elevation.
- The further east or west you are, the more oblique and loop-like the figure-eight
  becomes.

This daily shape is the same for everyone at the same longitude, which is what makes
Primus a position reference rather than merely a time signal.

**Visibility**: Primus is permanently above the horizon for the near-side hemisphere
(within roughly ±80° of the prime meridian along the equator, narrowing at higher
latitudes). It is permanently invisible from the far-side hemisphere.

---

## III. Finding Longitude: The Elevation Method

### Principle

The sub-Primus point has:
- Fixed **longitude**: always 0°.
- Oscillating **latitude**: 23.5° × sin(phase), sweeping ±23.5° per day.

Measuring Primus's **elevation** angle places you on a circle of constant geocentric
angular distance from the sub-satellite point. Your latitude φ (already known) places
you on a latitude circle. These two circles intersect at most at two points; knowing
which side of the sub-Primus meridian you are on resolves the ambiguity.

No chronometer is needed because Primus **carries its own phase signal**: by measuring
its current declination (from its north–south position relative to nearby stars of known
declination), you read directly where Primus is in its daily cycle. The sub-satellite
latitude at any moment is deterministic from that phase, and no external clock is
consulted.

### The Cleanest Fix: Observe at the Daily Extreme

The simplest procedure uses Primus at the moment of its **daily northern turning point**:
the instant it stops moving northward and begins moving southward. At that moment:

- Sub-satellite latitude: exactly **+23.5° N**.
- Sub-satellite longitude: **0°** (always).

The turning point is identifiable by direct observation — Primus's northward drift
pauses and reverses. No clock is required to find this moment; watch Primus for a few
minutes until you see it cease its northward motion.

The southern turning point (sub-satellite latitude −23.5° S), occurring approximately
12 hours later, provides a second opportunity each day.

---

## IV. The Calculation

### Symbols

| Symbol | Meaning |
|---|---|
| φ | Observer latitude (+ north, − south) |
| λ | Observer longitude east of the prime meridian (unknown) |
| φ_P | Sub-satellite latitude at time of observation (±23.5°) |
| e | Measured elevation angle to Primus (degrees above horizon) |
| ψ | Geocentric angular distance from observer to sub-satellite point |
| ρ | R_Qaia / r_Primus = 6371 / 42160 = **0.1511** |

### Step 1 — Solve for ψ from the measured elevation

The elevation formula for a body at orbital radius r_P as seen from the surface:

```
tan(e) = (cos ψ − ρ) / sin ψ
```

Rearranging to give cos ψ directly from the measured elevation:

```
cos ψ = ρ cos²e + sin(e) × sqrt(1 − ρ² cos²e)
```

With ρ = 0.1511, the correction term ρ² cos²e is at most 0.023 (negligible for rough
fixes; important for high precision).

### Step 2 — Recover longitude from ψ

The geocentric angular distance between observer (φ, λ) and sub-satellite point
(φ_P, 0°) is given by the spherical law of cosines:

```
cos ψ = sin φ × sin φ_P + cos φ × cos φ_P × cos λ
```

Solving for λ:

```
cos λ = (cos ψ − sin φ × sin φ_P) / (cos φ × cos φ_P)
λ = ± arccos( above )
```

**Sign convention**: the two solutions are ±λ (east and west of the prime meridian).
If Primus appears to the **east** of your local meridian (i.e., east of due north or due
south), you are **west** of the prime meridian (negative λ). If Primus appears to the
west, you are east.

---

## V. Worked Example

**Observer**: latitude 40° N, measures Primus elevation at its northern turning point:
e = 47.3°.

**Step 1 — Solve for ψ:**
```
ρ cos²e = 0.1511 × cos²(47.3°) = 0.1511 × 0.4596 = 0.0695
sin(e)  = sin(47.3°)            = 0.7353
ρ² cos²e = 0.1511² × 0.4596    = 0.0105
sqrt(1 − 0.0105)                = 0.9947

cos ψ = 0.0695 + 0.7353 × 0.9947 = 0.0695 + 0.7314 = 0.8009
ψ = 36.8°
```

**Step 2 — Solve for longitude:**
```
φ_P = +23.5°,  φ = 40°

numerator   = cos(36.8°) − sin(40°) × sin(23.5°)
            = 0.8004 − 0.6428 × 0.3987
            = 0.8004 − 0.2563 = 0.5441

denominator = cos(40°) × cos(23.5°)
            = 0.7660 × 0.9171 = 0.7025

cos λ = 0.5441 / 0.7025 = 0.7747
λ = 39.3°
```

Primus is slightly to the east in the sky → observer is at **39.3° West** of the prime meridian.

*(Check: forward-substitution confirms the elevation formula returns 47.3° for an observer at 40° N, 39.3° W. ✓)*

---

## VI. Practical Considerations

### Navigation tables

Pre-computed tables indexed by (latitude, Primus elevation at northern extreme) →
longitude are far faster than live calculation. A table at 1° latitude × 0.5° elevation
resolution covers the visible near-side hemisphere in roughly 30,000 entries — a standard
nautical almanac size.

### Accuracy

Longitude precision scales with elevation-measurement precision:

| Instrument precision | Latitude accuracy | Longitude accuracy |
|---|---|---|
| 0.5° (simple astrolabe) | ~55 km | ~55–70 km |
| 0.1° (good sextant) | ~11 km | ~11–14 km |
| 0.05° (careful sextant) | ~6 km | ~6–7 km |

Longitude sensitivity varies by location: it is highest near the equator and sub-Primus
meridian (where Primus is high overhead and small elevation changes produce large
longitude changes) and lowest near the visibility limits (where Primus is near the
horizon and the geometry is shallower).

### Horizon visibility limits

The maximum geocentric angle at which Primus remains above the horizon is
ψ_max = arccos(ρ) ≈ **81.3°**. In practice:

- From the **equator**, Primus is visible within roughly ±80° of the prime meridian.
- From **60° N or S latitude**, the near-meridian extent shrinks to roughly ±60–65°.
- Observers near the **visible edge** can still get a fix but with reduced accuracy; Primus
  is low, atmospheric refraction is significant, and the geometry is shallow.

### Equatorial crossings

Primus crosses the equator (sub-satellite latitude = 0°) twice per day, approximately
halfway between the northern and southern extremes. At that moment the geometry
simplifies (φ_P = 0°), but identifying the crossing instant requires watching Primus's
direction of motion carefully. The **extremes** (turning points) are easier to identify
in the field.

### Double fixes and error checks

A navigator can take two fixes per day (northern and southern extremes) and compare
results. Discrepancies reveal measurement error or timing error. Comparing the azimuth
to Primus at transit (when it is due north or south) provides a third cross-check.

### The sub-Primus prime meridian

The prime meridian passes through the sub-Primus point by convention. This is the most
natural zero of longitude on Qaia: a celestial landmark fixed in the sky, identifiable
from anywhere in the near-side hemisphere, requiring no agreement between nations — only
a clear night and an angle-measuring instrument.

---

## VII. Why Qaians Solved the Longitude Problem Early

On Earth, finding longitude at sea required a precise chronometer (to compare local noon
to Greenwich noon). The difficulty was mechanical: clocks could not keep accurate time
on a pitching ship.

Qaia has no such problem. Primus *is* the chronometer — its position in its daily
figure-eight encodes the time directly, readable by any observer who can measure angles.
More precisely: longitude does not require time at all on Qaia. A single elevation
measurement, combined with the known latitude, yields a longitude fix. No clock,
no radio signal, no reference port needed.

The limitation is hemispheric: the near side has effortless longitude from birth; the far
side has nothing of the sort and would need to develop the longitude-by-lunar-distance
method (comparing Secundus or Quartus positions to star catalogs) — a much harder
problem, exactly as on Earth.

---

## Summary

| Step | Observation | What you get |
|---|---|---|
| 1 | Elevation of the pole star above the north horizon | Latitude φ |
| 2 | Elevation of Primus at its daily northern turning point | Longitude λ (by formula or table) |
| Optional | Azimuth of Primus (east or west of due north/south) | East–west sign of longitude |

Two angle measurements. No clock. Position anywhere in the near-side hemisphere.
