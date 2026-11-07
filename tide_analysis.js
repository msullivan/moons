// Tide analysis on top of tides.js: run the sim over a window, apply the
// fitted port models (port_response.js), fit partial tides, compute range
// statistics.  No DOM or filesystem access,
// so it runs both in Node (analysis/*.mjs) and in the browser (tides_worker.js).

import { Simulation } from './simulation.js';
import { createInitialBodies, applySnapshot, MEAN_SOLAR_DAY } from './bodies.js';
import { calToSimTime, simDate, clockHM, zoneOffset } from './calendar.js';
import { TIDE_BODY_NAMES, tideBodyIndices, tideFrame, component, findExtrema, makeSite,
         forcingSeries, applyResponse, gapCurrent } from './tides.js';
import { RESPONSE } from './port_response.js';

export const HOUR = 3600;
export const DAY  = MEAN_SOLAR_DAY;
export const REPORT_BODIES = ['Secundus', 'Tertius', 'Quartus', 'Sun'];
export const REPORT_SPECIES = [['diurnal', 1], ['semidiurnal', 2]];

const EPOCH_MS = Date.UTC(2053, 0, 1);

// ── calendar helpers ───────────────────────────────────────────────────

// "2253-03-14" → sim seconds at local midnight for longitude lon.
export function parseLocalDate(str, lon) {
  const m = /^(\d+)-(\d+)-(\d+)$/.exec(str);
  if (!m) throw new Error(`bad date '${str}', expected YYYY-MM-DD`);
  return calToSimTime(+m[1], +m[2] - 1, +m[3]) - zoneOffset(lon) * HOUR * (DAY / 86400);
}

export function zoneName(lon) {
  const off = zoneOffset(lon);
  return `PMT${off < 0 ? '−' : '+'}${Math.abs(off)}`;
}

// Local date, clock and day number for sim time t at longitude lon.
export function localTime(t, lon) {
  const tl = t + zoneOffset(lon) * DAY / 24;
  const day = Math.floor(tl / DAY);
  return { date: simDate(tl), clock: clockHM(tl), day, iso: isoDay(day) };
}

// Local calendar day number only (cheap; no string formatting).
export function localDay(t, lon) {
  return Math.floor((t + zoneOffset(lon) * DAY / 24) / DAY);
}

// Calendar day number (days since the epoch) → "2253-02-01".
export function isoDay(day) {
  return new Date(EPOCH_MS + day * 86400000).toISOString().slice(0, 10);
}

// ── ephemeris ──────────────────────────────────────────────────────────

// Run the sim and record a tide frame every integrator step over [t0, t1].
// Starts from `snapshot` (the 200-yr state) when t0 is after it, else from
// the epoch (slow).  Returns { t0, dt, n, nb, data, names, R, frame(k) }.
export function recordEphemeris(snapshot, t0, t1) {
  const bodies = createInitialBodies();
  let simStart = 0;
  if (snapshot && t0 >= snapshot.time) { applySnapshot(bodies, snapshot); simStart = snapshot.time; }
  const sim = new Simulation(bodies);
  sim.time = simStart;
  const dt = sim.dt;
  const skip = Math.max(0, Math.floor((t0 - simStart) / dt));
  if (skip) sim.advance(skip, 1e12, null);
  const ind = tideBodyIndices(sim.bodies);
  const nb = ind.bodies.length;
  const n = Math.ceil((t1 - sim.time) / dt) + 1;
  const data = new Float64Array(n * 4 * nb);
  const start = sim.time;
  for (let k = 0; k < n; k++) {
    if (k) sim.advance(1, 1e12, null);
    tideFrame(sim.bodies, ind, sim.time, data.subarray(4 * nb * k, 4 * nb * (k + 1)));
  }
  return { t0: start, dt, n, nb, data, names: TIDE_BODY_NAMES,
           R: sim.bodies[ind.qaia].physicalRadius,
           frame(k) { return data.subarray(4 * nb * k, 4 * nb * (k + 1)); } };
}

// Spin-up: the port models look back over the forcing of the last 120 h
// (port_response.js lags), so a window needs that much ephemeris before it.
const MAX_LAG_H = Math.max(...Object.values(RESPONSE.ports).map(r => r.lags[r.lags.length - 1]));
export function spinupSeconds() {
  return Math.ceil(MAX_LAG_H / 24 + 0.5) * DAY;
}

