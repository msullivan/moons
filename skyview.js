// Sky view — full-window azimuthal equidistant projection of the sky
// as seen from Qaia's surface (equatorial observer at sub-Primus longitude).
// Zenith at center, horizon at rim. North up, east right.

import { PRIMUS_INCLINATION, QAIA_SIDEREAL_DAY } from './bodies.js';

// Body indices to display
const SKY_BODIES = [0, 2, 3, 4, 5, 6, 7];
// Sun, Primus, Secundus, Tertius, Quartus, Sextus, Septimus

const ANGULAR_SCALE = 3200; // px per radian of apparent angular radius
const MIN_DISC_R = 4;
const MAX_DISC_R = 18;
const RAD = 180 / Math.PI;
const PI  = Math.PI;
const TAU = 2 * PI;

export class SkyView {
  constructor(canvas, sim) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sim = sim;
    this.cosI = Math.cos(PRIMUS_INCLINATION);
    this.sinI = Math.sin(PRIMUS_INCLINATION);
    this.omega = TAU / QAIA_SIDEREAL_DAY;

    // Seeded star field (same PRNG as renderer.js but different seed)
    this.stars = buildStars(500, 0xCAFEBABE);
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  // ── coordinate transform ──────────────────────────────────────────────

  altAz(bodyIndex) {
    const qaia = this.sim.bodies[1];
    const body = this.sim.bodies[bodyIndex];
    const dx = body.x - qaia.x;
    const dy = body.y - qaia.y;
    const dz = body.z - qaia.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist === 0) return null;

    const p1 = dx * this.cosI - dz * this.sinI;
    const p2 = dy;
    const p3 = dx * this.sinI + dz * this.cosI;

    const phi = this.omega * this.sim.time;
    const c = Math.cos(phi), s = Math.sin(phi);
    const b1 =  c * p1 + s * p2;
    const b2 = -s * p1 + c * p2;
    const b3 = p3;

    const alt = Math.asin(clamp(b1 / dist, -1, 1));
    const az  = Math.atan2(b2, b3);

