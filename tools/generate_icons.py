#!/usr/bin/env python3
"""Generate the Peptide Tracker PWA icon set (gradient capsule motif, no font dependency)."""
import os, math
from PIL import Image, ImageDraw, ImageChops

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)

TEAL = (94, 234, 212)     # #5eead4
INDIGO = (129, 140, 248)  # #818cf8

def diagonal_gradient(size):
    """Teal -> indigo along the top-left to bottom-right diagonal."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    maxd = (size - 1) * 2 or 1
    for y in range(size):
        for x in range(size):
            t = (x + y) / maxd
            px[x, y] = (
                round(TEAL[0] + (INDIGO[0] - TEAL[0]) * t),
                round(TEAL[1] + (INDIGO[1] - TEAL[1]) * t),
                round(TEAL[2] + (INDIGO[2] - TEAL[2]) * t),
            )
    return img

def capsule(size, scale):
    """A clean white pill capsule, rotated 45deg. `scale` = fraction of the icon spanned
    (smaller for the maskable safe-zone)."""
    SS = 4  # supersample then downscale for crisp edges
    S = size * SS
    cx = cy = S / 2.0
    length = S * scale
    thick = length * 0.46
    x0, y0 = cx - length / 2, cy - thick / 2
    x1, y1 = cx + length / 2, cy + thick / 2
    r = thick / 2

    # body alpha mask (also used to clip the shaded half)
    body = Image.new("L", (S, S), 0)
    ImageDraw.Draw(body).rounded_rectangle([x0, y0, x1, y1], radius=r, fill=255)

    cap = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    cap.paste((255, 255, 255, 255), (0, 0), body)

    # shade the right half, strictly clipped to the capsule outline
    right = Image.new("L", (S, S), 0)
    ImageDraw.Draw(right).rectangle([cx, 0, S, S], fill=255)
    shade = ImageChops.multiply(body, right).point(lambda v: 34 if v else 0)
    cap.paste((7, 17, 24, 255), (0, 0), shade)

    # divider line down the middle
    dw = max(2, int(thick * 0.05))
    ImageDraw.Draw(cap).line([cx, y0 + r * 0.22, cx, y1 - r * 0.22],
                             fill=(7, 17, 24, 95), width=dw)

    cap = cap.rotate(45, resample=Image.BICUBIC, center=(cx, cy))
    return cap.resize((size, size), Image.LANCZOS)

def make(size, maskable=False):
    bg = diagonal_gradient(size).convert("RGBA")
    cap = capsule(size, 0.46 if maskable else 0.62)
    bg.alpha_composite(cap)
    return bg.convert("RGB") if not maskable else bg.convert("RGB")

# Render the heavy gradient once at 512 and downscale for the rest (fast + crisp).
base512 = diagonal_gradient(512).convert("RGBA")

def compose(size, maskable=False):
    bg = base512.resize((size, size), Image.LANCZOS)
    cap = capsule(size, 0.46 if maskable else 0.62)
    bg.alpha_composite(cap)
    return bg.convert("RGB")

targets = [
    ("icon-180.png", 180, False),   # iOS apple-touch-icon
    ("icon-192.png", 192, False),   # manifest
    ("icon-512.png", 512, False),   # manifest
    ("icon-512-maskable.png", 512, True),  # manifest maskable
    ("favicon-32.png", 32, False),
    ("apple-touch-icon.png", 180, False),  # default-name fallback
]
for name, size, mask in targets:
    img = compose(size, mask)
    img.save(os.path.join(OUT, name), "PNG")
    print("wrote", name, f"{size}x{size}")

print("done ->", os.path.abspath(OUT))
