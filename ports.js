// Tide ports and basins.  See tides.js for the models and
// analysis/port_report.mjs for tuning diagnostics.
//
// Coordinates come from docket/map-nice.jpeg, anchored to the sky view's
// Qaringil (45°N, 30°E) and Qama (40°N, 45°E).  Those two anchors imply
// ~1.72 km per map pixel both N–S and E–W, which is consistent with the
// map's 100-mile scale bar — so the map is roughly true-scale with north up:
//   lat ≈ 45 − (py − 335) · 0.01538      lon ≈ 30 + (px − 160) · 0.02098
//
// All values here are worldbuilding choices, not derived facts.  Tune
// with `node analysis/port_report.mjs <id>`.

export const BASINS = {
  // The Central Sea: the light-blue inland sea between Qamis and the
  // western continent.  Closed at the north by the wizard-built isthmus
  // (map px ~200,350) and open to the deep ocean to the southwest
  // (px ~170,880), ~900 km long.  Geometrically it is the Adriatic, with
  // Qaringil in Venice's position at the head.
  //
  // Depth sets the quarter-wave fundamental T ≈ 4L/√(gh):
  //   220 m → ~21.7 h, i.e. near-resonant in the diurnal band (like the
  //   Adriatic's ~21.5 h seiche).  Diurnal tides are amplified toward the
  //   head; the semidiurnal band has a node near mid-sea (Kard).
  // Qaia's moons fill the 9.8–27.3 h band densely, so there is no depth
  // that avoids every resonance: ~120 m moves the second mode onto
  // Secundus (9.8 h), ≳ 500 m moves the fundamental onto Tertius (13.6 h).
  //
  // Damping is the e-folding time of currents.  10 h (Q ≈ 2–3) is far more
  // than bottom friction in a 220 m sea could supply; it stands in for
  // energy radiated out through the wide mouth (and the 2-D / Coriolis
  // effects a 1-D channel leaves out).  30 h gives ±6 m at Qaringil.
  centralSea: {
    name: 'Central Sea',
    head:  { lat: 44.77, lon: 30.84 },
    mouth: { lat: 36.62, lon: 30.21 },
    depth: 220,      // m, mean
    damping: 10,     // h, e-folding time of currents
    cells: 40,
    ocean: { G: 1.0, tau: 0 },   // open-ocean tide at the mouth, × equilibrium
  },
};

// Port fields:
//   id, name, lat, lon   — location (lon east of the sub-Primus meridian)
//   basin, s             — channel port: basin key and position (0 head → 1 mouth)
//   semi, diurnal        — resonator port: { G, T0 (h), Q, tau (h) } per species;
//                          omit T0 for a non-resonant (pure gain + delay) response
//   forcing              — optional { lat, lon } open-ocean point driving a
//                          resonator port (defaults to the port itself)
//   notes                — rationale
export const PORTS = [
  {
    id: 'qaringil', name: 'Qaringil', lat: 45.0, lon: 30.0,
    basin: 'centralSea', s: 0.0,
    notes: 'Island city between the two bridges at the head of the Central Sea. ' +
           'Antinode of the basin mode: the largest tides in the sea, mostly diurnal, ' +
           'peaking when Tertius and Quartus stand far from the equator.',
  },
  {
    id: 'kard', name: 'Kard', lat: 40.46, lon: 34.93,
    basin: 'centralSea', s: 0.53,
    notes: 'Mid-sea on the Qamis shore (map px ~395,630). Sits near the semidiurnal ' +
           'node, so the tide is almost purely once-daily.',
  },
  {
    id: 'jia', name: 'Jia', lat: 36.9, lon: 32.9,
    basin: 'centralSea', s: 0.96,
    notes: 'Peninsula capital of Edrad near the mouth of the Central Sea (px ~300,860). ' +
           'Tide close to the open-ocean tide.',
  },
  {
    id: 'qis', name: 'Qis (river mouth)', lat: 39.54, lon: 47.1,
    forcing: { lat: 39.5, lon: 50.0 },
    semi:    { G: 1.4, T0: 12.6, Q: 2.5, tau: 1.5 },
    diurnal: { G: 1.0, tau: 1.0 },
    notes: 'Mouth of the Qis River on the eastern ocean coast (px ~975,690). Broad shelf ' +
           'resonant near 12.6 h: a regular twice-daily tide, dominated by Tertius, ' +
           'with the Tertius–Quartus beat (~5.7 days) as its spring–neap cycle.',
  },
  {
    id: 'freeport', name: 'Freeport', lat: 30.5, lon: 32.9,
    semi:    { G: 1.2, T0: 10.0, Q: 4, tau: 0.5 },
    diurnal: { G: 0.8, tau: 0 },
    notes: 'Notch harbour on the big southern island (px ~300,1270). A ~10 h bay-and-shelf ' +
           'resonance makes Secundus the dominant tide: fast and irregular, beating ' +
           'against Tertius every ~1.5 days. Needs a broad shallow shelf offshore — ' +
           'the notch itself is too small (~70 km) to resonate at 10 h.',
  },
];

export const PORTS_BY_ID = Object.fromEntries(PORTS.map(p => [p.id, p]));
