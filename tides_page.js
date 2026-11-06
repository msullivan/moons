// tides.html: controls, tide table and charts.  All computation happens in
// tides_worker.js; this module only draws.

import { PORTS, PORTS_BY_ID } from './ports.js';
import { MOON_PARAMS } from './bodies.js';

const BODIES = ['Secundus', 'Tertius', 'Quartus', 'Sun'];
const COLOR = Object.fromEntries(MOON_PARAMS.map(m => [m.name, m.color]));
COLOR.Sun = '#ffdd44';
const SP_COLOR = { diurnal: '#5fb4ff', semidiurnal: '#e58ad8' };
const TOTAL = 'rgba(220, 238, 255, 0.97)';
const NORTH = 'rgba(140, 170, 220, 0.55)';
const CURRENT = '#ff9f6b';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EPOCH_MS = Date.UTC(2053, 0, 1);

for (const sw of document.querySelectorAll('.sw-diurnal')) sw.style.background = SP_COLOR.diurnal;
for (const sw of document.querySelectorAll('.sw-semi')) sw.style.background = SP_COLOR.semidiurnal;

// ── formatting ─────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);
const dayDate = day => new Date(EPOCH_MS + day * 86400000);
const dayLabel = day => { const d = dayDate(day); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
const monthLabel = day => MONTHS[dayDate(day).getUTCMonth()];
const signed = (v, d = 2) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);
const axisNum = v => v === 0 ? '0' : signed(v, Number.isInteger(v) ? 0 : 1);
const clock = h => { const m = Math.round(((h % 24) + 24) % 24 * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

// ── SVG helpers ────────────────────────────────────────────────────────

const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
}
function text(parent, x, y, s, cls = 'tick', anchor = 'start', dy = '0.32em') {
  const t = svgEl('text', { x, y, class: cls, 'text-anchor': anchor, dy }, parent);
  t.textContent = s;
  return t;
}
function textWidth(svg, s, cls = 'tick') {
  const t = text(svg, 0, 0, s, cls); const w = t.getComputedTextLength(); t.remove(); return w;
}
function niceTicks(lo, hi, n = 5) {
  const step0 = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(step0)), err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
const scale = (d0, d1, r0, r1) => v => r0 + (v - d0) / (d1 - d0) * (r1 - r0);
function pathD(xs, ys, X, Y) {
  let d = '';
  for (let i = 0; i < xs.length; i++) d += (i ? 'L' : 'M') + X(xs[i]).toFixed(1) + ',' + Y(ys[i]).toFixed(1);
  return d;
}
function nearest(xs, v) {
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] < v) lo = m; else hi = m; }
  return v - xs[lo] < xs[hi] - v ? lo : hi;
}

// Tooltip box inside a chart container.
function makeTip(box) {
  const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; box.append(tip);
  return {
    show(head, rows, px, py, W) {
      tip.replaceChildren();
      const h = document.createElement('div'); h.className = 'head'; h.textContent = head; tip.append(h);
      for (const r of rows) {
        const row = document.createElement('div'); row.className = 'row';
        if (r.color) { const d = document.createElement('span'); d.className = 'dot'; d.style.background = r.color; row.append(d); }
        const n = document.createElement('span'); n.textContent = r.name;
        const v = document.createElement('span'); v.className = 'v'; v.textContent = r.value;
        row.append(n, v); tip.append(row);
      }
      tip.hidden = false;
      const sc = box.getBoundingClientRect().width / W;
      let left = px * sc + 14;
      if (left + tip.offsetWidth > box.clientWidth) left = px * sc - tip.offsetWidth - 14;
      tip.style.left = Math.max(0, left) + 'px';
      tip.style.top = (py != null ? py * sc + 6 : 4) + 'px';
    },
    hide() { tip.hidden = true; },
  };
}

// Redraw charts when their box changes width.
const drawers = new Map();
const ro = new ResizeObserver(entries => {
  for (const e of entries) {
    const d = drawers.get(e.target);
    if (d && Math.abs((d.w ?? 0) - e.contentRect.width) > 2) { d.w = e.contentRect.width; d.fn(); }
  }
});
function mount(box, fn) {
  drawers.set(box, { fn, w: box.clientWidth });
  ro.observe(box);
  fn();
}

