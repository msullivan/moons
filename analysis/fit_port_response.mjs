// Fit the port tide models (port_response.js) to the 2-D tide model.
//
//   node analysis/fit_port_response.mjs [--fit DATE:DAYS,…] [--test DATE:DAYS,…]
//        [--spin D] [--lags STEP,MAX] [--ridge R] [--cache DIR] [--linear]
//        [--check] [--spectrum] [--write]
//
// Runs ocean2d.js on the GPU (analysis/ocean_browser.mjs) over each fit and
// test window (after a D-day spin-up from rest), recording η at every port,
// at points down the middle of the Central Sea, and at the two ends of the
// isthmus gap.  Each site is then fitted with a response model (tides.js
// applyResponse): the water level as a fixed linear filter of the local
// equilibrium forcing,
//   h(t) = c + g·C₀(t) + Σ_s Σ_ℓ [ a_sℓ·C_s(t − ℓ) + b_sℓ·S_s(t − ℓ) ]
// with C_s, S_s the in-phase and quadrature equilibrium tide of species s
// (diurnal, semidiurnal) summed over the moons and the Sun, and lags
// ℓ = 0, STEP, …, MAX hours — Munk & Cartwright's (1966) response method —
// plus a second stage of non-linear terms (tides.js NL_TERMS) fitted to what
// the linear part leaves.  The weights describe the sea, not the orbits; the
// fit windows are spread over years so that they see the orbits in several
// configurations, and the test windows (not fitted) check that the result
// carries over to other dates.
//
//   --write     save the weights to port_response.js
//   --check     score the saved port_response.js instead of fitting
//   --cache DIR keep the 2-D runs in DIR (JSON) for re-fitting
//   --linear    skip the non-linear stage
//   --spectrum  print where each port's test residual sits in frequency

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { buildOceanGrid, nearestSeaCell, latToPy, lonToPx, KM_PER_PX } from '../ocean_grid.js';
import { makeSite, forcingSeries, applyResponse, NL_TERMS, gapCurrent } from '../tides.js';
import { PORTS } from '../ports.js';
import { recordEphemeris, parseLocalDate, DAY } from './tide_common.mjs';
import { runOceanInBrowser } from './ocean_browser.mjs';
import { OCEAN_DEFAULTS } from '../ocean2d.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : args[i + 1]; };
const windows = s => s.split(',').map(w => { const [date, days] = w.split(':'); return { date, days: +days }; });
const FIT = windows(opt('--fit', '2253-02-01:90,2256-07-01:90,2259-11-01:90,2263-04-01:90'));
const TEST = windows(opt('--test', '2261-06-01:45,2270-01-01:45'));
const spinDays = +opt('--spin', 4);
const [lagStep, lagMax] = opt('--lags', '6,120').split(',').map(Number);
const ridge = +opt('--ridge', 1e-6);
const cacheDir = opt('--cache', null);
const write = args.includes('--write'), check = args.includes('--check'), linear = args.includes('--linear');
if (check && write) throw new Error('--check and --write together make no sense');
const SAVED = check ? (await import('../port_response.js')).RESPONSE : null;

// Down the middle of the Central Sea, from Qaringil past the islands and Jia
// to the open water south of Templado (map pixels).
const AXIS = [[150, 380], [178, 440], [170, 520], [205, 680], [215, 770], [220, 840], [205, 920], [180, 990]];
const AXIS_POINTS = 28;

const grid = buildOceanGrid(JSON.parse(readFileSync(new URL('../ocean_mask.json', import.meta.url))));
const cellSite = k => makeSite(grid.lat[k], grid.lon[k]);

