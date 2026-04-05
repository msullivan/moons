// Star chart — two azimuthal equidistant projections (north + south pole)
// reusing the same deterministic star field as the sky view.

import { buildStars } from './skyview.js';
import { PRIMUS_INCLINATION } from './bodies.js';

const PI  = Math.PI;
const TAU = 2 * PI;

const cosI = Math.cos(PRIMUS_INCLINATION);
const sinI = Math.sin(PRIMUS_INCLINATION);

const stars = buildStars(500, 0xCAFEBABE);

// Compute the 3×3 matrix: ecliptic → observer (zen, east, north) frame.
// Same math as SkyView._starMatrix() but with time=0 and explicit lat/lon.
function starMatrix(latDeg) {
  const phi = latDeg * PI / 180;
  const cP = Math.cos(phi), sP = Math.sin(phi);
  // lon=0 → cosLam=1, sinLam=0

  // Ecliptic → body-fixed (θ=0) composed with body-fixed → observer (lon=0).
  // With θ=0 and lon=0 many terms vanish; the result is a rotation by
  // (lat + axial_tilt) around the y-axis.
  return [
    cP * cosI + sP * sinI,  0,  -cP * sinI + sP * cosI,
    0,                       1,  0,
    -sP * cosI + cP * sinI,  0,  sP * sinI + cP * cosI,
  ];
}

// Convert equatorial unit vector (at Dec=0, RA=ra) to ecliptic coordinates.
// RA=0 is anchored to the vernal equinox — the ecliptic direction (0,−1,0),
// where the Sun crosses the equator going north.  In equatorial coords this
// is also (0,−1,0), so we rotate the standard (cosRA, sinRA) basis by −90°:
//   eq = (sin(RA), −cos(RA), 0)
// Then equatorial→ecliptic rotates by −I around y.
function raToEcliptic(ra) {
  const eqx = Math.sin(ra), eqy = -Math.cos(ra);
  return [cosI * eqx, eqy, -sinI * eqx];
}

function renderChart(canvas, latDeg) {
  const dpr = window.devicePixelRatio || 1;
  const size = Math.min(600, Math.min(window.innerWidth / 2 - 40, window.innerHeight - 120));
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const margin = 32;
  const R  = size / 2 - margin;
  const cx = size / 2;
  const cy = size / 2;
  const isNorth = latDeg > 0;

  // Include 10° overlap past the equator so equatorial patterns aren't cut off
  const clipR = R * 1.11;

  ctx.fillStyle = '#04081a';
  ctx.fillRect(0, 0, size, size);

  const M = starMatrix(latDeg);

  // ── Declination circles ────────────────────────────────────────
  ctx.strokeStyle = 'rgba(80, 130, 255, 0.30)';
  ctx.lineWidth = 0.75;
  ctx.setLineDash([3, 6]);
  // 0° = equator (at distance R), ±30°, ±60°
  for (const dec of [0, 30, 60]) {
    const r = (90 - dec) / 90 * R;
    if (r > clipR) continue;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // ── RA hour lines (every 2h) ───────────────────────────────────
  for (let h = 0; h < 24; h += 2) {
    const ra = h * PI / 12;
    const [ex, ey, ez] = raToEcliptic(ra);

    const east = M[3] * ex + M[4] * ey + M[5] * ez;
    const nor  = M[6] * ex + M[7] * ey + M[8] * ez;
    const az   = Math.atan2(east, nor);

    // Spoke from pole to equator
    ctx.strokeStyle = 'rgba(80, 130, 255, 0.18)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - R * Math.cos(az), cy - R * Math.sin(az));
    ctx.stroke();

    // RA label just outside the equator circle
    const lr = R + 16;
    ctx.fillStyle = 'rgba(140, 185, 230, 0.80)';
    ctx.font = '11px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(h + 'h', cx - lr * Math.cos(az), cy - lr * Math.sin(az));
  }

  // ── Ecliptic ───────────────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, clipR, 0, TAU);
  ctx.clip();
  ctx.strokeStyle = 'rgba(200, 160, 80, 0.30)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  let drawing = false;
  for (let i = 0; i <= 120; i++) {
    const ang = (i / 120) * TAU;
    const ex = Math.cos(ang), ey = Math.sin(ang);
    const zen  = M[0] * ex + M[1] * ey;
    const east = M[3] * ex + M[4] * ey;
    const nor  = M[6] * ex + M[7] * ey;
    const alt = Math.asin(Math.max(-1, Math.min(1, zen)));
    const az  = Math.atan2(east, nor);
    const pr  = (PI / 2 - alt) / (PI / 2) * R;
    if (pr > clipR) { drawing = false; continue; }
    const sx = cx - pr * Math.cos(az);
    const sy = cy - pr * Math.sin(az);
    if (!drawing) { ctx.moveTo(sx, sy); drawing = true; }
    else ctx.lineTo(sx, sy);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // ── Stars ──────────────────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, clipR, 0, TAU);
  ctx.clip();
  for (const [ex, ey, ez, r, a] of stars) {
    const zen  = M[0] * ex + M[1] * ey + M[2] * ez;
    const east = M[3] * ex + M[4] * ey + M[5] * ez;
    const nor  = M[6] * ex + M[7] * ey + M[8] * ez;
    const alt = Math.asin(Math.max(-1, Math.min(1, zen)));
    const az  = Math.atan2(east, nor);
    const pr  = (PI / 2 - alt) / (PI / 2) * R;
    if (pr > clipR) continue;
    const sx = cx - pr * Math.cos(az);
    const sy = cy - pr * Math.sin(az);
    // Enlarge dots for chart readability; brighter stars get bigger
    const cr = r * 1.8;
    const opacity = Math.min(a * 1.3, 1);
    ctx.fillStyle = `rgba(255,255,255,${opacity.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, cr, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // ── Dec labels ─────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(120, 170, 220, 0.40)';
  ctx.font = '9px Courier New';
  ctx.textAlign = 'left';
  for (const dec of [0, 30, 60]) {
    const r = (90 - dec) / 90 * R;
    if (r > clipR) continue;
    const label = dec === 0 ? '0\u00B0'
      : isNorth ? `+${dec}\u00B0` : `\u2212${dec}\u00B0`;
    ctx.fillText(label, cx + 4, cy - r - 3);
  }

  // Pole label at center
  ctx.fillStyle = 'rgba(150, 210, 255, 0.5)';
  ctx.font = '10px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText(isNorth ? 'NCP' : 'SCP', cx + 12, cy - 4);
}

renderChart(document.getElementById('north-canvas'), 90);
renderChart(document.getElementById('south-canvas'), -90);

window.addEventListener('resize', () => {
  renderChart(document.getElementById('north-canvas'), 90);
  renderChart(document.getElementById('south-canvas'), -90);
});
