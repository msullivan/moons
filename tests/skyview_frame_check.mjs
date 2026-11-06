// Regression check for SkyView's coordinate transforms: dumps altAz() for
// every body and _starMatrix() at several times/locations.  Run before and
// after a refactor and diff the output.
//   node tests/skyview_frame_check.mjs > before.json
import { readFileSync } from 'fs';
import { Simulation } from '../simulation.js';
import { createInitialBodies, applySnapshot } from '../bodies.js';
import { SkyView } from '../skyview.js';

const snap = JSON.parse(readFileSync(new URL('../state_200yr.json', import.meta.url)));
const sim = new Simulation(applySnapshot(createInitialBodies(), snap));
sim.time = snap.time;
const sky = new SkyView({ getContext: () => ({}) }, sim);

const out = [];
for (const [lat, lon] of [[45, 30], [-25, -5], [0, 0], [90, 0], [12.3, -140]]) {
  sky.setLocation(lat, lon);
  for (let k = 0; k < 4; k++) {
    sim.advance(37, 1000, null);
    out.push({ lat, lon, t: sim.time,
      altAz: sim.bodies.map((_, i) => sky.altAz(i)),
      star: sky._starMatrix() });
  }
}
console.log(JSON.stringify(out));