// Generic line chart.  Every series shares series[0].xs (same sampling).
//   o = { height, x: {domain, ticks, fmt}, y: {domain, ticks?, fmt}, series: [{name, color, width, opacity, xs, ys}],
//         zero, refs: [{x, label}], markers: [{x, y, color}], tip: i => {head, rows} }
function lineChart(box, o) {
  const W = Math.max(300, box.clientWidth || 800), H = o.height;
  box.replaceChildren();
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}` }, box);
  const top = o.top ?? 10, bottom = 22;
  const yt = o.y.ticks ?? niceTicks(o.y.domain[0], o.y.domain[1], H < 220 ? 4 : 6);
  const ml = 8 + Math.max(...yt.map(t => textWidth(svg, o.y.fmt(t))));
  const mr = 12;
  const X = scale(o.x.domain[0], o.x.domain[1], ml, W - mr);
  const Y = scale(o.y.domain[0], o.y.domain[1], H - bottom, top);
  for (const t of yt) {
    svgEl('line', { x1: ml, x2: W - mr, y1: Y(t), y2: Y(t), class: t === 0 && o.zero ? 'zero' : 'gridline' }, svg);
    text(svg, ml - 6, Y(t), o.y.fmt(t), 'tick', 'end');
  }
  const xt = o.x.ticks(W);
  let lastRight = -Infinity;
  for (const t of xt) {
    const s = o.x.fmt(t), w = textWidth(svg, s), x = X(t);
    if (x - w / 2 < lastRight + 6 || x + w / 2 > W) continue;
    svgEl('line', { x1: x, x2: x, y1: top, y2: H - bottom, class: 'gridline' }, svg);
    text(svg, Math.max(ml + w / 2, x), H - 6, s, 'tick', 'middle', '0');
    lastRight = x + w / 2;
  }
  for (const r of o.refs ?? []) {
    const x = X(r.x);
    svgEl('line', { x1: x, x2: x, y1: top, y2: H - bottom, class: 'ref' }, svg);
    const anchor = x < ml + 50 ? 'start' : x > W - mr - 50 ? 'end' : 'middle';
    text(svg, x + (anchor === 'start' ? 4 : anchor === 'end' ? -4 : 0), top - 8, r.label, 'label', anchor, '0');
  }
  for (const s of o.series)
    svgEl('path', { d: pathD(s.xs, s.ys, X, Y), fill: 'none', stroke: s.color, 'stroke-width': s.width ?? 2,
                    'stroke-opacity': s.opacity ?? 1, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
  for (const m of o.markers ?? []) svgEl('circle', { cx: X(m.x), cy: Y(m.y), r: 2.6, fill: m.color }, svg);
  if (o.tip) {
    const tip = makeTip(box);
    const rule = svgEl('line', { y1: top, y2: H - bottom, class: 'rule', visibility: 'hidden' }, svg);
    const dots = svgEl('g', {}, svg);
    const xs = o.series[0].xs;
    const hit = svgEl('rect', { x: ml, y: 0, width: W - ml - mr, height: H, fill: 'transparent' }, svg);
    hit.addEventListener('pointermove', ev => {
      const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width;
      const xv = o.x.domain[0] + (px - ml) / (W - mr - ml) * (o.x.domain[1] - o.x.domain[0]);
      const i = nearest(xs, xv), cx = X(xs[i]);
      rule.setAttribute('x1', cx); rule.setAttribute('x2', cx); rule.setAttribute('visibility', 'visible');
      dots.replaceChildren();
      for (const s of o.series) svgEl('circle', { cx, cy: Y(s.ys[i]), r: 3, fill: s.color }, dots);
      const { head, rows } = o.tip(i);
      tip.show(head, rows, cx, null, W);
    });
    hit.addEventListener('pointerleave', () => { tip.hide(); rule.setAttribute('visibility', 'hidden'); dots.replaceChildren(); });
  }
}

// Day ticks for a series measured in hours from local midnight of startDay.
function dayTicks(startDay, hours) {
  return {
    domain: [0, hours],
    ticks: W => { const every = Math.max(1, Math.ceil((hours / 24) / (W / 70))); const t = []; for (let h = 0; h <= hours + 1e-6; h += 24 * every) t.push(h); return t; },
    fmt: h => dayLabel(startDay + Math.round(h / 24)),
  };
}

// ── workers ────────────────────────────────────────────────────────────

const newWorker = () => new Worker('tides_worker.js', { type: 'module' });
let winWorker = newWorker(), yearWorker = null;
let winId = 0, yearId = 0, yearDate = null;
let windowData = null, yearData = null;

function state() {
  return { port: $('port').value, date: $('date').value, days: +$('days').value };
}

function requestWindow() {
  const s = state(), id = ++winId;
  $('win-status').textContent = 'Computing…';
  $('win-status').classList.remove('error');
  winWorker.onmessage = ({ data }) => {
    if (data.id !== winId) return;
    if (data.kind === 'error') { $('win-status').textContent = data.message; $('win-status').classList.add('error'); return; }
    $('win-status').textContent = '';
    windowData = data.result;
    drawWindow();
    drawYearRange();
  };
  winWorker.postMessage({ id, kind: 'window', ...s });
  const url = new URL(location.href);
  url.searchParams.set('port', s.port); url.searchParams.set('date', s.date); url.searchParams.set('days', s.days);
  history.replaceState(null, '', url);
}

function requestYear() {
  const { date } = state();
  if (date === yearDate) return;
  yearDate = date;
  yearWorker?.terminate();
  yearWorker = newWorker();
  const id = ++yearId;
  $('year-title').textContent = `Year overview from ${dayLabel(dayOf(date))} ${date.slice(0, 4)}`;
  $('year-status').textContent = 'Starting…';
  $('year-status').classList.remove('error');
  yearWorker.onmessage = ({ data }) => {
    if (data.id !== yearId) return;
    if (data.kind === 'progress') { $('year-status').textContent = data.text; return; }
    if (data.kind === 'error') { $('year-status').textContent = data.message; $('year-status').classList.add('error'); return; }
    $('year-status').textContent = '';
    yearData = data.result;
    drawYear();
  };
  yearWorker.postMessage({ id, kind: 'year', date });
}

const dayOf = iso => Math.round((Date.parse(iso + 'T00:00:00Z') - EPOCH_MS) / 86400000);

// ── tide window ────────────────────────────────────────────────────────

function drawWindow() {
  const r = windowData, port = PORTS_BY_ID[r.port];
  const lat = `${Math.abs(port.lat).toFixed(2)}°${port.lat >= 0 ? 'N' : 'S'}`, lon = `${Math.abs(port.lon).toFixed(2)}°${port.lon >= 0 ? 'E' : 'W'}`;
  const info = $('portinfo');
  info.replaceChildren();
  const b = document.createElement('b'); b.textContent = `${port.name}, ${lat} ${lon}, times ${r.zone}. `;
  info.append(b, document.createTextNode(port.notes ?? ''));

  // Table: one row per local day.
  const table = $('tidetable');
  table.replaceChildren();
  const byDay = new Map();
  for (const e of r.extrema) { if (!byDay.has(e.day)) byDay.set(e.day, []); byDay.get(e.day).push(e); }
  const thead = table.createTHead().insertRow();
  for (const h of ['Date', `High and low water (${r.zone}, m)`]) { const th = document.createElement('th'); th.textContent = h; thead.append(th); }
  const tb = table.createTBody();
  for (const [, evs] of byDay) {
    const tr = tb.insertRow();
    const td0 = tr.insertCell(); td0.className = 'date'; td0.textContent = evs[0].date;
    const td1 = tr.insertCell();
    for (const e of evs) {
      const span = document.createElement('span'); span.className = `ev ${e.type}`;
      const t = document.createElement('b'); t.textContent = e.clock;
      const k = document.createElement('span'); k.className = 'kind'; k.textContent = ` ${e.type === 'H' ? 'High' : 'Low '} `;
      span.append(t, k, document.createTextNode(signed(e.h)));
      td1.append(span);
    }
  }

  mount($('win-chart'), () => {
    const show = $('show-bodies').checked, hours = r.hours[r.hours.length - 1];
    const xs = r.hours;
    const series = [];
    if (show) for (const name of BODIES) series.push({ name, color: COLOR[name], width: 1.2, opacity: 0.85, xs, ys: r.bodies[name] });
    series.push({ name: 'Total', color: TOTAL, width: 2, xs, ys: r.total });
    const all = show ? [r.total, ...BODIES.map(n => r.bodies[n])] : [r.total];
    const m = Math.max(...all.map(a => Math.max(...a.map(Math.abs)))) * 1.08;
    lineChart($('win-chart'), {
      height: 320, zero: true, x: dayTicks(r.startDay, hours),
      y: { domain: [-m, m], fmt: axisNum },
      series,
      markers: r.extrema.map(e => ({ x: e.hour, y: e.h, color: e.type === 'H' ? '#8fd0ff' : '#c9a0ff' })),
      tip: i => ({
        head: `${dayLabel(r.startDay + Math.floor(xs[i] / 24))} ${clock(xs[i])}`,
        rows: [...series].reverse().map(s => ({ color: s.color, name: s.name, value: signed(s.ys[i]) + ' m' })),
      }),
    });
  });
  // Legend swatches for the bodies.
  const legend = $('win-legend');
  legend.querySelectorAll('.body-sw').forEach(e => e.remove());
  if ($('show-bodies').checked)
    for (const name of BODIES) {
      const s = document.createElement('span'); s.className = 'body-sw';
      const i = document.createElement('i'); i.style.background = COLOR[name];
      s.append(i, document.createTextNode(name)); legend.insertBefore(s, legend.lastElementChild);
    }
}

// ── year overview ──────────────────────────────────────────────────────

function drawYear() {
  const r = yearData;
  // Summary table.
  const table = $('summary');
  table.replaceChildren();
  const cols = [['Port'], ['Model'], ['Tide type'], ['Form', 1], ['Neap', 1], ['Median', 1], ['Spring', 1],
                ['Highest', 1], ['Lowest', 1], ['≤1 HW', 1], ['2 HW', 1], ['3+ HW', 1]];
  const hr = table.createTHead().insertRow();
  for (const [h, num] of cols) { const th = document.createElement('th'); th.textContent = h; if (num) th.className = 'num'; hr.append(th); }
  const tb = table.createTBody();
  for (const p of r.summary) {
    const tr = tb.insertRow();
    const hp = p.highsPerDay, pc = f => (100 * f).toFixed(0) + '%';
    const vals = [p.name, p.model, p.type, p.F.toFixed(2), p.neap.toFixed(2) + ' m', p.median.toFixed(2) + ' m', p.spring.toFixed(2) + ' m',
                  signed(p.highest) + ' m', signed(p.lowest) + ' m', pc(hp[0] + hp[1]), pc(hp[2]), pc(hp[3])];
    vals.forEach((v, i) => { const td = tr.insertCell(); td.textContent = v; if (cols[i][1]) td.className = 'num'; });
  }

  mount($('multiples'), drawMultiples);
  mount($('drivers'), drawDrivers);
  mount($('profile'), drawProfile);
  drawYearRange();
  mount($('bridge-levels'), drawBridgeLevels);
  mount($('bridge-current'), drawBridgeCurrent);
}

function drawMultiples() {
  const r = yearData, box = $('multiples');
  const W = Math.max(300, box.clientWidth || 800), rowH = 92, H = r.summary.length * rowH + 22;
  box.replaceChildren();
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}` }, box);
  const ids = r.summary.map(p => p.id);
  const n = r.curves[ids[0]].length, step = r.curveStepHours;
  const xs = Float32Array.from({ length: n }, (_, i) => i * step);
  const m = Math.max(...ids.map(id => Math.max(...r.curves[id].map(Math.abs))));
  const ticks = [-Math.floor(m), 0, Math.floor(m)].filter((v, i, a) => a.indexOf(v) === i);
  const ml = 8 + Math.max(...ticks.map(t => textWidth(svg, axisNum(t))));
  const X = scale(0, xs[n - 1], ml, W - 12);
  const Ys = [];
  r.summary.forEach((p, k) => {
    const Y = scale(-m, m, k * rowH + rowH - 6, k * rowH + 20); Ys.push(Y);
    text(svg, ml, k * rowH + 10, p.name, 'label');
    for (const t of ticks) { svgEl('line', { x1: ml, x2: W - 12, y1: Y(t), y2: Y(t), class: t === 0 ? 'zero' : 'gridline' }, svg); text(svg, ml - 6, Y(t), axisNum(t), 'tick', 'end'); }
    svgEl('path', { d: pathD(xs, r.curves[p.id], X, Y), fill: 'none', stroke: TOTAL, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, svg);
  });
  const dt = dayTicks(r.startDay, xs[n - 1]);
  for (const t of dt.ticks(W)) text(svg, X(t), H - 4, dt.fmt(t), 'tick', 'middle', '0');
  const tip = makeTip(box);
  const rule = svgEl('line', { y1: 14, y2: H - 18, class: 'rule', visibility: 'hidden' }, svg);
  const dots = svgEl('g', {}, svg);
  const hit = svgEl('rect', { x: ml, y: 0, width: W - ml - 12, height: H, fill: 'transparent' }, svg);
  hit.addEventListener('pointermove', ev => {
    const b = svg.getBoundingClientRect(), px = (ev.clientX - b.left) * W / b.width;
    const i = nearest(xs, (px - ml) / (W - 12 - ml) * xs[n - 1]), cx = X(xs[i]);
    rule.setAttribute('x1', cx); rule.setAttribute('x2', cx); rule.setAttribute('visibility', 'visible');
    dots.replaceChildren();
    r.summary.forEach((p, k) => svgEl('circle', { cx, cy: Ys[k](r.curves[p.id][i]), r: 3, fill: TOTAL }, dots));
    tip.show(`${dayLabel(r.startDay + Math.floor(xs[i] / 24))} ${clock(xs[i])} PMT+2`,
             r.summary.map(p => ({ name: p.name, value: signed(r.curves[p.id][i]) + ' m' })), cx, null, W);
  });
  hit.addEventListener('pointerleave', () => { tip.hide(); rule.setAttribute('visibility', 'hidden'); dots.replaceChildren(); });
}

