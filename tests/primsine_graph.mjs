import { chromium } from 'playwright';
import { createServer } from 'http';

const RHO = 6371 / 42160; // 0.1511

function primsine(eDeg) {
  const e = eDeg * Math.PI / 180;
  const cos2e = Math.cos(e) ** 2;
  return RHO * cos2e + Math.sin(e) * Math.sqrt(1 - RHO * RHO * cos2e);
}

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { background: #1a1a2e; margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
  canvas { display: block; }
</style>
</head>
<body>
<canvas id="c" width="860" height="560"></canvas>
<script>
const RHO = ${RHO};
function primsine(eDeg) {
  const e = eDeg * Math.PI / 180;
  const cos2e = Math.cos(e) ** 2;
  return RHO * cos2e + Math.sin(e) * Math.sqrt(1 - RHO * RHO * cos2e);
}

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// Layout
const PAD = { top: 60, right: 60, bottom: 70, left: 80 };
const gW = W - PAD.left - PAD.right;
const gH = H - PAD.top - PAD.bottom;

// Background
ctx.fillStyle = '#1a1a2e';
ctx.fillRect(0, 0, W, H);

// Grid
ctx.strokeStyle = '#2a2a4a';
ctx.lineWidth = 1;
for (let x = 0; x <= 9; x++) {
  const px = PAD.left + x * gW / 9;
  ctx.beginPath(); ctx.moveTo(px, PAD.top); ctx.lineTo(px, PAD.top + gH); ctx.stroke();
}
for (let y = 0; y <= 10; y++) {
  const py = PAD.top + y * gH / 10;
  ctx.beginPath(); ctx.moveTo(PAD.left, py); ctx.lineTo(PAD.left + gW, py); ctx.stroke();
}

// Axes
ctx.strokeStyle = '#666';
ctx.lineWidth = 1.5;
ctx.strokeRect(PAD.left, PAD.top, gW, gH);

// X axis labels (elevation degrees)
ctx.fillStyle = '#aaa';
ctx.font = '14px monospace';
ctx.textAlign = 'center';
for (let x = 0; x <= 9; x++) {
  const deg = x * 10;
  const px = PAD.left + x * gW / 9;
  ctx.fillText(deg + '°', px, PAD.top + gH + 22);
}
ctx.fillText('Elevation above horizon (e)', PAD.left + gW / 2, PAD.top + gH + 52);

// Y axis labels (primsine value)
ctx.textAlign = 'right';
for (let y = 0; y <= 10; y++) {
  const val = (10 - y) / 10;
  const py = PAD.top + y * gH / 10;
  ctx.fillText(val.toFixed(1), PAD.left - 10, py + 5);
}
ctx.save();
ctx.translate(20, PAD.top + gH / 2);
ctx.rotate(-Math.PI / 2);
ctx.textAlign = 'center';
ctx.fillText('primsine(e)', 0, 0);
ctx.restore();

// Notable reference lines
function drawRef(eDeg, label, color) {
  const p = primsine(eDeg);
  const px = PAD.left + eDeg * gW / 90;
  const py = PAD.top + (1 - p) * gH;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(px, PAD.top + gH); ctx.lineTo(px, py); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(PAD.left, py); ctx.lineTo(px, py); ctx.stroke();
  ctx.setLineDash([]);
  // dot
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(px, py, 4, 0, 2*Math.PI); ctx.fill();
  // label
  ctx.fillStyle = color;
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(label, px + 6, py - 4);
}

// ρ line (horizon limit)
const yRho = PAD.top + (1 - RHO) * gH;
ctx.strokeStyle = '#555';
ctx.lineWidth = 1;
ctx.setLineDash([6, 4]);
ctx.beginPath(); ctx.moveTo(PAD.left, yRho); ctx.lineTo(PAD.left + gW, yRho); ctx.stroke();
ctx.setLineDash([]);
ctx.fillStyle = '#666';
ctx.font = '12px monospace';
ctx.textAlign = 'left';
ctx.fillText('ρ = ' + RHO.toFixed(4) + '  (horizon limit)', PAD.left + 6, yRho - 5);

// Main curve
ctx.strokeStyle = '#e8a020';
ctx.lineWidth = 3;
ctx.shadowColor = '#e8a020';
ctx.shadowBlur = 8;
ctx.beginPath();
for (let i = 0; i <= 900; i++) {
  const eDeg = i / 10;
  const p = primsine(eDeg);
  const px = PAD.left + eDeg * gW / 90;
  const py = PAD.top + (1 - p) * gH;
  if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
}
ctx.stroke();
ctx.shadowBlur = 0;

// Reference points from worked example and table
drawRef(0,  'e=0°  ρ',       '#6699cc');
drawRef(30, 'e=30° → 0.693', '#88bb66');
drawRef(42.2, 'e=42.2° → 0.750', '#cc8844');
drawRef(90, 'e=90° = 1',    '#cc6677');

// Title
ctx.fillStyle = '#eee';
ctx.font = 'bold 18px monospace';
ctx.textAlign = 'center';
ctx.fillText('primsine(e) = ρ cos²e + sin(e) √(1 − ρ² cos²e),   ρ = ' + RHO.toFixed(4), W / 2, 36);
</script>
</body>
</html>`;

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
}).listen(0);
const port = await new Promise(r => server.once('listening', () => r(server.address().port)));

const browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
await page.setViewportSize({ width: 860, height: 560 });
await page.goto(`http://localhost:${port}/`);
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/primsine_graph.png' });

console.log('Screenshot saved to /tmp/primsine_graph.png');
await browser.close();
server.close();
