// Web Worker for tides.html: runs the N-body sim and the tide models off the
// main thread.  Messages in:
//   { id, kind: 'window', port, date, days }  → tide table + curves for one port
//   { id, kind: 'year', date }                → year overview for every port
// Messages out: { id, kind: 'progress', text } and { id, kind, result } or
// { id, kind: 'error', message }.

import { PORTS, PORTS_BY_ID } from './ports.js';
import { recordEphemeris, parseLocalDate, localTime, spinupSeconds, runPort, runPorts,
         fitPartials, formNumber, portStats, seaProfile, gapSeries, declination,
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
  if (t < snap.time) throw new Error('Pick a date from 8 January 2253 on (the simulation snapshot is from 1 January 2253, and the port models need 6 days of forcing before the first day).');
}

// Tide table and curves for one port over `days` local days from `date`.
function tideWindow(snap, { port: id, date, days }) {
  const port = PORTS_BY_ID[id];
  const t0 = parseLocalDate(date, port.lon), t1 = t0 + days * DAY, spin = spinupSeconds();
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
  const t0 = parseLocalDate(date, 30), spin = spinupSeconds();
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
    summary.push({ id: p.id, name: p.name, F, type, neap: st.neap, median: st.median, spring: st.spring, highest: st.highest, lowest: st.lowest,
                   highsPerDay: st.highsPerDay });
    daily[p.id] = st.daily;
    const c = new Float32Array(n14);
    for (let i = 0; i < n14; i++) c[i] = h[k0 + i * step] - st.msl;
    curves[p.id] = c;
  }
  const partialRows = Object.fromEntries(Object.entries(partials).map(([id, rows]) =>
    [id, rows.map(({ y, ...rest }) => rest)]));

  progress('Along the Central Sea…');
  const profile = seaProfile(eph, k0, kFit);
  // Central Sea ports, placed at the nearest profile point.
  const near = p => profile.reduce((best, q) => {
    const d = Math.hypot(q.lat - p.lat, (q.lon - p.lon) * Math.cos(p.lat * Math.PI / 180));
    return d < best.d ? { d, km: q.km } : best;
  }, { d: Infinity }).km;
  const basin = { name: 'Central Sea', lengthKm: profile[profile.length - 1].km,
                  ports: PORTS.filter(p => p.sea === 'Central Sea').map(p => ({ name: p.name, km: near(p) })) };

  // Declinations at local noon (PMT+2), one per day.
  const decl = { day: [], Secundus: [], Tertius: [], Quartus: [], Sun: [] };
  for (let d = 0; d < 365; d++) {
    const k = k0 + Math.round((d + 0.5) * DAY / eph.dt);
    if (k >= eph.n) break;
    decl.day.push(localTime(eph.t0 + k * eph.dt, 30).day);
    for (const b of REPORT_BODIES) decl[b].push(declination(eph, eph.names.indexOf(b), k));
  }

  // Across the isthmus: the levels at the two ends of the bridge gap and the
  // current through it.
  const gap = gapSeries(eph);
  const mean = h => { let m = 0; for (let k = k0; k < eph.n; k++) m += h[k]; return m / (eph.n - k0); };
  const ms = mean(gap.south), mn = mean(gap.north);
  const bridge = { name: gap.name, south: new Float32Array(n14), north: new Float32Array(n14), current: new Float32Array(n14) };
  for (let i = 0; i < n14; i++) {
    const k = k0 + i * step;
    bridge.south[i] = gap.south[k] - ms; bridge.north[i] = gap.north[k] - mn; bridge.current[i] = gap.current[k];
  }

  return { startDay: localTime(t0 + HOUR, 30).day, summary, partials: partialRows, curves, curveStepHours: step * eph.dt / HOUR,
           daily, decl, profile, basin, bridge };
}
