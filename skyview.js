// Sky view — full-window azimuthal equidistant projection of the sky
// as seen from Qaia's surface at a configurable (lat, lon) location.
// Zenith at center, horizon at rim. North up, east right.
//
// Coordinate pipeline:
//   1. Inertial ecliptic (x,y,z) — the simulation frame
//   2. Equatorial basis (p1,p2,p3) — rotated 23.5° around y to align with Qaia's equator
//   3. Body-fixed (b1,b2,b3) — spinning with Qaia's sidereal rotation
//   4. Observer local frame (zen,east,nor) — rotated to observer's lat/lon
//   5. Altitude / azimuth — from local frame components
//   6. Screen (x,y) — azimuthal equidistant projection onto a circle

import { PRIMUS_INCLINATION, QAIA_SIDEREAL_DAY } from './bodies.js';

// Body indices to display
const SKY_BODIES = [0, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12];
// Sun, moons (Primus–Septimus), planets (Bahamut, Qars, Fafnir, Tiamat)
const SKY_PLANETS = new Set([9, 10, 11, 12]);

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

    // Observer location on Qaia's surface.  Default: Qarangil (45°N, 30°E).
    // setLocation() precomputes trig for the observer frame.
    this.setLocation(45, 30);

    // Seeded star field (same PRNG as renderer.js but different seed)
    this.stars = buildStars(500, 0xCAFEBABE);
  }

  // Set observer latitude and longitude (in degrees).
  // Longitude is relative to the sub-Primus meridian; positive = east, negative = west.
  setLocation(latDeg, lonDeg) {
    this.latDeg = latDeg;
    this.lonDeg = lonDeg;
    const phi = latDeg * PI / 180;
    const lam = lonDeg * PI / 180;
    this._cosPhi = Math.cos(phi);
    this._sinPhi = Math.sin(phi);
    this._cosLam = Math.cos(lam);
    this._sinLam = Math.sin(lam);
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  // ── coordinate transform ──────────────────────────────────────────────
  //
  // Converts a body's inertial position to altitude/azimuth as seen by an
  // observer standing on Qaia's surface at (latitude φ, longitude λ)
  // relative to the sub-Primus meridian.
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
  //      as a 2D rotation of (p1, p2) by angle θ = ω·t.  The spin-axis
  //      component p3 is unaffected (rotation around an axis doesn't change
  //      the component along that axis).
  //
  //      After rotation:
  //        b1 = direction toward sub-Primus equatorial point
  //        b2 = east at that point
  //        b3 = north pole  (= p3, unchanged)
  //
  //  (c) Body-fixed → observer's local frame at (φ, λ):
  //
  //      The observer's zenith direction in body-fixed coords is:
  //        ẑ = (cosφ·cosλ,  cosφ·sinλ,  sinφ)
  //
  //      Local east and north directions:
  //        ê = (−sinλ,  cosλ,  0)
  //        n̂ = (−sinφ·cosλ,  −sinφ·sinλ,  cosφ)
  //
  //      Project the body direction onto these to get:
  //        zenith_component → altitude = arcsin(zen / dist)
  //        east_component, north_component → azimuth = atan2(east, north)

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

    // (b) Rotate into body-fixed frame by sidereal angle θ
    const theta = this.omega * this.sim.time;
    const c = Math.cos(theta), s = Math.sin(theta);
    const b1 =  c * p1 + s * p2;   // toward sub-Primus equatorial point
    const b2 = -s * p1 + c * p2;   // east at sub-Primus point
    const b3 = p3;                   // north pole (unchanged by rotation)

    // (c) Project onto observer's local frame at (φ, λ)
    const cP = this._cosPhi, sP = this._sinPhi;
    const cL = this._cosLam, sL = this._sinLam;

    const zen  =  b1 * cP * cL + b2 * cP * sL + b3 * sP;   // zenith
    const east = -b1 * sL       + b2 * cL;                   // east
    const nor  = -b1 * sP * cL - b2 * sP * sL + b3 * cP;   // north

    // Convert to altitude and azimuth
    const alt = Math.asin(clamp(zen / dist, -1, 1));
    const az  = Math.atan2(east, nor);   // 0 = north, π/2 = east

    // Local-frame unit vector (used for great-circle phase orientation)
    const ux = zen / dist, uy = east / dist, uz = nor / dist;

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
    // Stars have fixed ecliptic coordinates and rotate with Qaia's
    // sidereal rotation — they rise and set like real stars.
    // Opacity fades with sun altitude: full at night, invisible in daytime.
    const starAlpha = sunAltDeg > 0 ? clamp(1 - sunAltDeg / 15, 0, 0.15) : 0.8;
    if (starAlpha > 0.01) {
      const M = this._starMatrix();
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
      for (const [ex, ey, ez, r, a] of this.stars) {
        // Rotate ecliptic unit vector into observer's local frame
        const zen  = M[0] * ex + M[1] * ey + M[2] * ez;
        if (zen < -0.17) continue;  // skip stars well below horizon (> ~10°)
        const east = M[3] * ex + M[4] * ey + M[5] * ez;
        const nor  = M[6] * ex + M[7] * ey + M[8] * ez;
        // Alt/az → screen projection
        const alt = Math.asin(clamp(zen, -1, 1));
        const az  = Math.atan2(east, nor);
        const pr  = (PI / 2 - alt) / (PI / 2) * R;
        const sx  = cx + pr * Math.sin(az);
        const sy  = cy - pr * Math.cos(az);
        // Cull outside horizon circle
        const ddx = sx - cx, ddy = sy - cy;
        if (ddx * ddx + ddy * ddy > R * R) continue;
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
      const isPlanet = SKY_PLANETS.has(idx);
      if (isPlanet) {
        // Planets render as star-like points with brightness from physics
        const brightness = this._planetBrightness(body, aa.dist);
        const pos = this._project(aa.alt, aa.az, cx, cy, R);
        objs.push({ body, idx, alt: aa.alt, az: aa.az, dist: aa.dist, ux: aa.ux, uy: aa.uy, uz: aa.uz, isPlanet: true, brightness, ...pos });
      } else {
        // Apparent angular radius → disc size in pixels (exaggerated)
        const angR = body.physicalRadius / aa.dist;
        const discR = clamp(angR * ANGULAR_SCALE, MIN_DISC_R, MAX_DISC_R);
        const pos = this._project(aa.alt, aa.az, cx, cy, R);
        objs.push({ body, idx, alt: aa.alt, az: aa.az, dist: aa.dist, ux: aa.ux, uy: aa.uy, uz: aa.uz, discR, ...pos });
      }
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

      if (o.isPlanet) {
        // Fade planets in daylight, similar to stars.  Brighter planets
        // (like Fafnir/Venus) linger a few degrees longer.
        const dayFade = sunAltDeg > 0
          ? clamp(1 - sunAltDeg / (15 + o.brightness * 10), 0, 1)
          : 1;
        if (dayFade > 0.01) {
          ctx.globalAlpha *= dayFade;
          this._drawPlanet(ctx, o);
          if (this.showLabels) {
            ctx.fillStyle = above ? 'rgba(210, 230, 255, 0.85)' : 'rgba(210, 230, 255, 0.4)';
            ctx.font = '11px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(o.body.name, o.x, o.y - 3 - 4);
          }
        }
      } else {
        // Glow halo — for moons, scale by illuminated fraction so new
        // moons don't glow as brightly as full moons.
        let glowScale = 1;
        if (o.idx !== 0 && sunAA) {
          const qaia = this.sim.bodies[1];
          const sun  = this.sim.bodies[0];
          const body = o.body;
          const dsx = sun.x - qaia.x, dsy = sun.y - qaia.y;
          const dmx = body.x - qaia.x, dmy = body.y - qaia.y, dmz = body.z - qaia.z;
          const md = Math.hypot(dmx, dmy, dmz);
          const sd = Math.hypot(dsx, dsy);
          if (md > 0 && sd > 0) {
            const cosE = clamp((dmx * dsx + dmy * dsy) / (md * sd), -1, 1);
            glowScale = (1 - cosE) / 2;  // 0 at new, 1 at full
          }
        }
        const glowR = o.idx === 0 ? o.discR * 5 : o.discR * 3;
        const glow = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, glowR);
        glow.addColorStop(0, hexAlpha(o.body.color, (o.idx === 0 ? 0.5 : 0.3) * glowScale));
        glow.addColorStop(0.5, hexAlpha(o.body.color, (o.idx === 0 ? 0.15 : 0.08) * glowScale));
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
      }

      ctx.globalAlpha = 1;
    }
  }

  // ── planet brightness and rendering ─────────────────────────────────
  //
  // Planets appear as point-like colored stars.  Apparent brightness is
  // proportional to:
  //
  //   B ∝ albedo × R² / (r_sun² × r_qaia²) × Φ(α)
  //
  // where r_sun = Sun–planet distance, r_qaia = Qaia–planet distance,
  // R = physical radius, and Φ(α) is the Lambertian diffuse sphere phase
  // function:
  //
  //   Φ(α) = [ sin(α) + (π − α) cos(α) ] / π
  //
  // The result is normalized so that Venus at opposition (α=0, r=0.28 AU)
  // maps to brightness ≈ 1.0.

  _planetBrightness(body, distFromQaia) {
    const qaia = this.sim.bodies[1];
    const sun  = this.sim.bodies[0];

    // Sun–planet distance
    const dsx = body.x - sun.x, dsy = body.y - sun.y, dsz = (body.z || 0) - (sun.z || 0);
    const rSun = Math.sqrt(dsx * dsx + dsy * dsy + dsz * dsz);
    if (rSun === 0 || distFromQaia === 0) return 0;

    // Phase angle: Sun-planet-Qaia angle
    // Vector from planet to Sun and planet to Qaia
    const toSunX = sun.x - body.x, toSunY = sun.y - body.y;
    const toQaiaX = qaia.x - body.x, toQaiaY = qaia.y - body.y;
    const dot = toSunX * toQaiaX + toSunY * toQaiaY;
    const magS = Math.sqrt(toSunX * toSunX + toSunY * toSunY);
    const magQ = Math.sqrt(toQaiaX * toQaiaX + toQaiaY * toQaiaY);
    const cosAlpha = clamp(dot / (magS * magQ), -1, 1);
    const alpha = Math.acos(cosAlpha);

    // Lambertian phase function
    const phi = (Math.sin(alpha) + (PI - alpha) * Math.cos(alpha)) / PI;

    const albedo = body.albedo || 0.3;
    const R = body.physicalRadius;

    // Raw flux (arbitrary units)
    const flux = albedo * R * R * phi / (rSun * rSun * distFromQaia * distFromQaia);

    // Normalize: Venus-like planet at opposition at closest approach (~0.28 AU)
    // gives flux_ref = 0.76 * R_venus² * 1 / ((0.723*AU)² * (0.277*AU)²)
    const AU = 1.49606e11;
    const R_V = 6.052e6;
    const fluxRef = 0.76 * R_V * R_V / ((0.723 * AU) ** 2 * (0.277 * AU) ** 2);

    return clamp(flux / fluxRef, 0, 1);
  }

  _drawPlanet(ctx, o) {
    const b = o.brightness;
    if (b < 0.001) return;

    // Map brightness to display size on a log scale for the huge dynamic
    // range between Tiamat and Fafnir.
    const logB = Math.log10(Math.max(b, 1e-4));  // -4 to 0
    const t = clamp((logB + 4) / 4, 0, 1);       // 0 to 1
    const dotR = 1.2 + t * 1.3;
    const alpha = 0.7 + t * 0.3;

    // Soft glow so planets are clearly brighter than any star
    const glowR = dotR * 4;
    const glow = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, glowR);
    glow.addColorStop(0, hexAlpha(o.body.color, 0.25 * t));
    glow.addColorStop(1, hexAlpha(o.body.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(o.x, o.y, glowR, 0, TAU); ctx.fill();

    ctx.fillStyle = hexAlpha(o.body.color, alpha);
    ctx.beginPath(); ctx.arc(o.x, o.y, dotR, 0, TAU); ctx.fill();
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
        // ellipse back to the top (clockwise through -tx).
        ctx.ellipse(0, 0, tx, R, 0, PI / 2, -PI / 2, false);
      } else {
        // Crescent: return along the RIGHT side of the terminator
        // ellipse back to the top (counterclockwise through +tx).
        ctx.ellipse(0, 0, tx, R, 0, PI / 2, -PI / 2, true);
      }
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  // ── star rotation matrix ───────────────────────────────────────────
  //
  // Computes the 3×3 rotation matrix from ecliptic unit vectors to
  // the observer's local (zenith, east, north) frame.  This composes
  // the axial tilt, sidereal rotation, and observer lat/lon into one
  // matrix so we can transform all 500 stars with 9 multiplies each.
  //
  // Returns a flat array [m00,m01,m02, m10,m11,m12, m20,m21,m22]
  // where row 0 = zenith, row 1 = east, row 2 = north.

  _starMatrix() {
    const cI = this.cosI, sI = this.sinI;
    const theta = this.omega * this.sim.time;
    const c = Math.cos(theta), s = Math.sin(theta);
    const cP = this._cosPhi, sP = this._sinPhi;
    const cL = this._cosLam, sL = this._sinLam;

    // Step 1+2: ecliptic (x,y,z) → body-fixed (b1,b2,b3)
    // b1 = c·cI·x + s·y - c·sI·z
    // b2 = -s·cI·x + c·y + s·sI·z
    // b3 = sI·x + cI·z
    const a00 = c * cI,  a01 = s,  a02 = -c * sI;
    const a10 = -s * cI, a11 = c,  a12 = s * sI;
    const a20 = sI,      a21 = 0,  a22 = cI;

    // Step 3: body-fixed (b1,b2,b3) → observer (zen,east,nor)
    // zen  = cP·cL·b1 + cP·sL·b2 + sP·b3
    // east = -sL·b1 + cL·b2
    // nor  = -sP·cL·b1 - sP·sL·b2 + cP·b3
    const o00 = cP * cL, o01 = cP * sL, o02 = sP;
    const o10 = -sL,     o11 = cL,      o12 = 0;
    const o20 = -sP * cL, o21 = -sP * sL, o22 = cP;

    // Compose: M = O × A
    return [
      o00*a00 + o01*a10 + o02*a20,  o00*a01 + o01*a11 + o02*a21,  o00*a02 + o01*a12 + o02*a22,
      o10*a00 + o11*a10 + o12*a20,  o10*a01 + o11*a11 + o12*a21,  o10*a02 + o11*a12 + o12*a22,
      o20*a00 + o21*a10 + o22*a20,  o20*a01 + o21*a11 + o22*a21,  o20*a02 + o21*a12 + o22*a22,
    ];
  }

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
    // Fixed ecliptic coordinates — uniform on the celestial sphere.
    // θ = ecliptic longitude [0, 2π), φ = ecliptic latitude via arcsin.
    const theta = rand() * 2 * PI;
    const phi   = Math.asin(2 * rand() - 1);
    const cp = Math.cos(phi);
    // Unit vector in the ecliptic (inertial) frame
    const ex = cp * Math.cos(theta);
    const ey = cp * Math.sin(theta);
    const ez = Math.sin(phi);
    // Display properties: r = radius, a = base opacity
    const r = rand() < 0.85 ? 0.5 : rand() * 1.2 + 0.5;
    const a = 0.25 + rand() * 0.6;
    stars.push([ex, ey, ez, r, a]);
  }
  // Pole star — bright star on the spin axis (ecliptic coords of the north pole).
  // I = 23.5° axial tilt → ecliptic unit vector = (sinI, 0, cosI).
  const I = 23.5 * PI / 180;
  stars.push([Math.sin(I), 0, Math.cos(I), 1.4, 0.9]);
  return stars;
}
