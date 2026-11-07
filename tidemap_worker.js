// Web Worker for tidemap.html: runs the N-body sim and the 2-D ocean model.
//
// Messages in:
//   { type: 'init' }                          → { type: 'init', info }
//   { type: 'start', run, date, spinDays, engine } → progress…, then { type: 'frame', run, … }
//     engine: 'auto' (WebGL2 if available, else CPU), 'gpu' or 'cpu'
//   { type: 'step', run, seconds, probe, layer } → { type: 'frame', run, … }
//     seconds is rounded down to whole ocean steps (40 s); the frame's t says where it got to
//   { type: 'probe', run, cell }              → { type: 'probe', run, cell, series }
// Frames carry the water level (or current speed) over the map area only, as a
// Float32Array of mapW × mapH cells (land = NaN), plus port levels and gap flow.
// A run id lets the page ignore replies from a run it has abandoned.

import { createInitialBodies, applySnapshot } from './bodies.js';
import { Simulation } from './simulation.js';
import { tideBodyIndices, tideFrame } from './tides.js';
import { buildOceanGrid, nearestSeaCell, latToPy, lonToPx } from './ocean_grid.js';
import { createOcean } from './ocean2d_gl.js';
import { PORTS } from './ports.js';
import { parseLocalDate, DAY } from './tide_analysis.js';

const HIST_EVERY = 2;                 // frames (sim steps of 6 min) between history samples
const HIST_LEN = 240;                 // 240 × 12 min = 48 h
const MAX_STEP = 12 * 3600;           // s; cap per request so the page stays responsive

let snapshot, grid, info, mapIdx, region, run = null;

async function load() {
  if (grid) return;
  const [snap, mask] = await Promise.all([
    fetch('state_200yr.json?v=5').then(r => { if (!r.ok) throw new Error(`state_200yr.json: ${r.status}`); return r.json(); }),
    fetch('ocean_mask.json').then(r => { if (!r.ok) throw new Error(`ocean_mask.json: ${r.status}`); return r.json(); }),
  ]);
  snapshot = snap;
  grid = buildOceanGrid(mask);
  const mapW = mask.width, mapH = mask.height, { pad, nx } = grid;
  // Map-area cell m = j·mapW + i  ↔  grid cell (i + pad, j + pad).
  mapIdx = new Int32Array(mapW * mapH);
  const sea = new Uint8Array(mapW * mapH), depth = new Float32Array(mapW * mapH);
  for (let j = 0; j < mapH; j++)
    for (let i = 0; i < mapW; i++) {
      const k = (j + pad) * nx + i + pad, m = j * mapW + i;
      mapIdx[m] = k; sea[m] = grid.sea[k]; depth[m] = grid.depth[k];
    }
  const toMap = k => { const i = k % nx - pad, j = Math.floor(k / nx) - pad; return j * mapW + i; };
  region = { i0: pad, j0: pad, w: mapW, h: mapH };
  info = {
    mapW, mapH, cellPx: grid.cellPx, sea, depth,
    ports: PORTS.map(p => {
      const px = lonToPx(p.lon), py = latToPy(p.lat);
      return { id: p.id, name: p.name.replace(/ \(.*\)/, ''), lon: p.lon, px, py, cell: toMap(nearestSeaCell(grid, px, py)) };
    }),
    gaps: grid.gaps.map(gp => ({ name: gp.name, ends: gp.ends, width: gp.width, depth: gp.depth })),
  };
}

self.onmessage = async ({ data: msg }) => {
  try {
    await load();
    if (msg.type === 'init') self.postMessage({ type: 'init', info });
    else if (msg.type === 'start') await start(msg);
    else if (msg.type === 'step') step(msg);
    else if (msg.type === 'probe') probe(msg);
  } catch (err) {
    self.postMessage({ type: 'error', run: msg.run, message: err.message });
  }
};

const yieldToMessages = () => new Promise(r => setTimeout(r, 0));