// ── sites ───────────────────────────────────────────────────────────────
const sites = [];
for (const p of PORTS)
  sites.push({ kind: 'port', id: p.id, name: p.name, cell: nearestSeaCell(grid, lonToPx(p.lon), latToPy(p.lat)), site: makeSite(p.lat, p.lon) });
{
  const seg = AXIS.slice(1).map((q, i) => Math.hypot(q[0] - AXIS[i][0], q[1] - AXIS[i][1]));
  const total = seg.reduce((a, b) => a + b, 0);
  for (let n = 0; n < AXIS_POINTS; n++) {
    let d = total * n / (AXIS_POINTS - 1), i = 0;
    while (i < seg.length - 1 && d > seg[i]) d -= seg[i++];
    const f = Math.min(1, d / seg[i]), px = AXIS[i][0] + f * (AXIS[i + 1][0] - AXIS[i][0]), py = AXIS[i][1] + f * (AXIS[i + 1][1] - AXIS[i][1]);
    const cell = nearestSeaCell(grid, px, py);
    sites.push({ kind: 'axis', id: `axis${n}`, n, km: total * n / (AXIS_POINTS - 1) * KM_PER_PX, cell, site: cellSite(cell) });
  }
}
grid.gaps.forEach((gp, n) => gp.cells.forEach((cell, end) =>
  sites.push({ kind: 'gap', id: `gap${n}${end ? 'B' : 'A'}`, gap: n, end, cell, site: cellSite(cell) })));
const cells = sites.map(s => s.cell);

// ── the 2-D runs ────────────────────────────────────────────────────────
const lags = []; for (let l = 0; l <= lagMax + 1e-9; l += lagStep) lags.push(+l.toFixed(3));

async function getRun({ date, days }, role) {
  const t0 = parseLocalDate(date, 30), tStart = t0 - spinDays * DAY, t1 = t0 + days * DAY;
  const file = cacheDir && `${cacheDir}/ocean_${date}_${days}d_spin${spinDays}.json`;
  let run = file && existsSync(file) ? JSON.parse(readFileSync(file)) : null;
  if (run && run.cells.join() !== cells.join()) run = null;     // sites have moved
  if (!run) {
    console.log(`2-D model: ${date}, ${days} d after ${spinDays} d spin-up`);
    const r = await runOceanInBrowser({ t0: tStart, t1, cells });
    console.log(`  ${(r.secPerDay * (days + spinDays)).toFixed(0)} s (${r.renderer.replace(/^ANGLE \((.*?),.*$/, '$1')})`);
    run = { cells, eta: r.eta.map(a => Array.from(a, v => +v.toFixed(5))), gaps: r.gaps.map(a => Array.from(a, v => +v.toFixed(4))) };
    if (file) { mkdirSync(cacheDir, { recursive: true }); writeFileSync(file, JSON.stringify(run)); }
  }
  const eph = recordEphemeris(tStart, t1);
  if (run.eta[0].length !== eph.n) throw new Error(`2-D run and ephemeris disagree (${run.eta[0].length} vs ${eph.n} frames)`);
  // Score from the end of the spin-up plus the longest lag.
  const k0 = Math.round(spinDays * DAY / eph.dt) + Math.round(lagMax * 3600 / eph.dt);
  return { date, days, role, eph, k0, eta: run.eta, gaps: run.gaps };
}
const runs = [];
for (const w of check ? [] : FIT) runs.push(await getRun(w, 'fit'));
for (const w of TEST) runs.push(await getRun(w, 'test'));
const dt = runs[0].eph.dt, L = lags.map(h => Math.round(h * 3600 / dt));

// ── fitting ─────────────────────────────────────────────────────────────
const m = 2 + 4 * lags.length;            // const, long, then (a, b) per lag for diurnal and semi

function fitLinear(series) {
  const AtA = Array.from({ length: m }, () => new Float64Array(m)), Aty = new Float64Array(m), row = new Float64Array(m);
  for (const { y, F, k0 } of series) for (let k = k0; k < y.length; k++) {
    row[0] = 1; row[1] = F.C[0][k];
    L.forEach((l, i) => {
      row[2 + 2 * i] = F.C[1][k - l]; row[3 + 2 * i] = F.S[1][k - l];
      row[2 + 2 * lags.length + 2 * i] = F.C[2][k - l]; row[3 + 2 * lags.length + 2 * i] = F.S[2][k - l];
    });
    for (let a = 0; a < m; a++) { if (!row[a]) continue; Aty[a] += row[a] * y[k]; for (let b = a; b < m; b++) AtA[a][b] += row[a] * row[b]; }
  }
  for (let a = 0; a < m; a++) for (let b = 0; b < a; b++) AtA[a][b] = AtA[b][a];
  // Ridge on the lag weights (not the constant or long-period gain): the
  // forcing is band-limited, so many lag combinations fit equally well.
  let tr = 0; for (let a = 2; a < m; a++) tr += AtA[a][a];
  for (let a = 2; a < m; a++) AtA[a][a] += ridge * tr / (m - 2);
  const x = solve(AtA, Aty);
  const pair = off => lags.map((_, i) => [x[off + 2 * i], x[off + 2 * i + 1]]);
  return { lags, c: x[0], long: x[1], diurnal: pair(2), semi: pair(2 + 2 * lags.length) };
}

