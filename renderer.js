'use strict';

class Renderer {
  constructor(canvas, sim) {
    this.canvas          = canvas;
    this.ctx             = canvas.getContext('2d');
    this.sim             = sim;

    // View state (metres per CSS pixel)
    this.scale           = 2e6;
    this.followIndex     = 1;     // follow Earth by default
    this.panX            = 0;    // world-space pan offset (metres)
    this.panY            = 0;

    this.showTrails      = true;
    this.showLabels      = true;

    // Random star field (screen-space, fixed)
    this.stars = buildStars(350);
  }

  // ─── coordinate helpers ─────────────────────────────────────────────────

  get W() { return this.canvas.clientWidth; }
  get H() { return this.canvas.clientHeight; }

  worldToScreen(wx, wy) {
    const ref = this.followIndex !== null
      ? this.sim.bodies[this.followIndex]
      : { x: 0, y: 0 };
    return {
      sx: this.W / 2 + (wx - ref.x - this.panX) / this.scale,
      sy: this.H / 2 - (wy - ref.y - this.panY) / this.scale,
    };
  }

  screenToWorld(sx, sy) {
    const ref = this.followIndex !== null
      ? this.sim.bodies[this.followIndex]
      : { x: 0, y: 0 };
    return {
      wx: ref.x + this.panX + (sx - this.W / 2) * this.scale,
      wy: ref.y + this.panY - (sy - this.H / 2) * this.scale,
    };
  }

  displayRadius(body) {
    return Math.max(body.minDisplayPx, body.physicalRadius / this.scale);
  }

  zoomAt(factor, pivotSx, pivotSy) {
    // Keep the world point under the cursor fixed while zooming.
    // Derivation: panX_new = panX_old + (pivotSx - W/2) * (scaleOld - scaleNew)
    //             panY_new = panY_old + (pivotSy - H/2) * (scaleNew - scaleOld)
    const scaleOld = this.scale;
    this.scale     = clamp(this.scale * factor, 1e4, 1e13);
    const delta    = this.scale - scaleOld;        // scaleNew - scaleOld
    this.panX     -= (pivotSx - this.W / 2) * delta;
    this.panY     += (pivotSy - this.H / 2) * delta;
  }

  // ─── main render ────────────────────────────────────────────────────────

  render() {
    const ctx = this.ctx;
    const W = this.W, H = this.H;

    // Background
    ctx.fillStyle = '#06060f';
    ctx.fillRect(0, 0, W, H);

    this._drawStars(W, H);

    if (this.showTrails) {
      for (const b of this.sim.bodies) this._drawTrail(b);
    }

    for (const b of this.sim.bodies) this._drawBody(b);

    this._drawScaleBar(H);
  }

  // ─── stars ──────────────────────────────────────────────────────────────

