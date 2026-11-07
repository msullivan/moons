// tidemap.html: draws the 2-D tide model (tidemap_worker.js) over the flat map.

import { localTime, zoneName } from './tide_analysis.js';

const MAP_SRC = 'docket/map-nice-marked-flat.jpeg';
const FLAT = [214, 232, 246];                  // the flat map's sea colour
// Lettering in the water (map px): letters stay drawn on top of the tide.
const LETTERING = [[745, 1128, 1075, 1240], [96, 372, 198, 390], [230, 812, 264, 830]];
const QARINGIL_LON = 29.71;
const SPIN_DAYS = 3;
const HIST_H = 48;
const SCALES = {
  eta: { label: 'Water level (m)', options: [1, 2, 3, 5], def: 2, signed: true },
  speed: { label: 'Current speed (m/s)', options: [0.5, 1, 2, 4], def: 1, signed: false },
};
// Diverging (low blue → white → high red) and sequential palettes.
const DIVERGING = [[-1, [33, 72, 150]], [-0.5, [103, 158, 214]], [0, [244, 241, 234]], [0.5, [240, 160, 92]], [1, [168, 46, 38]]];
const SEQUENTIAL = [[0, [244, 241, 234]], [0.25, [160, 214, 196]], [0.5, [70, 150, 186]], [0.75, [52, 74, 150]], [1, [40, 20, 80]]];

const $ = id => document.getElementById(id);
const canvas = $('map'), ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const state = {
  info: null, img: null, mask: null, fill: null, small: null, smallCtx: null, smallImg: null, layer: null, layerCtx: null,
  run: 0, ready: false, playing: false, inFlight: false, lastReq: 0,
  speed: 2, show: 'eta', scale: 2, probe: null, probeSeries: { t: [], h: [] },
  frame: null, prevPorts: null, rate: null, lut: null,
};

// ── worker ──────────────────────────────────────────────────────────────
const worker = new Worker('tidemap_worker.js', { type: 'module' });
worker.onmessage = ({ data: m }) => {
  if (m.type === 'init') return onInit(m.info);
  if (m.run !== state.run) return;                    // a run we've abandoned
  if (m.type === 'progress') return showOverlay(m.text, m.frac);
  if (m.type === 'error') { state.inFlight = false; return showOverlay(m.message, null, true); }
  if (m.type === 'probe') {
    if (m.cell === state.probe?.cell) state.probeSeries = { t: Array.from(m.series.t), h: Array.from(m.series.h) };
    return drawProbe();
  }
  if (m.type === 'frame') return onFrame(m);
};
worker.onerror = e => showOverlay(`Worker failed: ${e.message}`, null, true);

function showOverlay(text, frac, error = false) {
  $('overlay').hidden = false;
  $('overlay-msg').textContent = text;
  $('overlay-msg').classList.toggle('error', error);
  $('overlay-bar').parentElement.hidden = frac == null;
  if (frac != null) $('overlay-bar').style.width = `${(100 * frac).toFixed(1)}%`;
}

// ── setup ───────────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
if (params.get('date')) $('date').value = params.get('date');

const imgReady = new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = () => rej(new Error(`could not load ${MAP_SRC}`));
  img.src = MAP_SRC;
});
worker.postMessage({ type: 'init' });

async function onInit(info) {
  state.info = info;
  try { state.img = await imgReady; } catch (e) { return showOverlay(e.message, null, true); }
  buildMask();
  buildFill();
  const { mapW, mapH } = info;
  state.small = new OffscreenCanvas(mapW, mapH);
  state.smallCtx = state.small.getContext('2d');
  state.smallImg = state.smallCtx.createImageData(mapW, mapH);
  state.layer = new OffscreenCanvas(W, H);
  state.layerCtx = state.layer.getContext('2d');
  buildPortsTable();
  setScaleOptions();
  ctx.drawImage(state.img, 0, 0);
  const q = info.ports.find(p => p.id === 'qaringil');
  setProbe(q.cell, q.name);
  start();
}

