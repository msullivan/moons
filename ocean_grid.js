// Grid and invented bathymetry for the 2-D tide model of the Qamis map.
//
// The land/sea mask comes from docket/map-nice-marked-flat.jpeg
// (docket/tools/sea_mask.py → ocean_mask.json, 6 px cells).  The map is
// treated as a flat projection with square pixels of KM_PER_PX; latitude and
// longitude (for tidal forcing and Coriolis) use the same linear map
// conversion as ports.js.
//
// The model domain is the map plus PAD cells of extra ocean on every side, so
// the open boundaries sit in deep water away from the coasts.  Land touching
// a map edge (the western landmass) is continued straight outward.
//
// Depth is invented from distance to the coast d, with a shelf and a slope:
//      d < shelfWidth:  h = coast + (shelfDepth − coast)·(d/shelfWidth)^0.7
//      beyond:          h = shelfDepth + (deep − shelfDepth)·smoothstep((d − shelfWidth)/slopeWidth)
// The four profile parameters vary in space: each REGION sets them near its
// anchor, blended with the defaults (weight 0.01) by weight exp(−(r/radius)²)
// (depths blend in log space), where r is
// the distance through water (so the Central Sea doesn't leak across the
// isthmus).
//
// No DOM or filesystem access: pass the parsed ocean_mask.json in.

export const KM_PER_PX = 0.01538 * 111.19;    // 1.710 km, from the latitude scale

// Map pixel ↔ lat/lon (same as ports.js).
export const pxToLat = py => 45 - (py - 335) * 0.01538;
export const pxToLon = px => 30 + (px - 160) * 0.02098;
export const latToPy = lat => 335 + (45 - lat) / 0.01538;
export const lonToPx = lon => 160 + (lon - 30) / 0.02098;

export const OCEAN = {
  pad: 30,                 // cells of extra ocean around the map (~300 km)
  coastDepth: 15,          // m, depth of the cells touching land
  // The western landmass runs off the map's left edge.  Off-map, its north
  // and south coasts are straight lines leaving the map edge where its coast
  // meets it: slope = cells of latitude gained per cell west (positive =
  // the land widens westward).  Steep in the north, shallow in the south.
  westLand: { northSlope: 1.5, southSlope: 0.3 },
  // Sub-grid straits through land walls.  The isthmus is a closed wall in the
  // mask except for one gap, under the Great Western Bridge where the map
  // shows water between the causeway and the volcanic island (px ~127, 338),
  // sized like the Golden Gate
  // (≈1.6 km wide, ≈60 m mean depth (113 m max), ≈5 km long).  The solver
  // treats each gap as a 1-D channel joining the sea cells nearest its two
  // ends:  du/dt = g·Δη/length − (Cd/depth + loss/(2·length))·|u|·u,
  // with flux u·width·depth taken from one side and added to the other.
  // loss = entry + exit head-loss coefficient.
  gaps: [
    { name: 'Great Western Bridge', ends: [[127, 320], [127, 352]],
      width: 1600, depth: 60, length: 5000, loss: 1.0 },
  ],
  defaults: { shelfDepth: 140, shelfWidth: 80, slopeWidth: 120, deep: 3000 },   // m, km (3000 m: tides here barely care, and it allows a 40 s step)
  regions: [
    // The Central Sea: a flooded continental basin ~230 m deep with narrow
    // margins, matching the 1-D channel model's 220 m mean.  Three anchors
    // along its length; it deepens gradually past the mouth.
    { name: 'Central Sea (north)', px: [210, 430], radius: 220, shelfDepth: 120, shelfWidth: 25, slopeWidth: 45, deep: 270 },
    { name: 'Central Sea (middle)', px: [230, 620], radius: 220, shelfDepth: 120, shelfWidth: 25, slopeWidth: 45, deep: 270 },
    { name: 'Central Sea (south)', px: [200, 790], radius: 200, shelfDepth: 120, shelfWidth: 25, slopeWidth: 45, deep: 270 },
    // Shallow strait between Qamis and the southern island (~200 km wide),
    // like Bass Strait or the English Channel.
    { name: 'Southern strait', px: [620, 1090], radius: 220, shelfDepth: 110, shelfWidth: 60, slopeWidth: 60, deep: 150 },
    // Broad shallow shelf off Qis and the east coast (the Qis resonator's
    // ~12.6 h response wants a ~300 km shelf).
    { name: 'Qis shelf', px: [1060, 700], radius: 330, shelfDepth: 110, shelfWidth: 300, slopeWidth: 150 },
    // Broad shelf west of the southern island (Freeport's ~10 h response).
    { name: 'Freeport shelf', px: [190, 1290], radius: 280, shelfDepth: 90, shelfWidth: 230, slopeWidth: 120 },
  ],
};

