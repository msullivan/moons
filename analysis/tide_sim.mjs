// Compute tidal periods, simulate tide heights, and render a chart for Qaia.
// Run with: node analysis/tide_sim.mjs
// Re-run after changing any moon parameters in bodies.js.
//
// Assumes Qaia has a 24-hour solar day (matching Earth).
// Equilibrium tide half-amplitude formula: h = (3/4) * (M/M_planet) * (R_planet/a)^3 * R_planet
// Validated against Earth-Moon system (gives ~0.27 m, matching theory).

import { chromium } from 'playwright';
import { M_MOON, LUNAR_DIST, AU, M_EARTH, R_EARTH, M_SUN } from '../bodies.js';

const T_QAIA_H = 24; // Qaia solar day in hours (matches Earth)

const h_eq = (M, a) => (3/4) * (M / M_EARTH) * (R_EARTH / a)**3 * R_EARTH;

// Moon definitions — keep in sync with bodies.js
// Primus is omitted: as a geosynchronous moon it creates a permanent static tidal bulge,
// not an oscillating tide. It does not contribute to the daily tidal cycle.
const bodies = [
  { name: 'Secundus', M: 0.04 * M_MOON, a: 0.30 * LUNAR_DIST, T_d: 4.51,   dir: -1, color: '#44bbaa' },
  { name: 'Tertius',  M: 0.25 * M_MOON, a: 0.45 * LUNAR_DIST, T_d: 8.29,   dir:  1, color: '#cc8844' },
  { name: 'Quartus',  M: 1.00 * M_MOON, a: 1.00 * LUNAR_DIST, T_d: 27.45,  dir:  1, color: '#aaaaaa' },
  { name: 'Sun',      M: M_SUN,          a: AU,                 T_d: 365.25, dir:  1, color: '#ffdd44' },
];

// Tidal period as experienced on Qaia's surface.
// Prograde:   T_synodic = T_day * T_orb / (T_orb - T_day)
// Retrograde: T_synodic = T_day * T_orb / (T_orb + T_day)  (frequencies add)
// Tidal (semi-diurnal) period = T_synodic / 2
for (const b of bodies) {
  const T_orb_h = b.T_d * 24;
  b.T_syn_h  = T_QAIA_H * T_orb_h / (T_orb_h + T_QAIA_H * (-b.dir));
  b.T_tide_h = b.T_syn_h / 2;
  b.h        = h_eq(b.M, b.a);
}

console.log('=== Tidal periods and equilibrium amplitudes ===');
for (const b of bodies) {
  console.log(`  ${b.name.padEnd(10)} tidal ${b.T_tide_h.toFixed(2).padStart(6)}h  synodic ${b.T_syn_h.toFixed(2).padStart(6)}h  amp ±${(b.h*100).toFixed(0).padStart(4)}cm`);
}

console.log('\n=== Spring/neap beat periods ===');
const pairs = [
  ['Secundus', 'Tertius'],
  ['Secundus', 'Quartus'],
  ['Tertius', 'Quartus'],
  ['Quartus', 'Sun'],
];
for (const [n1, n2] of pairs) {
  const b1 = bodies.find(b => b.name === n1);
  const b2 = bodies.find(b => b.name === n2);
  const beat_h = 1 / Math.abs(1/b1.T_tide_h - 1/b2.T_tide_h);
  console.log(`  ${n1} + ${n2}: beat every ${beat_h.toFixed(1)}h = ${(beat_h/24).toFixed(2)} days`);
}

// ── simulation ───────────────────────────────────────────────────────────────
const SIM_H = 720; // 30 days
const dt    = 0.25;

let maxH = -Infinity, minH = Infinity;
const times    = [];
const combined = [];
const perBody  = bodies.map(() => []);

for (let t = 0; t <= SIM_H; t += dt) {
  times.push(t / 24); // days
  let total = 0;
  for (let i = 0; i < bodies.length; i++) {
    const v = bodies[i].h * Math.cos(2*Math.PI * t / bodies[i].T_tide_h);
    perBody[i].push(v * 100); // cm
    total += v;
  }
  const hCm = total * 100;
  combined.push(hCm);
  if (hCm > maxH) maxH = hCm;
  if (hCm < minH) minH = hCm;
}

console.log(`\n=== ${SIM_H/24}-day tide simulation (all moons at opposition, t=0) ===`);
console.log(`  Overall range: ${minH.toFixed(0)} cm to +${maxH.toFixed(0)} cm`);
console.log(`  Max single-cycle swing: ${(maxH-minH).toFixed(0)} cm`);
console.log('\n  t(h)   tide');
for (let i = 0; i < times.length; i += 4) { // 1h steps
  const t = times[i] * 24;
  const h = combined[i];
  const bar = '█'.repeat(Math.round((h - minH) / (maxH - minH) * 30));
  const hStr = (h >= 0 ? '+' : '') + h.toFixed(0);
  console.log(`  ${t.toFixed(0).padStart(4)}h  ${hStr.padStart(6)}cm  ${bar}`);
}

