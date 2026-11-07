// Diagnostics for a tide port (its fitted model from port_response.js).
//
//   node analysis/port_report.mjs <port|all> [YYYY-MM-DD] [days] [--plot]
//   node analysis/port_report.mjs kard 2253-02-01 365 --plot
//
// Prints:
//   - partial tides: gain, phase lag and amplitude of each body's diurnal
//     and semidiurnal response at the port (fitted from the model run)
//   - form number and dominant body
//   - range statistics, highest/lowest water, highs per day
// With --plot, writes analysis/ports/<id>.png: a 14-day trace of the total
// tide and each body's partial tide.  (tides.html shows the same results
// interactively.)

import { mkdirSync } from 'fs';
import { PORTS } from '../ports.js';
import { getPort, parseLocalDate, recordEphemeris, runPort, spinupSeconds, fitPartials,
         formNumber, portStats, REPORT_BODIES, DAY } from './tide_common.mjs';

const args = process.argv.slice(2);
const plot = args.includes('--plot');
const [id, dateArg = '2253-02-01', daysArg = '365'] = args.filter(a => !a.startsWith('--'));
if (!id) {
  console.error('usage: node analysis/port_report.mjs <port|all> [YYYY-MM-DD] [days] [--plot]');
  process.exit(1);
}
const ports = id === 'all' ? PORTS : [getPort(id)];
const COLORS = { Secundus: '#88CCAA', Tertius: '#CC9966', Quartus: '#CCCCCC', Sun: '#ffdd44' };
const fmt = (v, d = 2) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);

for (const port of ports) await report(port);

async function report(port) {
  const days = +daysArg;
  const t0 = parseLocalDate(dateArg, port.lon), t1 = t0 + days * DAY;
  const eph = recordEphemeris(t0 - spinupSeconds(), t1);
  const k0 = Math.round((t0 - eph.t0) / eph.dt);

  console.log(`\n══ ${port.name} (${port.id}) — ${port.lat}°, ${port.lon}° ══`);
  if (port.notes) console.log(port.notes);

  console.log('\nPartial tides (equilibrium amplitude at the port × gain; lag = time after the');
  console.log('body crosses the meridian that its partial tide peaks):');
  console.log('  body       species      period    eq amp     gain    amp      lag');
  const partials = fitPartials([port], eph, k0)[port.id];
  for (const p of partials)
    console.log(`  ${p.body.padEnd(10)} ${p.species.padEnd(11)} ${p.period_h.toFixed(2).padStart(6)} h ` +
                `${(p.eq_amp * 100).toFixed(1).padStart(6)} cm ${p.gain.toFixed(2).padStart(7)}× ` +
                `${(p.amp * 100).toFixed(1).padStart(6)} cm ${p.lag_h.toFixed(1).padStart(6)} h`);
  const { F, type } = formNumber(partials);
  const top = [...partials].sort((a, b) => b.amp - a.amp);
  console.log(`\nForm number (Σ diurnal / Σ semidiurnal amplitudes): ${F.toFixed(2)} → ${type.toLowerCase()}`);
  console.log(`Largest partials: ${top.slice(0, 3).map(p => `${p.body} ${p.species} ${(p.amp * 100).toFixed(0)} cm`).join(', ')}`);

  const h = runPort(port, eph);
  const st = portStats(port, eph, h, k0);
  console.log(`\nOver ${days} days from ${dateArg} (heights relative to MSL):`);
  console.log(`  highest ${fmt(st.highest)} m, lowest ${fmt(st.lowest)} m`);
  console.log(`  mean range ${st.meanRange.toFixed(2)} m between successive high/low waters`);
  console.log(`  daily range: neap-ish (10th pct) ${st.neap.toFixed(2)} m, median ${st.median.toFixed(2)} m, ` +
              `spring-ish (90th pct) ${st.spring.toFixed(2)} m`);
  console.log(`  high waters per day: ${st.highsPerDay.map((f, n) => f ? `${n}${n === 3 ? '+' : ''}: ${(100 * f).toFixed(0)}%` : null)
    .filter(Boolean).join(', ')}`);

  if (plot) await drawPlot(port, eph, k0, h, st.msl, partials);
}

// 14-day SVG trace → PNG via Playwright.
async function drawPlot(port, eph, k0, h, msl, partials) {
  const { chromium } = await import('playwright');
  const W = 1200, H = 520, P = { l: 60, r: 20, t: 40, b: 40 };
  const n = Math.min(eph.n - k0, Math.round(14 * DAY / eph.dt));
  const series = [{ y: h.subarray(k0, k0 + n).map(v => v - msl), color: '#ffffff', w: 2 }];
  for (const name of REPORT_BODIES) {
    const y = new Float64Array(n);
    for (const p of partials.filter(p => p.body === name)) for (let i = 0; i < n; i++) y[i] += p.y[k0 + i];
    const m = y.reduce((a, b) => a + b, 0) / n;
    series.push({ y: y.map(v => v - m), color: COLORS[name], w: 1, name });
  }
  const ymax = Math.max(0.5, ...series[0].y.map(Math.abs)) * 1.1;
  const X = i => P.l + i / (n - 1) * (W - P.l - P.r);
  const Y = v => P.t + (1 - (v + ymax) / (2 * ymax)) * (H - P.t - P.b);
  const step = Math.max(1, Math.floor(n / 1500));
  const path = s => { let d = ''; for (let i = 0; i < n; i += step) d += (d ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(s.y[i]).toFixed(1); return d; };
  let grid = '';
  const tick = ymax > 3 ? 1 : ymax > 1.2 ? 0.5 : 0.25;
  for (let v = -Math.floor(ymax / tick) * tick; v <= ymax; v += tick)
    grid += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v === 0 ? '#556' : '#223'}"/>` +
            `<text x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end">${v.toFixed(2)}</text>`;
  for (let d = 0; d <= 14; d++)
    grid += `<line y1="${P.t}" y2="${H - P.b}" x1="${X(d * DAY / eph.dt)}" x2="${X(d * DAY / eph.dt)}" stroke="#223"/>` +
            `<text x="${X(d * DAY / eph.dt)}" y="${H - P.b + 16}" text-anchor="middle">d${d}</text>`;
  const legend = series.slice(1).map((s, i) =>
    `<text x="${P.l + 10 + i * 110}" y="${P.t - 12}" fill="${s.color}">— ${s.name}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="monospace" font-size="12" fill="#8899cc">
    <rect width="100%" height="100%" fill="#0a0f20"/>${grid}
    ${series.slice(1).map(s => `<path d="${path(s)}" fill="none" stroke="${s.color}" stroke-opacity="0.6" stroke-width="${s.w}"/>`).join('')}
    <path d="${path(series[0])}" fill="none" stroke="#fff" stroke-width="2"/>
    ${legend}<text x="${W - P.r}" y="${P.t - 12}" text-anchor="end" fill="#fff">${port.name}: total (m, rel. MSL) — 14 days from ${dateArg}</text></svg>`;
  const dir = new URL('./ports/', import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  await page.screenshot({ path: `${dir}${port.id}.png` });
  await browser.close();
  console.log(`  plot → analysis/ports/${port.id}.png`);
}
