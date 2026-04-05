// Star chart — two azimuthal equidistant projections (north + south pole)
// plus an ecliptic band chart, rendered as inline SVGs.
// Reuses the same deterministic star field as the sky view.

import { buildStars } from './skyview.js';
import { PRIMUS_INCLINATION } from './bodies.js';

const PI  = Math.PI;
const TAU = 2 * PI;

const cosI = Math.cos(PRIMUS_INCLINATION);
const sinI = Math.sin(PRIMUS_INCLINATION);

const stars = buildStars(500, 0xCAFEBABE);

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── Shared helpers ──────────────────────────────────────────────────

function starMatrix(latDeg) {
  const phi = latDeg * PI / 180;
  const cP = Math.cos(phi), sP = Math.sin(phi);
  return [
    cP * cosI + sP * sinI,  0,  -cP * sinI + sP * cosI,
    0,                       1,  0,
    -sP * cosI + cP * sinI,  0,  sP * sinI + cP * cosI,
  ];
}

function raToEcliptic(ra) {
  const eqx = Math.sin(ra), eqy = -Math.cos(ra);
  return [cosI * eqx, eqy, -sinI * eqx];
}

function projectPolar(M, ex, ey, ez, R, cx, cy) {
  const zen  = M[0] * ex + M[1] * ey + M[2] * ez;
  const east = M[3] * ex + M[4] * ey + M[5] * ez;
  const nor  = M[6] * ex + M[7] * ey + M[8] * ez;
  const alt  = Math.asin(Math.max(-1, Math.min(1, zen)));
  const az   = Math.atan2(east, nor);
  const pr   = (PI / 2 - alt) / (PI / 2) * R;
  return { x: cx - pr * Math.cos(az), y: cy - pr * Math.sin(az), pr };
}

function el(tag, attrs, ...children) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const c of children) {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
}

// Track all star circle elements across charts: starElements[starIndex] = [circle, ...]
const starElements = [];
for (let i = 0; i < stars.length; i++) starElements.push([]);

function makeStarCircle(starIdx, cx, cy, r, opacity) {
  const circle = el('circle', {
    cx: cx.toFixed(2),
    cy: cy.toFixed(2),
    r: r.toFixed(2),
    fill: `rgba(255,255,255,${opacity.toFixed(3)})`,
    'data-star': starIdx,
  });
  starElements[starIdx].push(circle);
  return circle;
}

// ── Polar chart ─────────────────────────────────────────────────────

