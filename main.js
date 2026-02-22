'use strict';

// ─── globals ────────────────────────────────────────────────────────────────

// Body indices for the phase panel (outer→inner)
const PHASE_BODIES = [2, 3, 5, 4]; // Primus, Secundus, Tertius, Quartus

let sim, renderer;
let running        = false;
let orbitBodyIndex = 2;  // default: first moon (Primus)
let lastTs         = null;
let stepAccum      = 0;      // fractional steps carried over between frames

// sim-seconds per real-second
let simSpeed = 86400;  // default: 1 day / second

// Maximum steps per frame (prevents tab from freezing at very high speeds)
const MAX_STEPS_PER_FRAME = 80000;

const SPEED_PRESETS = [
  { label: '6h/s',      value: 3600 * 6 },
  { label: '1 day/s',   value: 86400 },
  { label: '1 wk/s',    value: 86400 * 7 },
  { label: '1 mo/s',    value: 86400 * 30.4375 },
  { label: '1 yr/s',    value: 86400 * 365.25 },
  { label: '10 yr/s',   value: 86400 * 365.25 * 10 },
  { label: '100 yr/s',  value: 86400 * 365.25 * 100 },
];

// ─── init ───────────────────────────────────────────────────────────────────

function init() {
  const canvas = document.getElementById('sim-canvas');
  resizeCanvas(canvas);
  window.addEventListener('resize', () => resizeCanvas(canvas));

  sim      = new Simulation();
  renderer = new Renderer(canvas, sim);

  buildUI(canvas);

  running = true;
  updatePlayBtn();
  requestAnimationFrame(tick);
}

function resizeCanvas(canvas) {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}

// ─── animation loop ──────────────────────────────────────────────────────────

function tick(ts) {
  if (lastTs === null) lastTs = ts;
  const dtReal = Math.min((ts - lastTs) / 1000, 0.1); // cap at 100 ms
  lastTs = ts;

  if (running) {
    stepAccum += (dtReal * simSpeed) / sim.dt;
    const steps = Math.floor(stepAccum);
    stepAccum  -= steps;

    const actual        = Math.min(steps, MAX_STEPS_PER_FRAME);
    const trailInterval = Math.max(10, Math.floor(actual / 300));

    if (actual > 0) sim.advance(actual, trailInterval, renderer.followIndex);
  }

  renderer.render();
  updateHUD();
  requestAnimationFrame(tick);
}

// ─── HUD ─────────────────────────────────────────────────────────────────────

function orbitalElements(body, primary) {
  const mu = G * primary.mass;
  const rx = body.x - primary.x, ry = body.y - primary.y, rz = body.z - primary.z;
  const vx = body.vx - primary.vx, vy = body.vy - primary.vy, vz = body.vz - primary.vz;
  const r = Math.sqrt(rx*rx + ry*ry + rz*rz);
  const v2 = vx*vx + vy*vy + vz*vz;

  // Specific orbital energy → semi-major axis
  const eps = v2 / 2 - mu / r;
  if (eps >= 0) return null; // unbound
  const a = -mu / (2 * eps);

  // Angular momentum vector → inclination
  const hx = ry*vz - rz*vy, hy = rz*vx - rx*vz, hz = rx*vy - ry*vx;
  const h = Math.sqrt(hx*hx + hy*hy + hz*hz);
  const inc = Math.acos(Math.max(-1, Math.min(1, hz / h)));

  // Eccentricity vector magnitude
  const rdotv = rx*vx + ry*vy + rz*vz;
  const ex = (v2/mu - 1/r)*rx - (rdotv/mu)*vx;
  const ey = (v2/mu - 1/r)*ry - (rdotv/mu)*vy;
  const ez = (v2/mu - 1/r)*rz - (rdotv/mu)*vz;
  const e = Math.sqrt(ex*ex + ey*ey + ez*ez);

  // Period
  const T = 2 * Math.PI * Math.sqrt(a*a*a / mu);

  return { a, e, inc, T, r };
}

function updateHUD() {
  const days  = sim.time / 86400;
  const years = days / 365.25;

  let timeStr;
  if (years >= 2)      timeStr = `${years.toFixed(1)} yr`;
  else if (days >= 60) timeStr = `${(days / 30.4375).toFixed(1)} mo`;
  else                 timeStr = `${days.toFixed(1)} days`;

  const err  = sim.energyError() * 100;
  const sign = err >= 0 ? '+' : '';

  document.getElementById('hud-time').textContent   = `T: ${timeStr}`;
  document.getElementById('hud-energy').textContent = `ΔE/E₀: ${sign}${err.toExponential(2)}`;

  updateMoonPhases();

  // Orbital elements panel
  const body    = sim.bodies[orbitBodyIndex];
  const primary = sim.bodies[1]; // Qaia
  if (body && body !== primary) {
    const oe = orbitalElements(body, primary);
    if (oe) {
      const LD = LUNAR_DIST;
      document.getElementById('oe-a').textContent = (oe.a / LD).toFixed(3) + ' LD';
      document.getElementById('oe-e').textContent = oe.e.toFixed(4);
      document.getElementById('oe-i').textContent = (oe.inc * 180 / Math.PI).toFixed(2) + '°';
      document.getElementById('oe-T').textContent = (oe.T / 86400).toFixed(2) + ' d';
      document.getElementById('oe-r').textContent = (oe.r / LD).toFixed(3) + ' LD';
    } else {
      ['oe-a','oe-e','oe-i','oe-T','oe-r'].forEach(id =>
        document.getElementById(id).textContent = 'unbound');
    }
  }
}

