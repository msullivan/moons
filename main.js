'use strict';

// ─── globals ────────────────────────────────────────────────────────────────

let sim, renderer;
let running        = false;
let lastTs         = null;
let stepAccum      = 0;      // fractional steps carried over between frames

// sim-seconds per real-second
let simSpeed = 86400;  // default: 1 day / second

// Maximum steps per frame (prevents tab from freezing at very high speeds)
const MAX_STEPS_PER_FRAME = 80000;

const SPEED_PRESETS = [
  { label: '1 day/s',   value: 86400 },
  { label: '1 wk/s',    value: 86400 * 7 },
  { label: '1 mo/s',    value: 86400 * 30.4375 },
  { label: '1 yr/s',    value: 86400 * 365.25 },
  { label: '10 yr/s',   value: 86400 * 365.25 * 10 },
  { label: '100 yr/s',  value: 86400 * 365.25 * 100 },
];

// Pre-set views
const VIEW_PRESETS = [
  {
    label: 'Solar System',
    apply: (r) => { r.scale = 5e8; r.followIndex = null; r.panX = 0; r.panY = 0; },
  },
  {
    label: 'Earth-Moon',
    apply: (r) => { r.scale = 2e6; r.followIndex = 1; r.panX = 0; r.panY = 0; },
  },
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
    // Record at most ~300 trail points per frame to keep buffer meaningful
    const trailInterval = Math.max(1, Math.floor(actual / 300));

    if (actual > 0) sim.advance(actual, trailInterval, renderer.followIndex);
  }

  renderer.render();
  updateHUD();
  requestAnimationFrame(tick);
}

// ─── HUD ─────────────────────────────────────────────────────────────────────

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

  // View presets
  const viewRow = document.getElementById('view-presets');
  VIEW_PRESETS.forEach(({ label, apply }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className   = 'ctrl-btn';
    btn.addEventListener('click', () => {
      apply(renderer);
      sim.clearTrails();
      updateFollowSelect();
    });
    viewRow.appendChild(btn);
  });

  // Follow select
  buildFollowSelect();

  // Trails toggle
  const trailBtn = document.getElementById('btn-trails');
  trailBtn.classList.toggle('active', renderer.showTrails);
  trailBtn.addEventListener('click', () => {
    renderer.showTrails = !renderer.showTrails;
    trailBtn.classList.toggle('active', renderer.showTrails);
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
