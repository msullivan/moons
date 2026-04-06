// Analyze star positions for constellation candidates
// Works with raw star data from buildStars()

import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('/tmp/star_positions.json', 'utf-8'));

// Get band chart positions (ecliptic coords) for all stars, plus brightness info
const bandStars = [];
for (const [idx, entries] of Object.entries(data)) {
  const band = entries.find(e => e.chart === 'band');
  const north = entries.find(e => e.chart === 'north');
  const south = entries.find(e => e.chart === 'south');
  // Parse opacity from fill like "rgba(255,255,255,0.583)"
  const fill = (band || north || south).fill;
  const opacity = parseFloat(fill.match(/[\d.]+\)$/)[0]);
  const r = (band || north || south).r;
  if (band) {
    bandStars.push({ idx: Number(idx), cx: band.cx, cy: band.cy, r, opacity });
  }
}

// Get north chart stars
const northStars = [];
for (const [idx, entries] of Object.entries(data)) {
  const north = entries.find(e => e.chart === 'north');
  if (!north) continue;
  const opacity = parseFloat(north.fill.match(/[\d.]+\)$/)[0]);
  northStars.push({ idx: Number(idx), cx: north.cx, cy: north.cy, r: north.r, opacity });
}

// Get south chart stars
const southStars = [];
for (const [idx, entries] of Object.entries(data)) {
  const south = entries.find(e => e.chart === 'south');
  if (!south) continue;
  const opacity = parseFloat(south.fill.match(/[\d.]+\)$/)[0]);
  southStars.push({ idx: Number(idx), cx: south.cx, cy: south.cy, r: south.r, opacity });
}

// Sort by brightness (opacity * radius as proxy)
const byBrightness = (a, b) => (b.opacity * b.r) - (a.opacity * a.r);

console.log('=== BRIGHTEST STARS (top 40) ===');
const allStars = [];
for (const [idx, entries] of Object.entries(data)) {
  const any = entries[0];
  const opacity = parseFloat(any.fill.match(/[\d.]+\)$/)[0]);
  allStars.push({ idx: Number(idx), r: any.r, opacity, brightness: opacity * any.r, charts: entries.map(e => e.chart) });
}
allStars.sort(byBrightness);
for (const s of allStars.slice(0, 40)) {
  console.log(`  Star ${s.idx}: r=${s.r.toFixed(2)} opacity=${s.opacity.toFixed(3)} brightness=${s.brightness.toFixed(3)} charts=[${s.charts}]`);
}

// Find clusters: for each bright star, find nearby bright stars
console.log('\n=== NORTH CHART CLUSTERS (bright stars within 80px of each other) ===');
const brightNorth = northStars.filter(s => s.opacity > 0.4).sort(byBrightness);
for (const s of brightNorth.slice(0, 20)) {
  const nearby = brightNorth.filter(t => {
    if (t.idx === s.idx) return false;
    const dx = t.cx - s.cx, dy = t.cy - s.cy;
    return Math.sqrt(dx*dx + dy*dy) < 80;
  });
  if (nearby.length >= 1) {
    console.log(`  Star ${s.idx} (${s.cx.toFixed(0)},${s.cy.toFixed(0)}) r=${s.r.toFixed(2)}: neighbors = [${nearby.map(n => n.idx).join(', ')}]`);
  }
}

console.log('\n=== SOUTH CHART CLUSTERS ===');
const brightSouth = southStars.filter(s => s.opacity > 0.4).sort(byBrightness);
for (const s of brightSouth.slice(0, 20)) {
  const nearby = brightSouth.filter(t => {
    if (t.idx === s.idx) return false;
    const dx = t.cx - s.cx, dy = t.cy - s.cy;
    return Math.sqrt(dx*dx + dy*dy) < 80;
  });
  if (nearby.length >= 1) {
    console.log(`  Star ${s.idx} (${s.cx.toFixed(0)},${s.cy.toFixed(0)}) r=${s.r.toFixed(2)}: neighbors = [${nearby.map(n => n.idx).join(', ')}]`);
  }
}

console.log('\n=== BAND CHART CLUSTERS ===');
const brightBand = bandStars.filter(s => s.opacity > 0.4).sort(byBrightness);
for (const s of brightBand.slice(0, 25)) {
  const nearby = brightBand.filter(t => {
    if (t.idx === s.idx) return false;
    const dx = t.cx - s.cx, dy = t.cy - s.cy;
    return Math.sqrt(dx*dx + dy*dy) < 60;
  });
  if (nearby.length >= 1) {
    console.log(`  Star ${s.idx} (${s.cx.toFixed(0)},${s.cy.toFixed(0)}) r=${s.r.toFixed(2)}: neighbors = [${nearby.map(n => n.idx).join(', ')}]`);
  }
}