// ── running ports ──────────────────────────────────────────────────────

// Water level at a site with response model `resp` over samples [0, k1) of
// the ephemeris.  sel = { body, species } keeps only that part of the forcing
// (a partial tide: linear terms only, no constant).
function runResponse(resp, site, eph, sel = null, k1 = eph.n) {
  const F = forcingSeries(eph, site, sel, k1);
  return applyResponse(resp, F, eph.dt, { k1, linear: sel != null });
}

// Several ports at once.  Returns Map(port.id → Float64Array).
export function runPorts(ports, eph, sel = null, k1 = eph.n) {
  return new Map(ports.map(p => {
    const resp = RESPONSE.ports[p.id];
    if (!resp) throw new Error(`port ${p.id} has no fitted model in port_response.js — run analysis/fit_port_response.mjs --write`);
    return [p.id, runResponse(resp, makeSite(p.lat, p.lon), eph, sel, k1)];
  }));
}

export function runPort(port, eph, sel = null) {
  return runPorts([port], eph, sel).get(port.id);
}

// Mean hour-angle rate of body j (rad/s) — its synodic rate as seen from Qaia.
export function hourAngleRate(eph, j) {
  let total = 0, prev = null;
  for (let k = 0; k < eph.n; k++) {
    const f = eph.frame(k);
    const lam = Math.atan2(f[4 * j + 2], f[4 * j + 1]);
    if (prev !== null) {
      let d = lam - prev;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      total += d;
    }
    prev = lam;
  }
  return -total / ((eph.n - 1) * eph.dt);   // H = λ_obs − λ_body
}

// Partial tides: for each report body and species, run the ports with only
// that forcing and fit  y ≈ a·C + b·S  over samples [k0, k1), where C, S are
// the component's in-phase and quadrature equilibrium tides at the port.
// Gain = |a + ib|, lag from φ = atan2(b, a).  Returns
//   { [port.id]: [{ body, species, period_h, eq_amp, gain, lag_h, amp, y }] }
// with amplitudes in metres and y the partial-tide series.
export function fitPartials(ports, eph, k0, k1 = eph.n) {
  const out = Object.fromEntries(ports.map(p => [p.id, []]));
  const sites = Object.fromEntries(ports.map(p => [p.id, makeSite(p.lat, p.lon)]));
  for (const body of REPORT_BODIES) {
    const j = eph.names.indexOf(body);
    const w = hourAngleRate(eph, j);
    for (const [species, s] of REPORT_SPECIES) {
      const ys = runPorts(ports, eph, { body: j, species: s }, k1);
      const period = 2 * Math.PI / (s * w) / HOUR;
      for (const p of ports) {
        const y = ys.get(p.id), site = sites[p.id];
        let cc = 0, ss = 0, cs = 0, yc = 0, ysum = 0;
        for (let k = k0; k < k1; k++) {
          const f = eph.frame(k);
          const C = component(f, j, site, s), S = component(f, j, site, s, true);
          cc += C * C; ss += S * S; cs += C * S; yc += y[k] * C; ysum += y[k] * S;
        }
        const det = cc * ss - cs * cs;
        const a = (yc * ss - ysum * cs) / det, b = (ysum * cc - yc * cs) / det;
        const gain = Math.hypot(a, b), eqAmp = Math.sqrt((cc + ss) / (k1 - k0));
        // Wrap into [−0.1, 0.9) periods so a near-zero lag doesn't read as a full period.
        let lag = Math.atan2(b, a) / (s * w) / HOUR;
        lag -= period * Math.floor(lag / period + 0.1);
        out[p.id].push({ body, species, period_h: period, eq_amp: eqAmp, gain, lag_h: lag, amp: gain * eqAmp, y });
      }
    }
  }
  return out;
}

// Form number Σ diurnal / Σ semidiurnal amplitudes, and its classification.
export function formNumber(partials) {
  const sum = sp => partials.filter(p => p.species === sp).reduce((a, p) => a + p.amp, 0);
  const F = sum('diurnal') / sum('semidiurnal');
  const type = F < 0.25 ? 'Semidiurnal' : F < 1.5 ? 'Mixed, mainly semidiurnal'
             : F < 3 ? 'Mixed, mainly diurnal' : 'Diurnal';
  return { F, type };
}

