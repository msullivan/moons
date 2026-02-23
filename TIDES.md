# Qaia Tidal Analysis

Generated from `bodies.js` parameters. Re-run `node analysis/tide_sim.mjs` after any changes.

Assumes Qaia has a 24-hour solar day (matching Earth). Equilibrium tide formula:

```
h = (3/4) × (M_moon / M_Qaia) × (R_Qaia / a)³ × R_Qaia
```

Validated against Earth-Moon system (gives ~0.27 m, matching the known theoretical value).

---

## Equilibrium Tide Amplitudes

The equilibrium tide is what you'd get if the ocean could respond instantly. Real tides are
amplified by basin resonance (the Bay of Fundy amplifies Earth's 0.27 m equilibrium to 16 m).

| Body | Tidal period | Equilibrium ± | Notes |
|---|---|---|---|
| Primus | 6.39 h | ±310 cm | Dominant driver; retrograde, fast |
| Secundus | 9.16 h | ±77 cm | |
| Tertius | 13.65 h | ±73 cm | |
| Quartus | 12.45 h | ±27 cm | Same as Earth's Moon |
| Sun | 12.03 h | ±12 cm | |
| **Total (aligned)** | | **±499 cm** | All at opposition simultaneously |

Primus alone contributes 6.2 m equilibrium range — already comparable to the Bay of Fundy's
resonantly-amplified tide. The combined maximum approaches 10 m equilibrium range.

### Why Primus's tidal period is 6.39 hours

Primus is retrograde, so its apparent motion across Qaia's sky adds to Qaia's rotation rather
than subtracting. Its synodic period (time between overhead transits) is:

```
T_synodic = T_day × T_orb / (T_orb + T_day) = 24 × 27.36 / (27.36 + 24) = 12.79 h
```

The semi-diurnal tidal period is half that: **6.39 h**. Primus crosses the sky every 12.8 hours
(rising west, setting east), driving two high tides per pass.

Quartus at 12.45 h is nearly identical to Earth's Moon (12.42 h) — as expected, same orbit.

---

## Spring/Neap Beat Periods

Each pair of bodies creates a spring/neap cycle at the beat frequency of their tidal periods:

| Pair | Beat period | Character |
|---|---|---|
| Primus + Quartus | 1.09 days | Fast dominant amplitude modulation |
| Primus + Secundus | 1.76 days | |
| Secundus + Tertius | 2.32 days | |
| Tertius + Quartus | 11.88 days | Medium-term envelope |
| Quartus + Sun | 29.68 days | Familiar month-scale spring/neap |

The Quartus-Sun beat (29.7 days) produces the familiar fortnightly spring/neap pattern
analogous to Earth's. But it is a minor modulation compared to the Primus-driven chaos.

---

## 72-Hour Simulation

All moons at opposition (maximum alignment) at t=0. Height is equilibrium water level.

```
Max: +499 cm    Min: −414 cm    Max range in one cycle: 913 cm

  0h  +  499cm  ██████████████████████████████
  1h  +  455cm  █████████████████████████████
  2h  +  331cm  ████████████████████████
  3h  +  154cm  ███████████████████
  4h    - 39cm  ████████████
  5h  - 210cm   ███████
  6h  - 325cm   ███
  7h  - 364cm   ██
  8h  - 326cm   ███
  9h  - 227cm   ██████
 10h  -  93cm   ███████████
 11h  +  38cm   ███████████████
 12h  + 136cm   ██████████████████
 13h  + 177cm   ███████████████████
 14h  + 154cm   ███████████████████
 15h  +  76cm   ████████████████
 16h  -  35cm   ████████████
 17h  - 146cm   █████████
 18h  - 226cm   ██████
 19h  - 252cm   █████
 20h  - 213cm   ███████
 21h  - 114cm   ██████████
 22h  +  23cm   ██████████████
 23h  + 167cm   ███████████████████
 24h  + 285cm   ███████████████████████
 25h  + 349cm   █████████████████████████
 26h  + 342cm   █████████████████████████
 27h  + 265cm   ██████████████████████
 28h  + 135cm   ██████████████████
 29h  -  18cm   █████████████
 30h  - 159cm   ████████
 31h  - 257cm   █████
 32h  - 289cm   ████
 33h  - 248cm   █████
 34h  - 146cm   █████████
 35h  -   8cm   █████████████
 36h  + 131cm   ██████████████████
 37h  + 236cm   █████████████████████
 38h  + 280cm   ███████████████████████
 39h  + 248cm   ██████████████████████
 40h  + 146cm   ██████████████████
 41h  -   4cm   █████████████
 42h  - 170cm   ████████
 43h  - 313cm   ███
 44h  - 399cm
 45h  - 407cm
 46h  - 333cm   ███
 47h  - 190cm   ███████
 48h  -   8cm   █████████████
 49h  + 177cm   ███████████████████
 50h  + 325cm   ████████████████████████
 51h  + 409cm   ███████████████████████████
 52h  + 413cm   ███████████████████████████
 53h  + 340cm   █████████████████████████
 54h  + 210cm   █████████████████████
 55h  +  56cm   ███████████████
 56h  -  89cm   ███████████
 57h  - 192cm   ███████
 58h  - 233cm   ██████
 59h  - 209cm   ███████
 60h  - 132cm   █████████
 61h  -  26cm   █████████████
 62h  +  76cm   ████████████████
 63h  + 145cm   ██████████████████
 64h  + 160cm   ███████████████████
 65h  + 115cm   █████████████████
 66h  +  20cm   ██████████████
 67h  - 102cm   ██████████
 68h  - 220cm   ██████
 69h  - 300cm   ████
 70h  - 320cm   ███
 71h  - 269cm   █████
 72h  - 154cm   █████████
```

Note that hours 0–24 look nothing like hours 24–48 or 48–72. The five incommensurate
tidal frequencies produce a pattern with no easily memorable cycle.

---

## Worldbuilding Implications

**Pattern complexity**: Earth has one dominant tidal frequency (M2, 12.42 h) with weak
overtones — sailors can learn to predict tides by watching the Moon. Qaia has five
comparable forcing frequencies; accurate prediction requires written tidal tables.

**Daily tides from Primus**: The dominant ±310 cm, 6.39 h cycle from Primus means
roughly four high tides per day, each separated by ~6.4 hours. But the other moons
constantly modulate the amplitude, so consecutive Primus high tides are rarely equal.

**Retrograde visual cues**: A coastal observer can see Primus rising in the west and know
a high tide is some hours away, but the height depends on where Secundus, Tertius, and
Quartus are in their cycles at that moment.

**Extreme events**: When all inner moons and the Sun align (rare), equilibrium range
approaches 10 m. With basin resonance this could be catastrophically amplified.
The ~1.09-day Primus-Quartus beat means extreme spring tides occur roughly every other day
when those two happen to align — unlike Earth where spring tides come fortnightly.

**Long-term**: Retrograde moons (Primus, Secundus) spiral inward over geological time
due to tidal friction, slowly increasing their tidal contribution. Prograde moons
(Tertius, Quartus) recede, like Earth's Moon.