const PARAMS = ['shelfDepth', 'shelfWidth', 'slopeWidth', 'deep'];

// Build the model grid.  Returns
//   { nx, ny, dx, pad, cellPx, sea (Uint8Array), depth (Float32Array, m; 0 on land),
//     coastKm (Float32Array), lat, lon (Float32Array, degrees),
//     gaps ([{ ...cfg.gaps[n], cells: [k0, k1], area }]),
//     mapCell(px, py) → cell index, cellCentrePx(i, j) → [px, py] }
// Cell (i, j) is column i, row j; index j·nx + i.
export function buildOceanGrid(mask, cfg = OCEAN) {
  const pad = cfg.pad, cellPx = mask.cell;
  const nx = mask.width + 2 * pad, ny = mask.height + 2 * pad, N = nx * ny;
  const dxKm = cellPx * KM_PER_PX;

  // Mask, with edge cells continued outward into the padding.
  const sea = new Uint8Array(N);
  for (let j = 0; j < ny; j++) {
    const mj = Math.min(mask.height - 1, Math.max(0, j - pad));
    const row = mask.rows[mj];
    for (let i = 0; i < nx; i++) {
      const mi = Math.min(mask.width - 1, Math.max(0, i - pad));
      sea[j * nx + i] = row.charCodeAt(mi) === 49 ? 1 : 0;
    }
  }
  if (cfg.westLand) {
    // Longest land run down the map's first column.
    let best = null, start = -1;
    for (let mj = 0; mj <= mask.height; mj++) {
      const land = mj < mask.height && mask.rows[mj][0] === '0';
      if (land && start < 0) start = mj;
      if (!land && start >= 0) {
        if (!best || mj - start > best[1] - best[0] + 1) best = [start, mj - 1];
        start = -1;
      }
    }
    if (best) {
      const [top, bot] = best, { northSlope, southSlope } = cfg.westLand;
      for (let i = 0; i < pad; i++) {
        const w = pad - i;                           // cells west of the map edge
        for (let j = 0; j < ny; j++) {
          const mj = j - pad;
          const land = mj >= top - northSlope * w && mj <= bot + southSlope * w;
          sea[j * nx + i] = land ? 0 : 1;
        }
      }
    }
  }

  const cellCentrePx = (i, j) => [(i - pad + 0.5) * cellPx, (j - pad + 0.5) * cellPx];
  const mapCell = (px, py) => {
    const i = Math.floor(px / cellPx) + pad, j = Math.floor(py / cellPx) + pad;
    return j * nx + i;
  };

  const lat = new Float32Array(N), lon = new Float32Array(N);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const [px, py] = cellCentrePx(i, j);
      lat[j * nx + i] = pxToLat(py);
      lon[j * nx + i] = pxToLon(px);
    }

  // Distance to the coast (km): from land cells, through everything, with a
  // 5×5 chamfer (≈2% from Euclidean).  The domain edge is not coast.
  const coast = chamfer(nx, ny, i => !sea[i]);
  const coastKm = new Float32Array(N);
  for (let k = 0; k < N; k++) coastKm[k] = sea[k] ? Math.max(0, coast[k] - 0.5) * dxKm : 0;

  // Region weights by distance through water.
  const fields = Object.fromEntries(PARAMS.map(p => [p, new Float32Array(N)]));
  const wsum = new Float32Array(N);                  // the defaults have weight 1 everywhere…
  // Depths blend in log space (235 m vs 4000 m shouldn't average to 2 km).
  const LOGP = new Set(['shelfDepth', 'deep']);
  const enc = (p, v) => LOGP.has(p) ? Math.log(v) : v;
  const BG = 0.01;                                   // …scaled to 0.01 below
  for (const p of PARAMS) fields[p].fill(BG * enc(p, cfg.defaults[p]));
  wsum.fill(BG);
  for (const r of cfg.regions) {
    const src = mapCell(r.px[0], r.px[1]);
    if (!sea[src]) throw new Error(`ocean region ${r.name}: anchor is on land`);
    const dist = waterDistance(nx, ny, sea, src);
    for (let k = 0; k < N; k++) {
      if (!sea[k]) continue;
      const w = Math.exp(-((dist[k] * dxKm / r.radius) ** 2));
      if (w < 1e-6) continue;
      wsum[k] += w;
      for (const p of PARAMS) fields[p][k] += w * enc(p, r[p] ?? cfg.defaults[p]);
    }
  }

  const depth = new Float32Array(N);
  const h0 = cfg.coastDepth;
  for (let k = 0; k < N; k++) {
    if (!sea[k]) continue;
    const sd = Math.exp(fields.shelfDepth[k] / wsum[k]), sw = fields.shelfWidth[k] / wsum[k];
    const sl = fields.slopeWidth[k] / wsum[k], deep = Math.exp(fields.deep[k] / wsum[k]);
    const d = coastKm[k];
    let h;
    if (d < sw) h = h0 + (sd - h0) * (d / sw) ** 0.7;
    else {
      const x = Math.min(1, (d - sw) / sl);
      h = sd + (deep - sd) * x * x * (3 - 2 * x);
    }
    depth[k] = Math.max(h0, Math.min(h, Math.max(deep, h0)));
  }

  // Gaps: snap each end to the nearest sea cell.
  const partial = { nx, ny, sea, mapCell };
  const nearestSea = (px, py) => nearestSeaCell(partial, px, py);
  const gaps = (cfg.gaps ?? []).map(gp => {
    const cells = gp.ends.map(([px, py]) => nearestSea(px, py));
    if (cells[0] === cells[1]) throw new Error(`ocean gap ${gp.name}: both ends in the same cell`);
    return { ...gp, cells, area: gp.width * gp.depth };
  });

  return { nx, ny, dx: dxKm * 1000, pad, cellPx, sea, depth, coastKm, lat, lon, gaps, mapCell, cellCentrePx };
}