// Pixel-resolution sea mask from the map's flat sea colour, limited to pixels
// near sea cells (paper on land can match the colour).  Inside lettering
// boxes the tolerance is looser so the letters' halos fill in.
function buildMask() {
  const { mapW, mapH, cellPx, sea } = state.info;
  const tmp = new OffscreenCanvas(W, H), t = tmp.getContext('2d');
  t.drawImage(state.img, 0, 0);
  const src = t.getImageData(0, 0, W, H).data;
  const out = t.createImageData(W, H), d = out.data;
  const inLetters = (x, y) => LETTERING.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
  for (let y = 0; y < H; y++) {
    const cj = Math.floor(y / cellPx);
    for (let x = 0; x < W; x++) {
      const ci = Math.floor(x / cellPx);
      let near = 0;
      for (let b = -1; b <= 1 && !near; b++) for (let c = -1; c <= 1; c++) {
        const i = ci + c, j = cj + b;
        if (i >= 0 && j >= 0 && i < mapW && j < mapH && sea[j * mapW + i]) { near = 1; break; }
      }
      if (!near) continue;
      const q = 4 * (y * W + x);
      const dist = Math.hypot(src[q] - FLAT[0], src[q + 1] - FLAT[1], src[q + 2] - FLAT[2]);
      const a = inLetters(x, y) ? (70 - dist) / 25 : (26 - dist) / 8;
      d[q + 3] = 255 * Math.min(1, Math.max(0, a));
    }
  }
  t.putImageData(out, 0, 0);
  state.mask = tmp;
}

// Each land cell takes its value from the nearest sea cell (multi-source BFS),
// so the smoothed upscale doesn't bleed land colour into the coast.
function buildFill() {
  const { mapW, mapH, sea } = state.info, N = mapW * mapH;
  const fill = new Int32Array(N).fill(-1), queue = new Int32Array(N);
  let head = 0, tail = 0;
  for (let m = 0; m < N; m++) if (sea[m]) { fill[m] = m; queue[tail++] = m; }
  while (head < tail) {
    const m = queue[head++], i = m % mapW, j = (m - i) / mapW;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = i + a, y = j + b;
      if (x < 0 || y < 0 || x >= mapW || y >= mapH) continue;
      const n = y * mapW + x;
      if (fill[n] < 0) { fill[n] = fill[m]; queue[tail++] = n; }
    }
  }
  state.fill = fill;
}

// ── controls ────────────────────────────────────────────────────────────
function setScaleOptions() {
  const s = SCALES[state.show];
  $('scale').innerHTML = s.options.map(v => `<option value="${v}"${v === s.def ? ' selected' : ''}>${s.signed ? '±' : '0–'}${v}</option>`).join('');
  state.scale = s.def;
  buildLut();
}

function buildLut() {
  const stops = SCALES[state.show].signed ? DIVERGING : SEQUENTIAL;
  const lut = new Uint8Array(256 * 3);
  for (let n = 0; n < 256; n++) {
    const t = SCALES[state.show].signed ? n / 127.5 - 1 : n / 255;
    let k = 1; while (k < stops.length - 1 && stops[k][0] < t) k++;
    const [t0, c0] = stops[k - 1], [t1, c1] = stops[k], f = (t - t0) / (t1 - t0);
    for (let c = 0; c < 3; c++) lut[3 * n + c] = Math.round(c0[c] + (c1[c] - c0[c]) * f);
  }
  state.lut = lut;
  drawColorbar();
}