// Second stage: what the linear part leaves, against NL_TERMS of its
// once- and twice-daily parts.
function fitNonlinear(series, resp) {
  const q = NL_TERMS(0, 0, 0, 0).length;
  const AtA = Array.from({ length: q }, () => new Float64Array(q)), Aty = new Float64Array(q);
  for (const { y, F, k0 } of series) {
    const hl = applyResponse(resp, F, dt), [dr, di] = hl.parts[1], [sr, si] = hl.parts[2];
    for (let k = k0; k < y.length; k++) {
      const t = NL_TERMS(dr[k], di[k], sr[k], si[k]), e = y[k] - hl[k];
      for (let a = 0; a < q; a++) { Aty[a] += t[a] * e; for (let b = 0; b < q; b++) AtA[a][b] += t[a] * t[b]; }
    }
  }
  let tr = 0; for (let a = 0; a < q; a++) tr += AtA[a][a];
  for (let a = 0; a < q; a++) AtA[a][a] += 1e-9 * tr / q;
  return Array.from(solve(AtA, Aty));
}

function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}

// RMS of the 2-D series, RMS and max of the error, pooled over runs.
function score(pairs) {
  let n = 0, vy = 0, ve = 0, emax = 0;
  for (const { y, h, k0 } of pairs) {
    let my = 0; for (let k = k0; k < y.length; k++) my += y[k]; my /= y.length - k0;
    for (let k = k0; k < y.length; k++) { vy += (y[k] - my) ** 2; const e = y[k] - h[k]; ve += e * e; emax = Math.max(emax, Math.abs(e)); n++; }
  }
  return { rms: Math.sqrt(vy / n), err: Math.sqrt(ve / n), emax };
}

// ── fit and score every site ────────────────────────────────────────────
const days = role => runs.filter(r => r.role === role).reduce((a, r) => a + (r.eph.n - r.k0) * dt / DAY, 0).toFixed(0);
console.log(check ? `\nscoring port_response.js over ${days('test')} d`
  : `\nlags 0–${lagMax} h every ${lagStep} h, ridge ${ridge}${linear ? ', linear only' : ''}; fit ${days('fit')} d (${FIT.map(w => w.date).join(', ')}), test ${days('test')} d (${TEST.map(w => w.date).join(', ')})`);
console.log(`  ${'site'.padEnd(26)}signal rms   fit err  test err  test max`);
const cm = v => `${(100 * v).toFixed(1).padStart(6)} cm`;
const out = { ports: {}, axis: [], gaps: [] };
sites.forEach((s, c) => {
  const series = runs.map(r => ({ role: r.role, y: r.eta[c], F: forcingSeries(r.eph, s.site), k0: r.k0, eph: r.eph }));
  let resp;
  if (check) resp = s.kind === 'port' ? SAVED.ports[s.id] : s.kind === 'axis' ? SAVED.axis[s.n] : SAVED.gaps[s.gap].ends[s.end];
  else {
    const fit = series.filter(r => r.role === 'fit');
    resp = fitLinear(fit);
    if (!linear) resp.nl = fitNonlinear(fit, resp);
  }
  for (const r of series) r.h = applyResponse(resp, r.F, dt);
  s.series = series;
  const a = score(series.filter(r => r.role === 'fit')), b = score(series.filter(r => r.role === 'test'));
  if (s.kind !== 'axis' || s.n % 9 === 0)
    console.log(`  ${(s.name ?? s.id).padEnd(26)}${cm(b.rms)}  ${check ? '      —  ' : cm(a.err)}  ${cm(b.err)}  ${cm(b.emax)}`);
  if (args.includes('--spectrum') && s.kind === 'port') for (const r of series) if (r.role === 'test') spectrum(`${s.name} ${r.date}`, r.y, r.h, r.k0);
  const w = round(resp), at = { lat: +s.site.lat.toFixed(3), lon: +s.site.lon.toFixed(3) };
  if (s.kind === 'port') out.ports[s.id] = w;
  else if (s.kind === 'axis') out.axis.push({ km: +s.km.toFixed(1), ...at, ...w });
  else (out.gaps[s.gap] ??= { name: grid.gaps[s.gap].name, ends: [] }).ends[s.end] = { ...at, ...w };
});