async function start({ run: id, date, spinDays, engine = 'auto' }) {
  const t0 = parseLocalDate(date, 30), tStart = t0 - spinDays * DAY;
  if (tStart < snapshot.time) throw new Error('Pick a date from 20 January 2253 on (the simulation snapshot starts mid-January 2253).');
  const progress = (text, frac) => self.postMessage({ type: 'progress', run: id, text, frac });
  const me = { id };
  run = me;

  // N-body sim up to the start of the spin-up.
  const bodies = createInitialBodies();
  applySnapshot(bodies, snapshot);
  const sim = new Simulation(bodies);
  sim.time = snapshot.time;
  const dt = sim.dt, skip = Math.floor((tStart - sim.time) / dt);
  for (let done = 0; done < skip; ) {
    const n = Math.min(skip - done, 2400);
    sim.advance(n, 1e12, null);
    done += n;
    progress(`Moving the moons to ${date}…`, 0.3 * done / skip);
    await yieldToMessages();
    if (run !== me) return;
  }
  const ind = tideBodyIndices(sim.bodies);
  const { ocean, engine: used } = createOcean(grid, { engine });
  me.engine = used;
  Object.assign(me, { sim, ind, ocean, dt, frame: tideFrame(sim.bodies, ind, sim.time), next: new Float64Array(4 * ind.bodies.length),
                      histT: new Float64Array(HIST_LEN), histN: 0, histHead: 0, nframes: 0,
                      per: Math.round(dt / ocean.dt), sub: 0 });
  ocean.initHistory(region, HIST_LEN);
  ocean.reset(me.frame, sim.time);

  // Spin-up.
  const nSpin = Math.round((t0 - sim.time) / dt), chunk = used === 'gpu' ? 120 : 40;
  for (let k = 0; k < nSpin; ) {
    const n = Math.min(nSpin - k, chunk);
    advanceFrames(me, n);
    k += n;
    progress(`Spinning up the ocean (${(k * dt / DAY).toFixed(1)} of ${spinDays} days)…`, 0.3 + 0.7 * k / nSpin);
    await yieldToMessages();
    if (run !== me) return;
  }
  const msg = frameMessage(me, 'eta', null);
  self.postMessage(msg, [msg.field.buffer]);
}

// Advance n frame intervals (sim steps of 6 min).
function advanceFrames(r, n) { advanceSteps(r, n * r.per); }

// Advance n ocean steps (40 s), stopping anywhere inside a frame interval:
// r.sub counts the ocean steps already taken in the current one.
function advanceSteps(r, n) {
  while (n > 0) {
    if (r.sub === 0) {
      r.sim.advance(1, 1e12, null);
      tideFrame(r.sim.bodies, r.ind, r.sim.time, r.next);
    }
    const k = Math.min(r.per - r.sub, n);
    r.ocean.advance(r.frame, r.next, r.dt, r.sub, r.sub + k);
    r.sub += k; n -= k;
    if (r.sub === r.per) {
      [r.frame, r.next] = [r.next, r.frame];
      r.sub = 0;
      if (++r.nframes % HIST_EVERY === 0) record(r);
    }
  }
}

// Water level history over the map area, kept by the solver (on the GPU for
// the WebGL one, so recording never stalls on a readback).
function record(r) {
  r.ocean.recordHistory(r.histHead);
  r.histT[r.histHead] = r.ocean.time;
  r.histHead = (r.histHead + 1) % HIST_LEN;
  r.histN = Math.min(HIST_LEN, r.histN + 1);
}

function series(r, cell) {
  const bySlot = r.ocean.readHistory(cell);
  const t = new Float64Array(r.histN), h = new Float32Array(r.histN);
  for (let n = 0; n < r.histN; n++) {
    const slot = (r.histHead - r.histN + n + HIST_LEN) % HIST_LEN;
    t[n] = r.histT[slot]; h[n] = bySlot[slot];
  }
  return { t, h };
}

function step({ run: id, seconds, probe: cell, layer }) {
  if (!run || run.id !== id || !run.ocean) return;
  const n = Math.max(0, Math.floor(Math.min(seconds, MAX_STEP) / run.ocean.dt + 1e-6));   // 0 = just redraw
  advanceSteps(run, n);
  const msg = frameMessage(run, layer, cell);
  self.postMessage(msg, [msg.field.buffer]);
}

function probe({ run: id, cell }) {
  if (!run || run.id !== id || !run.ocean) return;
  self.postMessage({ type: 'probe', run: id, cell, series: series(run, cell) });
}

function frameMessage(r, layer, probeCell) {
  const o = r.ocean, eta = o.readEta(region), field = layer === 'speed' ? o.readSpeed(region) : eta;
  for (let m = 0; m < mapIdx.length; m++) if (!info.sea[m]) field[m] = NaN;
  return {
    type: 'frame', run: r.id, t: o.time, layer: layer ?? 'eta', field, engine: r.engine,
    ports: info.ports.map(p => eta[p.cell]),
    gaps: o.gapCurrents(),
    // The probe's last 48 h at 12-min resolution (240 samples), so the chart
    // stays smooth however far each frame jumps.
    probe: probeCell == null ? null : { cell: probeCell, h: eta[probeCell], series: series(r, probeCell) },
  };
}
