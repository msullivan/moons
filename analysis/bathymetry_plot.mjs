// Render the invented bathymetry (ocean_grid.js) over the flat Qamis map.
//   node analysis/bathymetry_plot.mjs  → analysis/bathymetry.png
// Also prints a few depth statistics useful for tuning.

import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, readFileSync, statSync } from 'fs';
import { extname, join } from 'path';
import { buildOceanGrid, OCEAN, latToPy, lonToPx } from '../ocean_grid.js';
import { PORTS } from '../ports.js';

const ROOT = new URL('..', import.meta.url).pathname;
const mask = JSON.parse(readFileSync(join(ROOT, 'ocean_mask.json'), 'utf8'));
const g = buildOceanGrid(mask);

// ── statistics ─────────────────────────────────────────────────────────
const cellAt = (px, py) => g.mapCell(px, py);
const depthAt = (px, py) => g.depth[cellAt(px, py)];
console.log(`grid ${g.nx}×${g.ny} (${g.dx / 1000 | 0} km cells, ${g.pad} cells padding), ` +
            `${g.sea.reduce((a, b) => a + b, 0)} sea cells`);
let maxH = 0;
for (const h of g.depth) maxH = Math.max(maxH, h);
const c = Math.sqrt(9.81 * maxH);
console.log(`max depth ${maxH.toFixed(0)} m → wave speed ${c.toFixed(0)} m/s, CFL dt ≤ ${(g.dx / (c * Math.SQRT2)).toFixed(0)} s`);
console.log('\nCentral Sea axis (head → mouth):');
for (const py of [360, 420, 500, 580, 660, 740, 820, 900, 980]) {
  // widest-water mean across the row between the western land and Qamis
  let sum = 0, n = 0;
  for (let px = 90; px < 400; px += 6) { const h = depthAt(px, py); if (h) { sum += h; n++; } }
  console.log(`  py ${py}: mean ${(sum / n).toFixed(0)} m over ${(n * g.dx / 1000).toFixed(0)} km of water`);
}
console.log('\nPorts:');
for (const p of PORTS) {
  const px = lonToPx(p.lon), py = latToPy(p.lat);
  console.log(`  ${p.name.padEnd(18)} px ${px.toFixed(0)},${py.toFixed(0)}  depth ${depthAt(px, py).toFixed(0)} m`);
}

// ── render ─────────────────────────────────────────────────────────────
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.jpeg': 'image/jpeg' };
const server = createServer((req, res) => {
  if (req.url === '/blank') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>b</title>'); return; }
  const file = join(ROOT, new URL(req.url, 'http://localhost').pathname);
  try { statSync(file); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'text/plain' });
  createReadStream(file).pipe(res);
}).listen(0);
const port = await new Promise(r => server.once('listening', () => r(server.address().port)));

const ports = PORTS.map(p => ({ name: p.name.replace(/ \(.*\)/, ''), px: lonToPx(p.lon), py: latToPy(p.lat) }));
const regions = OCEAN.regions.map(r => ({ name: r.name, px: r.px }));
const gaps = g.gaps.map(gp => ({ name: gp.name, cells: gp.cells.map(k => [k % g.nx, Math.floor(k / g.nx)]) }));
for (const gp of g.gaps)
  console.log(`  gap ${gp.name}: ${gp.width} m × ${gp.depth} m (${(gp.area / 1e3).toFixed(0)}k m²), ${gp.length / 1000} km long, ` +
              `cells ${gp.cells.map(k => `(${k % g.nx},${Math.floor(k / g.nx)})`).join(' ↔ ')}`);