  _drawStars(W, H) {
    const ctx = this.ctx;
    for (const [fx, fy, r, alpha] of this.stars) {
      const sx = ((fx * W + W) % W);
      const sy = ((fy * H + H) % H);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Convert a trail point (already stored relative to the reference body) to screen.
  _trailToScreen(rx, ry) {
    return {
      sx: this.W / 2 + (rx - this.panX) / this.scale,
      sy: this.H / 2 - (ry - this.panY) / this.scale,
    };
  }

  // ─── trails ─────────────────────────────────────────────────────────────

  _drawTrail(body) {
    // The followed body's own trail is always (0,0) — skip it.
    if (this.followIndex !== null && body === this.sim.bodies[this.followIndex]) return;

    const n = body.trailCount;
    if (n < 2) return;

    const buf     = body.trailBuf;
    const head    = body.trailHead;
    const maxLen  = body.trailMaxLen;
    const ctx     = this.ctx;
    const GROUPS  = 6;
    const groupSize = Math.ceil(n / GROUPS);

    for (let g = 0; g < GROUPS; g++) {
      const start = g * groupSize;
      if (start >= n) break; // no data left for this group

      const alpha = ((g + 1) / GROUPS) * 0.65;
      const end   = Math.min(start + groupSize + 1, n); // +1 for continuity

      ctx.beginPath();
      ctx.strokeStyle = hexAlpha(body.trailColor, alpha);
      ctx.lineWidth   = 1;

      const s0 = buf[(head + start) % maxLen];
      const p0 = this._trailToScreen(s0.x, s0.y);
      ctx.moveTo(p0.sx, p0.sy);

      for (let k = start + 1; k < end; k++) {
        const s = buf[(head + k) % maxLen];
        const p = this._trailToScreen(s.x, s.y);
        ctx.lineTo(p.sx, p.sy);
      }
      ctx.stroke();
    }
  }

  // ─── bodies ─────────────────────────────────────────────────────────────

  _drawBody(body) {
    const ctx = this.ctx;
    const { sx, sy } = this.worldToScreen(body.x, body.y);
    const r = this.displayRadius(body);

    // Glow halo
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 4);
    glow.addColorStop(0,   hexAlpha(body.color, 0.5));
    glow.addColorStop(0.4, hexAlpha(body.color, 0.15));
    glow.addColorStop(1,   hexAlpha(body.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 4, 0, Math.PI * 2);
    ctx.fill();

    // Body disc
    ctx.fillStyle = body.color;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    // Continent rotation marker (Qaia only)
    if (body === this.sim.bodies[1]) {
      const SIDEREAL_DAY = 86164; // seconds
      const angle = (this.sim.time / SIDEREAL_DAY) * Math.PI * 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(sx, sy);
      ctx.rotate(angle);
      ctx.fillStyle = 'rgba(90, 125, 55, 0.88)';
      // Main continent
      const c1 = [
        [ 0.18,  0.55], [ 0.40,  0.78], [ 0.65,  0.70],
        [ 0.80,  0.42], [ 0.78,  0.10], [ 0.58, -0.08],
        [ 0.32, -0.12], [ 0.15,  0.12], [ 0.08,  0.35],
      ];
      ctx.beginPath();
      ctx.moveTo(c1[0][0] * r, c1[0][1] * r);
      for (let i = 1; i < c1.length; i++) ctx.lineTo(c1[i][0] * r, c1[i][1] * r);
      ctx.closePath();
      ctx.fill();
      // Second continent — wider and taller, just clockwise of the first
      const c2 = [
        [ 0.05,  0.32], [-0.12,  0.15], [-0.38,  0.08],
        [-0.58,  0.22], [-0.70,  0.45], [-0.65,  0.68],
        [-0.40,  0.80], [-0.15,  0.78], [ 0.05,  0.60],
        [ 0.08,  0.40],
      ];
      ctx.beginPath();
      ctx.moveTo(c2[0][0] * r, c2[0][1] * r);
      for (let i = 1; i < c2.length; i++) ctx.lineTo(c2[i][0] * r, c2[i][1] * r);
      ctx.closePath();
      ctx.fill();
      // Third continent — opposite side from c1
      const c3 = [
        [-0.45, -0.35], [-0.65, -0.20], [-0.78, -0.05],
        [-0.72,  0.15], [-0.50,  0.22], [-0.30,  0.10],
        [-0.20, -0.15], [-0.30, -0.28],
      ];
      ctx.beginPath();
      ctx.moveTo(c3[0][0] * r, c3[0][1] * r);
      for (let i = 1; i < c3.length; i++) ctx.lineTo(c3[i][0] * r, c3[i][1] * r);
      ctx.closePath();
      ctx.fill();
      // Fourth continent — opposite c2, clear of c1 (which ends at y≈-0.12)
      const c4 = [
        [ 0.10, -0.55], [ 0.30, -0.40], [ 0.52, -0.45],
        [ 0.62, -0.62], [ 0.52, -0.78], [ 0.25, -0.82],
        [ 0.08, -0.70],
      ];
      ctx.beginPath();
      ctx.moveTo(c4[0][0] * r, c4[0][1] * r);
      for (let i = 1; i < c4.length; i++) ctx.lineTo(c4[i][0] * r, c4[i][1] * r);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Night-side shadow (skip for the Sun itself)
    const sun = this.sim.bodies[0];
    if (body !== sun) {
      const { sx: sunSx, sy: sunSy } = this.worldToScreen(sun.x, sun.y);
      const dsx = sunSx - sx;
      const dsy = sunSy - sy;
      const dist = Math.sqrt(dsx * dsx + dsy * dsy);
      const nx = dist > 0 ? dsx / dist : 1;
      const ny = dist > 0 ? dsy / dist : 0;

      // Gradient from sun-facing edge (transparent) to night-side edge (dark)
      const shadow = ctx.createLinearGradient(
        sx + nx * r, sy + ny * r,
        sx - nx * r, sy - ny * r
      );
      shadow.addColorStop(0,    'rgba(0,0,0,0)');
      shadow.addColorStop(0.5,  'rgba(0,0,0,0)');
      shadow.addColorStop(0.55, 'rgba(0,0,0,0.65)');
      shadow.addColorStop(1,    'rgba(0,0,0,0.65)');

      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = shadow;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      ctx.restore();
    }

    // Label
    if (this.showLabels) {
      ctx.fillStyle  = 'rgba(210,230,255,0.85)';
      ctx.font       = '12px monospace';
      ctx.fillText(body.name, sx + r + 5, sy - r / 2);
    }
  }

  // ─── scale bar ──────────────────────────────────────────────────────────

  _drawScaleBar(H) {
    const ctx = this.ctx;

    // Target ~100 px bar; round to a nice value
    const targetM = 100 * this.scale;
    let barM, label;

    if (targetM < 1e6) {
      const km   = niceRound(targetM / 1e3);
      barM  = km * 1e3;
      label = `${km.toLocaleString()} km`;
    } else if (targetM < LUNAR_DIST * 0.5) {
      const k    = niceRound(targetM / 1e6);
      barM  = k * 1e6;
      label = `${k.toLocaleString()} Mm`;
    } else if (targetM < AU * 0.3) {
      const ld   = niceRound(targetM / LUNAR_DIST);
      barM  = ld * LUNAR_DIST;
      label = `${ld} LD`;
    } else {
      const au   = niceRound(targetM / AU);
      barM  = au * AU;
      label = `${au} AU`;
    }

    const barPx = barM / this.scale;
    const x = 20, y = H - 90;

    ctx.strokeStyle = 'rgba(180,220,255,0.65)';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);            ctx.lineTo(x + barPx, y);
    ctx.moveTo(x, y - 5);        ctx.lineTo(x, y + 5);
    ctx.moveTo(x + barPx, y - 5); ctx.lineTo(x + barPx, y + 5);
    ctx.stroke();

    ctx.fillStyle = 'rgba(180,220,255,0.7)';
    ctx.font      = '11px monospace';
    ctx.fillText(label, x + barPx / 2 - ctx.measureText(label).width / 2, y - 10);
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────

function buildStars(count) {
  // Seeded PRNG (mulberry32) so the star field is identical every page load.
  let s = 0xdeadbeef;
  const rand = () => { s |= 0; s = s + 0x6d2b79f5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  const stars = [];
  for (let i = 0; i < count; i++) {
    const fx    = rand();
    const fy    = rand();
    const r     = rand() < 0.85 ? 0.5 : rand() * 1.2 + 0.6;
    const alpha = 0.3 + rand() * 0.6;
    stars.push([fx, fy, r, alpha]);
  }
  return stars;
}

function hexAlpha(hex, alpha) {
  // Handles both '#RRGGBB' and '#RRGGBBAA' (ignore existing alpha)
  const h = hex.replace('#', '').slice(0, 6);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

function niceRound(v) {
  if (v <= 0) return 1;
  const mag  = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  if (norm < 1.5) return mag;
  if (norm < 3.5) return 2 * mag;
  if (norm < 7.5) return 5 * mag;
  return 10 * mag;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
