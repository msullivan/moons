#!/usr/bin/env python3
"""Replace the watercolor sea in the Qamis map with one flat light blue.

  1. Open sea = water-coloured pixels that survive a morphological opening
     wider than any river, connected to known open-water points.  Rivers and
     mountain shading never connect, so they stay as painted.
  2. Regrow up to 8 px into strongly blue pixels to reach the true shoreline
     (inlets, coast strokes) without eating tinted island paper.
  3. Holes in the sea: paper-coloured ones are islands (kept); the rest
     (specks, the compass, scale bar, lettering) become sea.
  4. Dark pixels in the sea next to land are the coastline stroke (kept).
  5. The QAMIS title is carried over as ink onto the flat colour.

    uv run --no-project --with scipy --with numpy --with pillow \
        python flatten_sea.py in.jpeg out.png [debug.png]

The debug image paints sea blue, kept coastline red and islands yellow.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC, OUT = sys.argv[1], sys.argv[2]
DEBUG = sys.argv[3] if len(sys.argv) > 3 else None
FLAT = np.array([214.0, 232.0, 246.0])          # the fixed very light blue
TITLE = (745, 1128, 1075, 1240)                 # "QAMIS" lettering (x0, y0, x1, y1)
SEEDS = [(540, 1100), (200, 450), (540, 40), (1050, 700), (300, 1470), (1000, 1450), (40, 1250), (900, 60)]

im = np.asarray(Image.open(SRC).convert('RGB')).astype(float)
H, W, _ = im.shape
lum = im.mean(axis=2)
br = im[..., 2] - im[..., 0]
K3 = np.ones((3, 3), bool)
disk = lambda rad: (np.add.outer(np.arange(-rad, rad + 1) ** 2, np.arange(-rad, rad + 1) ** 2) <= rad * rad)

# 1. Open-sea core.  The wash is b−r 41–77; tinted paper (isthmus, island
# interiors) stays below 30.  Radius 11 is wider than any river channel.
water = br > 30
core = ndi.binary_opening(water, structure=disk(11))
lab, _ = ndi.label(core)
ids = sorted({lab[y, x] for x, y in SEEDS if lab[y, x] > 0})
core = np.isin(lab, ids)

# 1b. Pale wash (b−r ~18–33, overlapping tinted paper in colour) joins the sea
# only through areas at least 11 px across: big pale stretches of sea qualify;
# the thin isthmus strip, river channels and fenced-in island interiors don't.
pale = (br > 18) & (lum >= 150)
dark = lum < 150                                   # strokes fence off thin land
pale_open = ndi.binary_opening((pale | core) & ~dark, structure=disk(5), border_value=1)
open_core = core.copy()                            # deep open water only
core = ndi.binary_propagation(core, mask=pale_open | core)

# 2. Regrow to the shoreline: up to 8 px, connected, and only through light
# blue pixels.  Dark ink (coast strokes, lettering in rivers) is never taken.
allowed = (br > 30) & (lum >= 135)
sea = core.copy()
for _ in range(8):
    sea |= ndi.binary_dilation(sea, structure=K3) & allowed

# 3. Holes in the sea.
holes = ndi.binary_fill_holes(sea) & ~sea
hl, nh = ndi.label(holes)
islands = np.zeros((H, W), bool)
for i, sl in enumerate(ndi.find_objects(hl), 1):
    comp = hl[sl] == i
    pix = im[sl][comp]
    size = comp.sum()
    paperish = np.median(pix[:, 2] - pix[:, 0]) < 25 and np.median(pix.mean(1)) > 180
    at_edge = sl[0].start < 15 or sl[1].start < 15 or sl[0].stop > H - 15 or sl[1].stop > W - 15
    if size >= 300 and paperish and not (at_edge and size < 5000):
        islands[sl] |= comp          # an island: keep it
    else:
        sea[sl] |= comp              # speck / ink in the sea: flatten

# Inside each kept island's painted outline (paper, inner wash halo and the
# outline itself) stays as painted.
# For small islands, the painted outline and its inner wash halo (within
# 6 px) stay as painted.  Big landmasses keep only their coastline stroke.
il, ni = ndi.label(islands)
isz = ndi.sum(islands, il, index=np.arange(1, ni + 1))
small_isl = np.isin(il, np.nonzero(isz < 5000)[0] + 1)
ring = ndi.binary_dilation(small_isl, structure=K3, iterations=6) & ~islands
sea &= ~ring

# 4. Coastline stroke: dark sea pixels within 5 px of land.
land = ~sea
near_land = ndi.binary_dilation(land, structure=K3, iterations=5)
keep = np.where(sea & near_land, np.clip((172 - lum) / 50, 0, 1), 0.0)

# Close gaps in the outline: a thin fixed-colour stroke along land where no
# painted stroke is nearby.
STROKE = np.array([72.0, 108.0, 168.0])
painted = ndi.binary_dilation((~sea & (lum < 150)) | (sea & (keep > 0.4)), structure=K3, iterations=2)
band = sea & ndi.binary_dilation(land, structure=K3, iterations=2) & ~painted
base = np.where(band[..., None], 0.8 * STROKE + 0.2 * FLAT, FLAT)

a = keep[..., None]
out = np.where(sea[..., None], a * im + (1 - a) * base, im)

# 5. Title: ink relative to the local wash, re-applied over the flat colour.
x0, y0, x1, y1 = TITLE
box = im[y0:y1, x0:x1]
wash = np.stack([ndi.median_filter(box[..., c], size=45) for c in range(3)], axis=-1)
T = np.clip(box / np.maximum(wash, 1), 0, 1.8)
dev = np.linalg.norm(box - wash, axis=-1)
absorbs_blue = np.clip((0.86 - T[..., 2]) / 0.12, 0, 1)
s_ink = (np.clip((dev - 22) / 28, 0, 1) * absorbs_blue)[..., None]
inked = FLAT * (1 - s_ink) + np.clip(FLAT * T, 0, 255) * s_ink
in_sea = sea[y0:y1, x0:x1] & ~near_land[y0:y1, x0:x1]
out[y0:y1, x0:x1] = np.where(in_sea[..., None], inked, out[y0:y1, x0:x1])

Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(OUT)
if DEBUG:
    dbg = im * 0.5
    dbg[sea] = [80, 160, 255]
    dbg[sea & (keep > 0.3)] = [255, 60, 60]
    dbg[islands] = [255, 220, 0]
    Image.fromarray(dbg.astype(np.uint8)).save(DEBUG)
print(f'sea {sea.mean():.1%}; islands kept {ndi.label(islands)[1]}; seeds in core {len(ids)}')