    return { alt, az, dist };
  }

  // ── azimuthal equidistant projection ──────────────────────────────────

  _project(alt, az, cx, cy, R) {
    // r = 0 at zenith, R at horizon, >R below horizon
    const r = (PI / 2 - alt) / (PI / 2) * R;
    return {
      x: cx + r * Math.sin(az),
      y: cy - r * Math.cos(az),
    };
  }

  // ── main render ───────────────────────────────────────────────────────

  render() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Background
    ctx.fillStyle = '#04081a';
    ctx.fillRect(0, 0, W, H);

    // Circle geometry — largest circle that fits, with margin for labels
    const margin = 40;
    const R  = Math.min(W, H) / 2 - margin;
    const cx = W / 2;
    const cy = H / 2;

    // Sun position (drives sky gradient + phase rendering)
    const sunAA = this.altAz(0);
    const sunAltDeg = sunAA ? sunAA.alt * RAD : -90;

    // ── sky gradient ──────────────────────────────────────────────────
    if (sunAA && sunAltDeg > -18) {
      const sp = this._project(sunAA.alt, sunAA.az, cx, cy, R);
      const t = clamp((sunAltDeg + 18) / 30, 0, 1);
      const grad = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, R * 1.5);
      if (sunAltDeg > 0) {
        grad.addColorStop(0,   hexAlpha('#4080c0', 0.25 * t));
        grad.addColorStop(0.4, hexAlpha('#1a3060', 0.12 * t));
        grad.addColorStop(1,   'rgba(0,0,0,0)');
      } else {
        grad.addColorStop(0,   hexAlpha('#805030', 0.18 * t));
        grad.addColorStop(0.4, hexAlpha('#402818', 0.08 * t));
        grad.addColorStop(1,   'rgba(0,0,0,0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    }

    // ── stars ─────────────────────────────────────────────────────────
    const starAlpha = sunAltDeg > 0 ? clamp(1 - sunAltDeg / 15, 0, 0.15) : 0.8;
    if (starAlpha > 0.01) {
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
      for (const [fx, fy, r, a] of this.stars) {
        const sx = cx + (fx * 2 - 1) * R;
        const sy = cy + (fy * 2 - 1) * R;
        // Only draw if inside circle
        const dx = sx - cx, dy = sy - cy;
        if (dx * dx + dy * dy > R * R) continue;
        ctx.fillStyle = `rgba(255,255,255,${(a * starAlpha).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    // ── grid ──────────────────────────────────────────────────────────

    // Altitude circles (30°, 60°)
    ctx.strokeStyle = 'rgba(80, 130, 255, 0.10)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    for (const alt of [30, 60]) {
      const r = (90 - alt) / 90 * R;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    }

    // Azimuth lines (every 45°)
    ctx.strokeStyle = 'rgba(80, 130, 255, 0.06)';
    for (let deg = 0; deg < 360; deg += 45) {
      const rad = deg * PI / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.sin(rad), cy - R * Math.cos(rad));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Horizon circle
    ctx.strokeStyle = 'rgba(80, 130, 255, 0.30)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

    // ── labels ────────────────────────────────────────────────────────

    // Cardinal directions
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelR = R + 22;
    const cards = [[0,'N'],[45,'NE'],[90,'E'],[135,'SE'],[180,'S'],[225,'SW'],[270,'W'],[315,'NW']];
    for (const [deg, lbl] of cards) {
      const rad = deg * PI / 180;
      const primary = lbl.length === 1;
      ctx.fillStyle = primary ? 'rgba(140, 185, 230, 0.7)' : 'rgba(120, 160, 210, 0.35)';
      ctx.font = primary ? '14px monospace' : '10px monospace';
      ctx.fillText(lbl, cx + labelR * Math.sin(rad), cy - labelR * Math.cos(rad));
    }

    // Altitude labels along N meridian
    ctx.fillStyle = 'rgba(120, 170, 220, 0.30)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    for (const alt of [0, 30, 60]) {
      const r = (90 - alt) / 90 * R;
      ctx.fillText(alt + '°', cx + 5, cy - r - 4);
    }

    // Zenith crosshair
    ctx.strokeStyle = 'rgba(120, 170, 220, 0.20)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy);
    ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8);
    ctx.stroke();

    // ── celestial objects ─────────────────────────────────────────────

    const objs = [];
    for (const idx of SKY_BODIES) {
      const aa = this.altAz(idx);
      if (!aa) continue;
      // Skip objects more than 10° below horizon
      if (aa.alt * RAD < -10) continue;
      const body = this.sim.bodies[idx];
      const angR = body.physicalRadius / aa.dist;
      const discR = clamp(angR * ANGULAR_SCALE, MIN_DISC_R, MAX_DISC_R);
      const pos = this._project(aa.alt, aa.az, cx, cy, R);
      objs.push({ body, idx, alt: aa.alt, az: aa.az, dist: aa.dist, discR, ...pos });
    }

    // Draw far / below-horizon first
    objs.sort((a, b) => {
      const aa = a.alt >= 0 ? 1 : 0, bb = b.alt >= 0 ? 1 : 0;
      if (aa !== bb) return aa - bb;
      return b.dist - a.dist;
    });

    // Sun screen position (for phase orientation)
    const sunObj = objs.find(o => o.idx === 0);

    for (const o of objs) {
      const above = o.alt >= 0;
      ctx.globalAlpha = above ? 1 : 0.2;

      // Glow halo
      const glowR = o.idx === 0 ? o.discR * 5 : o.discR * 3;
      const glow = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, glowR);
      glow.addColorStop(0, hexAlpha(o.body.color, o.idx === 0 ? 0.5 : 0.3));
      glow.addColorStop(0.5, hexAlpha(o.body.color, o.idx === 0 ? 0.15 : 0.08));
      glow.addColorStop(1, hexAlpha(o.body.color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(o.x, o.y, glowR, 0, TAU); ctx.fill();

      // Body disc — Sun is solid, moons get phase shading
      if (o.idx === 0) {
        ctx.fillStyle = o.body.color;
        ctx.beginPath(); ctx.arc(o.x, o.y, o.discR, 0, TAU); ctx.fill();
      } else {
        this._drawMoonDisc(ctx, o, sunObj);
      }

      // Label
      ctx.fillStyle = above ? 'rgba(210, 230, 255, 0.85)' : 'rgba(210, 230, 255, 0.4)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(o.body.name, o.x, o.y - o.discR - 4);

      ctx.globalAlpha = 1;
    }
  }

  // ── phase-shaded moon disc ──────────────────────────────────────────

  _drawMoonDisc(ctx, moon, sunObj) {
    const qaia = this.sim.bodies[1];
    const sun  = this.sim.bodies[0];
    const body = moon.body;

    // Elongation (Sun-Qaia-Moon angle)
    const dsx = sun.x - qaia.x, dsy = sun.y - qaia.y;
    const dmx = body.x - qaia.x, dmy = body.y - qaia.y, dmz = body.z - qaia.z;
    const moonDist = Math.hypot(dmx, dmy, dmz);
    const sunDist  = Math.hypot(dsx, dsy);
    if (moonDist === 0 || sunDist === 0) return;

    const cosElong = clamp((dmx * dsx + dmy * dsy) / (moonDist * sunDist), -1, 1);
    const waning = (dsx * dmy - dsy * dmx) < 0;

    // Phase angle: 0 = full, π = new
    const alpha = Math.acos(-cosElong);
    const R = moon.discR;
    const tx = R * Math.abs(Math.cos(alpha));

    // Orient the terminator so the lit side faces the Sun on screen
    let rotation = 0;
    if (sunObj) {
      // Angle from moon to sun in screen space, minus π/2 because
      // the phase drawing has lit-on-the-right (= +x = angle 0),
      // but we want lit side pointing toward the sun.
      rotation = Math.atan2(sunObj.y - moon.y, sunObj.x - moon.x);
    }

    ctx.save();
    ctx.translate(moon.x, moon.y);
    ctx.rotate(rotation);
    if (waning) ctx.scale(1, -1);  // mirror across lit axis

    // Clip to disc
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.clip();

    // Dark base
    ctx.fillStyle = '#0e0e1e';
    ctx.fillRect(-R - 1, -R - 1, 2 * R + 2, 2 * R + 2);

    // Near new: stay dark
    if (alpha < PI * 0.95) {
      // Lit right semicircle
      ctx.fillStyle = body.color;
      ctx.beginPath();
      ctx.arc(0, 0, R, -PI / 2, PI / 2, false);
      ctx.closePath();
      ctx.fill();

      // Terminator ellipse
      if (alpha < PI / 2) {
        // Gibbous: extend lit area leftward
        ctx.fillStyle = body.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, tx, R, 0, PI / 2, -PI / 2, false);
        ctx.closePath();
        ctx.fill();
      } else if (alpha > PI / 2) {
        // Crescent: cut into lit area
        ctx.fillStyle = '#0e0e1e';
        ctx.beginPath();
        ctx.ellipse(0, 0, tx, R, 0, -PI / 2, PI / 2, false);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // ── stars ───────────────────────────────────────────────────────────

}

// ── helpers ──────────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function hexAlpha(hex, a) {
  const h = hex.replace('#', '').slice(0, 6);
  return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a.toFixed(3)})`;
}

function buildStars(count, seed) {
  let s = seed;
  const rand = () => { s |= 0; s = s + 0x6d2b79f5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push([rand(), rand(), rand() < 0.85 ? 0.5 : rand() * 1.2 + 0.5, 0.25 + rand() * 0.6]);
  }
  return stars;
}
