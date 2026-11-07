// Tide ports.
//
// Coordinates come from docket/map-nice.jpeg, anchored to the sky view's
// Qaringil (45°N, 30°E) and Qama (40°N, 45°E).  Those two anchors imply
// ~1.72 km per map pixel both N–S and E–W, which is consistent with the
// map's 100-mile scale bar — so the map is roughly true-scale with north up:
//   lat ≈ 45 − (py − 335) · 0.01538      lon ≈ 30 + (px − 160) · 0.02098
//
// Each port's tide comes from its response model in port_response.js,
// fitted to the 2-D tide model (ocean2d.js) by analysis/fit_port_response.mjs.
// After adding or moving a port, refit:
//   node analysis/fit_port_response.mjs --write
// The tides themselves are tuned through the bathymetry (ocean_grid.js).
//
// Port fields:
//   id, name, lat, lon   — location (lon east of the sub-Primus meridian)
//   sea                  — 'Central Sea' for ports shown on its profile chart
//   notes                — where it is and what its tide is like
export const PORTS = [
  {
    id: 'qaringil', name: 'Qaringil', lat: 44.51, lon: 29.71, sea: 'Central Sea',
    notes: 'Island city just south of the isthmus (map px ~146,367), at the head of the Central Sea. ' +
           'Mixed tide on the edge of once-daily: about half the days have a single high water, ' +
           'largest when Tertius stands far from the equator; median daily range ~1.8 m.',
  },
  {
    id: 'kard', name: 'Kard', lat: 39.66, lon: 34.30, sea: 'Central Sea',
    notes: 'Mid-sea on the Qamis shore, at the river mouth south of the KARD label (map px ~365,682). ' +
           'The smallest tides on the map (median daily range ~1.3 m), mostly twice daily and led by Tertius.',
  },
  {
    id: 'jia', name: 'Jia', lat: 37.23, lon: 31.83, sea: 'Central Sea',
    notes: 'Peninsula capital of Edrad, on the tip of the peninsula near the mouth of the ' +
           'Central Sea (px ~247,840). Twice-daily tides from Secundus and Tertius about equally, ' +
           'so the highs come irregularly — three in a day about a third of the time; median range ~2.4 m.',
  },
  {
    id: 'templado', name: 'Templado', lat: 35.77, lon: 29.22, sea: 'Central Sea',
    notes: 'East coast of the southernmost island in the Central Sea, just south of its ENE point, ' +
           'west-southwest of Jia (px ~123,935). Much like Jia: irregular twice-daily tides from Secundus ' +
           'and Tertius, median range ~2.3 m.',
  },
  {
    id: 'qis', name: 'Qis (river mouth)', lat: 39.54, lon: 47.1,
    notes: 'Mouth of the Qis River on the eastern ocean coast (px ~975,690), behind a broad shelf ' +
           'that resonates near Secundus\'s 9.9 h twice-daily period: fast, large tides (median range ~4.3 m) ' +
           'with Secundus three times the next body.',
  },
  {
    id: 'freeport', name: 'Freeport', lat: 30.53, lon: 33.31,
    notes: 'Notch harbour on the big southern island, at the city dot on the headland ' +
           'north of the inlet (px ~318,1276), behind a broad shallow shelf. ' +
           'The largest tides on the map (median range ~4.9 m): twice daily, Secundus and Tertius together, ' +
           'so they beat every ~1.5 days.',
  },
];

export const PORTS_BY_ID = Object.fromEntries(PORTS.map(p => [p.id, p]));
