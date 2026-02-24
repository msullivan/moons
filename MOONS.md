# Qaia Moon Reference

Generated from `bodies.js` parameters. Re-run `node analysis/moon_stats.mjs` after any changes.

Qaia's Hill sphere: **3.89 LD**. All values assume lunar geometric albedo (~0.12) for brightness.
Quartus (1.00 LD, 1 M_moon) is used as the reference body throughout.

---

## Primus — geosynchronous prograde, 5° inclined *(magically anchored)*

| Property | Value |
|---|---|
| Mass | 0.001 M_moon |
| Radius | 138 km (0.079 R_moon) |
| Density | 6,689 kg/m³ — **2× lunar**, near-iron |
| Orbital radius | 0.110 LD (~42,160 km) — geosynchronous |
| Period | 1.00 days (= Qaia sidereal day) |
| Eccentricity | 0 (circular by construction) |
| Inclination | **5.0°** — ascending node along x-axis (Ω = 0) |
| Angular diameter | **22.5′** — **0.72× Quartus** |
| Full-moon brightness | **−12.04** (0.70 mag brighter than Quartus) |
| Surface gravity | 0.258 m/s² (0.16× Quartus) |
| Surface area | 0.24 M km² (0.6% of Quartus) |
| Escape velocity | 267 m/s |
| Static tidal bulge | **~20 cm** permanent ocean offset (not an oscillating tide) |
| Tidal force (gradient) | ×0.758 vs Quartus |
| Hill sphere fraction | 2.8% |
| Roche margin | ×5.6 (rigid body) |

Primus is near-stationary in Qaia's sky but not perfectly fixed. Its 5° orbital inclination causes it to trace a slow daily arc spanning **±5° in declination** — a north-south oscillation completing once per sidereal day. From any point on the near-side hemisphere it remains in the same general region of sky and never rises or sets, but it drifts visibly north and south over the course of a day. Despite being close (0.11 LD), its small mass (0.001 M_moon) makes it modest in the sky: **22.5′ apparent diameter** (smaller than Quartus) and magnitude −12.04. At 6,690 kg/m³ it is nearly iron-density, likely a fragment of a differentiated parent body.

**Navigation**: Primus is a powerful longitude reference. Because it remains locked to the same longitude and oscillates predictably in latitude, measuring its position in the sky (with knowledge of the time in the sidereal day) immediately yields longitude. Latitude is easily found by the usual methods (pole star, noon sun). The 5° inclination means a navigator must account for Primus's current declination, requiring a simple table or calculation — but this is straightforward given any reliable time-keeping. Qaian navigators would have solved the longitude problem far earlier than Earth's — the main limitation is that Primus is visible only from one hemisphere.

**Tidal signature**: because Primus co-rotates with Qaia, it does not sweep across the sky and produces no oscillating tide. The 5° inclination means the static bulge axis slowly oscillates a few degrees north and south over each sidereal day, but the effect is small. Primus still raises a **permanent ~20 cm static bulge** in Qaia's oceans at roughly the sub-Primus longitude. The daily tidal rhythm on Qaia is driven entirely by Secundus, Tertius, and Quartus.

---

## Secundus — retrograde

| Property | Value |
|---|---|
| Mass | 0.040 M_moon |
| Radius | 471 km (0.271 R_moon) |
| Density | 6,689 kg/m³ — 2× lunar, near-iron |
| Semi-major axis | 0.30 LD |
| Period | 4.51 days |
| Eccentricity | 0.10 |
| Angular diameter | 28.1′ mean (25.6′–31.2′) — 0.91× Quartus |
| Full-moon brightness | **−12.52** (0.22 mag brighter than Quartus) |
| Surface gravity | 0.882 m/s² (0.54× Quartus) |
| Surface area | 2.79 M km² (7.4% of Quartus) |
| Escape velocity | 912 m/s |
| Tidal force on Qaia | 1.48× Quartus |
| Hill sphere fraction | 7.7% |
| Roche margin | ×15.3 |

Slightly smaller than Quartus in the sky at mean distance; near periapsis it approaches Quartus's size. Retrograde — same 2× lunar density as Primus, suggesting shared origin or composition (both iron-rich fragments of the same progenitor).

---

## Tertius — prograde

| Property | Value |
|---|---|
| Mass | 0.250 M_moon |
| Radius | 1,094 km (0.630 R_moon) |
| Density | 3,344 kg/m³ — lunar |
| Semi-major axis | 0.45 LD |
| Period | 8.29 days |
| Eccentricity | 0.10 |
| Angular diameter | 43.5′ mean (39.5′–48.3′) — 1.40× Quartus |
| Full-moon brightness | **−13.47** (0.73 mag brighter than Quartus) |
| Surface gravity | 1.023 m/s² (0.63× Quartus) |
| Surface area | 15.05 M km² (39.7% of Quartus) |
| Escape velocity | 1,496 m/s |
| Tidal force on Qaia | 2.74× Quartus |
| Hill sphere fraction | 11.6% |
| Roche margin | ×18.2 |

The largest and brightest object in Qaia's sky among the free moons — 43.5′, noticeably bigger than Quartus. A substantial rocky world with surface area roughly comparable to Russia. Prograde, 8.3-day period. Tidal contribution nearly 3× Quartus.

---

## Quartus — prograde *(reference)*

