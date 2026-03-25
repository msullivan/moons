// Sky view panel — horizon-to-horizon panorama showing moon positions
// as seen from Qaia's surface (equatorial observer at sub-Primus longitude).

import { PRIMUS_INCLINATION, QAIA_SIDEREAL_DAY } from './bodies.js';

// Body indices to display
const SKY_BODIES = [0, 2, 3, 4, 5, 6, 7];
// Sun, Primus, Secundus, Tertius, Quartus, Sextus, Septimus

const ANGULAR_SCALE = 1600; // px per radian of apparent angular radius
const MIN_DISC_R = 2;
const MAX_DISC_R = 10;
const RAD = 180 / Math.PI;

export class SkyView {
  constructor(canvas, sim) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sim = sim;
    this.cosI = Math.cos(PRIMUS_INCLINATION);
    this.sinI = Math.sin(PRIMUS_INCLINATION);
    this.omega = 2 * Math.PI / QAIA_SIDEREAL_DAY;
  }

  resize(w) {
    this.canvas.width = w;
    this.canvas.height = 130;
  }

  // Compute altitude and azimuth of a body as seen from the surface.
  //
  // Qaia's spin axis = (sinI, 0, cosI) in the inertial frame.
  // At t=0 the prime meridian (sub-Primus longitude) points along
  // e1(0) = (cosI, 0, -sinI).  e2 = (0, 1, 0) completes the basis.
  //
  // The observer sits at latitude 0, longitude 0 (sub-Primus point),
  // so "up" = the rotating e1 direction, "east" = rotating e2, "north" = e3.
  altAz(bodyIndex) {
    const qaia = this.sim.bodies[1];
    const body = this.sim.bodies[bodyIndex];
    const dx = body.x - qaia.x;
    const dy = body.y - qaia.y;
    const dz = body.z - qaia.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist === 0) return null;

    // Project onto equatorial basis (inertial components)
    const p1 = dx * this.cosI - dz * this.sinI;   // along e1(0)
    const p2 = dy;                                  // along e2
    const p3 = dx * this.sinI + dz * this.cosI;   // along spin axis

    // Rotate into body-fixed frame (Qaia's rotation)
    const phi = this.omega * this.sim.time;
    const c = Math.cos(phi), s = Math.sin(phi);
    const b1 =  c * p1 + s * p2;   // radial (zenith)
    const b2 = -s * p1 + c * p2;   // east
    const b3 = p3;                   // north

    const alt = Math.asin(clamp(b1 / dist, -1, 1));
    const az  = Math.atan2(b2, b3);   // 0 = north, π/2 = east

    return { alt, az, dist };
  }

  render() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Background
    ctx.fillStyle = '#04081a';
    ctx.fillRect(0, 0, W, H);

    // Plot area margins
    const mL = 28, mR = 10, mT = 8, mB = 16;
    const pL = mL, pR = W - mR, pT = mT, pB = H - mB;
    const pW = pR - pL, pH = pB - pT;
    const ALT_MIN = -10, ALT_MAX = 90, ALT_RANGE = ALT_MAX - ALT_MIN;

    const azToX = (azRad) => {
      const d = ((azRad * RAD % 360) + 360) % 360;
      return pL + (d / 360) * pW;
    };
    const altToY = (altDeg) => pB - ((altDeg - ALT_MIN) / ALT_RANGE) * pH;

    // Below-horizon shading
    const horizY = altToY(0);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(pL, horizY, pW, pB - horizY);

    // Altitude grid (dashed)
    ctx.strokeStyle = 'rgba(80, 130, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    for (const a of [30, 60]) {
      const y = altToY(a);
      ctx.beginPath(); ctx.moveTo(pL, y); ctx.lineTo(pR, y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Horizon line (solid)
    ctx.strokeStyle = 'rgba(80, 130, 255, 0.35)';
    ctx.beginPath(); ctx.moveTo(pL, horizY); ctx.lineTo(pR, horizY); ctx.stroke();

    // Cardinal direction labels
    ctx.fillStyle = 'rgba(120, 170, 220, 0.5)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    for (const [deg, lbl] of [[0,'N'],[90,'E'],[180,'S'],[270,'W'],[360,'N']]) {
      ctx.fillText(lbl, pL + (deg / 360) * pW, H - 3);
    }

    // Altitude labels
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(120, 170, 220, 0.4)';
    for (const a of [0, 30, 60, 90]) {
      ctx.fillText(a + '°', pL - 3, altToY(a) + 3);
    }

    // Collect sky objects
    const objs = [];
    for (const idx of SKY_BODIES) {
      const aa = this.altAz(idx);
      if (!aa) continue;
      const body = this.sim.bodies[idx];
      const angR = body.physicalRadius / aa.dist;
      const discR = clamp(angR * ANGULAR_SCALE, MIN_DISC_R, MAX_DISC_R);
      objs.push({ body, alt: aa.alt * RAD, az: aa.az, dist: aa.dist, discR });
    }

    // Draw order: below-horizon first, then far → near
    objs.sort((a, b) => {
      const aa = a.alt >= 0 ? 1 : 0, bb = b.alt >= 0 ? 1 : 0;
      if (aa !== bb) return aa - bb;
      return b.dist - a.dist;
    });

    // Clip to plot area
    ctx.save();
    ctx.beginPath();
    ctx.rect(pL, pT, pW, pH);
    ctx.clip();

    for (const o of objs) {
      const x = azToX(o.az);
      const y = altToY(o.alt);
      const above = o.alt >= 0;

      // Draw at primary position + wrapped copy if near edge
      const xPositions = [x];
      if (x - o.discR * 3 < pL) xPositions.push(x + pW);
      if (x + o.discR * 3 > pR) xPositions.push(x - pW);

      ctx.globalAlpha = above ? 1 : 0.25;

      for (const px of xPositions) {
        // Glow
        const g = ctx.createRadialGradient(px, y, 0, px, y, o.discR * 3);
        g.addColorStop(0, hexAlpha(o.body.color, 0.35));
        g.addColorStop(1, hexAlpha(o.body.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, y, o.discR * 3, 0, Math.PI * 2); ctx.fill();

        // Disc
        ctx.fillStyle = o.body.color;
        ctx.beginPath(); ctx.arc(px, y, o.discR, 0, Math.PI * 2); ctx.fill();

        // Label
        ctx.fillStyle = 'rgba(210, 230, 255, 0.8)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(o.body.name, px, y - o.discR - 3);
      }

      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Bottom border
    ctx.strokeStyle = 'rgba(80, 130, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H - 0.5); ctx.lineTo(W, H - 0.5); ctx.stroke();
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function hexAlpha(hex, a) {
  const h = hex.replace('#', '').slice(0, 6);
  return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a.toFixed(3)})`;
}
