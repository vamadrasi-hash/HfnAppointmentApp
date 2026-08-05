#!/usr/bin/env python3
"""Render public/favicon.svg into the PNG app icons.

The mark lives in exactly one place — public/favicon.svg — and every raster
icon is rendered from it, so the logo can never drift between formats.

Usage:  python3 scripts/make_icons.py [path-to-chrome]

Needs a Chromium/Chrome binary. Pass the path as an argument, or set CHROME.
No Python packages required.
"""
import binascii
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
SVG = PUBLIC / "favicon.svg"

# (output file, pixel size)
TARGETS = [
    ("pwa-512x512.png", 512),
    ("pwa-192x192.png", 192),
    ("apple-touch-icon.png", 180),
    ("favicon-64.png", 64),
]

# Headless Chrome treats --window-size as the *outer* window size and still
# reserves room for the (invisible) frame, so the page is painted this many
# pixels shorter than asked. We render tall and crop the slack off the bottom.
FRAME_SLACK = 120

CANDIDATES = [
    os.environ.get("CHROME"),
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    shutil.which("chromium"),
    shutil.which("chromium-browser"),
    shutil.which("google-chrome"),
]


def find_chrome(argv):
    for c in ([argv[1]] if len(argv) > 1 else []) + CANDIDATES:
        if c and Path(c).exists():
            return c
    sys.exit("No Chromium/Chrome found. Pass the binary path as an argument.")


def _chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(
        ">I", binascii.crc32(tag + data) & 0xFFFFFFFF
    )


def crop_height(png: bytes, keep_rows: int) -> bytes:
    """Trim a PNG to its first `keep_rows` rows.

    PNG row filters only ever refer to the row above, so the compressed
    scanlines for the rows we keep are self-contained: truncating the
    decompressed stream is enough, and no unfiltering is needed.
    """
    pos, chunks, idat = 8, [], b""
    while pos < len(png):
        (length,) = struct.unpack(">I", png[pos : pos + 4])
        tag = png[pos + 4 : pos + 8]
        data = png[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if tag == b"IDAT":
            idat += data
        else:
            chunks.append((tag, data))

    header = dict(zip(("w", "h", "depth", "color", "comp", "filt", "inter"),
                      struct.unpack(">IIBBBBB", next(d for t, d in chunks if t == b"IHDR"))))
    if header["depth"] != 8 or header["inter"] != 0:
        raise SystemExit("unexpected PNG format from Chrome (depth/interlace)")
    if keep_rows >= header["h"]:
        return png

    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[header["color"]]
    stride = header["w"] * channels + 1  # +1 for the per-row filter byte
    raw = zlib.decompress(idat)[: stride * keep_rows]

    body = b"".join(
        _chunk(t, struct.pack(">II", header["w"], keep_rows) + d[8:] if t == b"IHDR" else d)
        for t, d in chunks
        if t != b"IEND"
    )
    return png[:8] + body + _chunk(b"IDAT", zlib.compress(raw, 9)) + _chunk(b"IEND", b"")


def main():
    chrome = find_chrome(sys.argv)
    svg = SVG.read_text()

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for name, size in TARGETS:
            page = tmp / f"{name}.html"
            page.write_text(
                "<!doctype html><html><head><style>"
                "html,body{margin:0;background:transparent}"
                "svg{display:block;width:100%;height:100%}"
                "</style></head><body>"
                f"<div style='width:{size}px;height:{size}px'>{svg}</div>"
                "</body></html>"
            )
            shot = tmp / name
            subprocess.run(
                [
                    chrome,
                    "--headless",
                    "--no-sandbox",
                    "--disable-gpu",
                    "--hide-scrollbars",
                    "--default-background-color=00000000",
                    f"--user-data-dir={tmp / 'profile'}",
                    f"--screenshot={shot}",
                    f"--window-size={size},{size + FRAME_SLACK}",
                    page.as_uri(),
                ],
                check=True,
                capture_output=True,
            )
            (PUBLIC / name).write_bytes(crop_height(shot.read_bytes(), size))
            print(f"wrote public/{name} ({size}x{size})")


if __name__ == "__main__":
    main()
