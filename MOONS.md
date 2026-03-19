# Qaia Moon Reference

Generated from `bodies.js` parameters and the 200-year N-body snapshot (`state_200yr.json`). Re-run `node analysis/moon_stats.mjs` after any changes.

Qaia's Hill sphere: **3.89 LD**. Brightness uses per-moon geometric albedo: iron-rich moons (Primus, Secundus) 0.06; outer moons (Sextus, Septimus) and Tertius 0.09; Quartus 0.12.
Luna (Earth's Moon: 1.00 LD, 1 M_moon, albedo 0.12) is the reference for all ratios.

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
| Angular diameter | **10.4′** — **0.34× Luna** |
| Full-moon brightness | **−9.62** (3.12 mag dimmer than Luna) |
| Full-moon illumination | **×0.056 Luna** (~1/18 of Earth's full moon) |
| Surface gravity | 0.120 m/s² (0.074× lunar) |
| Surface area | 0.05 M km² (0.1% of Luna) |
| Escape velocity | 124 m/s |
| Static tidal bulge | **~2 cm** permanent ocean offset (not an oscillating tide) |
| Tidal force (gradient) | ×0.076 vs Luna |
| Hill sphere fraction | 2.8% |
| Roche margin | ×5.6 (rigid body) |

Primus is fixed over a single point on Qaia's surface — it neither rises nor sets for the hemisphere beneath it, and is never visible from the opposite hemisphere. Despite being close (0.11 LD), its tiny mass (0.0001 M_moon) and dark iron surface (albedo 0.06) make it a minor object in the sky: **10.4′ apparent diameter** (one-third of Luna) and magnitude −9.62 — dimmer than Luna by 3.1 magnitudes. At 6,690 kg/m³ it is nearly iron-density, likely a fragment of a differentiated parent body. Its 23.5° orbital inclination (to the ecliptic) exactly matches Qaia's axial tilt — the two cancel, placing Primus's orbit in Qaia's equatorial plane. It is therefore truly **geostationary**: a motionless fixed point in the sky of the near hemisphere, never rising, never setting, never drifting.

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
| Period | 4.57 days |
| Inclination | 5.72° |
| Eccentricity | 0.10 |
| Angular diameter | 27.9′ mean (23.7′–33.9′) — 0.90× Luna |
| Full-moon brightness | **−11.75** (0.99 mag dimmer than Luna) |
| Full-moon illumination | **×0.402 Luna** (~2/5 of Earth's full moon) |
| Surface gravity | 0.882 m/s² (0.54× lunar) |
| Surface area | 2.79 M km² (7.4% of Luna) |
| Escape velocity | 912 m/s |
| Tidal force on Qaia | 1.44× Luna |
| Hill sphere fraction | 7.8% |
| Roche margin | ×15.5 |

Slightly smaller than Luna in the sky at mean distance; near periapsis it approaches Luna's size. Retrograde — same 2× lunar density and dark albedo (0.06) as Primus, suggesting shared origin or composition (both iron-rich fragments of the same progenitor). Despite being nearly as large in the sky as Luna, its dark surface makes it ~1 magnitude dimmer.

---

## Tertius — prograde

| Property | Value |
|---|---|
| Mass | 0.180 M_moon |
| Radius | 839 km (0.483 R_moon) |
| Density | 5,351 kg/m³ — **1.6× lunar**, iron-enriched |
| Albedo | 0.09 (dark rocky) |
| Semi-major axis | 0.44 LD |
| Period | 8.12 days (~8-day week) |
| Inclination | 10.88° |
| Eccentricity | 0.10 |
| Angular diameter | 33.8′ mean (30.0′–38.7′) — 1.09× Luna |
| Full-moon brightness | **−12.61** (0.13 mag dimmer than Luna) |
| Full-moon illumination | **×0.887 Luna** (~9/10 of Earth's full moon) |
| Surface gravity | 1.254 m/s² (0.77× lunar) |
| Surface area | 8.84 M km² (23.3% of Luna) |
| Escape velocity | 1,450 m/s |
| Tidal force on Qaia | 2.06× Luna |
| Hill sphere fraction | 11.4% |
| Roche margin | ×21.0 |

Slightly larger than Luna in the sky but nearly identical in brightness — its darker surface (albedo 0.09 vs 0.12) compensates for its closer orbit. A dense, iron-enriched rocky world with surface area comparable to Brazil. Prograde, ~8-day period — the basis for Qaia's week. Tidal contribution 2.1× Luna.

---

## Quartus — prograde

| Property | Value |
|---|---|
| Mass | 1.000 M_moon |
| Radius | 1,737 km (1.000 R_moon) |
| Density | 3,344 kg/m³ — lunar |
| Albedo | 0.12 (lunar) |
| Semi-major axis | 1.03 LD |
| Period | 28.67 days |
| Inclination | 3.55° |
| Eccentricity | ~0.04 at t=200 yr |
| Angular diameter | 30.2′ mean (29.0′–31.4′) — 0.97× Luna |
| Full-moon brightness | **−12.68** (0.06 mag dimmer than Luna) |
| Full-moon illumination | **×0.944 Luna** (~Earth's full moon, ~0.1–0.3 lux) |
| Surface gravity | 1.624 m/s² |
| Surface area | 37.91 M km² |
| Escape velocity | 2,375 m/s |
| Tidal force on Qaia | 0.92× Luna |
| Hill sphere fraction | 26.4% |
| Roche margin | ×41.7 |

A clone of Earth's Moon at roughly the same distance and mass. The natural calendar body (monthly cycle). Its inclination means it crosses Qaia's equatorial plane twice per orbit, producing an eclipse season roughly twice per month when the geometry aligns.

---

## Sextus — retrograde

| Property | Value |
|---|---|
| Mass | 0.010 M_moon |
| Radius | 374 km (0.215 R_moon) |
| Density | 3,344 kg/m³ — lunar |
| Albedo | 0.09 |
| Semi-major axis | 1.69 LD |
| Period | 60.12 days |
| Inclination | 25.78° |
| Eccentricity | 0.10 |
| Angular diameter | 4.0′ mean (3.1′–5.6′) — 0.13× Luna |
| Full-moon brightness | **−7.96** (4.78 mag dimmer than Luna) |
| Full-moon illumination | **×0.012 Luna** (~1/83 of Earth's full moon) |
| Surface gravity | 0.350 m/s² (0.215× lunar) |
| Surface area | 1.76 M km² (4.6% of Luna) |
| Escape velocity | 512 m/s |
| Tidal force on Qaia | ×0.002 Luna |
| Hill sphere fraction | 43.3% |
| Roche margin | ×68.4 |

Visible as a small disc (~5× the apparent diameter of Jupiter from Earth). At −8.0 dramatically brighter than any planet but clearly not a full moon. Retrograde. At 43.3% of the Hill sphere, stable for a retrograde orbit (retrograde limit ~70%).

---

## Septimus — retrograde

| Property | Value |
|---|---|
| Mass | 0.010 M_moon |
| Radius | 374 km (0.215 R_moon) |
| Density | 3,344 kg/m³ — lunar |
| Albedo | 0.09 |
| Semi-major axis | 2.21 LD |
| Period | 89.89 days |
| Inclination | 18.80° |
| Eccentricity | 0.10 |
| Angular diameter | 3.0′ mean (2.6′–3.6′) — 0.10× Luna |
| Full-moon brightness | **−7.38** (5.36 mag dimmer than Luna) |
| Full-moon illumination | **×0.007 Luna** (~1/143 of Earth's full moon) |
| Surface gravity | 0.350 m/s² (0.215× lunar) |
| Surface area | 1.76 M km² (4.6% of Luna) |
| Escape velocity | 512 m/s |
| Tidal force on Qaia | ×0.001 Luna |
| Hill sphere fraction | 56.6% |
| Roche margin | ×89.4 |

Physically identical to Sextus but farther out — slightly smaller and dimmer in the sky. ~90-day period makes it a useful long-calendar body.

---

## System Notes

**Sky appearance by size** (largest→smallest): Tertius 33.8′ > Quartus 30.2′ > Secundus 27.9′ > Primus 10.4′ (stationary). Tertius and Quartus are nearly the same apparent size but Tertius is slightly dimmer (albedo 0.09 vs 0.12). Primus is small and faint — roughly one-third the angular size of Luna and 3.1 magnitudes dimmer. Secundus, though nearly Luna's angular size, is ~1 mag dimmer due to its dark iron surface.

**Oscillating tidal load**: Secundus (×1.44) + Tertius (×2.06) + Quartus (×0.92) ≈ **4.4× Luna's tidal force**. Primus contributes a separate static ~2 cm bulge but no daily tidal cycle. Total tidal complexity comes from three incommensurate oscillating drivers (9.85h, 13.69h, 12.43h) plus the solar tide (12.03h).

**Primus visibility**: fixed over one hemisphere. Observers on the sublunar face see a 10.4′ moon that never moves. Observers on the far side never see it. A minor but permanent fixture — dimmer than Quartus and about the size of a large asteroid seen up close.

**Retrograde moons** (Secundus, Sextus, Septimus) rise in the west. A nighttime observer on the near side sees the stationary Primus plus Secundus sweeping east-to-west, while Tertius and Quartus move west-to-east.

**Inclinations are ecliptic-relative.** All `inc_deg` values in the simulation are measured from the ecliptic plane, not Qaia's equatorial plane. Because Qaia has a 23.5° axial tilt, a moon's equatorial inclination varies over time as the orbital node precesses — just as Earth's Moon oscillates between ~18.3° and ~28.6° to Earth's equator despite its stable 5.14° ecliptic inclination. Primus is the exception: its 23.5° ecliptic inclination exactly cancels Qaia's axial tilt, placing it in the equatorial plane (geostationary orbit requires equatorial alignment).

**Density split**: Primus and Secundus at 6,690 kg/m³ are likely iron-rich fragments of a differentiated progenitor. Tertius at 5,351 kg/m³ (1.6× lunar) is iron-enriched — intermediate between the iron cores and the rocky moons. The rest are standard rocky at lunar density.

**Tidal migration**: Primus is magically anchored — no tidal torque, no migration. Secundus (retrograde) slowly spirals inward over geological time. Roche margin is comfortable for all moons.

**Long-term stability**: 2,000-year simulation shows all five freely-orbiting moons (Secundus, Tertius, Quartus, Sextus, Septimus) are stable. Longer runs may reveal late escapes — the system's long-term fate without dragon magic is an open question.

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
