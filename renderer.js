'use strict';

class Renderer {
  constructor(canvas, sim) {
    this.canvas          = canvas;
    this.ctx             = canvas.getContext('2d');
    this.sim             = sim;

    // View state (metres per CSS pixel)
    this.scale           = 5e8;
    this.followIndex     = null;  // null = fixed CoM origin
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

    const trail = body.trail;
    const n = trail.length;
    if (n < 2) return;

    const ctx = this.ctx;
    const GROUPS = 6;
    const groupSize = Math.ceil(n / GROUPS);

    for (let g = 0; g < GROUPS; g++) {
      const alpha  = ((g + 1) / GROUPS) * 0.65;
      const start  = g * groupSize;
      const end    = Math.min(start + groupSize + 1, n); // +1 for continuity

      ctx.beginPath();
      ctx.strokeStyle = hexAlpha(body.trailColor, alpha);
      ctx.lineWidth   = 1;

      const p0 = this._trailToScreen(trail[start].x, trail[start].y);
      ctx.moveTo(p0.sx, p0.sy);

      for (let i = start + 1; i < end; i++) {
        const p = this._trailToScreen(trail[i].x, trail[i].y);
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
    const x = 20, y = H - 36;

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
  const stars = [];
  for (let i = 0; i < count; i++) {
    const fx    = Math.random();
    const fy    = Math.random();
    const r     = Math.random() < 0.85 ? 0.5 : Math.random() * 1.2 + 0.6;
    const alpha = 0.3 + Math.random() * 0.6;
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