function drawColorbar() {
  const cb = $('colorbar'), c = cb.getContext('2d'), s = SCALES[state.show];
  for (let x = 0; x < cb.width; x++) {
    const n = Math.round(255 * x / (cb.width - 1));
    c.fillStyle = `rgb(${state.lut[3 * n]},${state.lut[3 * n + 1]},${state.lut[3 * n + 2]})`;
    c.fillRect(x, 0, 1, cb.height);
  }
  const ticks = s.signed ? [-1, -0.5, 0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
  $('colorbar-ticks').innerHTML = ticks.map(t => {
    const frac = s.signed ? (t + 1) / 2 : t, v = t * state.scale;
    return `<span style="left:${(100 * frac).toFixed(1)}%">${s.signed && v > 0 ? '+' : ''}${+v.toFixed(2)}</span>`;
  }).join('');
  $('colorbar-title').textContent = s.label;
}

$('play').onclick = () => {
  state.playing = !state.playing;
  $('play').textContent = state.playing ? 'Pause' : 'Play';
  state.lastReq = performance.now();
  state.lastFrameWall = null; state.rate = null;
};
$('speed').onchange = e => { state.speed = +e.target.value; };
$('layer').onchange = e => { state.show = e.target.value; setScaleOptions(); requestFrame(0); };
$('scale').onchange = e => { state.scale = +e.target.value; drawColorbar(); if (state.frame) render(state.frame); };
$('date').onchange = () => start();

function start() {
  const date = $('date').value;
  if (!date) return;
  params.set('date', date);
  history.replaceState(null, '', `?${params}`);
  state.run++;
  state.ready = false; state.inFlight = true; state.rate = null;
  state.probeSeries = { t: [], h: [] };
  $('play').disabled = true;
  showOverlay('Starting…', 0);
  worker.postMessage({ type: 'start', run: state.run, date, spinDays: SPIN_DAYS });
}

function requestFrame(seconds) {
  if (!state.ready || state.inFlight) return;
  state.inFlight = true;
  state.lastReq = performance.now();
  worker.postMessage({ type: 'step', run: state.run, seconds, probe: state.probe?.cell ?? null, layer: state.show });
}

// Playback: each request asks for the sim time that has elapsed at the chosen
// speed, capped at a quarter second's worth so a slow machine plays smoothly
// (just slower) instead of jumping.
function tick(now) {
  requestAnimationFrame(tick);
  if (!state.playing || !state.ready || state.inFlight) return;
  const want = state.speed * 3600;
  const seconds = Math.min(want * (now - state.lastReq) / 1000, want / 4);
  if (seconds >= 360) requestFrame(seconds);
}
requestAnimationFrame(tick);

// ── frames ──────────────────────────────────────────────────────────────
function onFrame(m) {
  const first = !state.ready;
  state.inFlight = false;
  if (first) {
    state.ready = true;
    $('overlay').hidden = true;
    $('play').disabled = false;
    if (state.probe) worker.postMessage({ type: 'probe', run: state.run, cell: state.probe.cell });
  }
  // Achieved playback rate: sim hours per wall-clock second between frames.
  const nowWall = performance.now();
  if (state.frame && !first && state.playing && state.lastFrameWall) {
    const r = (m.t - state.frame.t) / 3600 / Math.max((nowWall - state.lastFrameWall) / 1000, 1e-3);
    if (m.t > state.frame.t) state.rate = state.rate == null ? r : 0.85 * state.rate + 0.15 * r;
  }
  state.lastFrameWall = nowWall;
  if (m.probe && m.probe.cell === state.probe?.cell) {
    const s = state.probeSeries;
    if (!s.t.length || m.t > s.t[s.t.length - 1]) { s.t.push(m.t); s.h.push(m.probe.h); }
    while (s.t.length && s.t[0] < m.t - HIST_H * 3600) { s.t.shift(); s.h.shift(); }
  }
  state.prevPorts = state.frame?.ports ?? null;
  state.frame = m;
  render(m);
  updatePanel(m);
  drawProbe();
}

function render(m) {
  const { mapW, mapH, cellPx } = state.info, N = mapW * mapH;
  const px = state.smallImg.data, lut = state.lut, fill = state.fill, f = m.field;
  const signed = m.layer !== 'speed', sc = state.scale;
  for (let k = 0; k < N; k++) {
    const v = f[fill[k]];
    let n = signed ? Math.round(127.5 + 127.5 * v / sc) : Math.round(255 * v / sc);
    n = n < 0 ? 0 : n > 255 ? 255 : n;
    px[4 * k] = lut[3 * n]; px[4 * k + 1] = lut[3 * n + 1]; px[4 * k + 2] = lut[3 * n + 2]; px[4 * k + 3] = 255;
  }
  state.smallCtx.putImageData(state.smallImg, 0, 0);
  const lc = state.layerCtx;
  lc.globalCompositeOperation = 'copy';
  lc.imageSmoothingEnabled = true; lc.imageSmoothingQuality = 'high';
  lc.drawImage(state.small, 0, 0, mapW * cellPx, mapH * cellPx);
  lc.globalCompositeOperation = 'destination-in';
  lc.drawImage(state.mask, 0, 0);

  ctx.globalAlpha = 1;
  ctx.drawImage(state.img, 0, 0);
  ctx.globalAlpha = 0.92;
  ctx.drawImage(state.layer, 0, 0);
  ctx.globalAlpha = 1;
  drawMarkers(m);
}

function drawMarkers(m) {
  const { ports, gaps } = state.info;
  ctx.font = 'bold 22px Courier New, monospace';
  ctx.lineJoin = 'round';
  const label = (txt, x, y, color) => {
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText(txt, x, y);
    ctx.fillStyle = color; ctx.fillText(txt, x, y);
  };
  // Port levels in small dark pills, so they don't read as map labels.
  ctx.font = 'bold 20px Courier New, monospace';
  ports.forEach((p, n) => {
    const h = m.ports[n], txt = `${h >= 0 ? '+' : '−'}${Math.abs(h).toFixed(2)} m`;
    const tw = ctx.measureText(txt).width, x = p.px + 9, y = p.py + 8;
    ctx.fillStyle = '#1b1b2a'; ctx.beginPath(); ctx.arc(p.px, p.py, 6, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(16, 20, 40, 0.82)';
    ctx.beginPath(); ctx.roundRect(x, y, tw + 12, 26, 6); ctx.fill();
    ctx.fillStyle = h >= 0 ? '#ffc9a6' : '#b9d6ff'; ctx.fillText(txt, x + 6, y + 19);
  });
  gaps.forEach((g, n) => {
    const [[x0, y0], [x1, y1]] = g.ends, u = m.gaps[n];
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, len = Math.min(26, 6 + 5 * Math.abs(u));
    const dir = Math.sign(u) || 1;                    // + = north → south
    ctx.strokeStyle = '#d4471a'; ctx.fillStyle = '#d4471a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx, cy - dir * len); ctx.lineTo(cx, cy + dir * len); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy + dir * (len + 8)); ctx.lineTo(cx - 7, cy + dir * len); ctx.lineTo(cx + 7, cy + dir * len); ctx.fill();
  });
  if (state.probe && !state.probe.port) {
    const { x, y } = state.probe;
    ctx.strokeStyle = '#1b1b2a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.moveTo(x - 18, y); ctx.lineTo(x - 6, y); ctx.moveTo(x + 6, y); ctx.lineTo(x + 18, y);
    ctx.moveTo(x, y - 18); ctx.lineTo(x, y - 6); ctx.moveTo(x, y + 6); ctx.lineTo(x, y + 18); ctx.stroke();
  }
}

// ── side panel ──────────────────────────────────────────────────────────
function buildPortsTable() {
  $('ports').innerHTML = state.info.ports.map((p, n) =>
    `<tr data-n="${n}"><td>${p.name}</td><td class="num" id="port-${n}">—</td><td id="trend-${n}"></td></tr>`).join('');
  $('ports').onclick = e => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const p = state.info.ports[+tr.dataset.n];
    setProbe(p.cell, p.name, true);
  };
}

function updatePanel(m) {
  const lt = localTime(m.t, QARINGIL_LON);
  $('clock').innerHTML = `${lt.date.replace(' AD', '')} ${lt.clock} <small>${zoneName(QARINGIL_LON)} (Qaringil)</small>`;
  $('rate').textContent = state.playing && state.rate != null ? `running at ${state.rate.toFixed(1)} sim hours per second` : (state.playing ? '' : 'paused');
  state.info.ports.forEach((p, n) => {
    const h = m.ports[n];
    $(`port-${n}`).textContent = `${h >= 0 ? '+' : '−'}${Math.abs(h).toFixed(2)} m`;
    const prev = state.prevPorts?.[n];
    const el = $(`trend-${n}`);
    if (prev == null || Math.abs(h - prev) < 0.003) { el.textContent = ''; el.className = ''; }
    else { el.textContent = h > prev ? '▲ rising' : '▼ falling'; el.className = h > prev ? 'up' : 'down'; }
  });
  for (const tr of $('ports').children) tr.classList.toggle('sel', state.info.ports[+tr.dataset.n].cell === state.probe?.cell);
  const u = m.gaps[0], g = state.info.gaps[0];
  $('gap').innerHTML = `<b class="clock" style="font-size:15px">${Math.abs(u).toFixed(1)} m/s</b> (${(Math.abs(u) * 1.944).toFixed(1)} kn) ` +
    `${Math.abs(u) < 0.2 ? 'near slack' : u > 0 ? 'southward, into the Central Sea' : 'northward, out of the Central Sea'}` +
    `<br><span class="muted">${(Math.abs(u) * g.width * g.depth / 1000).toFixed(0)}k m³/s</span>`;
}

function setProbe(cell, name, port = false) {
  const { mapW, cellPx } = state.info;
  const i = cell % mapW, j = Math.floor(cell / mapW);
  state.probe = { cell, name, port: port || state.info.ports.some(p => p.cell === cell && p.name === name),
                  x: (i + 0.5) * cellPx, y: (j + 0.5) * cellPx };
  state.probeSeries = { t: [], h: [] };
  $('probe-title').textContent = `${name}: last ${HIST_H} hours`;
  if (state.ready) worker.postMessage({ type: 'probe', run: state.run, cell });
  if (state.frame) { render(state.frame); updatePanel(state.frame); }
  drawProbe();
}

canvas.addEventListener('click', e => {
  if (!state.info) return;
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
  const { mapW, mapH, cellPx, sea, depth } = state.info;
  const i = Math.floor(x / cellPx), j = Math.floor(y / cellPx);
  if (i < 0 || j < 0 || i >= mapW || j >= mapH) return;
  const cell = j * mapW + i;
  if (!sea[cell]) return;
  const port = state.info.ports.find(p => p.cell === cell);
  setProbe(cell, port ? port.name : `Sea (${depth[cell].toFixed(0)} m deep)`, !!port);
});

function drawProbe() {
  const el = $('probe-chart'), s = state.probeSeries, m = state.frame;
  if (!m || s.t.length < 2) { el.innerHTML = '<p class="muted" style="font-size:12px">Collecting…</p>'; return; }
  const Wc = 310, Hc = 150, L = 34, R = 6, T = 8, B = 20;
  const t1 = m.t, t0 = t1 - HIST_H * 3600;
  let lim = 0.5;
  for (const h of s.h) lim = Math.max(lim, Math.abs(h));
  lim = Math.ceil(lim * 2) / 2;
  const X = t => L + (Wc - L - R) * (t - t0) / (t1 - t0), Y = h => T + (Hc - T - B) * (0.5 - h / (2 * lim));
  const pts = s.t.map((t, n) => `${X(Math.max(t0, t)).toFixed(1)},${Y(s.h[n]).toFixed(1)}`).join(' ');
  let g = '';
  for (const v of [-lim, -lim / 2, 0, lim / 2, lim])
    g += `<line class="${v ? 'grid' : 'zero'}" x1="${L}" x2="${Wc - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 4}" y="${Y(v) + 3}" text-anchor="end">${v > 0 ? '+' : ''}${v}</text>`;
  for (const hAgo of [48, 36, 24, 12, 0])
    g += `<text x="${X(t1 - hAgo * 3600)}" y="${Hc - 6}" text-anchor="middle">${hAgo ? `−${hAgo}h` : 'now'}</text>`;
  const last = s.h[s.h.length - 1];
  el.innerHTML = `<svg viewBox="0 0 ${Wc} ${Hc}" role="img" aria-label="Water level over the last ${HIST_H} hours">${g}` +
    `<polyline class="line" points="${pts}"/><circle class="now" cx="${X(s.t[s.t.length - 1])}" cy="${Y(last)}" r="3.5"/></svg>`;
}
