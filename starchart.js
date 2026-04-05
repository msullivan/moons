// Star chart — two azimuthal equidistant projections (north + south pole)
// rendered as inline SVGs for crisp printing and vector editing.
// Reuses the same deterministic star field as the sky view.

import { buildStars } from './skyview.js';
import { PRIMUS_INCLINATION } from './bodies.js';

const PI  = Math.PI;
const TAU = 2 * PI;

const cosI = Math.cos(PRIMUS_INCLINATION);
const sinI = Math.sin(PRIMUS_INCLINATION);

const stars = buildStars(500, 0xCAFEBABE);

const SVG_NS = 'http://www.w3.org/2000/svg';

// Compute the 3×3 matrix: ecliptic → observer (zen, east, north) frame.
// Same math as SkyView._starMatrix() but with time=0 and lon=0.
function starMatrix(latDeg) {
  const phi = latDeg * PI / 180;
  const cP = Math.cos(phi), sP = Math.sin(phi);
  return [
    cP * cosI + sP * sinI,  0,  -cP * sinI + sP * cosI,
    0,                       1,  0,
    -sP * cosI + cP * sinI,  0,  sP * sinI + cP * cosI,
  ];
}

// Convert equatorial direction (Dec=0, RA=ra) to ecliptic coordinates.
// RA=0 anchored at the vernal equinox: ecliptic direction (0, −1, 0).
function raToEcliptic(ra) {
  const eqx = Math.sin(ra), eqy = -Math.cos(ra);
  return [cosI * eqx, eqy, -sinI * eqx];
}

// Project ecliptic direction through matrix M, return screen (x, y).
// Convention: 0h at bottom, RA counterclockwise (north) / clockwise (south).
function project(M, ex, ey, ez, R, cx, cy) {
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

function buildChart(latDeg) {
  const size = 600;
  const margin = 32;
  const R  = size / 2 - margin;
  const cx = size / 2;
  const cy = size / 2;
  const isNorth = latDeg > 0;
  const clipR = R * 1.11;
  const M = starMatrix(latDeg);

  const svg = el('svg', {
    viewBox: `0 0 ${size} ${size}`,
    xmlns: SVG_NS,
  });

  // Clip definition for the chart area
  const defs = el('defs', {});
  const clipPath = el('clipPath', { id: isNorth ? 'clip-n' : 'clip-s' });
  clipPath.appendChild(el('circle', { cx, cy, r: clipR }));
  defs.appendChild(clipPath);
  svg.appendChild(defs);

  // Background
  svg.appendChild(el('rect', { width: size, height: size, fill: '#04081a' }));

  const clipId = isNorth ? 'clip-n' : 'clip-s';

  // ── Declination circles ──────────────────────────────────────
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

  // ── RA hour lines ────────────────────────────────────────────
  for (let h = 0; h < 24; h += 2) {
    const ra = h * PI / 12;
    const [ex, ey, ez] = raToEcliptic(ra);
    const p = project(M, ex, ey, ez, R, cx, cy);

    // Spoke
    svg.appendChild(el('line', {
      x1: cx, y1: cy, x2: p.x, y2: p.y,
      stroke: 'rgba(80,130,255,0.18)',
      'stroke-width': 0.75,
    }));

    // Label
    const lr = R + 16;
    const east = M[3] * ex + M[4] * ey + M[5] * ez;
    const nor  = M[6] * ex + M[7] * ey + M[8] * ez;
    const az   = Math.atan2(east, nor);
    const lx = cx - lr * Math.cos(az);
    const ly = cy - lr * Math.sin(az);
    svg.appendChild(el('text', {
      x: lx, y: ly,
      fill: 'rgba(140,185,230,0.80)',
      'font-family': 'Courier New, monospace',
      'font-size': '11',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    }, h + 'h'));
  }

  // ── Ecliptic ─────────────────────────────────────────────────
  const eclPts = [];
  const N_ECL = 120;
  let segment = [];
  for (let i = 0; i <= N_ECL; i++) {
    const ang = (i / N_ECL) * TAU;
    const ex = Math.cos(ang), ey = Math.sin(ang);
    const p = project(M, ex, ey, 0, R, cx, cy);
    if (p.pr > clipR) {
      if (segment.length) { eclPts.push(segment); segment = []; }
      continue;
    }
    segment.push(p);
  }
  if (segment.length) eclPts.push(segment);
  for (const seg of eclPts) {
    const d = seg.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('');
    svg.appendChild(el('path', {
      d,
      fill: 'none',
      stroke: 'rgba(200,160,80,0.30)',
      'stroke-width': 1,
      'stroke-dasharray': '6 6',
      'clip-path': `url(#${clipId})`,
    }));
  }

  // ── Stars ────────────────────────────────────────────────────
  const starGroup = el('g', { 'clip-path': `url(#${clipId})` });
  for (const [ex, ey, ez, r, a] of stars) {
    const p = project(M, ex, ey, ez, R, cx, cy);
    if (p.pr > clipR) continue;
    const cr = r * 1.8;
    const opacity = Math.min(a * 1.3, 1);
    starGroup.appendChild(el('circle', {
      cx: p.x.toFixed(2),
      cy: p.y.toFixed(2),
      r: cr.toFixed(2),
      fill: `rgba(255,255,255,${opacity.toFixed(3)})`,
    }));
  }
  svg.appendChild(starGroup);

  // ── Dec labels ───────────────────────────────────────────────
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

  // Pole label
  svg.appendChild(el('text', {
    x: cx + 12, y: cy - 4,
    fill: 'rgba(150,210,255,0.5)',
    'font-family': 'Courier New, monospace',
    'font-size': '10',
    'text-anchor': 'middle',
  }, isNorth ? 'NCP' : 'SCP'));

  return svg;
}

document.getElementById('north-chart').appendChild(buildChart(90));
document.getElementById('south-chart').appendChild(buildChart(-90));