// ── statistics ─────────────────────────────────────────────────────────

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// Range statistics for one port's series over samples [k0, n).  Days are the
// port's local calendar days; the first and last (partial) days are dropped.
export function portStats(port, eph, h, k0) {
  const t0 = eph.t0 + k0 * eph.dt;
  let msl = 0, hi = -Infinity, lo = Infinity;
  for (let k = k0; k < eph.n; k++) { msl += h[k]; hi = Math.max(hi, h[k]); lo = Math.min(lo, h[k]); }
  msl /= eph.n - k0;
  const extrema = findExtrema(eph.t0, eph.dt, h).filter(e => e.t >= t0);
  const ranges = [];
  for (let i = 1; i < extrema.length; i++) ranges.push(Math.abs(extrema[i].h - extrema[i - 1].h));
  const byDay = new Map();
  for (let k = k0; k < eph.n; k++) {
    const d = localDay(eph.t0 + k * eph.dt, port.lon);
    const r = byDay.get(d) ?? { day: d, lo: Infinity, hi: -Infinity, highs: 0 };
    r.lo = Math.min(r.lo, h[k]); r.hi = Math.max(r.hi, h[k]);
    byDay.set(d, r);
  }
  for (const e of extrema) if (e.type === 'H') { const r = byDay.get(localDay(e.t, port.lon)); if (r) r.highs++; }
  const daily = [...byDay.values()].slice(1, -1).map(r => ({ day: r.day, date: isoDay(r.day), range: r.hi - r.lo, highs: r.highs }));
  const dr = daily.map(r => r.range);
  const hist = [0, 0, 0, 0];
  for (const r of daily) hist[Math.min(3, r.highs)]++;
  return {
    msl, extrema, daily,
    highest: hi - msl, lowest: lo - msl,
    meanRange: ranges.reduce((a, b) => a + b, 0) / Math.max(1, ranges.length),
    neap: pct(dr, 0.1), median: pct(dr, 0.5), spring: pct(dr, 0.9),
    highsPerDay: hist.map(c => c / Math.max(1, daily.length)),   // [0, 1, 2, ≥3]
  };
}

// Typical once-daily and twice-daily amplitude down the middle of the
// Central Sea (port_response.js axis points), over samples [k0, k1).
// Returns [{ km, lat, lon, diurnal, semidiurnal }] (m), km from Qaringil.
export function seaProfile(eph, k0, k1 = eph.n) {
  return RESPONSE.axis.map(pt => {
    const site = makeSite(pt.lat, pt.lon), amp = {};
    for (const [species, s] of REPORT_SPECIES) {
      const y = runResponse(pt, site, eph, { species: s }, k1);
      let sum = 0, sq = 0;
      for (let k = k0; k < k1; k++) { sum += y[k]; sq += y[k] * y[k]; }
      const m = k1 - k0;
      amp[species] = Math.sqrt(2 * Math.max(0, sq / m - (sum / m) ** 2));
    }
    return { km: pt.km, lat: pt.lat, lon: pt.lon, ...amp };
  });
}

// Levels at the two ends of isthmus gap n (port_response.js gaps) and the
// current through it, over the whole ephemeris.  Returns { name, north,
// south, current } — current in m/s, positive running north, out of the
// Central Sea.  End A (ends[0]) is the northern end.
export function gapSeries(eph, n = 0) {
  const gp = RESPONSE.gaps[n];
  const [A, B] = gp.ends.map(e => {
    const site = makeSite(e.lat, e.lon), F = forcingSeries(eph, site);
    return { F, h: applyResponse(e, F, eph.dt) };
  });
  const u = gapCurrent(gp, A.h, B.h, A.F, B.F, eph.dt);
  return { name: gp.name, north: A.h, south: B.h, current: u.map(v => -v) };
}

// Declination (degrees) of body j at sample k.
export function declination(eph, j, k) {
  return Math.asin(eph.frame(k)[4 * j + 3]) * 180 / Math.PI;
}

// High and low waters with t in [t0, t1).
export function findExtremaWindow(eph, h, t0, t1) {
  return findExtrema(eph.t0, eph.dt, h).filter(e => e.t >= t0 && e.t < t1);
}
