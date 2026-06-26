#!/usr/bin/env python3
"""Generate the Heartfulness Sittings app icons: a calm white lotus on a teal tile."""
import math
from PIL import Image, ImageDraw

OUT = "/home/claude/heartfulness-ams/public"

TEAL_TOP = (15, 118, 110)     # #0f766e  (brand-600)
TEAL_BOT = (11, 79, 72)       # deeper teal for a soft vertical gradient
WHITE = (255, 255, 255)

# Petal fan: angle (deg from vertical), width, height (as fraction of S), alpha
PETALS = [
    (-54, 0.135, 0.34, 140),
    (-28, 0.150, 0.40, 175),
    (0,   0.165, 0.46, 235),
    (28,  0.150, 0.40, 175),
    (54,  0.135, 0.34, 140),
]


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def gradient_tile(size):
    base = Image.new("RGB", (size, size), TEAL_TOP)
    top, bot = TEAL_TOP, TEAL_BOT
    px = base.load()
    for y in range(size):
        t = y / (size - 1)
        # ease the blend slightly toward the centre
        t = t * t * (3 - 2 * t)
        r = int(top[0] + (bot[0] - top[0]) * t)
        g = int(top[1] + (bot[1] - top[1]) * t)
        b = int(top[2] + (bot[2] - top[2]) * t)
        for x in range(size):
            px[x, y] = (r, g, b)
    return base


def draw_petal(canvas_size, width, height, alpha, angle_deg, base_xy):
    """Draw one upright petal then rotate it about the lotus base point."""
    S = canvas_size
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    pw = width * S
    ph = height * S
    cx = S / 2
    base_y = S / 2  # petal base sits at layer centre, tip points up
    bbox = [cx - pw / 2, base_y - ph, cx + pw / 2, base_y]
    d.ellipse(bbox, fill=(*WHITE, alpha))
    # rotate about the layer centre (which is the petal base)
    layer = layer.rotate(-angle_deg, center=(cx, base_y), resample=Image.BICUBIC)
    # composite so the layer centre lands on the lotus base point
    off = (int(base_xy[0] - cx), int(base_xy[1] - base_y))
    return layer, off


def build_icon(size, corner_ratio=0.235):
    SS = size * 2  # supersample for smooth edges
    tile = gradient_tile(SS).convert("RGBA")

    base_xy = (SS / 2, SS * 0.665)

    # Soft halo behind the lotus
    halo = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    hr = SS * 0.30
    hd.ellipse(
        [base_xy[0] - hr, base_xy[1] - hr * 1.15, base_xy[0] + hr, base_xy[1] + hr * 0.85],
        fill=(*WHITE, 26),
    )
    tile = Image.alpha_composite(tile, halo)

    # Petals
    for angle, w, h, a in PETALS:
        layer, off = draw_petal(SS, w, h, a, angle, base_xy)
        shifted = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
        shifted.paste(layer, off, layer)
        tile = Image.alpha_composite(tile, shifted)

    # Small base bud + a calm centre dot
    bd = ImageDraw.Draw(tile)
    br = SS * 0.045
    bd.ellipse(
        [base_xy[0] - br, base_xy[1] - br, base_xy[0] + br, base_xy[1] + br],
        fill=(*WHITE, 235),
    )

    # Round the corners
    mask = rounded_mask(SS, int(SS * corner_ratio))
    tile.putalpha(mask)

    return tile.resize((size, size), Image.LANCZOS)


def write_svg():
    petals_svg = []
    cx, by = 256, 338
    cy = 218  # petal centre so its bottom (cy+ry) reaches the base
    for angle, w, h, a in PETALS:
        rx = w * 512 / 2
        ry = h * 512 / 2
        pcy = by - ry
        petals_svg.append(
            f'<ellipse cx="{cx}" cy="{pcy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" '
            f'fill="#ffffff" fill-opacity="{a/255:.2f}" '
            f'transform="rotate({angle} {cx} {by})"/>'
        )
    petals = "\n      ".join(petals_svg)
    svg = f"""<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0f766e"/>
      <stop offset="1" stop-color="#0b4f48"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" rx="120" fill="url(#tile)"/>
  <ellipse cx="256" cy="300" rx="150" ry="150" fill="#ffffff" fill-opacity="0.10"/>
  <g>
      {petals}
  </g>
  <circle cx="256" cy="338" r="23" fill="#ffffff" fill-opacity="0.92"/>
</svg>
"""
    with open(f"{OUT}/favicon.svg", "w") as f:
        f.write(svg)


def main():
    write_svg()
    build_icon(512).save(f"{OUT}/pwa-512x512.png")
    build_icon(192).save(f"{OUT}/pwa-192x192.png")
    build_icon(180).save(f"{OUT}/apple-touch-icon.png")
    # a small favicon png as a fallback for older browsers
    build_icon(64).save(f"{OUT}/favicon-64.png")
    print("Icons written to", OUT)


if __name__ == "__main__":
    main()
