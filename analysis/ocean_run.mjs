// Run the 2-D tide model (ocean2d.js) and report on it.
//   node analysis/ocean_run.mjs [YYYY-MM-DD] [days] [--spin D]
// Spins up for D days (default 4) before the date, runs `days` days (default
// 3), and prints speed, conservation, and the tide at each port: range, and
// — for runs of ≥ 30 days — partial tides fitted jointly to the full series,
// side by side with the existing port models.

import { readFileSync } from 'fs';
import { buildOceanGrid, nearestSeaCell, latToPy, lonToPx } from '../ocean_grid.js';
import { Ocean2D } from '../ocean2d.js';
import { component, makeSite } from '../tides.js';
import { PORTS } from '../ports.js';
import { recordEphemeris, parseLocalDate, runPorts, hourAngleRate, fitPartials,
         REPORT_BODIES, REPORT_SPECIES, DAY, HOUR } from './tide_common.mjs';

const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return +v; };
const spinDays = flag('--spin', 4);
const [date = '2253-02-01', daysArg = '3'] = args;
const days = +daysArg;

const grid = buildOceanGrid(JSON.parse(readFileSync(new URL('../ocean_mask.json', import.meta.url))));
const ocean = new Ocean2D(grid);
const t0 = parseLocalDate(date, 30), tStart = t0 - spinDays * DAY;
console.log(`grid ${grid.nx}×${grid.ny}, ${grid.sea.reduce((a, b) => a + b, 0)} sea cells, dt ${ocean.dt} s; ` +
            `spin-up ${spinDays} d, run ${days} d from ${date}`);

let tm = Date.now();
const eph = recordEphemeris(tStart, t0 + days * DAY);
console.log(`N-body ephemeris: ${((Date.now() - tm) / 1000).toFixed(1)} s for ${eph.n} frames`);

const probes = PORTS.map(p => {
  const px = lonToPx(p.lon), py = latToPy(p.lat), k = nearestSeaCell(grid, px, py);
  return { id: p.id, name: p.name, k, h: new Float64Array(eph.n), depth: grid.depth[k] };
});
const gapU = grid.gaps.map(() => new Float64Array(eph.n));

ocean.reset(eph.frame(0), eph.t0);
const k0 = Math.round((t0 - eph.t0) / eph.dt);
tm = Date.now();
let maxEta = 0;
for (let k = 0; k < eph.n; k++) {
  if (k) ocean.advance(eph.frame(k - 1), eph.frame(k), eph.dt);
  for (const p of probes) p.h[k] = ocean.eta[p.k];
  ocean.gaps.forEach((gp, n) => { gapU[n][k] = gp.u; });
  if (k % 240 === 0) {
    let m = 0;
    for (let c = 0; c < ocean.eta.length; c++) if (grid.sea[c]) m = Math.max(m, Math.abs(ocean.eta[c]));
    maxEta = Math.max(maxEta, m);
    if (!Number.isFinite(m) || m > 50) { console.log(`blew up at day ${(k * eph.dt / DAY).toFixed(2)}: max |η| ${m}`); process.exit(1); }
    if (k % 2400 === 0)
      process.stdout.write(`  day ${(k * eph.dt / DAY - spinDays).toFixed(0).padStart(3)}: max |η| ${m.toFixed(2)} m, ` +
                           `${((Date.now() - tm) / 1000 / Math.max(1e-9, k * eph.dt / DAY)).toFixed(2)} s per sim day\n`);
  }
}
const secPerDay = (Date.now() - tm) / 1000 / ((eph.n - 1) * eph.dt / DAY);
console.log(`ocean: ${secPerDay.toFixed(2)} s per simulated day; max |η| anywhere ${maxEta.toFixed(2)} m`);

