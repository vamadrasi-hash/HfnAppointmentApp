#!/usr/bin/env python3
"""Turn the supplied brand artwork into the assets the app ships.

Input   assets/brand/mark-source.png       the seated figure, on a white ground
        assets/brand/wordmark-source.png   the logotype, already transparent

Output  public/logo-mark.png               figure, transparent, brand blue
        public/logo-mark-white.png         figure, transparent, white
        public/logo-wordmark.png           logotype, transparent, ink
        public/favicon.svg                 app tile with the white figure baked in

Run scripts/make_icons.py afterwards to re-render the PNG app icons.
Pure standard library — no Pillow, no build step.
"""
import base64
import binascii
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "brand"
PUBLIC = ROOT / "public"

BRAND = (0x45, 0x59, 0x8F)  # brand-600 — the app's primary
INK = (0x1E, 0x24, 0x38)  # ink-900 — body text
WHITE = (0xFF, 0xFF, 0xFF)

# The tile the app icon sits on.
TILE_TOP, TILE_BOTTOM, TILE_RADIUS = "#4d6299", "#33436e", 120
TILE_SIZE = 512
MARK_FILL = 0.66  # how much of the tile's width the figure spans


# ---------------------------------------------------------------- PNG codec --
def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    return a if pa <= pb and pa <= pc else (b if pb <= pc else c)


def read_png(path):
    """-> (w, h, rgba) for any 8-bit non-interlaced PNG."""
    d = path.read_bytes()
    pos, idat, plte, trns, ihdr = 8, b"", None, None, None
    while pos < len(d):
        (ln,) = struct.unpack(">I", d[pos : pos + 4])
        tag, data = d[pos + 4 : pos + 8], d[pos + 8 : pos + 8 + ln]
        if tag == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", data)
        elif tag == b"IDAT":
            idat += data
        elif tag == b"PLTE":
            plte = data
        elif tag == b"tRNS":
            trns = data
        pos += 12 + ln

    w, h, depth, color, _, _, interlace = ihdr
    if depth != 8 or interlace:
        raise SystemExit(f"{path.name}: need an 8-bit, non-interlaced PNG")
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color]
    stride = w * channels
    raw = zlib.decompress(idat)

    rows, prev, p = bytearray(), bytearray(stride), 0
    for _ in range(h):
        ft = raw[p]
        line = bytearray(raw[p + 1 : p + 1 + stride])
        p += 1 + stride
        for i in range(stride):
            a = line[i - channels] if i >= channels else 0
            b = prev[i]
            c = prev[i - channels] if i >= channels else 0
            if ft == 1:
                line[i] = (line[i] + a) & 255
            elif ft == 2:
                line[i] = (line[i] + b) & 255
            elif ft == 3:
                line[i] = (line[i] + (a + b) // 2) & 255
            elif ft == 4:
                line[i] = (line[i] + _paeth(a, b, c)) & 255
        rows += line
        prev = line

    rgba = bytearray(w * h * 4)
    for i in range(w * h):
        s = i * channels
        if color == 6:
            rgba[i * 4 : i * 4 + 4] = rows[s : s + 4]
        elif color == 2:
            rgba[i * 4 : i * 4 + 3] = rows[s : s + 3]
            rgba[i * 4 + 3] = 255
        elif color == 3:
            idx = rows[s]
            rgba[i * 4 : i * 4 + 3] = plte[idx * 3 : idx * 3 + 3]
            rgba[i * 4 + 3] = trns[idx] if trns and idx < len(trns) else 255
        else:
            g = rows[s]
            rgba[i * 4 : i * 4 + 3] = bytes((g, g, g))
            rgba[i * 4 + 3] = rows[s + 1] if color == 4 else 255
    return w, h, rgba


def _chunk(tag, data):
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", binascii.crc32(tag + data) & 0xFFFFFFFF)
    )


def encode_png(w, h, rgba):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += rgba[y * w * 4 : (y + 1) * w * 4]
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
        + _chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + _chunk(b"IEND", b"")
    )


# ------------------------------------------------------------------ helpers --
def key_out_white(w, h, rgba):
    """Recover the alpha of artwork that was flattened onto a white ground.

    A drawn pixel is  p = colour·a + 255·(1 - a),  so  a = (255 - p) / (255 - c)
    using whichever channel is furthest from white — that keeps the anti-aliased
    edges instead of hard-clipping them.
    """
    # Take the artwork's own colour to be the one the solid interior is painted
    # in — the most common dark pixel. A single darkest outlier would make every
    # other pixel come out slightly see-through.
    tally = {}
    for i in range(w * h):
        px = bytes(rgba[i * 4 : i * 4 + 3])
        if sum(px) < 600:  # ignore the white ground
            tally[px] = tally.get(px, 0) + 1
    if not tally:
        raise SystemExit("no artwork found — is the source blank?")
    base = max(tally, key=tally.get)
    ch = max(range(3), key=lambda c: 255 - base[c])
    span = 255 - base[ch]
    out = bytearray(w * h * 4)
    for i in range(w * h):
        a = round((255 - rgba[i * 4 + ch]) * 255 / span)
        out[i * 4 + 3] = max(0, min(255, a))
    return out


