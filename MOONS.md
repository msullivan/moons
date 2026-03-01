# Qaia Moon Reference

Generated from `bodies.js` parameters and the 200-year N-body snapshot (`state_200yr.json`). Re-run `node analysis/moon_stats.mjs` after any changes.

Qaia's Hill sphere: **3.89 LD**. Brightness uses per-moon geometric albedo: iron-rich moons (Primus, Secundus) 0.06; outer moons (Sextus, Septimus) 0.09; rocky moons (Tertius, Quartus) 0.12.
Quartus (1.00 LD, 1 M_moon) is used as the reference body throughout.

---

## Primus — geostationary prograde *(magically anchored)*

| Property | Value |
|---|---|
| Mass | 0.0001 M_moon |
| Radius | 64 km (0.037 R_moon) |
| Density | 6,689 kg/m³ — **2× lunar**, near-iron |
| Albedo | 0.06 (dark iron surface) |
| Orbital radius | 0.110 LD (~42,160 km) — geostationary |
| Period | 1.00 days (= Qaia sidereal day) |
| Inclination | 23.5° to ecliptic (= equatorial orbit; matches Qaia's axial tilt) |
| Eccentricity | 0 (circular by construction) |
| Angular diameter | **10.4′** — **0.33× Quartus** |
| Full-moon brightness | **−9.60** (3.14 mag dimmer than Quartus) |
| Full-moon illumination | **×0.055 Quartus** (~1/18 of Earth's full moon) |
| Surface gravity | 0.120 m/s² (0.074× Quartus) |
| Surface area | 0.05 M km² (0.1% of Quartus) |
| Escape velocity | 124 m/s |
| Static tidal bulge | **~2 cm** permanent ocean offset (not an oscillating tide) |
| Tidal force (gradient) | ×0.073 vs Quartus |
| Hill sphere fraction | 2.8% |
| Roche margin | ×5.6 (rigid body) |

Primus is fixed over a single point on Qaia's surface — it neither rises nor sets for the hemisphere beneath it, and is never visible from the opposite hemisphere. Despite being close (0.11 LD), its tiny mass (0.0001 M_moon) and dark iron surface (albedo 0.06) make it a minor object in the sky: **10.4′ apparent diameter** (one-third of Quartus) and magnitude −9.60 — dimmer than Quartus by 3.1 magnitudes. At 6,690 kg/m³ it is nearly iron-density, likely a fragment of a differentiated parent body. Its 23.5° orbital inclination (to the ecliptic) exactly matches Qaia's axial tilt — the two cancel, placing Primus's orbit in Qaia's equatorial plane. It is therefore truly **geostationary**: a motionless fixed point in the sky of the near hemisphere, never rising, never setting, never drifting.

**Navigation**: Primus is a revolutionary longitude reference. Because it is fixed in the sky at a known point above the equator, measuring its elevation from any location (with known latitude) immediately yields longitude — no chronometer required. Latitude is easily found by the usual methods (pole star, noon sun); elevation to Primus then places the observer on a circle of known angular radius around the sub-Primus point, and the intersection of that circle with the latitude line gives a longitude fix. This is structurally similar to finding latitude from the pole star, but with the "pole" on the equator instead of at the celestial pole — the difference being that Primus is close enough (0.11 LD) that its parallax is significant and position-dependent, so the geometry requires tables or calculation rather than a direct angle readout. Qaian navigators would have solved the longitude problem far earlier than Earth's — the main limitation is that Primus is visible only from one hemisphere.

**Tidal signature**: because Primus co-rotates with Qaia, it does not sweep across the sky and produces no oscillating tide. Instead it raises a **permanent ~2 cm static bulge** in Qaia's oceans — sea level is slightly higher along the Primus–antiprimus axis. This is a permanent geographic feature, not a daily cycle. The daily tidal rhythm on Qaia is driven entirely by Secundus, Tertius, and Quartus.

---

## Secundus — retrograde

| Property | Value |
|---|---|
| Mass | 0.040 M_moon |
| Radius | 471 km (0.271 R_moon) |
| Density | 6,689 kg/m³ — 2× lunar, near-iron |
| Albedo | 0.06 (dark iron surface) |
| Semi-major axis | 0.30 LD |
| Period | 4.52 days |
| Inclination | 8.60° |
| Eccentricity | 0.10 |
| Angular diameter | 28.1′ mean (25.3′–31.5′) — 0.90× Quartus |
| Full-moon brightness | **−11.74** (1.00 mag dimmer than Quartus) |
| Full-moon illumination | **×0.400 Quartus** (~2/5 of Earth's full moon) |
| Surface gravity | 0.882 m/s² (0.54× Quartus) |
| Surface area | 2.79 M km² (7.4% of Quartus) |
| Escape velocity | 912 m/s |
| Tidal force on Qaia | 1.43× Quartus |
| Hill sphere fraction | 7.7% |
| Roche margin | ×15.3 |

Slightly smaller than Quartus in the sky at mean distance; near periapsis it approaches Quartus's size. Retrograde — same 2× lunar density and dark albedo (0.06) as Primus, suggesting shared origin or composition (both iron-rich fragments of the same progenitor). Despite being nearly as large in the sky as Quartus, its dark surface makes it ~1 magnitude dimmer.

---

## Tertius — prograde

| Property | Value |
|---|---|
| Mass | 0.250 M_moon |
| Radius | 1,094 km (0.630 R_moon) |
| Density | 3,344 kg/m³ — lunar |
| Albedo | 0.12 (lunar) |
| Semi-major axis | 0.45 LD |
| Period | 8.29 days |
| Inclination | 1.44° |
| Eccentricity | 0.10 |
| Angular diameter | 43.5′ mean (39.7′–48.0′) — 1.39× Quartus |
| Full-moon brightness | **−13.45** (0.71 mag brighter than Quartus) |
| Full-moon illumination | **×1.917 Quartus** (~2× Earth's full moon) |
| Surface gravity | 1.023 m/s² (0.63× Quartus) |
| Surface area | 15.05 M km² (39.7% of Quartus) |
| Escape velocity | 1,496 m/s |
| Tidal force on Qaia | 2.66× Quartus |
| Hill sphere fraction | 11.6% |
| Roche margin | ×18.2 |

The largest and brightest object in Qaia's sky among the free moons — 43.5′, noticeably bigger than Quartus. A substantial rocky world with surface area roughly comparable to Russia. Prograde, 8.3-day period. Tidal contribution 2.7× Quartus.

---

## Quartus — prograde *(reference)*

| Property | Value |
|---|---|
| Mass | 1.000 M_moon |
| Radius | 1,737 km (1.000 R_moon) |
| Density | 3,344 kg/m³ — lunar |
| Albedo | 0.12 (lunar) |
| Semi-major axis | 0.989 LD |
| Period | 27.02 days |
| Inclination | 5.02° |
| Eccentricity | ~0.02 at t=200 yr |
| Angular diameter | 31.4′ mean (30.8′–32.0′) |
| Full-moon brightness | **−12.74** |
| Full-moon illumination | **×1.000 Quartus** (~Earth's full moon, ~0.1–0.3 lux) |
| Surface gravity | 1.624 m/s² |
| Surface area | 37.91 M km² |
| Escape velocity | 2,375 m/s |
| Tidal force on Qaia | 1.00× (reference) |
| Hill sphere fraction | 25.4% |
| Roche margin | ×40.1 |

A clone of Earth's Moon at the same distance and mass. The natural calendar body. Its 5.02° inclination means it crosses Qaia's equatorial plane twice per orbit, producing an eclipse season roughly twice per month when the geometry aligns.

---

## Sextus — retrograde

| Property | Value |
|---|---|
| Mass | 0.010 M_moon |
| Radius | 374 km (0.215 R_moon) |
| Density | 3,344 kg/m³ — lunar |
| Albedo | 0.09 |
| Semi-major axis | 1.684 LD |
| Period | 60.00 days |
| Inclination | 15.75° |
| Eccentricity | 0.10 |
| Angular diameter | 4.0′ mean (3.6′–4.4′) — 0.13× Quartus |
| Full-moon brightness | **−7.94** (4.80 mag dimmer than Quartus) |
| Full-moon illumination | **×0.012 Quartus** (~1/80 of Earth's full moon) |
| Surface gravity | 0.350 m/s² (0.215× Quartus) |
| Surface area | 1.76 M km² (4.6% of Quartus) |
| Escape velocity | 512 m/s |
| Tidal force on Qaia | ~0.002× Quartus |
| Hill sphere fraction | 43.3% |
| Roche margin | ×68.3 |

Visible as a small disc (~5× the apparent diameter of Jupiter from Earth). At −7.9 dramatically brighter than any planet but clearly not a full moon. Retrograde. At 43.3% of the Hill sphere, stable for a retrograde orbit (retrograde limit ~70%).

---

## Septimus — retrograde

| Property | Value |
|---|---|
| Mass | 0.010 M_moon |
| Radius | 374 km (0.215 R_moon) |
| Density | 3,344 kg/m³ — lunar |
| Albedo | 0.09 |
| Semi-major axis | 2.079 LD |
| Period | 82.30 days |
| Inclination | 17.05° |
| Eccentricity | 0.10 |
| Angular diameter | 3.2′ mean (2.8′–3.7′) — 0.10× Quartus |
| Full-moon brightness | **−7.48** (5.26 mag dimmer than Quartus) |
| Full-moon illumination | **×0.008 Quartus** (~1/125 of Earth's full moon) |
| Surface gravity | 0.350 m/s² (0.215× Quartus) |
| Surface area | 1.76 M km² (4.6% of Quartus) |
| Escape velocity | 512 m/s |
| Tidal force on Qaia | ~0.001× Quartus |
| Hill sphere fraction | 53.4% |
| Roche margin | ×84.3 |

Physically identical to Sextus but farther out — slightly smaller and dimmer in the sky. ~82-day period makes it a useful long-calendar body.

---

## System Notes

**Sky appearance by size** (largest→smallest): Tertius 43.5′ > Quartus 31.4′ > Secundus 28.1′ > Primus 10.4′ (stationary). Primus is small and faint — roughly one-third the angular size of Quartus and 3.1 magnitudes dimmer. Secundus, though nearly Quartus's angular size, is ~1 mag dimmer due to its dark iron surface.

**Oscillating tidal load**: Secundus (×1.43) + Tertius (×2.66) + Quartus (×1.0) ≈ **5.1× our Moon's total tidal force**. Primus contributes a separate static ~2 cm bulge but no daily tidal cycle. Total tidal complexity comes from three incommensurate oscillating drivers (9.83h, 13.65h, 12.46h) plus the solar tide (12.03h).

**Primus visibility**: fixed over one hemisphere. Observers on the sublunar face see a 10.4′ moon that never moves. Observers on the far side never see it. A minor but permanent fixture — dimmer than Quartus and about the size of a large asteroid seen up close.

**Retrograde moons** (Secundus, Sextus, Septimus) rise in the west. A nighttime observer on the near side sees the stationary Primus plus Secundus sweeping east-to-west, while Tertius and Quartus move west-to-east.

**Inclinations are ecliptic-relative.** All `inc_deg` values in the simulation are measured from the ecliptic plane, not Qaia's equatorial plane. Because Qaia has a 23.5° axial tilt, a moon's equatorial inclination varies over time as the orbital node precesses — just as Earth's Moon oscillates between ~18.3° and ~28.6° to Earth's equator despite its stable 5.14° ecliptic inclination. Primus is the exception: its 23.5° ecliptic inclination exactly cancels Qaia's axial tilt, placing it in the equatorial plane (geostationary orbit requires equatorial alignment).

**Density split**: Primus and Secundus at 6,690 kg/m³ are likely iron-rich fragments of a differentiated progenitor. The rest are standard rocky at lunar density.

**Tidal migration**: Primus is magically anchored — no tidal torque, no migration. Secundus (retrograde) slowly spirals inward over geological time. Roche margin is comfortable for all moons.

**Long-term stability**: 10,000-year simulation shows Tertius, Quartus, and Septimus are stable; Sextus escapes ~yr 1210 and Secundus ~yr 1860 via chaotic ejection (no gradual drift — stable for centuries then suddenly unbound). The system is not naturally stable on civilizational timescales.

**Tidal locking**: The three freely-orbiting inner moons are almost certainly synchronously rotating — tidal locking timescale scales as a⁶.

**Triple-moon alignment eras**: all three inner moons (Secundus, Tertius, Quartus) are simultaneously within 5% of full or new roughly every three months, and within 1% about once per year. However, which type dominates alternates in multi-year eras separated by ~13 years: a ~5–6 year "full-moon era" (all-full alignments frequent, all-new absent) followed by a ~5–6 year "new-moon era" (the reverse). The clock is a beat between Quartus's synodic period (~29.7 days) and the Qaia year: 365.25 / 29.68 ≈ 12.31 synodic periods per year, so the phase slips ~9.2 days/year and resets after ~13 years. The best alignments within an era are essentially exact — all three moons within 0.1% of syzygy simultaneously.

### Triple-moon alignment calendar, 2253–2263

The decade 2253–2263 falls in a **full-moon era**: 10 triple-full events reach within 1%, while no triple-new event breaks 1.1%. Closest alignments within 2% (bold = within 1%):

| Date | PMT | Type | Sec | Ter | Qua |
|---|---|---|---|---|---|
| **2253 Jul 14** | **02h** | **full** | **99.8%** | **99.4%** | **99.7%** |
| **2254 Jan 8** | **12h** | **full** | **99.5%** | **99.1%** | **99.9%** |
| 2254 Mar 7 | 00h | full | 99.0% | 98.5% | 99.7% |
| 2254 Oct 30 | 03h | full | 99.3% | 98.9% | 99.9% |
| 2255 Feb 12 | 08h | new | 0.6% | 1.7% | 1.6% |
| 2255 Aug 21 | 18h | full | 98.4% | 98.5% | 99.0% |
| 2256 Feb 15 | 10h | full | 98.7% | 99.1% | 100.0% |
| **2256 Apr 13** | **00h** | **full** | **99.3%** | **99.2%** | **99.7%** |
| **2256 Dec 6** | **02h** | **full** | **99.8%** | **100.0%** | **99.7%** |
| 2257 Mar 21 | 05h | new | 0.7% | 1.3% | 1.1% |
| 2257 Jul 30 | 22h | full | 98.6% | 98.6% | 99.8% |
| 2257 Sep 26 | 13h | full | 99.2% | 99.1% | 98.6% |
| **2258 Mar 23** | **03h** | **full** | **99.9%** | **99.9%** | **99.9%** |
| 2258 Jul 6 | 07h | new | 1.6% | 0.6% | 1.5% |
| **2259 Jan 12** | **17h** | **full** | **99.4%** | **99.7%** | **99.2%** |
| 2259 Apr 27 | 02h | new | 0.0% | 0.8% | 1.1% |
| 2259 Nov 3 | 09h | full | 98.2% | 98.4% | 98.4% |
| **2260 Apr 29** | **02h** | **full** | **99.7%** | **99.3%** | **99.9%** |
| 2260 Aug 12 | 03h | new | 0.8% | 0.2% | 1.3% |
| **2261 Feb 18** | **17h** | **full** | **99.7%** | **99.9%** | **99.3%** |
| **2261 Oct 12** | **15h** | **full** | **99.6%** | **100.0%** | **99.4%** |
| **2262 Jun 6** | **20h** | **full** | **99.6%** | **99.9%** | **99.5%** |
| 2262 Sep 19 | 01h | new | 0.9% | 0.0% | 1.2% |

**March 23, 2258 at 03h PMT** is the peak event of the decade: all three moons within 0.1% of full simultaneously.

**Quintus** is a trace particle at the Sun-Qaia L4 point (60° ahead of Qaia). It librates between ~45° and ~80° from Qaia with a period of ~2,000 years. Effectively massless — included for worldbuilding purposes.
