# Qaia Tidal Analysis

Generated from `bodies.js` parameters. Re-run `node analysis/tide_sim.mjs` after any changes.

Assumes Qaia has a 24-hour solar day (matching Earth).

### Equilibrium tide model

The [equilibrium tide](https://en.wikipedia.org/wiki/Tide#Tidal_physics) is the theoretical
water-surface shape if the ocean responded instantly to tidal forcing with no friction or
basin dynamics. The half-amplitude of the tidal bulge is:

```
h_eq = (3/4) × (M_moon / M_planet) × (R_planet / a)³ × R_planet
```

Validated against Earth-Moon system (gives ~0.27 m, matching the known theoretical value).

### Primus — static, not oscillating

Primus is geosynchronous: it co-rotates with Qaia and does not sweep across the sky. It
raises a **permanent ~20 cm static tidal bulge** along the Primus–antiprimus axis — a fixed
geographic feature, not a daily cycle. It is excluded from the oscillating tide simulation.

### Simulation method

The tidal height at a fixed surface location is modelled as a sum of cosines, one per body:

```
h(t) = Σ  h_eq_i × cos(2π t / T_tide_i)
```

where `T_tide_i = T_syn_i / 2` is the semi-diurnal tidal period (two bulges per synodic
pass). `t = 0` is set to maximum alignment (all bodies at opposition), so each cosine starts
at its peak. This is the simplest possible model — it ignores ocean basin resonance, friction,
eccentricity-driven amplitude variation, and latitude effects. Real tides on Qaia would differ
substantially in amplitude (resonance can multiply the equilibrium value by ~10×) but the
periods and their interference structure would be the same.

---

## Equilibrium Tide Amplitudes

The equilibrium tide is what you'd get if the ocean could respond instantly. Real tides are
amplified by basin resonance (the Bay of Fundy amplifies Earth's 0.27 m equilibrium to 16 m).

| Body | Tidal period | Equilibrium ± | Notes |
|---|---|---|---|
| Secundus | 9.82 h | ±40 cm | Retrograde, fast |
| Tertius | 13.65 h | ±73 cm | Dominant driver |
| Quartus | 12.45 h | ±27 cm | Same as Earth's Moon |
| Sun | 12.03 h | ±12 cm | |
| **Total (aligned)** | | **±152 cm** | All at opposition simultaneously |

### Why Secundus's tidal period is 9.82 hours

Secundus is retrograde, so its apparent motion across Qaia's sky adds to Qaia's rotation rather
than subtracting. Its synodic period (time between overhead transits) is:

```
T_synodic = T_day × T_orb / (T_orb + T_day) = 24 × 108.24 / (108.24 + 24) = 19.64 h
```

The equilibrium tide has two bulges — one facing the moon, one on the opposite side. A point
on Qaia's surface passes through both bulges per synodic period, so the semi-diurnal tidal
period is half that: **9.82 h**. This gives ~2.4 high tides per Qaia day from Secundus.

Quartus at 12.45 h is nearly identical to Earth's Moon (12.42 h) — as expected, same orbit.

---

## Spring/Neap Beat Periods

Each pair of bodies creates a spring/neap cycle at the beat frequency of their tidal periods:

| Pair | Beat period | Character |
|---|---|---|
| Secundus + Tertius | 1.46 days | Fast amplitude modulation |
| Secundus + Quartus | 1.94 days | |
| Tertius + Quartus | 5.94 days | Medium-term envelope |
| Quartus + Sun | 14.84 days | Familiar fortnightly spring/neap |

The Quartus-Sun beat (14.84 days) produces a fortnightly spring/neap analogous to Earth's.
Without Primus as a dominant fast driver, the tidal pattern is less extreme than the old
system but still complex — three incommensurate oscillating frequencies from the moons plus
the solar contribution.

---

## 30-Day Simulation

All moons at opposition (maximum alignment) at t=0. Height is equilibrium water level.

![Qaia 30-day tide chart](analysis/tide_plot.png)

Regenerate with `node analysis/tide_sim.mjs`. ASCII table (1-hour resolution):

```
=== 30-day tide simulation (all moons at opposition, t=0) ===
  Overall range: -145 cm to +152 cm
  Max single-cycle swing: 297 cm

  t(h)   tide
     0h    +152cm  ██████████████████████████████
     1h    +132cm  ████████████████████████████
     2h     +76cm  █████████████████████
     3h     -21cm  █████████████
     4h    -109cm  ██████
     5h    -156cm  ██
     6h    -151cm  ███
     7h    -102cm  ██████
     8h     -32cm  ████████████
     9h     +33cm  █████████████████
    10h     +72cm  ████████████████████
    11h     +79cm  █████████████████████
    12h     +63cm  ████████████████████
    13h     +39cm  ██████████████████
    14h     +22cm  ████████████████
    15h     +17cm  ████████████████
    16h     +21cm  ████████████████
    17h     +21cm  ████████████████
    18h      +7cm  ███████████████
    19h     -25cm  █████████████
    20h     -67cm  █████████
    21h    -102cm  ██████
    22h    -110cm  ██████
    23h     -80cm  ████████
    24h     -16cm  █████████████
    25h     +63cm  ████████████████████
    26h    +131cm  █████████████████████████
    27h    +159cm  ████████████████████████████
    28h    +137cm  ██████████████████████████
    29h     +68cm  ████████████████████
    30h     -23cm  █████████████
    31h    -105cm  ██████
    32h    -149cm  ███
    33h    -142cm  ███
    34h     -90cm  ███████
    35h     -14cm  ██████████████
    36h     +55cm  ███████████████████
    37h     +95cm  ██████████████████████
    38h     +95cm  ██████████████████████
    39h     +62cm  ████████████████████
    40h     +16cm  ████████████████
    41h     -20cm  █████████████
    42h     -33cm  ████████████
    43h     -21cm  █████████████
    44h      +4cm  ███████████████
    45h     +23cm  █████████████████
    46h     +22cm  ████████████████
    47h      -1cm  ███████████████
    48h     -39cm  ████████████
    49h     -71cm  █████████
    50h     -79cm  ████████
    51h     -54cm  ██████████
    52h      -1cm  ███████████████
    53h     +60cm  ████████████████████
    54h    +105cm  ███████████████████████
    55h    +115cm  ████████████████████████
    56h     +84cm  █████████████████████
    57h     +22cm  ████████████████
    58h     -47cm  ███████████
    59h     -96cm  ███████
    60h    -109cm  ██████
    61h     -82cm  ████████
    62h     -29cm  ████████████
    63h     +26cm  █████████████████
    64h     +62cm  ████████████████████
    65h     +66cm  ████████████████████
    66h     +40cm  ██████████████████
    67h      +2cm  ███████████████
    68h     -28cm  ████████████
    69h     -34cm  ████████████
    70h     -14cm  ██████████████
    71h     +23cm  █████████████████
    72h     +54cm  ███████████████████
```

---

## Worldbuilding Implications

**Pattern complexity**: Earth has one dominant tidal frequency (M2, 12.42 h) with weak
overtones — sailors can learn to predict tides by watching the Moon. Qaia has four
comparable forcing frequencies (9.82h, 13.65h, 12.45h, 12.03h); accurate prediction
requires written tidal tables, though the tides are far less violent than if Primus were
oscillating.

**Primus's geosynchronous effect**: Instead of contributing a fast, large oscillating tide,
Primus raises only a small (~20 cm) permanent bulge on the sub-Primus side of Qaia. This
is a permanent feature of sea level geography — the ocean is very slightly deeper beneath
Primus.

**Tidal range**: The maximum equilibrium range (all aligned) is ~3 m. With ocean basin
resonance this could be amplified to potentially 10–30 m in narrow bays — comparable to
Earth's most extreme tidal locations but not catastrophically beyond them.

**Retrograde visual cues**: A coastal observer can watch Secundus rising in the west and
estimate tidal timing. Tertius (prograde, 8.3-day period) is the dominant tidal driver;
when Tertius and Secundus are in the same part of the sky, expect amplified tides.

**Long-term**: Secundus (retrograde) spirals inward over geological time due to tidal
friction, slowly increasing its tidal contribution. Tertius and Quartus (prograde) recede,
like Earth's Moon. Primus is magically anchored — no migration.
