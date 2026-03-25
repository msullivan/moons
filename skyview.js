// Sky view — full-window azimuthal equidistant projection of the sky
// as seen from Qaia's surface (equatorial observer at sub-Primus longitude).
// Zenith at center, horizon at rim. North up, east right.
//
// Coordinate pipeline:
//   1. Inertial ecliptic (x,y,z) — the simulation frame
//   2. Equatorial basis (p1,p2,p3) — rotated 23.5° around y to align with Qaia's equator
//   3. Body-fixed (b1,b2,b3) — spinning with Qaia's sidereal rotation
//   4. Altitude / azimuth — observer's local horizon frame
//   5. Screen (x,y) — azimuthal equidistant projection onto a circle

import { PRIMUS_INCLINATION, QAIA_SIDEREAL_DAY } from './bodies.js';

// Body indices to display
const SKY_BODIES = [0, 2, 3, 4, 5, 6, 7];
// Sun, Primus, Secundus, Tertius, Quartus, Sextus, Septimus

// Disc sizes are exaggerated — real angular diameters are sub-pixel.
// Tertius (largest apparent moon) ≈ 0.005 rad → 16px at this scale.
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
    this.showLabels = true;

    // Precompute trig for the 23.5° axial tilt (ecliptic → equatorial rotation).
    this.cosI = Math.cos(PRIMUS_INCLINATION);
    this.sinI = Math.sin(PRIMUS_INCLINATION);
    // Sidereal rotation rate (rad/s).  One full turn = one sidereal day.
    this.omega = TAU / QAIA_SIDEREAL_DAY;

    // Seeded star field (same PRNG as renderer.js but different seed)
    this.stars = buildStars(500, 0xCAFEBABE);
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  // ── coordinate transform ──────────────────────────────────────────────
  //
  // Converts a body's inertial position to altitude/azimuth as seen by an
  // observer standing on Qaia's equator at the sub-Primus longitude.
  //
  // The transform has three stages:
  //
  //  (a) Ecliptic → equatorial: rotate (dx, dz) by the axial tilt I = 23.5°
  //      around the y-axis.  This aligns the coordinate system with Qaia's
  //      equator rather than the orbital plane.
  //
  //      Equatorial basis vectors (in inertial/ecliptic components):
  //        e1(0) = (cosI, 0, −sinI)  — prime meridian at t=0 (toward Primus)
  //        e2    = (0, 1, 0)         — 90° east in the equatorial plane
  //        e3    = (sinI, 0, cosI)   — spin axis (north pole)
  //
  //      p1, p2, p3 = dot products of the direction vector with these basis
  //      vectors.  They are still inertial (non-rotating).
  //
  //  (b) Inertial equatorial → body-fixed: apply Qaia's sidereal rotation
  //      as a 2D rotation of (p1, p2) by angle φ = ω·t.  The spin-axis
  //      component p3 is unaffected (rotation around an axis doesn't change
  //      the component along that axis).
  //
  //      After rotation:
  //        b1 = zenith direction for the sub-Primus observer
  //        b2 = east
  //        b3 = north  (= p3, unchanged)
  //
  //  (c) Body-fixed → alt/az:
  //        altitude = arcsin(b1 / distance)   — angle above the horizon
  //        azimuth  = atan2(b2, b3)           — compass bearing, 0=N, π/2=E

  altAz(bodyIndex) {
    const qaia = this.sim.bodies[1];
    const body = this.sim.bodies[bodyIndex];

    // Direction vector from Qaia to body (inertial ecliptic frame)
    const dx = body.x - qaia.x;
    const dy = body.y - qaia.y;
    const dz = body.z - qaia.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist === 0) return null;

    // (a) Project onto equatorial basis — rotation of (x,z) by tilt I
    const p1 = dx * this.cosI - dz * this.sinI;   // equatorial radial
    const p2 = dy;                                  // equatorial east
    const p3 = dx * this.sinI + dz * this.cosI;   // spin axis (north)

    // (b) Rotate into body-fixed frame by sidereal angle φ
    const phi = this.omega * this.sim.time;
    const c = Math.cos(phi), s = Math.sin(phi);
    const b1 =  c * p1 + s * p2;   // zenith component
    const b2 = -s * p1 + c * p2;   // east component
    const b3 = p3;                   // north (unchanged by rotation)

    // (c) Convert to altitude and azimuth
    const alt = Math.asin(clamp(b1 / dist, -1, 1));
    const az  = Math.atan2(b2, b3);   // 0 = north, π/2 = east

    // Body-fixed unit vector (used for great-circle phase orientation)
    const ux = b1 / dist, uy = b2 / dist, uz = b3 / dist;

    return { alt, az, dist, ux, uy, uz };
  }

  // ── azimuthal equidistant projection ──────────────────────────────────
  //
  // Maps the sky hemisphere onto a flat circle.  The angular distance from
  // zenith (= π/2 − altitude) maps linearly to the radial distance from
  // the circle's center:
  //
  //   r = (π/2 − alt) / (π/2) × R
  //
  //   alt = 90° (zenith)  → r = 0  (center)
  //   alt =  0° (horizon) → r = R  (rim)
  //   alt < 0°            → r > R  (outside, drawn dimmed)
  //
  // Azimuth maps to the angle on screen.  Convention: north (az=0) points
  // up (−y on screen), east (az=π/2) points right (+x).
  //
  //   screen_x = cx + r · sin(az)
  //   screen_y = cy − r · cos(az)

  _project(alt, az, cx, cy, R) {
    const r = (PI / 2 - alt) / (PI / 2) * R;
    return {
      x: cx + r * Math.sin(az),
      y: cy - r * Math.cos(az),
    };
  }

  // ── great-circle screen angle ─────────────────────────────────────────
  //
  // Returns the screen-space direction from `from` toward `to` along
  // the great circle on the celestial sphere.  Used to orient the lit
  // side of moon phase discs toward the Sun.
  //
  // A naïve atan2(toScreen − fromScreen) fails because the azimuthal
  // equidistant projection is nonlinear — the straight screen line
  // doesn't follow the great circle.
  //
  // Instead we use finite differencing: nudge `from` a tiny amount
  // along the great circle toward `to`, project both through _project(),
  // and measure the screen angle between them.  This is projection-
  // agnostic — works for any sky-to-screen mapping.

  _greatCircleScreenAngle(from, to) {
    if (from.ux === undefined || to.ux === undefined) return 0;

    const mx = from.ux, my = from.uy, mz = from.uz;
    const sx = to.ux,   sy = to.uy,   sz = to.uz;

    // Great-circle tangent at `from` toward `to`.
    // Decompose ŝ (to) into components parallel and perpendicular to m̂ (from):
    //   parallel:      dot * m̂       where dot = ŝ · m̂  (dot product, a scalar)
    //   perpendicular: ŝ − dot * m̂   ← this is the tangent
    // The perpendicular part lies in the tangent plane of the sphere at
    // m̂ and points toward ŝ — the great-circle direction.
    const dot = sx * mx + sy * my + sz * mz;
    let tx = sx - dot * mx;
    let ty = sy - dot * my;
    let tz = sz - dot * mz;
    const tlen = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (tlen < 1e-12) return 0;  // degenerate (coincident or antipodal)
    tx /= tlen; ty /= tlen; tz /= tlen;

    // Nudge `from` along the tangent (small ε keeps the projection linear)
    const eps = 0.002;
    let nx = mx + eps * tx;
    let ny = my + eps * ty;
    let nz = mz + eps * tz;
    const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz);
    nx /= nlen; ny /= nlen; nz /= nlen;

    // Convert nudged point back to alt/az and project both
    const nalt = Math.asin(clamp(nx, -1, 1));
    const naz  = Math.atan2(ny, nz);

    const W = this.canvas.width, H = this.canvas.height;
    const R = Math.min(W, H) / 2 - 40;
    const cx = W / 2, cy = H / 2;
    const pFrom  = this._project(from.alt, from.az, cx, cy, R);
    const pNudge = this._project(nalt, naz, cx, cy, R);

    return Math.atan2(pNudge.y - pFrom.y, pNudge.x - pFrom.x);
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
    // Radial gradient centered on the Sun's projected position.
    // −18° is the astronomical twilight threshold; below that, the sky
    // is fully dark.  The intensity ramps linearly from 0 at −18° to
    // full at +12°.  Daytime gets blue, twilight gets warm orange.
    if (sunAA && sunAltDeg > -18) {
      const sp = this._project(sunAA.alt, sunAA.az, cx, cy, R);
      const t = clamp((sunAltDeg + 18) / 30, 0, 1);  // 0 at −18°, 1 at +12°
      const grad = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, R * 1.5);
      if (sunAltDeg > 0) {
        // Daytime: blue sky wash
        grad.addColorStop(0,   hexAlpha('#4080c0', 0.25 * t));
        grad.addColorStop(0.4, hexAlpha('#1a3060', 0.12 * t));
        grad.addColorStop(1,   'rgba(0,0,0,0)');
      } else {
        // Twilight: warm horizon glow
        grad.addColorStop(0,   hexAlpha('#805030', 0.18 * t));
        grad.addColorStop(0.4, hexAlpha('#402818', 0.08 * t));
        grad.addColorStop(1,   'rgba(0,0,0,0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    }

    // ── stars ─────────────────────────────────────────────────────────
    // Fixed star field rendered inside the horizon circle.  Opacity fades
    // with sun altitude: full brightness at night, nearly invisible in
    // daytime (above +15° solar altitude).
    const starAlpha = sunAltDeg > 0 ? clamp(1 - sunAltDeg / 15, 0, 0.15) : 0.8;
    if (starAlpha > 0.01) {
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
      for (const [fx, fy, r, a] of this.stars) {
        const sx = cx + (fx * 2 - 1) * R;
        const sy = cy + (fy * 2 - 1) * R;
        const dx = sx - cx, dy = sy - cy;
        if (dx * dx + dy * dy > R * R) continue;
        ctx.fillStyle = `rgba(255,255,255,${(a * starAlpha).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    // ── grid ──────────────────────────────────────────────────────────

    // Altitude circles at 30° and 60° — concentric rings inside the
    // horizon circle, spaced by equal angular distance from zenith.
    ctx.strokeStyle = 'rgba(80, 130, 255, 0.10)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    for (const alt of [30, 60]) {
      const r = (90 - alt) / 90 * R;   // same formula as _project, in degrees
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    }

    // Azimuth lines every 45° — radial spokes from zenith to horizon.
    ctx.strokeStyle = 'rgba(80, 130, 255, 0.06)';
    for (let deg = 0; deg < 360; deg += 45) {
      const rad = deg * PI / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.sin(rad), cy - R * Math.cos(rad));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Horizon circle — the boundary between visible sky and ground.
    ctx.strokeStyle = 'rgba(80, 130, 255, 0.30)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

    // ── labels ────────────────────────────────────────────────────────

    // Cardinal directions around the rim
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

    // Altitude labels along the N meridian
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
      if (aa.alt * RAD < -10 && idx !== 0) continue;  // skip far-below-horizon objects (but keep Sun for phase rendering)
      const body = this.sim.bodies[idx];
      // Apparent angular radius → disc size in pixels (exaggerated)
      const angR = body.physicalRadius / aa.dist;
      const discR = clamp(angR * ANGULAR_SCALE, MIN_DISC_R, MAX_DISC_R);
      const pos = this._project(aa.alt, aa.az, cx, cy, R);
      objs.push({ body, idx, alt: aa.alt, az: aa.az, dist: aa.dist, ux: aa.ux, uy: aa.uy, uz: aa.uz, discR, ...pos });
    }

    // Draw order: below-horizon objects first (behind), then far → near.
    objs.sort((a, b) => {
      const aa = a.alt >= 0 ? 1 : 0, bb = b.alt >= 0 ? 1 : 0;
      if (aa !== bb) return aa - bb;
      return b.dist - a.dist;
    });

    // Sun's screen position is needed by _drawMoonDisc to orient phases.
    const sunObj = objs.find(o => o.idx === 0);

    for (const o of objs) {
      const above = o.alt >= 0;
      ctx.globalAlpha = above ? 1 : 0.2;

      // Glow halo (Sun gets a larger, brighter one)
      const glowR = o.idx === 0 ? o.discR * 5 : o.discR * 3;
      const glow = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, glowR);
      glow.addColorStop(0, hexAlpha(o.body.color, o.idx === 0 ? 0.5 : 0.3));
      glow.addColorStop(0.5, hexAlpha(o.body.color, o.idx === 0 ? 0.15 : 0.08));
      glow.addColorStop(1, hexAlpha(o.body.color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(o.x, o.y, glowR, 0, TAU); ctx.fill();

      // Body disc — Sun is solid yellow, moons get phase shading
      if (o.idx === 0) {
        ctx.fillStyle = o.body.color;
        ctx.beginPath(); ctx.arc(o.x, o.y, o.discR, 0, TAU); ctx.fill();
      } else {
        this._drawMoonDisc(ctx, o, sunObj);
      }

      // Label
      if (this.showLabels) {
        ctx.fillStyle = above ? 'rgba(210, 230, 255, 0.85)' : 'rgba(210, 230, 255, 0.4)';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(o.body.name, o.x, o.y - o.discR - 4);
      }

      ctx.globalAlpha = 1;
    }
  }

  // ── phase-shaded moon disc ──────────────────────────────────────────
  //
  // Draws a moon disc with illumination matching the current Sun-Qaia-Moon
  // geometry.  Unlike the phase panel (which always puts the lit side on
  // the right), this view rotates the terminator so the lit edge faces the
  // Sun's position on screen — matching what you'd actually see in the sky.
  //
  // The illuminated fraction is determined by the elongation angle ε
  // (Sun-Qaia-Moon angle):
  //
  //   cosε = (d_sun · d_moon) / (|d_sun| · |d_moon|)
  //
  // The phase angle α (angle at the moon between Sun and observer):
  //
  //   α = arccos(−cosε)
  //
  //   α = 0  → full moon  (opposite the Sun, cosε = −1)
  //   α = π  → new moon   (same direction as Sun, cosε = +1)
  //
  // The terminator (day/night boundary on the disc) is an ellipse whose
  // x semi-axis = R·|cos(α)|.  At quarter phase (α = π/2) the terminator
  // is a straight line.  For gibbous phases (α < π/2), the lit ellipse
  // extends past the midline; for crescents (α > π/2), the dark ellipse
  // cuts into the lit semicircle.
  //
  // Waxing vs waning doesn't require special handling: the rotation
  // (computed via great-circle finite difference) already points the lit
  // semicircle toward the Sun, so the terminator is on the correct side
  // in both cases.

  _drawMoonDisc(ctx, moon, sunObj) {
    const qaia = this.sim.bodies[1];
    const sun  = this.sim.bodies[0];
    const body = moon.body;

    // Direction vectors from Qaia to Sun and Moon (inertial frame)
    const dsx = sun.x - qaia.x, dsy = sun.y - qaia.y;
    const dmx = body.x - qaia.x, dmy = body.y - qaia.y, dmz = body.z - qaia.z;
    const moonDist = Math.hypot(dmx, dmy, dmz);
    const sunDist  = Math.hypot(dsx, dsy);
    if (moonDist === 0 || sunDist === 0) return;

    // Elongation: cos of the Sun-Qaia-Moon angle
    const cosElong = clamp((dmx * dsx + dmy * dsy) / (moonDist * sunDist), -1, 1);
    // Phase angle α: 0 = full (opposite Sun), π = new (same as Sun)
    const alpha = Math.acos(-cosElong);
    const R = moon.discR;
    // Terminator ellipse x semi-axis: R at full, 0 at quarter, R at new
    const tx = R * Math.abs(Math.cos(alpha));

    const rotation = sunObj ? this._greatCircleScreenAngle(moon, sunObj) : 0;

    ctx.save();
    ctx.translate(moon.x, moon.y);
    ctx.rotate(rotation);           // align lit side → Sun direction

    // Clip to disc boundary
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.clip();

    // Near full moon (α < 9°): disc is entirely lit.  The terminator
    // is sub-pixel at this phase, and the great-circle tangent toward the
    // Sun is ill-defined near opposition (ŝ ≈ −m̂), so we skip the
    // rotation-dependent rendering entirely.
    if (alpha < 0.16) {   // ~9° — at this phase the terminator is sub-pixel, and the
      ctx.fillStyle = body.color;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }

    // Dark base (night side)
    ctx.fillStyle = '#0e0e1e';
    ctx.fillRect(-R - 1, -R - 1, 2 * R + 2, 2 * R + 2);

    // Near new moon (α ≥ 95% of π): disc stays fully dark
    if (alpha < PI * 0.95) {
      // Draw the entire lit region as a single path to avoid an
      // anti-aliasing seam where the semicircle meets the terminator.
      ctx.fillStyle = body.color;
      ctx.beginPath();
      // Right semicircle arc (top → bottom, clockwise)
      ctx.arc(0, 0, R, -PI / 2, PI / 2, false);
      if (alpha < PI / 2) {
        // Gibbous: continue along the LEFT side of the terminator
        // ellipse back to the top (counterclockwise through -tx).
        ctx.ellipse(0, 0, tx, R, 0, PI / 2, -PI / 2, true);
      } else {
        // Crescent: return along the RIGHT side of the terminator
        // ellipse back to the top (clockwise through +tx).
        ctx.ellipse(0, 0, tx, R, 0, PI / 2, -PI / 2, false);
      }
      ctx.closePath();
      ctx.fill();
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

// Mulberry32 PRNG — deterministic star field, same every page load.
function buildStars(count, seed) {
  let s = seed;
  const rand = () => { s |= 0; s = s + 0x6d2b79f5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const stars = [];
  for (let i = 0; i < count; i++) {
    // [fx, fy] ∈ [0,1)² mapped to the bounding square of the sky circle;
    // points outside the circle are culled at render time.
    // r = display radius, a = base opacity.
    stars.push([rand(), rand(), rand() < 0.85 ? 0.5 : rand() * 1.2 + 0.5, 0.25 + rand() * 0.6]);
  }
  return stars;
}