const browser = await chromium.launch();
const page = await browser.newPage();
const W = g.nx * g.cellPx, H = g.ny * g.cellPx, LEG = 150;
await page.setViewportSize({ width: W + LEG, height: H });
await page.goto(`http://localhost:${port}/blank`);
await page.setContent(`<body style="margin:0;background:#06060f"><canvas id=c width=${W + LEG} height=${H}></canvas></body>`);
await page.evaluate(async ({ nx, ny, cellPx, pad, depth, sea, ports, regions, gaps, base, coastDepth }) => {
  const img = new Image();
  img.src = `${base}/docket/map-nice-marked-flat.jpeg`;
  await img.decode();
  const W = nx * cellPx, H = ny * cellPx, ox = pad * cellPx, oy = pad * cellPx;
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  ctx.fillStyle = '#06060f'; ctx.fillRect(0, 0, cv.width, cv.height);

  // Colormap: log depth, coastDepth → 3000 m.
  const STOPS = [[0, [232, 246, 236]], [0.25, [150, 215, 190]], [0.45, [70, 170, 190]],
                 [0.65, [40, 110, 175]], [0.85, [30, 55, 140]], [1, [12, 22, 80]]];
  const lo = Math.log(coastDepth), hi = Math.log(3000);
  const color = h => {
    const t = Math.min(1, Math.max(0, (Math.log(h) - lo) / (hi - lo)));
    let k = 1; while (k < STOPS.length - 1 && STOPS[k][0] < t) k++;
    const [t0, c0] = STOPS[k - 1], [t1, c1] = STOPS[k], f = (t - t0) / (t1 - t0);
    return c0.map((v, i) => v + (c1[i] - v) * f);
  };

  // Base: paper-grey land everywhere (padding included), then the map.
  ctx.fillStyle = 'rgb(214,214,218)'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, ox, oy);

  // Depth layer at cell resolution, land filled from neighbouring sea so
  // the smoothed upscale doesn't bleed grey into the coast.
  const N = nx * ny, rgb = new Float32Array(3 * N), have = new Uint8Array(N);
  for (let k = 0; k < N; k++) if (sea[k]) { const c = color(depth[k]); rgb.set(c, 3 * k); have[k] = 1; }
  for (let it = 0; it < 4; it++) {
    const nh = have.slice();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; if (have[k]) continue;
      let s0 = 0, s1 = 0, s2 = 0, n = 0;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = i + a, y = j + b; if (x < 0 || y < 0 || x >= nx || y >= ny) continue;
        const m = y * nx + x; if (!have[m]) continue;
        s0 += rgb[3 * m]; s1 += rgb[3 * m + 1]; s2 += rgb[3 * m + 2]; n++;
      }
      if (n) { rgb[3 * k] = s0 / n; rgb[3 * k + 1] = s1 / n; rgb[3 * k + 2] = s2 / n; nh[k] = 1; }
    }
    have.set(nh);
  }
  const small = new OffscreenCanvas(nx, ny), sctx = small.getContext('2d');
  const sd = sctx.createImageData(nx, ny);
  for (let k = 0; k < N; k++) { sd.data[4 * k] = rgb[3 * k]; sd.data[4 * k + 1] = rgb[3 * k + 1]; sd.data[4 * k + 2] = rgb[3 * k + 2]; sd.data[4 * k + 3] = 255; }
  sctx.putImageData(sd, 0, 0);
  const layer = new OffscreenCanvas(W, H), lctx = layer.getContext('2d');
  lctx.imageSmoothingEnabled = true; lctx.imageSmoothingQuality = 'high';
  lctx.drawImage(small, 0, 0, W, H);

  // Sea mask at pixel resolution: the map's flat sea colour inside the map,
  // the cell mask in the padding.
  const mk = new OffscreenCanvas(W, H), mctx = mk.getContext('2d');
  const md = mctx.createImageData(W, H);
  const tmp = new OffscreenCanvas(img.width, img.height), tctx = tmp.getContext('2d');
  tctx.drawImage(img, 0, 0);
  const id = tctx.getImageData(0, 0, img.width, img.height).data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const mx = x - ox, my = y - oy;
    let a;
    if (mx >= 0 && my >= 0 && mx < img.width && my < img.height) {
      const q = 4 * (my * img.width + mx);
      const d = Math.hypot(id[q] - 214, id[q + 1] - 232, id[q + 2] - 246);
      // Only near sea cells: paper on land can match the sea colour too.
      const ci = Math.floor(x / cellPx), cj = Math.floor(y / cellPx);
      let near = 0;
      for (let b = -1; b <= 1 && !near; b++) for (let c = -1; c <= 1; c++)
        if (sea[(cj + b) * nx + ci + c]) { near = 1; break; }
      a = near * Math.min(1, Math.max(0, (26 - d) / 8));
    } else a = sea[Math.floor(y / cellPx) * nx + Math.floor(x / cellPx)];
    md.data[4 * (y * W + x) + 3] = 255 * a;
  }
  mctx.putImageData(md, 0, 0);
  lctx.globalCompositeOperation = 'destination-in';
  lctx.drawImage(mk, 0, 0);
  ctx.drawImage(layer, 0, 0);

  // Contours (marching squares on cell centres; land counts as 0 m).
  const LEVELS = [50, 100, 150, 200, 300, 500, 1000, 2000, 2500];   // not 3000: that is the flat deep-ocean floor itself
  ctx.lineWidth = 1;
  for (const L of LEVELS) {
    ctx.strokeStyle = L >= 1000 ? 'rgba(255,255,255,0.45)' : 'rgba(10,40,70,0.45)';
    if (L === 200 || L === 1000) ctx.lineWidth = 1.6; else ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i;
      const v = [depth[k], depth[k + 1], depth[k + nx + 1], depth[k + nx]];
      if (v.some(h => h === 0)) continue;       // skip squares touching land
      const pts = [];
      const corner = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let e = 0; e < 4; e++) {
        const a = v[e], b = v[(e + 1) % 4];
        if ((a < L) !== (b < L)) {
          const f = (L - a) / (b - a), [x0, y0] = corner[e], [x1, y1] = corner[(e + 1) % 4];
          pts.push([(i + 0.5 + x0 + (x1 - x0) * f) * cellPx, (j + 0.5 + y0 + (y1 - y0) * f) * cellPx]);
        }
      }
      for (let p = 0; p + 1 < pts.length; p += 2) { ctx.moveTo(...pts[p]); ctx.lineTo(...pts[p + 1]); }
    }
    ctx.stroke();
  }

  // Map edge.
  ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(40,40,60,0.7)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(ox, oy, img.width, img.height); ctx.setLineDash([]);

  ctx.font = '15px Courier New, monospace';
  const label = (txt, x, y, col = '#111') => {
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.strokeText(txt, x, y);
    ctx.fillStyle = col; ctx.fillText(txt, x, y);
  };
  for (const p of ports) {
    ctx.fillStyle = '#d0302a'; ctx.beginPath(); ctx.arc(ox + p.px, oy + p.py, 5, 0, 7); ctx.fill();
    label(p.name, ox + p.px + 8, oy + p.py - 6, '#8a1510');
  }
  ctx.font = '13px Courier New, monospace';
  for (const r of regions) {
    const x = ox + r.px[0], y = oy + r.px[1];
    ctx.strokeStyle = '#ffdd55'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke();
    label(r.name, x + 9, y + 15, '#5a4500');
  }
  for (const gp of gaps) {
    const [[i0, j0], [i1, j1]] = gp.cells.map(([i, j]) => [(i + 0.5) * cellPx, (j + 0.5) * cellPx]);
    ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(i0, j0); ctx.lineTo(i1, j1); ctx.stroke();
    for (const [x, y] of [[i0, j0], [i1, j1]]) { ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); }
    label(gp.name, Math.max(i0, i1) + 10, (j0 + j1) / 2 - 4, '#a04000');
  }
  label('map edge', ox + 6, oy - 8, '#222');
  label('extra ocean (model only)', 10, 22, '#222');

  // Colorbar.
  const bx = W + 40, by = 60, bh = H - 160, bw = 26;
  for (let y = 0; y < bh; y++) {
    const t = y / (bh - 1), h = Math.exp(lo + (hi - lo) * t);
    ctx.fillStyle = `rgb(${color(h).map(Math.round).join(',')})`; ctx.fillRect(bx, by + y, bw, 1);
  }
  ctx.strokeStyle = 'rgba(200,220,255,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = 'rgba(200,225,255,0.9)'; ctx.font = '14px Courier New, monospace';
  ctx.fillText('depth', bx - 6, by - 24); ctx.fillText('(m)', bx, by - 8);
  for (const L of [15, 50, 100, 200, 500, 1000, 2000, 3000]) {
    const y = by + (Math.log(L) - lo) / (hi - lo) * (bh - 1);
    ctx.fillRect(bx + bw, y, 6, 1); ctx.fillText(String(L), bx + bw + 9, y + 5);
  }
}, { nx: g.nx, ny: g.ny, cellPx: g.cellPx, pad: g.pad, depth: Array.from(g.depth), sea: Array.from(g.sea),
     ports, regions, gaps, base: `http://localhost:${port}`, coastDepth: OCEAN.coastDepth });

const out = join(ROOT, 'analysis', 'bathymetry.png');
await page.screenshot({ path: out });
console.log(`\nplot → analysis/bathymetry.png`);
await browser.close();
server.close();
