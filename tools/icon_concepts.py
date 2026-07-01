#!/usr/bin/env python3
"""Generate 3 upgraded app-icon concepts (512px previews) to icons/concepts/."""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageChops

OUT = os.path.join(os.path.dirname(__file__), "..", "icons", "concepts")
os.makedirs(OUT, exist_ok=True)
SIZE = 512
SS = 4
S = SIZE * SS
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

BG512 = gradient(SIZE)

def base_bg():
    bg = BG512.resize((S, S), Image.LANCZOS).convert("RGBA")
    # soft radial glow top-left for depth
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([-S*0.2, -S*0.2, S*0.7, S*0.7], fill=(255, 255, 255, 46))
    glow = glow.filter(ImageFilter.GaussianBlur(S*0.06))
    return Image.alpha_composite(bg, glow)

def soft_shadow(layer, dy=0.02, blur=0.02, alpha=115):
    a = layer.split()[3]
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sh.paste(Image.new("RGBA", (S, S), (4, 8, 14, alpha)), (0, int(S*dy)), a)
    return sh.filter(ImageFilter.GaussianBlur(S*blur))

def finish(bg, layer):
    out = Image.alpha_composite(bg, soft_shadow(layer))
    out = Image.alpha_composite(out, layer)
    return out.convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)

# ---------- A: glossy capsule ----------
def concept_capsule():
    bg = base_bg()
    cap = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(cap)
    cx = cy = S/2; length = S*0.60; thick = length*0.44; r = thick/2
    x0, y0, x1, y1 = cx-length/2, cy-thick/2, cx+length/2, cy+thick/2
    d.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=(255, 255, 255, 255))
    body = Image.new("L", (S, S), 0); ImageDraw.Draw(body).rounded_rectangle([x0, y0, x1, y1], radius=r, fill=255)
    right = Image.new("L", (S, S), 0); ImageDraw.Draw(right).rectangle([cx, 0, S, S], fill=255)
    shade = ImageChops.multiply(body, right).point(lambda v: 42 if v else 0)
    cap.paste((7, 17, 24, 255), (0, 0), shade)
    d.line([cx, y0+r*0.2, cx, y1-r*0.2], fill=(7, 17, 24, 85), width=max(2, int(thick*0.05)))
    gl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(gl).ellipse([x0+length*0.06, y0+thick*0.10, x0+length*0.6, y0+thick*0.44], fill=(255, 255, 255, 150))
    gl = ImageChops.multiply(gl, Image.merge("RGBA", (Image.new("L",(S,S),255),)*3+(body,)))  # clip glow to capsule
    gl = gl.filter(ImageFilter.GaussianBlur(S*0.008))
    cap = Image.alpha_composite(cap, gl)
    cap = cap.rotate(45, resample=Image.BICUBIC, center=(cx, cy))
    return finish(bg, cap)

# ---------- B: peptide chain ----------
def concept_chain():
    bg = base_bg()
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    pts = [(S*0.27, S*0.62), (S*0.42, S*0.42), (S*0.58, S*0.58), (S*0.73, S*0.38)]
    for i in range(len(pts)-1):
        d.line([pts[i], pts[i+1]], fill=(255, 255, 255, 235), width=int(S*0.032))
    br = S*0.078
    for x, y in pts:
        d.ellipse([x-br, y-br, x+br, y+br], fill=(255, 255, 255, 255))
    x, y = pts[1]; d.ellipse([x-br, y-br, x+br, y+br], fill=(129, 140, 248, 255))
    x, y = pts[2]; d.ellipse([x-br, y-br, x+br, y+br], fill=(94, 234, 212, 255))
    return finish(bg, layer)

# ---------- C: droplet ----------
def concept_drop():
    bg = base_bg()
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    cx = S/2; cy = S*0.58; rad = S*0.19
    d.ellipse([cx-rad, cy-rad, cx+rad, cy+rad], fill=(255, 255, 255, 255))
    d.polygon([(cx-rad*0.70, cy-rad*0.52), (cx+rad*0.70, cy-rad*0.52), (cx, S*0.26)], fill=(255, 255, 255, 255))
    inner = rad*0.42
    d.ellipse([cx-inner, cy-inner, cx+inner, cy+inner], fill=(129, 140, 248, 255))
    hl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(hl).ellipse([cx-rad*0.55, cy-rad*0.5, cx-rad*0.05, cy+rad*0.05], fill=(255, 255, 255, 140))
    hl = hl.filter(ImageFilter.GaussianBlur(S*0.01))
    layer = Image.alpha_composite(layer, hl)
    return finish(bg, layer)

for name, fn in [("A-capsule", concept_capsule), ("B-chain", concept_chain), ("C-droplet", concept_drop)]:
    fn().save(os.path.join(OUT, name + ".png"), "PNG")
    print("wrote", name)
print("done ->", os.path.abspath(OUT))