// ── plot ─────────────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; background: #080c18; }
  canvas { display: block; }
</style>
</head>
<body>
<canvas id="c" width="1200" height="700"></canvas>
<script>
const times    = ${JSON.stringify(times)};
const combined = ${JSON.stringify(combined)};
const perBody  = ${JSON.stringify(perBody)};
const bodies   = ${JSON.stringify(bodies.map(b => ({ name: b.name, color: b.color, h: b.h * 100 })))};

const W = 1200, H = 700;
const PAD = { top: 50, right: 30, bottom: 50, left: 70 };
const MID = 380;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

function drawPanel(x0, y0, w, h, tMin, tMax, label) {
  const yMax = 175, yMin = -175;

  ctx.fillStyle = '#0a0f20';
  ctx.fillRect(x0, y0, w, h);

  ctx.strokeStyle = 'rgba(100,120,180,0.15)';
  ctx.lineWidth = 1;
  for (let y = -150; y <= 150; y += 50) {
    const pyMapped = y0 + h * (1 - (y - yMin) / (yMax - yMin));
    ctx.beginPath(); ctx.moveTo(x0, pyMapped); ctx.lineTo(x0 + w, pyMapped); ctx.stroke();
  }
  for (let t = Math.ceil(tMin); t <= Math.floor(tMax); t++) {
    const px = x0 + (t - tMin) / (tMax - tMin) * w;
    ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, y0 + h); ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(150,170,220,0.4)';
  ctx.lineWidth = 1;
  const py0 = y0 + h * (1 - (0 - yMin) / (yMax - yMin));
  ctx.beginPath(); ctx.moveTo(x0, py0); ctx.lineTo(x0 + w, py0); ctx.stroke();

  const toX = t => x0 + (t - tMin) / (tMax - tMin) * w;
  const toY = v => y0 + h * (1 - (v - yMin) / (yMax - yMin));

  for (let bi = 0; bi < bodies.length; bi++) {
    ctx.strokeStyle = bodies[bi].color + '55';
    ctx.lineWidth = 1;
    ctx.beginPath();
    let first = true;
    for (let i = 0; i < times.length; i++) {
      if (times[i] < tMin || times[i] > tMax) continue;
      const px = toX(times[i]), py = toY(perBody[bi][i]);
      first ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      first = false;
    }
    ctx.stroke();
  }

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  let first = true;
  for (let i = 0; i < times.length; i++) {
    if (times[i] < tMin || times[i] > tMax) continue;
    const px = toX(times[i]), py = toY(combined[i]);
    first ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    first = false;
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(100,140,200,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0, y0, w, h);

  ctx.fillStyle = '#8899cc';
  ctx.font = '12px monospace';
  ctx.textAlign = 'right';
  for (let v = -150; v <= 150; v += 50) {
    const py = toY(v);
    if (py < y0 || py > y0 + h) continue;
    ctx.fillText((v >= 0 ? '+' : '') + v + 'cm', x0 - 6, py + 4);
  }

  ctx.textAlign = 'center';
  for (let t = Math.ceil(tMin); t <= Math.floor(tMax); t++) {
    const step = (tMax - tMin) > 10 ? 5 : 1;
    if (t % step !== 0) continue;
    ctx.fillText('d' + t, toX(t), y0 + h + 16);
  }

  ctx.fillStyle = '#aabbdd';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(label, x0 + 8, y0 + 18);
}

ctx.fillStyle = '#ccd8ff';
ctx.font = 'bold 16px monospace';
ctx.textAlign = 'center';
ctx.fillText('Qaia equilibrium tide — combined (white) and per-body contributions', W/2, 28);

const PL = PAD.left, PR = PAD.right, PT = PAD.top, PB = PAD.bottom;
const panelW = W - PL - PR;
drawPanel(PL, PT,      panelW, MID - PT - 10,        0, 30, '30-day overview');
drawPanel(PL, MID + 10, panelW, H - MID - 10 - PB,  0,  4, 'First 4 days (detail)');

const lx = PL + 10, ly = H - PB + 8;
ctx.font = '11px monospace';
ctx.textAlign = 'left';
let loff = 0;
for (const b of bodies) {
  ctx.fillStyle = b.color;
  ctx.fillRect(lx + loff, ly, 18, 3);
  ctx.fillStyle = b.color + 'cc';
  ctx.fillText(b.name + ' \xb1' + Math.round(b.h) + 'cm', lx + loff + 22, ly + 8);
  loff += 145;
}
ctx.fillStyle = '#ffffff';
ctx.fillRect(lx + loff, ly, 18, 3);
ctx.fillStyle = '#ffffffcc';
ctx.fillText('combined', lx + loff + 22, ly + 8);
</script>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1200, height: 700 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => new Promise(r => setTimeout(r, 200)));
const outPath = new URL('tide_plot.png', import.meta.url).pathname;
await page.screenshot({ path: outPath });
await browser.close();
console.log('\nPlot written to', outPath);
