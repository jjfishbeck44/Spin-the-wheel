#!/usr/bin/env python3
"""Generate the Leitz Flow app icons as PNGs (no external deps).

Renders a Leitz-red, full-bleed icon with a white "L" monogram and a
green productivity checkmark, supersampled for anti-aliasing. iOS masks
the corners itself, so the artwork is drawn full-bleed (square).
"""
import struct
import zlib
import math

# Leitz brand palette
RED_TOP = (0xF5, 0x1A, 0x2E)
RED_BOTTOM = (0xC8, 0x00, 0x16)
WHITE = (0xFF, 0xFF, 0xFF)
GREEN = (0x2E, 0xCC, 0x71)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def dist_point_seg(px, py, ax, ay, bx, by):
    """Distance from point to line segment AB."""
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


def render(size):
    ss = 4  # supersample factor
    S = size * ss
    # background gradient buffer (no alpha needed, full bleed)
    buf = bytearray(S * S * 3)

    def put(x, y, color):
        i = (y * S + x) * 3
        buf[i], buf[i + 1], buf[i + 2] = color

    # gradient background
    for y in range(S):
        row = lerp(RED_TOP, RED_BOTTOM, y / (S - 1))
        for x in range(S):
            put(x, y, row)

    # --- white "L" monogram ---
    # proportions relative to canvas
    stroke = 0.165 * S          # thickness of the L strokes
    left = 0.30 * S             # left edge of vertical stroke
    top = 0.24 * S              # top of vertical stroke
    bottom = 0.70 * S           # baseline (top of the foot's lower edge region)
    foot_right = 0.70 * S       # right edge of the horizontal foot
    radius = 0.02 * S           # gentle corner rounding for the L tips

    # checkmark geometry (drawn over lower-right)
    c_thick = 0.115 * S
    cax, cay = 0.515 * S, 0.585 * S
    cbx, cby = 0.605 * S, 0.675 * S
    ccx, ccy = 0.80 * S, 0.40 * S

    aa = ss  # anti-alias softness in supersampled px

    for y in range(S):
        for x in range(S):
            px, py = x + 0.5, y + 0.5

            # signed coverage helper using a soft edge
            def cover_rect(x0, y0, x1, y1):
                # distance outside the rect (negative inside)
                dx = max(x0 - px, px - x1, 0.0)
                dy = max(y0 - py, py - y1, 0.0)
                d = math.hypot(dx, dy)
                return max(0.0, min(1.0, 1.0 - d / aa))

            # vertical bar + foot of the L
            l_cov = max(
                cover_rect(left, top, left + stroke, bottom + stroke),
                cover_rect(left, bottom, foot_right, bottom + stroke),
            )

            if l_cov > 0:
                base = buf[(y * S + x) * 3:(y * S + x) * 3 + 3]
                col = lerp((base[0], base[1], base[2]), WHITE, l_cov)
                put(x, y, col)

            # checkmark (two thick segments) on top
            d1 = dist_point_seg(px, py, cax, cay, cbx, cby)
            d2 = dist_point_seg(px, py, cbx, cby, ccx, ccy)
            d = min(d1, d2)
            c_cov = max(0.0, min(1.0, (c_thick / 2 - d) / aa + 0.5))
            if c_cov > 0:
                base = buf[(y * S + x) * 3:(y * S + x) * 3 + 3]
                col = lerp((base[0], base[1], base[2]), GREEN, c_cov)
                put(x, y, col)

    # downsample by ss (box filter)
    out = bytearray(size * size * 3)
    for y in range(size):
        for x in range(size):
            r = g = b = 0
            for dy in range(ss):
                for dx in range(ss):
                    i = ((y * ss + dy) * S + (x * ss + dx)) * 3
                    r += buf[i]
                    g += buf[i + 1]
                    b += buf[i + 2]
            n = ss * ss
            o = (y * size + x) * 3
            out[o] = r // n
            out[o + 1] = g // n
            out[o + 2] = b // n
    return bytes(out)


def write_png(path, size, rgb):
    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        return c + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    raw = bytearray()
    stride = size * 3
    for y in range(size):
        raw.append(0)  # filter type none
        raw.extend(rgb[y * stride:(y + 1) * stride])
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", idat))
        f.write(chunk(b"IEND", b""))


if __name__ == "__main__":
    import os
    out_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    for sz, name in [(180, "apple-touch-icon.png"),
                     (192, "icon-192.png"),
                     (512, "icon-512.png")]:
        write_png(os.path.join(out_dir, name), sz, render(sz))
        print("wrote", name)