| Property | Value |
|---|---|
| Mass | 1.000 M_moon |
| Radius | 1,737 km (1.000 R_moon) |
| Density | 3,344 kg/m³ — lunar |
| Semi-major axis | 1.00 LD |
| Period | 27.45 days |
| Eccentricity | 0.10 |
| Angular diameter | 31.1′ mean (28.2′–34.5′) |
| Full-moon brightness | **−12.74** |
| Surface gravity | 1.624 m/s² |
| Surface area | 37.91 M km² |
| Escape velocity | 2,375 m/s |
| Tidal force on Qaia | 1.00× (reference) |
| Hill sphere fraction | 25.7% |
| Roche margin | ×40.5 |

A clone of Earth's Moon at the same distance and mass. The natural calendar body.

---

## Sextus — retrograde

| Property | Value |
|---|---|
| Mass | 0.010 M_moon |
| Radius | 374 km (0.215 R_moon) |
| Density | 3,344 kg/m³ — lunar |
| Semi-major axis | 1.65 LD |
| Period | 58.19 days |
| Eccentricity | 0.10 |
| Angular diameter | 4.1′ mean (3.7′–4.5′) — 0.13× Quartus |
| Full-moon brightness | **−8.32** (4.42 mag dimmer than Quartus) |
| Surface gravity | 0.350 m/s² (0.22× Quartus) |
| Surface area | 1.76 M km² (4.6% of Quartus) |
| Escape velocity | 512 m/s |
| Tidal force on Qaia | ~0.002× Quartus |
| Hill sphere fraction | 42.4% |
| Roche margin | ×66.9 |

Visible as a small disc (~5× the apparent diameter of Jupiter from Earth). At −8.3 dramatically brighter than any planet but clearly not a full moon. Retrograde. At 42.4% of the Hill sphere, stable for a retrograde orbit (retrograde limit ~70%).

---

## Septimus — retrograde

| Property | Value |
|---|---|
| Mass | 0.010 M_moon |
| Radius | 374 km (0.215 R_moon) |
| Density | 3,344 kg/m³ — lunar |
| Semi-major axis | 2.10 LD |
| Period | 83.54 days |
| Eccentricity | 0.10 |
| Angular diameter | 3.2′ mean (2.9′–3.5′) — 0.10× Quartus |
| Full-moon brightness | **−7.80** (4.94 mag dimmer than Quartus) |
| Surface gravity | 0.350 m/s² (0.22× Quartus) |
| Surface area | 1.76 M km² (4.6% of Quartus) |
| Escape velocity | 512 m/s |
| Tidal force on Qaia | ~0.001× Quartus |
| Hill sphere fraction | 53.9% |
| Roche margin | ×85.1 |

Physically identical to Sextus but 27% farther out — slightly smaller and dimmer in the sky. ~84-day period makes it a useful long-calendar body.

---

## System Notes

**Sky appearance by size** (largest→smallest): Tertius 43.5′ > Quartus 31.1′ > Secundus 28.1′ > Primus 22.5′ (stationary). Only Tertius is meaningfully larger than our Moon; Primus is the smallest of the four inner moons.

**Oscillating tidal load**: Secundus (×1.48) + Tertius (×2.74) + Quartus (×1.0) ≈ **5.2× our Moon's total tidal force**. Primus contributes a separate static ~20 cm bulge but no daily tidal cycle. Total tidal complexity comes from three incommensurate oscillating drivers (9.82h, 13.65h, 12.45h) plus the solar tide (12.03h).

**Primus visibility**: fixed over one hemisphere. Observers on the sublunar face see a 22.5′ moon that never moves. Observers on the far side never see it. A bright but small permanent fixture — brighter than Quartus by 0.7 magnitudes, but smaller in the sky.

**Retrograde moons** (Secundus, Sextus, Septimus) rise in the west. A nighttime observer on the near side sees the stationary Primus plus Secundus sweeping east-to-west, while Tertius and Quartus move west-to-east.

**Density split**: Primus and Secundus at 6,690 kg/m³ are likely iron-rich fragments of a differentiated progenitor. The rest are standard rocky at lunar density.

**Tidal migration**: Primus is magically anchored — no tidal torque, no migration. Secundus (retrograde) slowly spirals inward over geological time. Roche margin is comfortable for all moons.

**Tidal locking**: The three freely-orbiting inner moons are almost certainly synchronously rotating — tidal locking timescale scales as a⁶.

**Triple-moon alignment eras**: all three inner moons (Secundus, Tertius, Quartus) are simultaneously within 5% of full or new roughly every three months, and within 1% about once per year. However, which type dominates alternates in multi-year eras separated by ~13 years: a ~5–6 year "full-moon era" (all-full alignments frequent, all-new absent) followed by a ~5–6 year "new-moon era" (the reverse). The clock is a beat between Quartus's synodic period (~29.7 days) and the Qaia year: 365.25 / 29.68 ≈ 12.31 synodic periods per year, so the phase slips ~9.2 days/year and resets after ~13 years. The best alignments within an era are essentially exact — all three moons within 0.1% of syzygy simultaneously.

**Quintus** is a trace particle at the Sun-Qaia L4 point (60° ahead of Qaia). It librates between ~45° and ~80° from Qaia with a period of ~2,000 years. Effectively massless — included for worldbuilding purposes.