// The gap current, rebuilt from the fitted levels at its ends with the 2-D
// model's own strait equation (tides.js gapCurrent), against the current the
// 2-D model computed.
grid.gaps.forEach((gp, n) => {
  const [A, B] = [0, 1].map(e => sites.find(s => s.kind === 'gap' && s.gap === n && s.end === e));
  const strait = { length: gp.length, depth: gp.depth, width: gp.width, drag: +(OCEAN_DEFAULTS.cd / gp.depth + gp.loss / (2 * gp.length)).toPrecision(5) };
  const pairs = runs.filter(r => r.role === 'test').map(r => {
    const i = runs.indexOf(r), sa = A.series[i], sb = B.series[i];
    return { y: r.gaps[n], h: gapCurrent(strait, sa.h, sb.h, sa.F, sb.F, dt), k0: r.k0 };
  });
  const s = score(pairs);
  console.log(`  ${(gp.name + ' current').padEnd(26)}${s.rms.toFixed(2).padStart(6)} m/s  ${''.padStart(8)} ${s.err.toFixed(2).padStart(6)} m/s ${s.emax.toFixed(2).padStart(5)} m/s`);
  Object.assign(out.gaps[n], strait);
});

// Where a test residual sits: fraction of its variance per band (cycles/day).
function spectrum(name, y, h, a) {
  const b = y.length;
  let N = 1; while (N < b - a) N *= 2;
  const re = new Float64Array(N), im = new Float64Array(N);
  let mean = 0; for (let k = a; k < b; k++) mean += y[k] - h[k]; mean /= b - a;
  for (let k = a; k < b; k++) re[k - a] = y[k] - h[k] - mean;
  fft(re, im);
  const bands = [[0, 0.6, 'long'], [0.6, 1.5, 'D'], [1.5, 3.2, 'SD'], [3.2, 5.5, 'QD'], [5.5, 1e9, 'higher']];
  const pw = bands.map(() => 0); let tot = 0;
  const cpd = 86400 / dt / N;
  for (let i = 1; i < N / 2; i++) { const p = re[i] ** 2 + im[i] ** 2, f = i * cpd; tot += p; bands.forEach(([lo, hi], j) => { if (f >= lo && f < hi) pw[j] += p; }); }
  console.log(`      residual ${name}: ` + bands.map(([, , n], j) => `${n} ${(100 * pw[j] / tot).toFixed(0)}%`).join('  '));
}
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

function round(r) {
  const p = v => +v.toPrecision(5);
  return { c: p(r.c), long: p(r.long), lags: r.lags, diurnal: r.diurnal.map(w => w.map(p)), semi: r.semi.map(w => w.map(p)),
           ...(r.nl ? { nl: r.nl.map(p) } : {}) };
}

if (write) {
  const cmd = ['--fit', FIT.map(w => `${w.date}:${w.days}`).join(','), '--test', TEST.map(w => `${w.date}:${w.days}`).join(','),
               '--spin', spinDays, '--lags', `${lagStep},${lagMax}`, '--ridge', ridge, ...(linear ? ['--linear'] : [])].join(' ');
  const src = `// Port tide models, fitted to the 2-D tide model (ocean2d.js).  Generated by
//   node analysis/fit_port_response.mjs ${cmd} --write
// — do not edit.  Each entry is a response model for tides.js applyResponse:
//   lags     hours
//   diurnal, semi   per lag, [a, b] weights on the in-phase and quadrature
//            equilibrium forcing of that species
//   long     long-period gain;  c  constant (the 2-D model's mean level)
//   nl       weights on tides.js NL_TERMS
// Sites:
//   ports    by port id
//   axis     points down the middle of the Central Sea, km from Qaringil
//   gaps     the two ends of each isthmus gap, and the strait (tides.js gapCurrent)

export const RESPONSE = ${JSON.stringify(out)};
`;
  writeFileSync(new URL('../port_response.js', import.meta.url), src);
  console.log('\nwrote port_response.js');
}