def tint(w, h, rgba, colour):
    """Keep the alpha, replace every pixel's colour."""
    out = bytearray(rgba)
    for i in range(w * h):
        out[i * 4 : i * 4 + 3] = bytes(colour)
    return out


def trim(w, h, rgba, threshold=6):
    xs = [x for x in range(w) if any(rgba[(y * w + x) * 4 + 3] > threshold for y in range(h))]
    ys = [y for y in range(h) if any(rgba[(y * w + x) * 4 + 3] > threshold for x in range(w))]
    if not xs or not ys:
        return w, h, rgba
    x0, x1, y0, y1 = xs[0], xs[-1] + 1, ys[0], ys[-1] + 1
    nw, nh = x1 - x0, y1 - y0
    out = bytearray(nw * nh * 4)
    for y in range(nh):
        s = ((y + y0) * w + x0) * 4
        out[y * nw * 4 : (y + 1) * nw * 4] = rgba[s : s + nw * 4]
    return nw, nh, out


def crop_tagline(w, h, rgba):
    """Return just the "heartfulness" line, without "advancing in love".

    The two sit on separate lines, so the row carrying the least ink in the
    lower middle of the artwork is the gap between them.
    """
    ink = [sum(1 for x in range(w) if rgba[(y * w + x) * 4 + 3] > 20) for y in range(h)]
    lo, hi = int(h * 0.55), int(h * 0.85)
    split = min(range(lo, hi), key=lambda y: ink[y])
    return w, split, rgba[: w * split * 4]


def write_favicon(mark_png_bytes, mark_w, mark_h):
    """The tile, with the white figure embedded so the file stands alone."""
    uri = "data:image/png;base64," + base64.b64encode(mark_png_bytes).decode()
    draw_w = TILE_SIZE * MARK_FILL
    draw_h = draw_w * mark_h / mark_w
    x = (TILE_SIZE - draw_w) / 2
    y = (TILE_SIZE - draw_h) / 2
    (PUBLIC / "favicon.svg").write_text(
        f'<svg width="{TILE_SIZE}" height="{TILE_SIZE}" '
        f'viewBox="0 0 {TILE_SIZE} {TILE_SIZE}" xmlns="http://www.w3.org/2000/svg">\n'
        f"  <defs>\n"
        f'    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">\n'
        f'      <stop offset="0" stop-color="{TILE_TOP}"/>\n'
        f'      <stop offset="1" stop-color="{TILE_BOTTOM}"/>\n'
        f"    </linearGradient>\n"
        f"  </defs>\n"
        f'  <rect width="{TILE_SIZE}" height="{TILE_SIZE}" rx="{TILE_RADIUS}" fill="url(#tile)"/>\n'
        f'  <image x="{x:.1f}" y="{y:.1f}" width="{draw_w:.1f}" height="{draw_h:.1f}" '
        f'href="{uri}"/>\n'
        f"</svg>\n"
    )


def main():
    # The figure: key the white ground out, then ship a brand and a white copy.
    w, h, rgba = read_png(SRC / "mark-source.png")
    w, h, rgba = trim(w, h, key_out_white(w, h, rgba))
    (PUBLIC / "logo-mark.png").write_bytes(encode_png(w, h, tint(w, h, rgba, BRAND)))
    white = encode_png(w, h, tint(w, h, rgba, WHITE))
    (PUBLIC / "logo-mark-white.png").write_bytes(white)
    print(f"wrote public/logo-mark.png and logo-mark-white.png ({w}x{h})")

    # The logotype arrives transparent already; just trim and set the ink.
    ww, wh, wrgba = trim(*read_png(SRC / "wordmark-source.png"))
    wrgba = tint(ww, wh, wrgba, INK)
    (PUBLIC / "logo-wordmark.png").write_bytes(encode_png(ww, wh, wrgba))
    print(f"wrote public/logo-wordmark.png ({ww}x{wh})")

    # A compact copy for small lockups, where the tagline would only smudge.
    cw, ch, crgba = trim(*crop_tagline(ww, wh, wrgba))
    (PUBLIC / "logo-wordmark-compact.png").write_bytes(encode_png(cw, ch, crgba))
    print(f"wrote public/logo-wordmark-compact.png ({cw}x{ch})")

    write_favicon(white, w, h)
    print("wrote public/favicon.svg")


if __name__ == "__main__":
    main()
