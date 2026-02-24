# Qaia Moon Reference

Generated from `bodies.js` parameters. Re-run `node analysis/moon_stats.mjs` after any changes.

Qaia's Hill sphere: **3.89 LD**. All values assume lunar geometric albedo (~0.12) for brightness.
Quartus (1.00 LD, 1 M_moon) is used as the reference body throughout.

---

## Primus — geosynchronous prograde *(magically anchored)*

| Property | Value |
|---|---|
| Mass | 0.020 M_moon |
| Radius | 374 km (0.215 R_moon) |
| Density | 6,689 kg/m³ — **2× lunar**, near-iron |
| Orbital radius | 0.110 LD (~42,160 km) — geosynchronous |
| Period | 1.00 days (= Qaia sidereal day) |
| Eccentricity | 0 (circular by construction) |
| Angular diameter | **61.0′** — **1.96× Quartus** |
| Full-moon brightness | **−14.2** (1.47 mag brighter than Quartus) |
| Surface gravity | 0.700 m/s² (0.43× Quartus) |
| Surface area | 1.76 M km² (4.6% of Quartus) |
| Escape velocity | 724 m/s |
| Static tidal bulge | **~4 m** permanent ocean offset (not an oscillating tide) |
| Hill sphere fraction | 2.8% |
| Roche margin | 5.6× (rigid body) |

Primus is fixed over a single point on Qaia's surface — it neither rises nor sets for the hemisphere beneath it, and is never visible from the opposite hemisphere. It is by far the dominant object in the sky from its sublunar region: **61′ apparent diameter** (nearly twice Quartus / our Moon) and magnitude −14.2. At 6,690 kg/m³ it is nearly iron-density, likely a fragment of a differentiated parent body.

**Tidal signature**: because Primus co-rotates with Qaia, it does not sweep across the sky and produces no oscillating tide. Instead it raises a **permanent ~4 m static bulge** in Qaia's oceans — sea level is ~4 m higher along the Primus–antiprimus axis and ~4 m lower at the 90° ring. This is a permanent geographic feature, not a daily cycle. The daily tidal rhythm on Qaia is driven entirely by Secundus, Tertius, and Quartus.

---

## Secundus — retrograde

| Property | Value |
|---|---|
| Mass | 0.040 M_moon |
| Radius | 471 km (0.271 R_moon) |
| Density | 6,689 kg/m³ — 2× lunar, near-iron |
| Semi-major axis | 0.24 LD |
| Period | 3.23 days |
| Eccentricity | 0.10 |
| Angular diameter | 35.1′ mean (31.9′–39.0′) — 1.13× Quartus |
| Full-moon brightness | **−13.0** (0.27 mag brighter than Quartus) |
| Surface gravity | 0.882 m/s² (0.54× Quartus) |
| Surface area | 2.79 M km² (7.4% of Quartus) |
| Escape velocity | 912 m/s |
| Tidal force on Qaia | 2.9× Quartus |
| Hill sphere fraction | 6.2% |
| Roche margin | 7.7× |

At mean distance Secundus appears almost exactly the same angular size as Quartus; near periapsis it is noticeably larger. Retrograde — same 2× lunar density as Primus, suggesting shared origin or composition (both iron-rich fragments of the same progenitor). Contributes nearly 3× Quartus's tidal effect.

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
| Full-moon brightness | **−13.5** (0.73 mag brighter than Quartus) |
| Surface gravity | 1.023 m/s² (0.63× Quartus) |
| Surface area | 15.05 M km² (39.7% of Quartus) |
| Escape velocity | 1,496 m/s |
| Tidal force on Qaia | 2.7× Quartus |
| Hill sphere fraction | 11.6% |
| Roche margin | 9.7× |

A substantial rocky world — larger in the sky than our Moon. Prograde, 8.3-day period. Surface area roughly comparable to Russia (17 M km²). Tidal contribution similar to Secundus.

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
| Roche margin | 40.5× |