// Look for geometric patterns: lines, triangles, arcs
console.log('\n=== NOTABLE GEOMETRIC PATTERNS ===');

function findLines(stars, maxPerp, minLen) {
  const results = [];
  const bright = stars.filter(s => s.opacity > 0.35).sort(byBrightness).slice(0, 50);
  for (let i = 0; i < bright.length; i++) {
    for (let j = i+1; j < bright.length; j++) {
      const dx = bright[j].cx - bright[i].cx;
      const dy = bright[j].cy - bright[i].cy;
      const len = Math.sqrt(dx*dx + dy*dy);
      if (len < minLen || len > 200) continue;
      // Find stars along this line
      const inline = [];
      for (let k = 0; k < bright.length; k++) {
        if (k === i || k === j) continue;
        // Project onto line
        const px = bright[k].cx - bright[i].cx;
        const py = bright[k].cy - bright[i].cy;
        const t = (px*dx + py*dy) / (len*len);
        if (t < -0.15 || t > 1.15) continue;
        const perp = Math.abs(px*dy/len - py*dx/len);
        if (perp < maxPerp) inline.push({ star: bright[k], t });
      }
      if (inline.length >= 1) {
        const allStarsInLine = [
          { star: bright[i], t: 0 },
          ...inline,
          { star: bright[j], t: 1 }
        ].sort((a,b) => a.t - b.t);
        results.push({
          stars: allStarsInLine.map(s => s.star.idx),
          len,
          count: allStarsInLine.length
        });
      }
    }
  }
  // Deduplicate (same star set)
  const seen = new Set();
  return results.filter(r => {
    const key = r.stars.sort((a,b) => a-b).join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a,b) => b.count - a.count).slice(0, 15);
}

function findTriangles(stars) {
  const results = [];
  const bright = stars.filter(s => s.opacity > 0.45).sort(byBrightness).slice(0, 30);
  for (let i = 0; i < bright.length; i++) {
    for (let j = i+1; j < bright.length; j++) {
      for (let k = j+1; k < bright.length; k++) {
        const d1 = Math.sqrt((bright[j].cx-bright[i].cx)**2 + (bright[j].cy-bright[i].cy)**2);
        const d2 = Math.sqrt((bright[k].cx-bright[j].cx)**2 + (bright[k].cy-bright[j].cy)**2);
        const d3 = Math.sqrt((bright[i].cx-bright[k].cx)**2 + (bright[i].cy-bright[k].cy)**2);
        const sides = [d1, d2, d3].sort((a,b) => a-b);
        // Look for roughly equilateral or isosceles, sides 40-150px
        if (sides[0] < 30 || sides[2] > 150) continue;
        const ratio = sides[2] / sides[0];
        if (ratio < 2.0) {
          const brightness = bright[i].opacity + bright[j].opacity + bright[k].opacity;
          results.push({
            stars: [bright[i].idx, bright[j].idx, bright[k].idx],
            sides,
            ratio,
            brightness
          });
        }
      }
    }
  }
  return results.sort((a,b) => b.brightness - a.brightness).slice(0, 10);
}

console.log('\nNorth chart lines (3+ stars):');
const northLines = findLines(northStars, 8, 40);
for (const l of northLines.filter(l => l.count >= 3)) {
  console.log(`  Stars [${l.stars}] — ${l.count} in line, span ${l.len.toFixed(0)}px`);
}

console.log('\nSouth chart lines:');
const southLines = findLines(southStars, 8, 40);
for (const l of southLines.filter(l => l.count >= 3)) {
  console.log(`  Stars [${l.stars}] — ${l.count} in line, span ${l.len.toFixed(0)}px`);
}

console.log('\nBand chart lines:');
const bandLines = findLines(bandStars, 6, 30);
for (const l of bandLines.filter(l => l.count >= 3)) {
  console.log(`  Stars [${l.stars}] — ${l.count} in line, span ${l.len.toFixed(0)}px`);
}

console.log('\nNorth chart triangles:');
const northTris = findTriangles(northStars);
for (const t of northTris.slice(0, 5)) {
  console.log(`  Stars [${t.stars}] — sides ${t.sides.map(s => s.toFixed(0)).join(',')} ratio ${t.ratio.toFixed(2)}`);
}

console.log('\nSouth chart triangles:');
const southTris = findTriangles(southStars);
for (const t of southTris.slice(0, 5)) {
  console.log(`  Stars [${t.stars}] — sides ${t.sides.map(s => s.toFixed(0)).join(',')} ratio ${t.ratio.toFixed(2)}`);
}
