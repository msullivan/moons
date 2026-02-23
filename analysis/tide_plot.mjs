// Generate a tide chart image using Playwright + canvas.
// Run with: node analysis/tide_plot.mjs
// Output: /tmp/tide_plot.png

import { chromium } from 'playwright';

// Moon definitions — keep in sync with bodies.js / tide_sim.mjs
const M_MOON      = 7.342e22;
const LUNAR_DIST  = 3.844e8;
const AU          = 1.496e11;
const M_EARTH     = 5.972e24;
const R_EARTH     = 6.371e6;
const M_SUN       = 1.989e30;

const T_QAIA_H = 24;
const h_eq = (M, a) => (3/4) * (M / M_EARTH) * (R_EARTH / a)**3 * R_EARTH;

const bodies = [
  { name: 'Primus',   M: 0.02 * M_MOON, a: 0.12 * LUNAR_DIST, T_d: 1.14,   dir: -1, color: '#5588ff' },
  { name: 'Secundus', M: 0.04 * M_MOON, a: 0.24 * LUNAR_DIST, T_d: 3.23,   dir: -1, color: '#44bbaa' },
  { name: 'Tertius',  M: 0.25 * M_MOON, a: 0.45 * LUNAR_DIST, T_d: 8.29,   dir:  1, color: '#cc8844' },
  { name: 'Quartus',  M: 1.00 * M_MOON, a: 1.00 * LUNAR_DIST, T_d: 27.45,  dir:  1, color: '#aaaaaa' },
  { name: 'Sun',      M: M_SUN,          a: AU,                 T_d: 365.25, dir:  1, color: '#ffdd44' },
];

for (const b of bodies) {
  const T_orb_h = b.T_d * 24;
  b.T_syn_h  = T_QAIA_H * T_orb_h / (T_orb_h + T_QAIA_H * (-b.dir));
  b.T_tide_h = b.T_syn_h / 2;
  b.h        = h_eq(b.M, b.a);
}

const SIM_H = 720;
const dt = 0.25;
const times = [];
const combined = [];
const perBody = bodies.map(() => []);

for (let t = 0; t <= SIM_H; t += dt) {
  times.push(t / 24); // convert to days
  let total = 0;
  for (let i = 0; i < bodies.length; i++) {
    const v = bodies[i].h * Math.cos(2 * Math.PI * t / bodies[i].T_tide_h);
    perBody[i].push(v * 100); // cm
    total += v;
  }
  combined.push(total * 100);
}

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
const times   = ${JSON.stringify(times)};
const combined = ${JSON.stringify(combined)};
const perBody  = ${JSON.stringify(perBody)};
const bodies   = ${JSON.stringify(bodies.map(b => ({ name: b.name, color: b.color, h: b.h * 100 })))};

const W = 1200, H = 700;
const PAD = { top: 50, right: 30, bottom: 50, left: 70 };
const MID = 380; // y-split between panels

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

function drawPanel(x0, y0, w, h, tMin, tMax, label) {
  const yMax = 560, yMin = -560;

  // axes background
  ctx.fillStyle = '#0a0f20';
  ctx.fillRect(x0, y0, w, h);

  // grid lines
  ctx.strokeStyle = 'rgba(100,120,180,0.15)';
  ctx.lineWidth = 1;
  for (let y = -500; y <= 500; y += 100) {
    const py = y0 + h/2 - (y / (yMax - yMin)) * h * (yMax > 0 ? 1 : -1);
    const pyMapped = y0 + h * (1 - (y - yMin) / (yMax - yMin));
    ctx.beginPath(); ctx.moveTo(x0, pyMapped); ctx.lineTo(x0 + w, pyMapped); ctx.stroke();
  }
  for (let t = Math.ceil(tMin); t <= Math.floor(tMax); t++) {
    const px = x0 + (t - tMin) / (tMax - tMin) * w;
    ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, y0 + h); ctx.stroke();
  }

  // zero line
  ctx.strokeStyle = 'rgba(150,170,220,0.4)';
  ctx.lineWidth = 1;
  const py0 = y0 + h * (1 - (0 - yMin) / (yMax - yMin));
  ctx.beginPath(); ctx.moveTo(x0, py0); ctx.lineTo(x0 + w, py0); ctx.stroke();

  const toX = t => x0 + (t - tMin) / (tMax - tMin) * w;
  const toY = v => y0 + h * (1 - (v - yMin) / (yMax - yMin));

  // per-body contributions (faint)
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

  // combined line
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

  // border
  ctx.strokeStyle = 'rgba(100,140,200,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0, y0, w, h);

  // y-axis labels
  ctx.fillStyle = '#8899cc';
  ctx.font = '12px monospace';
  ctx.textAlign = 'right';
  for (let v = -500; v <= 500; v += 100) {
    const py = toY(v);
    if (py < y0 || py > y0 + h) continue;
    ctx.fillText((v >= 0 ? '+' : '') + v + 'cm', x0 - 6, py + 4);
  }

  // x-axis labels
  ctx.textAlign = 'center';
  for (let t = Math.ceil(tMin); t <= Math.floor(tMax); t++) {
    const step = (tMax - tMin) > 10 ? 5 : 1;
    if (t % step !== 0) continue;
    const px = toX(t);
    ctx.fillText('d' + t, px, y0 + h + 16);
  }

  // panel label
  ctx.fillStyle = '#aabbdd';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(label, x0 + 8, y0 + 18);
}

// title
ctx.fillStyle = '#ccd8ff';
ctx.font = 'bold 16px monospace';
ctx.textAlign = 'center';
ctx.fillText('Qaia equilibrium tide — combined (white) and per-body contributions', W/2, 28);

const PL = PAD.left, PR = PAD.right, PT = PAD.top, PB = PAD.bottom;
const panelW = W - PL - PR;

// top panel: 30 days
drawPanel(PL, PT, panelW, MID - PT - 10, 0, 30, '30-day overview');

// bottom panel: first 4 days
drawPanel(PL, MID + 10, panelW, H - MID - 10 - PB, 0, 4, 'First 4 days (detail)');

// legend
const lx = PL + 10, ly = H - PB + 8;
ctx.font = '11px monospace';
ctx.textAlign = 'left';
let loff = 0;
for (const b of bodies) {
  ctx.fillStyle = b.color;
  ctx.fillRect(lx + loff, ly, 18, 3);
  ctx.fillStyle = b.color + 'cc';
  ctx.fillText(b.name + ' ±' + Math.round(b.h) + 'cm', lx + loff + 22, ly + 8);
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
const outPath = new URL('../analysis/tide_plot.png', import.meta.url).pathname;
await page.screenshot({ path: outPath });
await browser.close();
console.log('Written to', outPath);
