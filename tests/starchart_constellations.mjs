import { chromium } from 'playwright';
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join } from 'path';

const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.md':'text/plain', '.json':'application/json' };
const ROOT = new URL('..', import.meta.url).pathname;
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = join(ROOT, pathname === '/' ? 'index.html' : pathname);
  try { statSync(file); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'text/plain' });
  createReadStream(file).pipe(res);
}).listen(0);
const port = await new Promise(r => server.once('listening', () => r(server.address().port)));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 1800 });
await page.goto(`http://localhost:${port}/starchart.html`);
await page.waitForTimeout(500);

// Define constellation candidates as lists of star indices with connecting lines
// Each constellation: { name, color, stars: [idx, ...], lines: [[from, to], ...] }
const constellations = [
  // --- NORTH CHART ---
  {
    name: 'The Crown',
    color: '#f84',
    chart: 'north',
    stars: [264, 83, 43, 52, 166, 500],
    lines: [[264, 83], [83, 43], [43, 52], [52, 166], [166, 500], [500, 264]],
    labelStar: 43,
    labelOffset: [0, -20],
  },
  {
    name: 'The Spear',
    color: '#4f8',
    chart: 'north',
    stars: [93, 48, 435],
    lines: [[93, 48], [48, 435]],
    labelStar: 48,
    labelOffset: [10, -10],
  },
  {
    name: 'The Wing',
    color: '#8af',
    chart: 'north',
    stars: [267, 480, 50],
    lines: [[267, 480], [480, 50]],
    labelStar: 480,
    labelOffset: [-40, -10],
  },
  {
    name: 'The Chain',
    color: '#fa4',
    chart: 'north',
    stars: [192, 425, 486, 241, 211],
    lines: [[192, 425], [425, 486], [486, 241], [241, 211]],
    labelStar: 486,
    labelOffset: [0, -15],
  },
  {
    name: 'The Bow',
    color: '#f4f',
    chart: 'north',
    stars: [245, 414, 345],
    lines: [[414, 245], [245, 345]],
    labelStar: 245,
    labelOffset: [10, -10],
  },
  {
    name: 'The Anchor',
    color: '#4ff',
    chart: 'north',
    stars: [102, 269, 256],
    lines: [[269, 102], [102, 256]],
    labelStar: 102,
    labelOffset: [10, 10],
  },

  // --- SOUTH CHART ---
  {
    name: 'The Throne',
    color: '#f84',
    chart: 'south',
    stars: [418, 453, 461, 154, 145],
    lines: [[453, 418], [418, 461], [461, 145], [145, 154], [154, 453]],
    labelStar: 461,
    labelOffset: [15, -15],
  },
  {
    name: 'The Serpent',
    color: '#4f8',
    chart: 'south',
    stars: [346, 13, 94, 447, 487, 168],
    lines: [[168, 487], [487, 94], [94, 13], [13, 346], [346, 447]],
    labelStar: 13,
    labelOffset: [10, -12],
  },
  {
    name: 'The Triangle',
    color: '#8af',
    chart: 'south',
    stars: [11, 294, 60],
    lines: [[11, 294], [294, 60], [60, 11]],
    labelStar: 11,
    labelOffset: [10, -10],
  },
  {
    name: 'The Twins',
    color: '#fa4',
    chart: 'south',
    stars: [350, 464],
    lines: [[350, 464]],
    labelStar: 350,
    labelOffset: [10, -10],
  },
  {
    name: 'The Exile',
    color: '#f4f',
    chart: 'south',
    stars: [293, 403, 305, 345],
    lines: [[345, 403], [403, 293], [293, 305]],
    labelStar: 403,
    labelOffset: [-40, -10],
  },
  {
    name: 'The Shield',
    color: '#4ff',
    chart: 'south',
    stars: [281, 189, 350],
    lines: [[281, 189], [189, 350]],
    labelStar: 189,
    labelOffset: [10, -10],
  },
];

// Draw constellation lines and labels on the charts
await page.evaluate((constellations) => {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Build lookup: starIdx -> { chart -> circle element }
  const starMap = {};
  for (const circle of document.querySelectorAll('[data-star]')) {
    const idx = Number(circle.dataset.star);
    const svg = circle.closest('svg');
    const chart = svg.closest('#band-chart') ? 'band' :
                  svg.closest('#north-chart') ? 'north' : 'south';
    if (!starMap[idx]) starMap[idx] = {};
    starMap[idx][chart] = circle;
  }

  for (const c of constellations) {
    const firstStar = starMap[c.stars[0]];
    if (!firstStar || !firstStar[c.chart]) continue;
    const svg = firstStar[c.chart].closest('svg');

    // Draw lines
    for (const [from, to] of c.lines) {
      const f = starMap[from]?.[c.chart];
      const t = starMap[to]?.[c.chart];
      if (!f || !t) continue;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', f.getAttribute('cx'));
      line.setAttribute('y1', f.getAttribute('cy'));
      line.setAttribute('x2', t.getAttribute('cx'));
      line.setAttribute('y2', t.getAttribute('cy'));
      line.setAttribute('stroke', c.color);
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('opacity', '0.7');
      svg.appendChild(line);
    }

    // Draw label
    const labelCircle = starMap[c.labelStar]?.[c.chart];
    if (labelCircle) {
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', parseFloat(labelCircle.getAttribute('cx')) + c.labelOffset[0]);
      text.setAttribute('y', parseFloat(labelCircle.getAttribute('cy')) + c.labelOffset[1]);
      text.setAttribute('fill', c.color);
      text.setAttribute('font-family', 'Courier New, monospace');
      text.setAttribute('font-size', '12');
      text.setAttribute('font-weight', 'bold');
      text.textContent = c.name;
      svg.appendChild(text);
    }

    // Highlight constituent stars with colored rings
    for (const idx of c.stars) {
      const circle = starMap[idx]?.[c.chart];
      if (!circle) continue;
      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('cx', circle.getAttribute('cx'));
      ring.setAttribute('cy', circle.getAttribute('cy'));
      ring.setAttribute('r', '5');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', c.color);
      ring.setAttribute('stroke-width', '1.5');
      ring.setAttribute('opacity', '0.8');
      svg.appendChild(ring);
    }
  }
}, constellations);

const north = page.locator('#north-chart');
await north.screenshot({ path: '/tmp/constellations_north.png' });

const south = page.locator('#south-chart');
await south.screenshot({ path: '/tmp/constellations_south.png' });

await browser.close();
server.close();