A clone of Earth's Moon at the same distance and mass. The natural calendar body. Appears the smallest of the four inner moons in the sky — only 31′ vs Primus's 61′.

---

## Sextus — retrograde

| Property | Value |
|---|---|
| Mass | 0.010 M_moon |
| Radius | 374 km (0.215 R_moon) |
| Density | 3,344 kg/m³ — lunar |
| Semi-major axis | 1.90 LD |
| Period | 71.9 days |
| Eccentricity | 0.10 |
| Angular diameter | 3.5′ mean (3.2′–3.9′) — 0.11× Quartus |
| Full-moon brightness | **−8.0** (4.73 mag dimmer than Quartus) |
| Surface gravity | 0.350 m/s² (0.22× Quartus) |
| Surface area | 1.76 M km² (4.6% of Quartus) |
| Escape velocity | 512 m/s |
| Tidal force on Qaia | ~0.001× Quartus |
| Hill sphere fraction | 48.8% |
| Roche margin | 12.2× |

Visible as a small disc (~4× the apparent diameter of Jupiter from Earth). At −8.0 dramatically brighter than any planet but clearly not a full moon. Retrograde. At 48.8% of the Hill sphere, stable for a retrograde orbit (limit ~70%) but would be completely unstable if prograde (~33% limit).

---

## Septimus — retrograde

| Property | Value |
|---|---|
| Mass | 0.010 M_moon |
| Radius | 374 km (0.215 R_moon) |
| Density | 3,344 kg/m³ — lunar |
| Semi-major axis | 2.20 LD |
| Period | 89.6 days |
| Eccentricity | 0.10 |
| Angular diameter | 3.0′ mean (2.8′–3.4′) — 0.098× Quartus |
| Full-moon brightness | **−7.7** (5.05 mag dimmer than Quartus) |
| Surface gravity | 0.350 m/s² (0.22× Quartus) |
| Surface area | 1.76 M km² (4.6% of Quartus) |
| Escape velocity | 512 m/s |
| Tidal force on Qaia | ~0.001× Quartus |
| Hill sphere fraction | 56.5% |
| Roche margin | 14.1× |

Physically identical to Sextus but 16% farther out — slightly smaller and dimmer in the sky. At 56.5% of the Hill sphere, the most precariously placed moon. ~90-day period makes it a useful long-calendar body.

---

## System Notes

**Oscillating tidal load**: Secundus (×2.9) + Tertius (×2.7) + Quartus (×1.0) ≈ **6.6× our Moon's total tidal force**. Primus contributes a separate static ~4 m bulge but no daily tidal cycle. Total tidal complexity comes from three incommensurate oscillating drivers (9.2h, 13.7h, 12.5h).

**All four inner moons appear larger than our Moon** in Qaia's sky. Quartus at 31′ is the *smallest* of the four; Primus at 61′ is the largest.

**Primus visibility**: fixed over one hemisphere. Observers on the sublunar face see a 61′ moon that never moves. Observers on the far side never see it. This creates a profound day/night asymmetry on Qaia — one hemisphere has a permanent "second sun" (in brightness terms) overhead.

**Retrograde moons** (Secundus, Sextus, Septimus) rise in the west. A nighttime observer on the near side sees the dominant stationary Primus plus Secundus sweeping east-to-west, while Tertius and Quartus move west-to-east.

**Density split**: Primus and Secundus at 6,690 kg/m³ are likely iron-rich fragments of a differentiated progenitor. The rest are standard rocky at lunar density.

**Tidal migration**: Primus is magically anchored — no tidal torque, no migration. Secundus (retrograde) slowly spirals inward over geological time. Roche margin is comfortable for all moons.

**Tidal locking**: The three freely-orbiting inner moons are almost certainly synchronously rotating — tidal locking timescale scales as a⁶.

**Quintus** is a trace particle at the Sun-Qaia L4 point (60° ahead of Qaia). It librates between ~45° and ~80° from Qaia with a period of ~2,000 years. Effectively massless — included for worldbuilding purposes.
