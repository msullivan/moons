# TODO

*These suggestions were AI-generated and may not reflect actual priorities.*

## Sky view

- **Proper star field** — assign stars fixed ecliptic/solar-relative spherical coordinates
  at infinity and rotate them with Qaia's sidereal rotation, so the star field moves
  realistically rather than being a static random backdrop.
- **Smooth slow playback** — at 10m/s and 1h/s the sky jumps between integrator steps
  (dt = 6 min). Lerp body positions between the last two sim states to produce smooth
  apparent motion without changing the integrator or making it speed-dependent.
- Fix positioning / calandar priority

## World-building / RPG utility

- **Calendar system** — Tertius (~8.3 d) as a natural week, Quartus (~27.5 d) as a month;
  live fictional date display.
- **Conjunction/opposition markers** — flag when two or more moons are within N° of each
  other or in opposition; useful for "great conjunction" story events.

## Simulation depth

- **Eclipse detection** — solar eclipses (moon crosses solar disc) and lunar eclipses (moon
  enters Qaia's shadow). Phase panel geometry is already halfway there.
- **Live tide gauge** — bar or waveform showing current combined tidal height from real moon
  positions, rather than the pre-baked equilibrium model in TIDES.md.

## Visual polish

- **Phase names** in the phase panel (New / Crescent / Quarter / Gibbous / Full).
- **Smoother continents** — Bézier curves instead of polygon vertices; optional atmospheric
  limb glow on Qaia.
- **Quintus libration path** — faint arc around L4 to make its motion legible.