function buildPolarChart(latDeg) {
  const size = 600;
  const margin = 32;
  const R  = size / 2 - margin;
  const cx = size / 2;
  const cy = size / 2;
  const isNorth = latDeg > 0;
  const clipR = R * 1.11;
  const M = starMatrix(latDeg);
  const clipId = isNorth ? 'clip-n' : 'clip-s';

  const svg = el('svg', {
    viewBox: `0 0 ${size} ${size}`,
    xmlns: SVG_NS,
    width: size,
    height: size,
  });

  const defs = el('defs', {});
  const cp = el('clipPath', { id: clipId });
  cp.appendChild(el('circle', { cx, cy, r: clipR }));
  defs.appendChild(cp);
  svg.appendChild(defs);

  svg.appendChild(el('rect', { width: size, height: size, fill: '#04081a' }));

  // Declination circles
  for (const dec of [0, 30, 60]) {
    const r = (90 - dec) / 90 * R;
    if (r > clipR) continue;
    svg.appendChild(el('circle', {
      cx, cy, r,
      fill: 'none',
      stroke: 'rgba(80,130,255,0.30)',
      'stroke-width': 0.75,
      'stroke-dasharray': '3 6',
    }));
  }

  // RA hour lines
  for (let h = 0; h < 24; h += 2) {
    const ra = h * PI / 12;
    const [ex, ey, ez] = raToEcliptic(ra);
    const p = projectPolar(M, ex, ey, ez, R, cx, cy);

    svg.appendChild(el('line', {
      x1: cx, y1: cy, x2: p.x, y2: p.y,
      stroke: 'rgba(80,130,255,0.18)',
      'stroke-width': 0.75,
    }));

    const lr = R + 16;
    const east = M[3] * ex + M[4] * ey + M[5] * ez;
    const nor  = M[6] * ex + M[7] * ey + M[8] * ez;
    const az   = Math.atan2(east, nor);
    svg.appendChild(el('text', {
      x: cx - lr * Math.cos(az),
      y: cy - lr * Math.sin(az),
      fill: 'rgba(140,185,230,0.80)',
      'font-family': 'Courier New, monospace',
      'font-size': '11',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    }, h + 'h'));
  }

  // Ecliptic
  const eclSegs = [];
  let seg = [];
  for (let i = 0; i <= 120; i++) {
    const ang = (i / 120) * TAU;
    const ex = Math.cos(ang), ey = Math.sin(ang);
    const p = projectPolar(M, ex, ey, 0, R, cx, cy);
    if (p.pr > clipR) {
      if (seg.length) { eclSegs.push(seg); seg = []; }
      continue;
    }
    seg.push(p);
  }
  if (seg.length) eclSegs.push(seg);
  for (const s of eclSegs) {
    svg.appendChild(el('path', {
      d: s.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(''),
      fill: 'none',
      stroke: 'rgba(200,160,80,0.30)',
      'stroke-width': 1,
      'stroke-dasharray': '6 6',
      'clip-path': `url(#${clipId})`,
    }));
  }

  // Stars
  const starGroup = el('g', { 'clip-path': `url(#${clipId})` });
  for (let i = 0; i < stars.length; i++) {
    const [ex, ey, ez, r, a] = stars[i];
    const p = projectPolar(M, ex, ey, ez, R, cx, cy);
    if (p.pr > clipR) continue;
    starGroup.appendChild(makeStarCircle(i, p.x, p.y, r * 1.8, Math.min(a * 1.3, 1)));
  }
  svg.appendChild(starGroup);

  // Dec labels
  for (const dec of [0, 30, 60]) {
    const r = (90 - dec) / 90 * R;
    if (r > clipR) continue;
    const label = dec === 0 ? '0\u00B0'
      : isNorth ? `+${dec}\u00B0` : `\u2212${dec}\u00B0`;
    svg.appendChild(el('text', {
      x: cx + 4, y: cy - r - 3,
      fill: 'rgba(120,170,220,0.40)',
      'font-family': 'Courier New, monospace',
      'font-size': '9',
    }, label));
  }

  svg.appendChild(el('text', {
    x: cx + 12, y: cy - 4,
    fill: 'rgba(150,210,255,0.5)',
    'font-family': 'Courier New, monospace',
    'font-size': '10',
    'text-anchor': 'middle',
  }, isNorth ? 'NCP' : 'SCP'));

  return svg;
}

// ── Ecliptic band chart ─────────────────────────────────────────────

