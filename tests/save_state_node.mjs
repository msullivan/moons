import { readFileSync, writeFileSync } from 'fs';

const YEARS = 300;
const OUT   = '/tmp/sim_state_300yr.json';

// Load simulation.js and bodies.js into a shared scope without a browser.
// Neither file uses import/export, so they can't be directly imported as modules.
// new Function(code)() evaluates the concatenated source as a function body,
// giving both scripts a shared local scope (G and Body from simulation.js are
// visible to bodies.js; createInitialBodies from bodies.js is visible to the
// Simulation constructor). The explicit return pulls Simulation out.
// Order matters: simulation.js first, since bodies.js uses G and Body.
// The circular dependency (Simulation calls createInitialBodies) is fine because
// createInitialBodies only needs to exist at call time, not at class definition time.
const code =
  readFileSync(new URL('../simulation.js', import.meta.url), 'utf8') + '\n' +
  readFileSync(new URL('../bodies.js',     import.meta.url), 'utf8') + '\n' +
  'return { Simulation };';

const { Simulation } = new Function(code)();
const sim = new Simulation();
const steps = Math.round(YEARS * 365.25 * 86400 / sim.dt);

console.log(`Advancing ${steps.toLocaleString()} steps (${YEARS} years)…`);
sim.advance(steps, 1000, null);

const state = {
  time_years: sim.time / (365.25 * 86400),
  dt: sim.dt,
  bodies: sim.bodies.map(b => ({
    name: b.name, mass: b.mass,
    x: b.x, y: b.y, z: b.z,
    vx: b.vx, vy: b.vy, vz: b.vz,
  })),
};

writeFileSync(OUT, JSON.stringify(state, null, 2));
console.log(`Saved state at ${state.time_years.toFixed(2)} years to ${OUT}`);
state.bodies.forEach(b =>
  console.log(`  ${b.name.padEnd(10)} x=${b.x.toExponential(4)}  y=${b.y.toExponential(4)}  vx=${b.vx.toExponential(4)}  vy=${b.vy.toExponential(4)}`)
);
