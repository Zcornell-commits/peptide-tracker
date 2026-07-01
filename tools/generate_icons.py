#!/usr/bin/env python3
"""Generate the Peptide Tracker PWA icon set — 'molecule chain' motif (a peptide)."""
import os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)
TEAL = (94, 234, 212)
INDIGO = (129, 140, 248)

def gradient(size):
    img = Image.new("RGB", (size, size)); px = img.load()
    maxd = (size - 1) * 2 or 1
    for y in range(size):
        for x in range(size):
            t = (x + y) / maxd
            px[x, y] = tuple(round(TEAL[i] + (INDIGO[i] - TEAL[i]) * t) for i in range(3))
    return img

def build(size, maskable=False):
    SS = 4
    S = size * SS
    bg = gradient(max(size, 96)).resize((S, S), Image.LANCZOS).convert("RGBA")
    # soft top-left glow for depth
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([-S*0.2, -S*0.2, S*0.7, S*0.7], fill=(255, 255, 255, 46))
    bg = Image.alpha_composite(bg, glow.filter(ImageFilter.GaussianBlur(S*0.06)))

    # maskable keeps the motif inside the central safe zone
    sc = 0.72 if maskable else 1.0
    def P(fx, fy):
        return (S*(0.5 + (fx-0.5)*sc), S*(0.5 + (fy-0.5)*sc))
    pts = [P(0.27, 0.62), P(0.42, 0.42), P(0.58, 0.58), P(0.73, 0.38)]

    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    lw = max(2, int(S*0.032*sc))
    for i in range(len(pts)-1):
        d.line([pts[i], pts[i+1]], fill=(255, 255, 255, 235), width=lw)
    br = S*0.078*sc
    cols = [(255, 255, 255, 255), (129, 140, 248, 255), (94, 234, 212, 255), (255, 255, 255, 255)]
    for (x, y), c in zip(pts, cols):
        d.ellipse([x-br, y-br, x+br, y+br], fill=c)

    # soft drop shadow beneath the chain
    a = layer.split()[3]
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sh.paste(Image.new("RGBA", (S, S), (4, 8, 14, 115)), (0, int(S*0.02)), a)
    out = Image.alpha_composite(bg, sh.filter(ImageFilter.GaussianBlur(S*0.02)))
    out = Image.alpha_composite(out, layer)
    return out.convert("RGB").resize((size, size), Image.LANCZOS)

targets = [
    ("icon-180.png", 180, False),
    ("apple-touch-icon.png", 180, False),   # iOS home screen
    ("icon-192.png", 192, False),
    ("icon-512.png", 512, False),
    ("icon-512-maskable.png", 512, True),
    ("favicon-32.png", 32, False),
]
for name, size, mask in targets:
    build(size, mask).save(os.path.join(OUT, name), "PNG")
    print("wrote", name, f"{size}x{size}")
print("done ->", os.path.abspath(OUT))
