// Web Worker for tides.html: runs the N-body sim and the tide models off the
// main thread.  Messages in:
//   { id, kind: 'window', port, date, days }  → tide table + curves for one port
//   { id, kind: 'year', date }                → year overview for every port
// Messages out: { id, kind: 'progress', text } and { id, kind, result } or
// { id, kind: 'error', message }.

import { PORTS, PORTS_BY_ID, BASINS } from './ports.js';
import { Channel } from './tides.js';
import { recordEphemeris, parseLocalDate, localTime, spinupSeconds, runPort, runPorts,
         fitPartials, formNumber, portStats, channelProfile, equilibriumSeries, declination,
         findExtremaWindow, zoneName, REPORT_BODIES, DAY, HOUR } from './tide_analysis.js';

let snapshot = null;
async function getSnapshot() {
  if (!snapshot) {
    const res = await fetch('state_200yr.json?v=5');
    if (!res.ok) throw new Error(`could not load state_200yr.json (${res.status})`);
    snapshot = await res.json();
  }
  return snapshot;
}

self.onmessage = async ({ data: req }) => {
  try {
    const snap = await getSnapshot();
    const progress = text => self.postMessage({ id: req.id, kind: 'progress', text });
    const result = req.kind === 'window' ? tideWindow(snap, req) : yearOverview(snap, req, progress);
    self.postMessage({ id: req.id, kind: req.kind, result });
  } catch (err) {
    self.postMessage({ id: req.id, kind: 'error', message: err.message });
  }
};

function checkStart(snap, t) {
  if (t < snap.time) throw new Error('Dates before mid-January 2253 need the simulation run from the 2053 epoch; pick a later date.');
}

// Tide table and curves for one port over `days` local days from `date`.
function tideWindow(snap, { port: id, date, days }) {
  const port = PORTS_BY_ID[id];
  const t0 = parseLocalDate(date, port.lon), t1 = t0 + days * DAY, spin = spinupSeconds(port);
  checkStart(snap, t0 - spin);
  const eph = recordEphemeris(snap, t0 - spin, t1 + DAY / 4);
  const k0 = Math.round((t0 - eph.t0) / eph.dt), k1 = Math.min(eph.n - 1, Math.round((t1 - eph.t0) / eph.dt));
  const h = runPort(port, eph);
  let msl = 0;
  for (let k = k0; k <= k1; k++) msl += h[k];
  msl /= k1 - k0 + 1;
  const extrema = findExtremaWindow(eph, h, t0, t1).map(e => {
    const lt = localTime(e.t, port.lon);
    return { hour: (e.t - t0) / HOUR, h: e.h - msl, type: e.type, date: lt.date.replace(' AD', ''), clock: lt.clock, day: lt.day };
  });
  // Curves every 2 steps (12 min).
  const step = 2, n = Math.floor((k1 - k0) / step) + 1;
  const hours = new Float32Array(n), total = new Float32Array(n);
  for (let i = 0; i < n; i++) { hours[i] = i * step * eph.dt / HOUR; total[i] = h[k0 + i * step] - msl; }
  const bodies = {};
  for (const name of REPORT_BODIES) {
    const y = runPort(port, eph, { body: eph.names.indexOf(name) });
    let m = 0; for (let k = k0; k <= k1; k++) m += y[k]; m /= k1 - k0 + 1;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = y[k0 + i * step] - m;
    bodies[name] = out;
  }
  const startDay = localTime(t0 + HOUR, port.lon).day;
  return { port: id, zone: zoneName(port.lon), startDay, days, extrema, hours, total, bodies };
}

// Year overview for every port, from local midnight at Qaringil on `date`.
function yearOverview(snap, { date }, progress) {
  const t0 = parseLocalDate(date, 30), spin = Math.max(...PORTS.map(spinupSeconds));
  checkStart(snap, t0 - spin);
  progress('Running the simulation for a year…');
  const eph = recordEphemeris(snap, t0 - spin, t0 + 365 * DAY);
  const k0 = Math.round((t0 - eph.t0) / eph.dt);
  const kFit = Math.min(eph.n, k0 + Math.round(120 * DAY / eph.dt));
  const k14 = Math.min(eph.n, k0 + Math.round(14 * DAY / eph.dt) + 1);

  progress('Tides at every port…');
  const hs = runPorts(PORTS, eph);
  progress('Fitting partial tides…');
  const partials = fitPartials(PORTS, eph, k0, kFit);

  const summary = [], daily = {}, curves = {};
  const step = 5;                                    // 30-min samples for the 14-day curves
  const n14 = Math.floor((k14 - 1 - k0) / step) + 1;
  for (const p of PORTS) {
    const h = hs.get(p.id), st = portStats(p, eph, h, k0);
    const { F, type } = formNumber(partials[p.id]);
    summary.push({ id: p.id, name: p.name, model: p.basin ? `${BASINS[p.basin].name} channel` : (p.semi?.T0 ? `Resonator ${p.semi.T0} h` : 'Open ocean'),
                   F, type, neap: st.neap, median: st.median, spring: st.spring, highest: st.highest, lowest: st.lowest,
                   highsPerDay: st.highsPerDay });
    daily[p.id] = st.daily;
    const c = new Float32Array(n14);
    for (let i = 0; i < n14; i++) c[i] = h[k0 + i * step] - st.msl;
    curves[p.id] = c;
  }
  const partialRows = Object.fromEntries(Object.entries(partials).map(([id, rows]) =>
    [id, rows.map(({ y, ...rest }) => rest)]));

  progress('Along the Central Sea…');
  const profile = channelProfile('centralSea', eph, k0, kFit);
  const cs = BASINS.centralSea, ch = new Channel(cs, eph.dt, eph.R);
  const basin = { name: cs.name, lengthKm: ch.L / 1000, depth: cs.depth, damping: cs.damping,
                  fundamental: ch.fundamentalPeriodHours,
                  ports: PORTS.filter(p => p.basin === 'centralSea').map(p => ({ name: p.name, km: p.s * ch.L / 1000 })) };

  // Declinations at local noon (PMT+2), one per day.
  const decl = { day: [], Secundus: [], Tertius: [], Quartus: [], Sun: [] };
  for (let d = 0; d < 365; d++) {
    const k = k0 + Math.round((d + 0.5) * DAY / eph.dt);
    if (k >= eph.n) break;
    decl.day.push(localTime(eph.t0 + k * eph.dt, 30).day);
    for (const b of REPORT_BODIES) decl[b].push(declination(eph, eph.names.indexOf(b), k));
  }

  // Across the isthmus: Qaringil vs a plain equilibrium tide just north.
  const north = equilibriumSeries(eph, 45.6, 30.6), q = hs.get('qaringil');
  let mq = 0, mn = 0;
  for (let k = k0; k < eph.n; k++) { mq += q[k]; mn += north[k]; }
  mq /= eph.n - k0; mn /= eph.n - k0;
  const bridge = { qaringil: new Float32Array(n14), north: new Float32Array(n14), current: new Float32Array(n14) };
  for (let i = 0; i < n14; i++) {
    const k = k0 + i * step, a = q[k] - mq, b = north[k] - mn, d = a - b;
    bridge.qaringil[i] = a; bridge.north[i] = b; bridge.current[i] = Math.sign(d) * Math.sqrt(2 * 9.81 * Math.abs(d));
  }

  return { startDay: localTime(t0 + HOUR, 30).day, summary, partials: partialRows, curves, curveStepHours: step * eph.dt / HOUR,
           daily, decl, profile, basin, bridge };
}