// ─── Moon phases ─────────────────────────────────────────────────────────────

function buildPhasePanel() {
  const panel = document.getElementById('phase-panel');
  PHASE_BODIES.forEach(bi => {
    const body = sim.bodies[bi];
    const cell = document.createElement('div');
    cell.className = 'phase-cell';

    const canvas = document.createElement('canvas');
    canvas.id = `phase-canvas-${bi}`;
    canvas.width  = 64;
    canvas.height = 64;
    canvas.className = 'phase-canvas';

    const name = document.createElement('span');
    name.className   = 'phase-name';
    name.textContent = body.name;

    cell.appendChild(canvas);
    cell.appendChild(name);
    panel.appendChild(cell);
  });
}

function updateMoonPhases() {
  const sun  = sim.bodies[0];
  const qaia = sim.bodies[1];

  const dsx = sun.x - qaia.x;
  const dsy = sun.y - qaia.y;
  const sunDist = Math.hypot(dsx, dsy);

  PHASE_BODIES.forEach(bi => {
    const body   = sim.bodies[bi];
    const canvas = document.getElementById(`phase-canvas-${bi}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const dmx  = body.x - qaia.x;
    const dmy  = body.y - qaia.y;
    const moonDist = Math.hypot(dmx, dmy);
    if (moonDist === 0) return;

    const cosElong = Math.max(-1, Math.min(1,
      (dmx * dsx + dmy * dsy) / (moonDist * sunDist)));

    // Cross product: positive = moon CCW from sun (waxing), negative = waning
    const waning = (dsx * dmy - dsy * dmx) < 0;

    drawPhaseDisc(ctx, 32, 32, 26, cosElong, body.color, waning);
  });
}

// Draw a phase disc centered at (cx, cy) with radius R.
// cosElong = cos of Sun-Qaia-Moon elongation angle.
// Lit side is on the right (+x). cosElong=-1 → full, cosElong=1 → new.
function drawPhaseDisc(ctx, cx, cy, R, cosElong, moonColor, waning = false) {
  const PI = Math.PI;
  // Phase angle at moon: 0 = full, PI = new
  const alpha = Math.acos(-cosElong);
  // Terminator ellipse x semi-axis
  const tx = R * Math.abs(Math.cos(alpha));

  ctx.save();
  ctx.translate(cx, cy);
  // Flip disc when waning so dark fills in from the same side as light did,
  // producing a continuous one-directional sweep rather than back-and-forth.
  if (waning) ctx.rotate(PI);

  // Clip to disc
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, 2 * PI);
  ctx.clip();

  // Dark base
  ctx.fillStyle = '#0e0e1e';
  ctx.fillRect(-R, -R, 2 * R, 2 * R);

  // Lit right semicircle (sun side)
  ctx.fillStyle = moonColor;
  ctx.beginPath();
  ctx.arc(0, 0, R, -PI / 2, PI / 2, false); // clockwise through right
  ctx.closePath();
  ctx.fill();

  // Terminator ellipse adjustment
  if (alpha < PI / 2) {
    // Gibbous: fill left half of terminator ellipse with moon color (extends lit area)
    ctx.fillStyle = moonColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, tx, R, 0, PI / 2, -PI / 2, false); // clockwise through left
    ctx.closePath();
    ctx.fill();
  } else if (alpha > PI / 2) {
    // Crescent: fill right half of terminator ellipse dark (cuts into lit area)
    ctx.fillStyle = '#0e0e1e';
    ctx.beginPath();
    ctx.ellipse(0, 0, tx, R, 0, -PI / 2, PI / 2, false); // clockwise through right
    ctx.closePath();
    ctx.fill();
  }

  // Subtle ring outline
  ctx.strokeStyle = 'rgba(100,150,200,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, 2 * PI);
  ctx.stroke();

  ctx.restore();
}

// ─── UI setup ────────────────────────────────────────────────────────────────

function buildUI(canvas) {
  // Play / Pause
  document.getElementById('btn-play').addEventListener('click', togglePause);

  // Reset
  document.getElementById('btn-reset').addEventListener('click', () => {
    sim = new Simulation();
    renderer.sim = sim;
    stepAccum = 0;
  });

  // Speed presets
  const speedRow = document.getElementById('speed-presets');
  SPEED_PRESETS.forEach(({ label, value }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className   = 'ctrl-btn speed-btn';
    if (value === simSpeed) btn.classList.add('active');
    btn.addEventListener('click', () => {
      simSpeed = value;
      speedRow.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    speedRow.appendChild(btn);
  });

  // Follow select
  buildFollowSelect();

  // Phase panel
  buildPhasePanel();

  // Orbit select — skip Sun (0) and Qaia (1)
  const orbitSel = document.getElementById('orbit-select');
  sim.bodies.forEach((b, i) => {
    if (i < 2) return;
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = b.name;
    orbitSel.appendChild(opt);
  });
  orbitSel.value = String(orbitBodyIndex);
  orbitSel.addEventListener('change', () => {
    orbitBodyIndex = parseInt(orbitSel.value);
  });

  // Trails toggle
  const trailBtn = document.getElementById('btn-trails');
  trailBtn.classList.toggle('active', renderer.showTrails);
  trailBtn.addEventListener('click', () => {
    renderer.showTrails = !renderer.showTrails;
    trailBtn.classList.toggle('active', renderer.showTrails);
  });

  // Labels toggle
  const labelBtn = document.getElementById('btn-labels');
  labelBtn.classList.toggle('active', renderer.showLabels);
  labelBtn.addEventListener('click', () => {
    renderer.showLabels = !renderer.showLabels;
    labelBtn.classList.toggle('active', renderer.showLabels);
  });

  // Zoom buttons
  document.getElementById('btn-zoom-in').addEventListener('click',
    () => renderer.zoomAt(1 / 2, renderer.W / 2, renderer.H / 2));
  document.getElementById('btn-zoom-out').addEventListener('click',
    () => renderer.zoomAt(2, renderer.W / 2, renderer.H / 2));

  // Scroll wheel zoom
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : (1 / 1.12);
    renderer.zoomAt(factor, e.clientX, e.clientY);
  }, { passive: false });

  // Drag to pan
  setupPan(canvas);

  // Keyboard shortcuts
  window.addEventListener('keydown', handleKey);
}

function buildFollowSelect() {
  const sel = document.getElementById('follow-select');
  sel.innerHTML = '';

  const noneOpt     = document.createElement('option');
  noneOpt.value     = '-1';
  noneOpt.textContent = 'CoM';
  sel.appendChild(noneOpt);

  sim.bodies.forEach((b, i) => {
    const opt     = document.createElement('option');
    opt.value     = String(i);
    opt.textContent = b.name;
    sel.appendChild(opt);
  });

  updateFollowSelect();

  sel.addEventListener('change', () => {
    const v = parseInt(sel.value);
    renderer.followIndex = v >= 0 ? v : null;
    renderer.panX = 0;
    renderer.panY = 0;
    sim.clearTrails(); // trails were recorded in the old reference frame
  });
}

function updateFollowSelect() {
  const sel = document.getElementById('follow-select');
  sel.value  = renderer.followIndex === null ? '-1' : String(renderer.followIndex);
}

// ─── pan ─────────────────────────────────────────────────────────────────────

function setupPan(canvas) {
  let dragging = false;
  let lastX = 0, lastY = 0;

  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    renderer.panX -= dx * renderer.scale;
    renderer.panY += dy * renderer.scale;
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
    canvas.style.cursor = 'default';
  });

  // Touch pan
  let lastTouchX = 0, lastTouchY = 0, lastPinchDist = null;

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      lastPinchDist = null;
    } else if (e.touches.length === 2) {
      lastPinchDist = pinchDist(e.touches);
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && lastPinchDist === null) {
      const dx = e.touches[0].clientX - lastTouchX;
      const dy = e.touches[0].clientY - lastTouchY;
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      renderer.panX -= dx * renderer.scale;
      renderer.panY += dy * renderer.scale;
    } else if (e.touches.length === 2) {
      const d = pinchDist(e.touches);
      if (lastPinchDist !== null && d > 0) {
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        renderer.zoomAt(lastPinchDist / d, midX, midY);
      }
      lastPinchDist = d;
    }
  }, { passive: false });

  canvas.addEventListener('touchend', () => { lastPinchDist = null; }, { passive: true });
}

function pinchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── keyboard ────────────────────────────────────────────────────────────────

function handleKey(e) {
  if (e.target.tagName === 'SELECT') return;
  switch (e.key) {
    case ' ':
      e.preventDefault();
      togglePause();
      break;
    case '+': case '=':
      renderer.zoomAt(1 / 2, renderer.W / 2, renderer.H / 2);
      break;
    case '-': case '_':
      renderer.zoomAt(2, renderer.W / 2, renderer.H / 2);
      break;
    case 'r': case 'R':
      sim = new Simulation();
      renderer.sim = sim;
      stepAccum = 0;
      break;
    case 't': case 'T':
      renderer.showTrails = !renderer.showTrails;
      document.getElementById('btn-trails').classList.toggle('active', renderer.showTrails);
      break;
    case 'l': case 'L':
      renderer.showLabels = !renderer.showLabels;
      document.getElementById('btn-labels').classList.toggle('active', renderer.showLabels);
      break;
  }
}

function togglePause() {
  running = !running;
  updatePlayBtn();
}

function updatePlayBtn() {
  document.getElementById('btn-play').textContent = running ? '⏸' : '▶';
}

// ─── start ───────────────────────────────────────────────────────────────────

window.addEventListener('load', init);