function drawDrivers() {
  const r = yearData, box = $('drivers');
  const W = Math.max(300, box.clientWidth || 500), rowH = 26, headH = 22, gap = 8;
  const H = r.summary.length * (headH + BODIES.length * rowH + gap) + 18;
  box.replaceChildren();
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}` }, box);
  const ml = 10 + Math.max(...BODIES.map(b => textWidth(svg, b)));
  const all = Object.values(r.partials).flat();
  const maxA = Math.max(...all.map(p => p.amp)) * 100;
  const X = scale(0, maxA, ml, W - 10 - textWidth(svg, '000 cm'));
  const tip = makeTip(box);
  let y = 0;
  for (const p of r.summary) {
    text(svg, 0, y + 12, p.name, 'label');
    y += headH;
    for (const body of BODIES) {
      const d = r.partials[p.id].find(q => q.body === body && q.species === 'diurnal');
      const s = r.partials[p.id].find(q => q.body === body && q.species === 'semidiurnal');
      text(svg, ml - 6, y + rowH / 2, body, 'tick', 'end');
      for (const [q, off] of [[d, 3], [s, 14]]) {
        svgEl('rect', { x: ml, y: y + off, height: 8, rx: 2, width: Math.max(1, X(q.amp * 100) - ml), fill: SP_COLOR[q.species] }, svg);
        text(svg, X(q.amp * 100) + 4, y + off + 4, `${(q.amp * 100).toFixed(0)} cm`, 'barval');
      }
      const yTop = y;
      const hit = svgEl('rect', { x: 0, y, width: W, height: rowH, fill: 'transparent' }, svg);
      hit.addEventListener('pointermove', () => tip.show(`${p.name} · ${body}`, [d, s].map(q => ({
        color: SP_COLOR[q.species], name: `${q.species === 'diurnal' ? 'once' : 'twice'}-daily ${q.period_h.toFixed(2)} h`,
        value: `${(q.amp * 100).toFixed(0)} cm · ${q.gain.toFixed(2)}× · lag ${q.lag_h.toFixed(1)} h`,
      })), ml, yTop + rowH, W));
      hit.addEventListener('pointerleave', () => tip.hide());
      y += rowH;
    }
    y += gap;
  }
  for (const t of niceTicks(0, maxA, W < 420 ? 3 : 5)) text(svg, X(t), H - 4, `${t} cm`, 'tick', 'middle', '0');
}

function drawProfile() {
  const r = yearData, b = r.basin;
  $('profile-note').textContent = `Typical tide amplitude from the isthmus (left) to the open mouth (right). The sea is ` +
    `${b.lengthKm.toFixed(0)} km long and ${b.depth} m deep, so it rings at ${b.fundamental.toFixed(1)} h, near the once-daily tides: ` +
    `those pile up at the closed head, while twice-daily tides nearly cancel mid-sea.`;
  const xs = r.profile.map(p => p.km);
  const series = [
    { name: 'once-daily', color: SP_COLOR.diurnal, xs, ys: r.profile.map(p => p.diurnal * 100) },
    { name: 'twice-daily', color: SP_COLOR.semidiurnal, xs, ys: r.profile.map(p => p.semidiurnal * 100) },
  ];
  const m = Math.max(...series.flatMap(s => s.ys)) * 1.1;
  lineChart($('profile'), {
    height: 300, top: 26,
    x: { domain: [0, b.lengthKm], ticks: W => niceTicks(0, b.lengthKm, W < 420 ? 3 : 6), fmt: v => `${v} km` },
    y: { domain: [0, m], fmt: v => `${v} cm` },
    refs: b.ports.map(p => ({ x: p.km, label: p.name })),
    series,
    tip: i => ({ head: `${xs[i].toFixed(0)} km from the isthmus`, rows: series.map(s => ({ color: s.color, name: s.name, value: `${s.ys[i].toFixed(0)} cm` })) }),
  });
}

function drawYearRange() {
  if (!yearData) return;
  const r = yearData, id = $('port').value, port = PORTS_BY_ID[id];
  $('yearrange-title').textContent = `Daily range through the year — ${port.name}`;
  const rows = r.daily[id];
  const xs = rows.map(d => d.day - r.startDay);
  const monthTicks = W => {
    const t = []; let last = -1;
    for (let d = 0; d <= 365; d++) { const mo = dayDate(r.startDay + d).getUTCMonth(); if (mo !== last && dayDate(r.startDay + d).getUTCDate() === 1) t.push(d); last = mo; }
    return W < 520 ? t.filter((_, i) => i % 3 === 0) : t;
  };
  const xAxis = { domain: [0, 365], ticks: monthTicks, fmt: d => monthLabel(r.startDay + d) };
  mount($('yearrange'), () => lineChart($('yearrange'), {
    height: 220, x: xAxis, y: { domain: [0, Math.max(...rows.map(d => d.range)) * 1.08], fmt: v => `${v} m` },
    series: [{ name: 'daily range', color: TOTAL, width: 1.4, xs, ys: rows.map(d => d.range) }],
    tip: i => ({ head: `${dayLabel(rows[i].day)} ${dayDate(rows[i].day).getUTCFullYear()}`,
                 rows: [{ name: 'daily range', value: `${rows[i].range.toFixed(2)} m` }, { name: 'high waters', value: String(rows[i].highs) }] }),
  }));
  const legend = $('decl-legend');
  legend.replaceChildren();
  for (const name of ['Tertius', 'Quartus', 'Sun']) {
    const s = document.createElement('span'); const i = document.createElement('i'); i.style.background = COLOR[name];
    s.append(i, document.createTextNode(name)); legend.append(s);
  }
  const dxs = r.decl.day.map(d => d - r.startDay);
  const dser = ['Tertius', 'Quartus', 'Sun'].map(name => ({ name, color: COLOR[name], width: name === 'Sun' ? 2 : 1.2, xs: dxs, ys: r.decl[name] }));
  const dm = Math.ceil(Math.max(...dser.flatMap(s => s.ys.map(Math.abs))) / 10) * 10;
  mount($('decl'), () => lineChart($('decl'), {
    height: 180, zero: true, x: xAxis, y: { domain: [-dm, dm], ticks: [-dm, -dm / 2, 0, dm / 2, dm], fmt: v => axisNum(v) + '°' },
    series: dser,
    tip: i => ({ head: `${dayLabel(r.decl.day[i])} ${dayDate(r.decl.day[i]).getUTCFullYear()}`,
                 rows: dser.map(s => ({ color: s.color, name: s.name, value: signed(s.ys[i], 1) + '°' })) }),
  }));
}

function bridgeXs() {
  const r = yearData, n = r.bridge.qaringil.length;
  return Float32Array.from({ length: n }, (_, i) => i * r.curveStepHours);
}
function drawBridgeLevels() {
  const r = yearData, xs = bridgeXs(), B = r.bridge;
  const series = [
    { name: 'north of the isthmus', color: NORTH, width: 1.5, xs, ys: B.north },
    { name: 'Qaringil', color: TOTAL, width: 2, xs, ys: B.qaringil },
  ];
  const m = Math.max(...series.flatMap(s => Array.from(s.ys, Math.abs))) * 1.08;
  lineChart($('bridge-levels'), {
    height: 200, zero: true, x: dayTicks(r.startDay, xs[xs.length - 1]), y: { domain: [-m, m], fmt: axisNum },
    series,
    tip: i => ({ head: `${dayLabel(r.startDay + Math.floor(xs[i] / 24))} ${clock(xs[i])} PMT+2`, rows: [
      { color: TOTAL, name: 'Qaringil', value: signed(B.qaringil[i]) + ' m' },
      { color: NORTH, name: 'north side', value: signed(B.north[i]) + ' m' },
      { name: 'difference', value: signed(B.qaringil[i] - B.north[i]) + ' m' }] }),
  });
}
function drawBridgeCurrent() {
  const r = yearData, xs = bridgeXs(), c = r.bridge.current;
  const m = Math.max(...Array.from(c, Math.abs)) * 1.08;
  lineChart($('bridge-current'), {
    height: 180, zero: true, x: dayTicks(r.startDay, xs[xs.length - 1]), y: { domain: [-m, m], fmt: v => axisNum(v) + ' m/s' },
    series: [{ name: 'implied current', color: CURRENT, width: 1.6, xs, ys: c }],
    tip: i => ({ head: `${dayLabel(r.startDay + Math.floor(xs[i] / 24))} ${clock(xs[i])} PMT+2`, rows: [
      { color: CURRENT, name: c[i] >= 0 ? 'running north' : 'running south', value: `${Math.abs(c[i]).toFixed(1)} m/s · ${(Math.abs(c[i]) * 1.9438).toFixed(0)} kn` }] }),
  });
}

// ── controls ───────────────────────────────────────────────────────────

const portSel = $('port');
for (const p of PORTS) portSel.append(new Option(p.name, p.id));
const params = new URLSearchParams(location.search);
if (PORTS_BY_ID[params.get('port')]) portSel.value = params.get('port');
if (/^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '')) $('date').value = params.get('date');
if (['7', '14', '28'].includes(params.get('days'))) $('days').value = params.get('days');

const dateOk = () => { const d = $('date'); return d.value && d.value >= d.min && d.value <= d.max; };
function onChange() {
  if (!dateOk()) { $('win-status').textContent = `Pick a date between ${$('date').min} and ${$('date').max}.`; $('win-status').classList.add('error'); return; }
  requestWindow();
  requestYear();
}
portSel.addEventListener('change', onChange);
$('days').addEventListener('change', onChange);
$('date').addEventListener('change', onChange);
$('show-bodies').addEventListener('change', () => windowData && drawWindow());
onChange();