// Index of the sea cell nearest map pixel (px, py) (searching up to 5 cells).
export function nearestSeaCell(grid, px, py) {
  const { nx, sea } = grid;
  const k0 = grid.mapCell(px, py), i0 = k0 % nx, j0 = (k0 - i0) / nx;
  for (let r = 0; r < 6; r++) {
    let best = -1, bd = Infinity;
    for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
      const k = j * nx + i;
      if (!sea[k]) continue;
      const d = (i - i0) ** 2 + (j - j0) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    if (best >= 0) return best;
  }
  throw new Error(`no sea within 5 cells of map px (${px}, ${py})`);
}

// 5×5 chamfer distance (in cells) from cells where isSource(k).
function chamfer(nx, ny, isSource) {
  const INF = 1e9, d = new Float32Array(nx * ny);
  for (let k = 0; k < nx * ny; k++) d[k] = isSource(k) ? 0 : INF;
  const a = 1, b = Math.SQRT2, c = Math.sqrt(5);
  const fwd = [[-1, 0, a], [0, -1, a], [-1, -1, b], [1, -1, b], [-1, -2, c], [1, -2, c], [-2, -1, c], [2, -1, c]];
  const bwd = fwd.map(([x, y, w]) => [-x, -y, w]);
  const pass = (offs, j0, j1, js, i0, i1, is) => {
    for (let j = j0; j !== j1; j += js)
      for (let i = i0; i !== i1; i += is) {
        let v = d[j * nx + i];
        for (const [ox, oy, w] of offs) {
          const x = i + ox, y = j + oy;
          if (x < 0 || y < 0 || x >= nx || y >= ny) continue;
          const u = d[y * nx + x] + w;
          if (u < v) v = u;
        }
        d[j * nx + i] = v;
      }
  };
  pass(fwd, 0, ny, 1, 0, nx, 1);
  pass(bwd, ny - 1, -1, -1, nx - 1, -1, -1);
  return d;
}

// Shortest 8-connected path length (cells) from src through sea cells.
function waterDistance(nx, ny, sea, src) {
  const N = nx * ny, dist = new Float64Array(N).fill(Infinity);
  const heap = new MinHeap();
  dist[src] = 0; heap.push(0, src);
  const D = Math.SQRT2;
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, D], [1, -1, D], [-1, 1, D], [-1, -1, D]];
  while (heap.size) {
    const [dk, k] = heap.pop();
    if (dk > dist[k]) continue;
    const i = k % nx, j = (k - i) / nx;
    for (const [ox, oy, w] of nb) {
      const x = i + ox, y = j + oy;
      if (x < 0 || y < 0 || x >= nx || y >= ny) continue;
      const m = y * nx + x;
      if (!sea[m]) continue;
      // No diagonal moves between two land cells (keeps thin land walls tight).
      if (ox && oy && !sea[j * nx + x] && !sea[y * nx + i]) continue;
      const nd = dk + w;
      if (nd < dist[m]) { dist[m] = nd; heap.push(nd, m); }
    }
  }
  return dist;
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let n = k.length; k.push(key); v.push(val);
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (k[p] <= key) break;
      k[n] = k[p]; v[n] = v[p]; n = p;
    }
    k[n] = key; v[n] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = [k[0], v[0]];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let n = 0;
      const len = k.length;
      for (;;) {
        let c = 2 * n + 1;
        if (c >= len) break;
        if (c + 1 < len && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[n] = k[c]; v[n] = v[c]; n = c;
      }
      k[n] = lk; v[n] = lv;
    }
    return top;
  }
}
