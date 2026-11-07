#!/usr/bin/env python3
"""Mark the Qamis map: move Jia to the peninsula tip (as on map-sketch.jpeg),
and add city dots and labels for Freeport and Qaringil.

    python3 mark_map.py <in> <out> [font]

<in> must still have the original JIA label (map-nice.jpeg, or its
flat-sea version from flatten_sea.py): the script lifts that label and dot
and reuses them.  Coordinates are pixels in map-nice.jpeg (1080×1521).
Run docket/tools/build_maps.sh to regenerate both docket maps.

Ink is treated as a multiply layer: pixel = paper × transmittance.  The
original JIA letters and city dot are lifted that way and re-applied at the
new spot; new lettering is rendered in a handwriting font, tinted with the
transmittance of JIA's own ink.
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SRC, OUT = sys.argv[1], sys.argv[2]
FONT = sys.argv[3] if len(sys.argv) > 3 else '/usr/share/fonts/opentype/tlwg/Purisa-Bold.otf'

im = np.asarray(Image.open(SRC).convert('RGB')).astype(float)
H, W, _ = im.shape
PAPER = np.array([218.0, 218.0, 222.0])

def lum(a): return a.mean(axis=-1)

# ── lift the original label and dot ───────────────────────────────────
def ink_mask(x0, y0, x1, y1, thresh=22):
    """Ink pixels in a box: darker than paper and not the blue coastline."""
    p = im[y0:y1, x0:x1]
    dark = lum(p) < lum(PAPER) - thresh
    bluish = (p[..., 2] - p[..., 0]) > 18
    return dark & ~bluish

LET = (287, 849, 317, 865)    # "JIA" letters
DOT = (296, 864, 316, 880)    # ochre city dot

def lift(box, thresh, ochre=False):
    x0, y0, x1, y1 = box
    m = ink_mask(*box, thresh=thresh)
    if ochre:   # the city dot: keep only its warm watercolor, not nearby stipple
        p = im[y0:y1, x0:x1]
        m &= (p[..., 0] - p[..., 2]) > 18
    # Soft alpha: grow the mask by one pixel and blur its edge.
    mi = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    a = np.asarray(mi).astype(float) / 255
    T = np.clip(im[y0:y1, x0:x1] / PAPER, 0, 1)
    T = 1 - a[..., None] * (1 - T)        # transmittance, 1 outside the ink
    return T, a, im[y0:y1, x0:x1].copy()

T_let, a_let, _ = lift(LET, 22)
T_dot, a_dot, rgb_dot = lift(DOT, 8, ochre=True)

# ── erase the original ─────────────────────────────────────────────────
# Replace the lifted pixels with stippled land from a clean patch nearby.
def erase(box, alpha, patch_xy):
    x0, y0, x1, y1 = box
    px, py = patch_xy
    patch = im[py:py + (y1 - y0), px:px + (x1 - x0)]
    a = np.clip(alpha * 1.6, 0, 1)[..., None]
    im[y0:y1, x0:x1] = a * patch + (1 - a) * im[y0:y1, x0:x1]

ERASE_FROM = (330, 875)        # stippled land east of the old label, clear of river and coast
erase(LET, a_let, ERASE_FROM)
erase(DOT, a_dot, (ERASE_FROM[0] + 2, ERASE_FROM[1] + 16))

# ── stamping helpers ───────────────────────────────────────────────────
def multiply(T, x0, y0):
    h, w, _ = T.shape
    im[y0:y0 + h, x0:x0 + w] *= T

def put_dot(cx, cy, scale=1.0):
    """Paint the lifted ochre dot (opaque watercolor blob) centred at (cx, cy)."""
    h, w = a_dot.shape
    a = Image.fromarray((a_dot * 255).astype(np.uint8))
    c = Image.fromarray(rgb_dot.astype(np.uint8))
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    a = np.asarray(a.resize((nw, nh), Image.LANCZOS)).astype(float) / 255
    c = np.asarray(c.resize((nw, nh), Image.LANCZOS)).astype(float)
    # Dot centre of mass in its own box.
    ys, xs = np.nonzero(a > 0.5)
    ox, oy = round(cx - xs.mean()), round(cy - ys.mean())
    reg = im[oy:oy + nh, ox:ox + nw]
    im[oy:oy + nh, ox:ox + nw] = a[..., None] * c + (1 - a[..., None]) * reg

# Ink colour: transmittance of the darkest pixels of JIA's "J" and "I".
jt = T_let[:, :18].reshape(-1, 3)
dark = jt[lum(jt * PAPER) < np.percentile(lum(jt * PAPER), 12)]
INK_T = dark.mean(axis=0)

def letter(text, cap_px, wobble=0.6, tracking=1.0):
    """Render text at 6× then downsample; returns transmittance array."""
    S = 6
    font = ImageFont.truetype(FONT, int(cap_px * S * 1.42))
    # Lay out letter by letter with small random baseline/rotation jitter.
    rng = np.random.default_rng(7)
    glyphs = []
    for ch in text:
        bbox = font.getbbox(ch)
        gw, gh = bbox[2] - bbox[0] + 4 * S, bbox[3] - bbox[1] + 4 * S
        g = Image.new('L', (gw, gh), 0)
        ImageDraw.Draw(g).text((2 * S - bbox[0], 2 * S - bbox[1]), ch, fill=255, font=font)
        g = g.rotate(rng.normal(0, 3), resample=Image.BICUBIC, expand=True)
        glyphs.append((g, rng.normal(0, wobble * S), bbox[2] - bbox[0]))
    total = int(sum(adv for _, _, adv in glyphs) * 1.0 + (len(glyphs) - 1) * tracking * S + 8 * S)
    hmax = max(g.size[1] for g, _, _ in glyphs) + 4 * S
    canvas = Image.new('L', (total, hmax), 0)
    x = 2 * S
    for g, dy, adv in glyphs:
        canvas.paste(g, (int(x - 2 * S), int(2 * S + dy)), g)
        x += adv + tracking * S
    canvas = canvas.crop(canvas.getbbox())
    small = canvas.resize((max(1, round(canvas.size[0] / S)), max(1, round(canvas.size[1] / S))), Image.LANCZOS)
    a = np.asarray(small).astype(float) / 255
    a = np.clip(a * 1.15, 0, 1)
    return 1 - a[..., None] * (1 - INK_T)

def place_text(T, x0=None, y0=None, cx=None, cy=None, right=None):
    h, w, _ = T.shape
    if cx is not None: x0 = round(cx - w / 2)
    if right is not None: x0 = right - w
    if cy is not None: y0 = round(cy - h / 2)
    multiply(T, x0, y0)
    return (x0, y0, x0 + w, y0 + h)

# ── Jia: peninsula tip ─────────────────────────────────────────────────
put_dot(247, 840)
lh, lw, _ = T_let.shape
multiply(T_let, 247 - lw // 2 - 1, 828 - lh)

# ── Freeport: headland on the north side of the inlet ──────────────────
put_dot(318, 1276, scale=0.85)
fp = place_text(letter('FREEPORT', 10), x0=329, cy=1272)

# ── Qaringil: a tiny island just south of the west side of the isthmus ─
put_dot(146, 367, scale=0.55)
lt = letter("QARINGIL", 10)
qa = place_text(lt, cx=146, y0=374)

Image.fromarray(np.clip(im, 0, 255).astype(np.uint8)).save(OUT, quality=95)
print('ink T', INK_T.round(2), 'freeport box', fp, 'qaringil box', qa)
