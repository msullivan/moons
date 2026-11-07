#!/usr/bin/env python3
"""Coarse land/sea mask for the 2-D tide model, from the flat-sea Qamis map.

The flat map's sea is one fixed colour, so a pixel is sea when it is close
to it.  Pixels are pooled into square cells (sea when most of the cell is
sea), then:
  - lettering in the water is forced to sea, and land specks of 1-2 cells (labels,
    city dots) become sea;
  - edge cells continue the land just inside them (see below);
  - the isthmus is drawn in as an unbroken wall;
  - sea not connected to the map edge (none at present) becomes land.

    uv run --no-project --with scipy --with numpy --with pillow \
        python sea_mask.py map-nice-marked-flat.jpeg ../../ocean_mask.json [cell_px] [debug.png]

Output JSON: { cell, width, height, source, rows } where rows[j] is a string
of '1' (sea) / '0' (land) for cell row j, top to bottom.
"""
import json
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC, OUT = sys.argv[1], sys.argv[2]
CELL = int(sys.argv[3]) if len(sys.argv) > 3 else 6
DEBUG = sys.argv[4] if len(sys.argv) > 4 else None
FLAT = np.array([214.0, 232.0, 246.0])   # flatten_sea.py's sea colour
TOL = 18                                 # JPEG noise is < 15 in open sea
# Lettering painted in open water (x0, y0, x1, y1 in map px): always sea.
# QAMIS is flatten_sea.py's TITLE; QARINGIL and JIA are mark_map.py's labels
# (their city dots stay as painted and fall to the speck filter).
LETTERING = [(745, 1128, 1075, 1240),    # QAMIS
             (96, 372, 198, 390),        # QARINGIL
             (230, 812, 264, 830),       # JIA
             (139, 920, 223, 939)]       # TEMPLADO

im = np.asarray(Image.open(SRC).convert('RGB')).astype(float)
H, W, _ = im.shape
sea_px = np.linalg.norm(im - FLAT, axis=2) < TOL
for x0, y0, x1, y1 in LETTERING:
    sea_px[y0:y1, x0:x1] = True

nx, ny = W // CELL, H // CELL
frac = sea_px[:ny * CELL, :nx * CELL].reshape(ny, CELL, nx, CELL).mean(axis=(1, 3))
sea = frac > 0.5

# Land specks → sea.
lab, n = ndi.label(~sea)
sizes = ndi.sum(~sea, lab, index=np.arange(1, n + 1))
specks = np.isin(lab, np.nonzero(sizes <= 2)[0] + 1)
sea |= specks

# Edge cells: the flattening leaves a 1-px sea strip along the painting's
# border where land actually runs off the map (the western landmass).  A sea
# cell on the map edge whose inward neighbour is land becomes land.
for _ in range(2):
    sea[:, 0] &= sea[:, 1]; sea[:, -1] &= sea[:, -2]
    sea[0, :] &= sea[1, :]; sea[-1, :] &= sea[-2, :]

# The isthmus is drawn as a wall: at 6 px cells its thin western causeway
# otherwise breaks up into a one-cell (10 km) channel.  Flow through it is
# modelled separately as a sub-grid strait (ocean_grid.js GAPS).  The polyline
# runs along the causeway, the volcanic island and the eastern bridge, and is
# rasterised with 4-connected steps so no cell-face path crosses it.
ISTHMUS = [(40, 338), (100, 338), (130, 334), (160, 333), (190, 343), (250, 350), (310, 362)]

def wall(points):
    cells = []
    for (xa, ya), (xb, yb) in zip(points, points[1:]):
        i, j = xa // CELL, ya // CELL
        ib, jb = xb // CELL, yb // CELL
        cells.append((i, j))
        while (i, j) != (ib, jb):
            # step along whichever axis keeps us closest to the segment
            di, dj = (ib > i) - (ib < i), (jb > j) - (jb < j)
            if di and dj:
                ex = abs((jb - (ya // CELL)) * (i + di - xa // CELL) - (ib - xa // CELL) * (j - ya // CELL))
                ey = abs((jb - (ya // CELL)) * (i - xa // CELL) - (ib - xa // CELL) * (j + dj - ya // CELL))
                if ex <= ey: i += di
                else: j += dj
            elif di: i += di
            else: j += dj
            cells.append((i, j))
    return cells

for i, j in wall(ISTHMUS):
    sea[j, i] = False

# Check: within a box around the isthmus, water north and south of it must
# not touch through cell faces.
x0, y0, x1, y1 = 40 // CELL, 280 // CELL, 330 // CELL, 400 // CELL
box = sea[y0:y1, x0:x1]
lab, _ = ndi.label(box)
n_id, s_id = lab[300 // CELL - y0, 100 // CELL - x0], lab[372 // CELL - y0, 100 // CELL - x0]
assert n_id and s_id and n_id != s_id, 'isthmus leaks'

# Sea must connect to the map edge through cell faces (as flow does in the
# model), so pockets cut off by the wall become land.
lab, n = ndi.label(sea)
edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
sea = np.isin(lab, list(edge))

rows = [''.join('1' if v else '0' for v in r) for r in sea]
with open(OUT, 'w') as f:
    json.dump({'cell': CELL, 'width': nx, 'height': ny,
               'source': 'docket/map-nice-marked-flat.jpeg', 'rows': rows}, f, separators=(',', ':'))
    f.write('\n')

if DEBUG:
    big = np.kron(sea, np.ones((CELL, CELL), bool))
    dbg = im[:ny * CELL, :nx * CELL] * 0.6
    dbg[big] = dbg[big] * 0.4 + np.array([60, 140, 255]) * 0.6
    Image.fromarray(dbg.astype(np.uint8)).save(DEBUG)
print(f'{nx}x{ny} cells of {CELL} px; sea {sea.mean():.1%}; land specks removed {int(specks.sum())}')