function buildBandChart() {
  const W = 1200, H = 240;
  const margin = { left: 30, right: 10, top: 14, bottom: 22 };
  const pw = W - margin.left - margin.right;
  const ph = H - margin.top - margin.bottom;
  const bandHalf = 30;

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    xmlns: SVG_NS,
    width: W,
    height: H,
  });

  svg.appendChild(el('rect', { width: W, height: H, fill: '#04081a' }));

  const defs = el('defs', {});
  const cp = el('clipPath', { id: 'clip-band' });
  cp.appendChild(el('rect', { x: margin.left, y: margin.top, width: pw, height: ph }));
  defs.appendChild(cp);
  svg.appendChild(defs);

  const lonToX = (lon) => margin.left + (lon / TAU) * pw;
  const latToY = (lat) => margin.top + ph / 2 - (lat / (bandHalf * PI / 180)) * (ph / 2);

  // Longitude grid every 30°
  for (let deg = 0; deg <= 360; deg += 30) {
    const x = lonToX(deg * PI / 180);
    svg.appendChild(el('line', {
      x1: x, y1: margin.top, x2: x, y2: margin.top + ph,
      stroke: 'rgba(80,130,255,0.15)',
      'stroke-width': deg % 90 === 0 ? 0.75 : 0.5,
    }));
    if (deg < 360) {
      svg.appendChild(el('text', {
        x, y: H - 4,
        fill: 'rgba(140,185,230,0.70)',
        'font-family': 'Courier New, monospace',
        'font-size': '9',
        'text-anchor': 'middle',
      }, deg + '\u00B0'));
    }
  }

  // Latitude grid every 10°
  for (let lat = -bandHalf; lat <= bandHalf; lat += 10) {
    const y = latToY(lat * PI / 180);
    svg.appendChild(el('line', {
      x1: margin.left, y1: y, x2: margin.left + pw, y2: y,
      stroke: lat === 0 ? 'rgba(200,160,80,0.30)' : 'rgba(80,130,255,0.12)',
      'stroke-width': lat === 0 ? 1 : 0.5,
      'stroke-dasharray': lat === 0 ? '6 4' : 'none',
    }));
    const label = lat === 0 ? '0\u00B0' : (lat > 0 ? '+' : '\u2212') + Math.abs(lat) + '\u00B0';
    svg.appendChild(el('text', {
      x: margin.left - 4, y: y + 3,
      fill: 'rgba(120,170,220,0.40)',
      'font-family': 'Courier New, monospace',
      'font-size': '8',
      'text-anchor': 'end',
    }, label));
  }

  // Celestial equator
  const tanI = Math.tan(PRIMUS_INCLINATION);
  const eqPts = [];
  for (let i = 0; i <= 360; i++) {
    const lon = i * PI / 180;
    const lat = Math.atan(-tanI * Math.cos(lon));
    eqPts.push(`${i ? 'L' : 'M'}${lonToX(lon).toFixed(2)},${latToY(lat).toFixed(2)}`);
  }
  svg.appendChild(el('path', {
    d: eqPts.join(''),
    fill: 'none',
    stroke: 'rgba(80,130,255,0.25)',
    'stroke-width': 0.75,
    'stroke-dasharray': '4 4',
    'clip-path': 'url(#clip-band)',
  }));

  // Stars
  const starGroup = el('g', { 'clip-path': 'url(#clip-band)' });
  for (let i = 0; i < stars.length; i++) {
    const [ex, ey, ez, r, a] = stars[i];
    let lon = Math.atan2(ey, ex) + PI / 2;
    if (lon < 0) lon += TAU;
    if (lon >= TAU) lon -= TAU;
    const lat = Math.asin(Math.max(-1, Math.min(1, ez)));
    if (Math.abs(lat) > bandHalf * PI / 180) continue;
    starGroup.appendChild(makeStarCircle(i, lonToX(lon), latToY(lat), r * 1.8, Math.min(a * 1.3, 1)));
  }
  svg.appendChild(starGroup);

  // Border
  svg.appendChild(el('rect', {
    x: margin.left, y: margin.top, width: pw, height: ph,
    fill: 'none',
    stroke: 'rgba(80,130,255,0.25)',
    'stroke-width': 0.75,
  }));

  return svg;
}

// ── Highlight on hover/touch ────────────────────────────────────────

let activeStarIdx = -1;

function highlightStar(idx) {
  if (idx === activeStarIdx) return;
  // Clear previous
  if (activeStarIdx >= 0) {
    for (const c of starElements[activeStarIdx]) {
      c.removeAttribute('stroke');
      c.removeAttribute('stroke-width');
    }
  }
  activeStarIdx = idx;
  if (idx < 0) return;
  for (const c of starElements[idx]) {
    c.setAttribute('stroke', 'rgba(100,180,255,0.9)');
    c.setAttribute('stroke-width', '2');
  }
}

function handleStarEvent(e) {
  const star = e.target.closest('[data-star]');
  if (star) {
    highlightStar(Number(star.dataset.star));
  } else if (e.type === 'mouseleave') {
    highlightStar(-1);
  }
}

// ── Save SVG ────────────────────────────────────────────────────────

function saveSvg(svg, filename) {
  const source = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    new XMLSerializer().serializeToString(svg);
  const blob = new Blob([source], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function addSaveButton(container, svg, filename) {
  const btn = document.createElement('button');
  btn.textContent = 'Save SVG';
  btn.className = 'save-btn';
  btn.addEventListener('click', () => saveSvg(svg, filename));
  container.appendChild(btn);
}

// ── Mount ───────────────────────────────────────────────────────────

const bandSvg = buildBandChart();
const bandEl = document.getElementById('band-chart');
bandEl.appendChild(bandSvg);
addSaveButton(bandEl, bandSvg, 'qaia-ecliptic-band.svg');

const northSvg = buildPolarChart(90);
const northEl = document.getElementById('north-chart');
northEl.appendChild(northSvg);
addSaveButton(northEl, northSvg, 'qaia-stars-north.svg');

const southSvg = buildPolarChart(-90);
const southEl = document.getElementById('south-chart');
southEl.appendChild(southSvg);
addSaveButton(southEl, southSvg, 'qaia-stars-south.svg');

// Attach hover/touch listeners to all three SVGs
for (const svg of [bandSvg, northSvg, southSvg]) {
  svg.addEventListener('mousemove', handleStarEvent);
  svg.addEventListener('mouseleave', handleStarEvent);
  svg.addEventListener('touchstart', handleStarEvent, { passive: true });
}