// ── ranges ──────────────────────────────────────────────────────────────
const old = runPorts(PORTS, eph);
const rangeOf = (h, a, b) => { let lo = Infinity, hi = -Infinity; for (let k = a; k < b; k++) { lo = Math.min(lo, h[k]); hi = Math.max(hi, h[k]); } return hi - lo; };
const perDay = Math.round(DAY / eph.dt);
console.log('\nDaily range at each port (median over the run), 2-D model vs port model:');
for (const p of probes) {
  const r2 = [], r1 = [];
  for (let k = k0; k + perDay <= eph.n; k += perDay) { r2.push(rangeOf(p.h, k, k + perDay)); r1.push(rangeOf(old.get(p.id), k, k + perDay)); }
  const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  console.log(`  ${p.name.padEnd(18)} cell depth ${p.depth.toFixed(0).padStart(4)} m   2-D ${med(r2).toFixed(2)} m   port model ${med(r1).toFixed(2)} m`);
}
grid.gaps.forEach((gp, n) => {
  let m = 0; for (let k = k0; k < eph.n; k++) m = Math.max(m, Math.abs(gapU[n][k]));
  console.log(`\nGap ${gp.name}: peak current ${m.toFixed(2)} m/s (${(m * 1.944).toFixed(1)} kn), peak flux ${(m * gp.area / 1e3).toFixed(0)}k m³/s`);
});

// ── partial tides (joint fit) ───────────────────────────────────────────
if (days >= 30) {
  console.log('\nPartial tides, amplitude (cm) — 2-D model / port model:');
  const oldFit = fitPartials(PORTS, eph, k0);
  const terms = [];
  for (const body of REPORT_BODIES) for (const [species, s] of REPORT_SPECIES) terms.push({ body, species, j: eph.names.indexOf(body), s });
  const header = terms.map(t => `${t.body.slice(0, 4)} ${t.species === 'diurnal' ? 'D' : 'SD'}`.padStart(10)).join('');
  console.log(`  ${''.padEnd(18)}${header}      F`);
  for (const p of probes) {
    const port = PORTS.find(q => q.id === p.id), site = makeSite(port.lat, port.lon);
    const fit = jointFit(p.h, eph, k0, terms, site);
    const amps = terms.map((t, n) => fit[n] * eqAmp(eph, k0, t, site));
    const o = terms.map(t => oldFit[p.id].find(r => r.body === t.body && r.species === t.species).amp);
    const F = (a, sp) => a.filter((_, n) => terms[n].species === 'diurnal').reduce((x, y) => x + y, 0) /
                         a.filter((_, n) => terms[n].species !== 'diurnal').reduce((x, y) => x + y, 0);
    console.log(`  ${p.name.padEnd(18)}${amps.map((a, n) => `${(100 * a).toFixed(0)}/${(100 * o[n]).toFixed(0)}`.padStart(10)).join('')}   ${F(amps).toFixed(2)}/${F(o).toFixed(2)}`);
  }
}

// Least-squares fit of y over [k0, n) to Σ (a·C + b·S) + const; returns gains |a+ib|.
function jointFit(y, eph, k0, terms, site) {
  const m = 2 * terms.length + 1;
  const AtA = Array.from({ length: m }, () => new Float64Array(m)), Aty = new Float64Array(m), row = new Float64Array(m);
  for (let k = k0; k < eph.n; k++) {
    const f = eph.frame(k);
    terms.forEach((t, n) => { row[2 * n] = component(f, t.j, site, t.s); row[2 * n + 1] = component(f, t.j, site, t.s, true); });
    row[m - 1] = 1;
    for (let a = 0; a < m; a++) { Aty[a] += row[a] * y[k]; for (let b = 0; b < m; b++) AtA[a][b] += row[a] * row[b]; }
  }
  const x = solve(AtA, Aty);
  return terms.map((_, n) => Math.hypot(x[2 * n], x[2 * n + 1]));
}

function eqAmp(eph, k0, t, site) {
  let s = 0;
  for (let k = k0; k < eph.n; k++) { const f = eph.frame(k); s += component(f, t.j, site, t.s) ** 2 + component(f, t.j, site, t.s, true) ** 2; }
  return Math.sqrt(s / (eph.n - k0));
}

function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
