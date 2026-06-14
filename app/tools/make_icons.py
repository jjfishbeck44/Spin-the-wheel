#!/usr/bin/env python3
"""Generate the Leitz Label Studio app icons as PNGs (no external deps).

Renders a Leitz-red, full-bleed icon with a white luggage-tag (label)
shape, a punched hole, and two red "text" lines. Drawn at 4x and box
down-sampled for anti-aliasing. iOS masks the corners itself, so the
artwork is full-bleed (square).
"""
import struct
import zlib

RED_TOP = (0xF5, 0x1A, 0x2E)
RED_BOTTOM = (0xC8, 0x00, 0x16)
WHITE = (0xFF, 0xFF, 0xFF)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def point_in_poly(px, py, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > py) != (yj > py):
            xint = (xj - xi) * (py - yi) / (yj - yi) + xi
            if px < xint:
                inside = not inside
        j = i
    return inside


def render(size):
    ss = 4
    S = size * ss
    buf = bytearray(S * S * 3)

    # label tag pentagon (pointed left end) in normalized coords
    tag = [(0.30, 0.28), (0.86, 0.28), (0.86, 0.72),
           (0.30, 0.72), (0.13, 0.50)]
    poly = [(x * S, y * S) for x, y in tag]

    hole_cx, hole_cy, hole_r = 0.295 * S, 0.50 * S, 0.050 * S
    # two rounded "text" lines on the right portion of the tag
    lines = [
        (0.42 * S, 0.415 * S, 0.78 * S, 0.475 * S),
        (0.42 * S, 0.525 * S, 0.70 * S, 0.585 * S),
    ]
    line_r = 0.03 * S

    def in_round_rect(px, py, x0, y0, x1, y1, r):
        if x0 + r <= px <= x1 - r and y0 <= py <= y1:
            return True
        if x0 <= px <= x1 and y0 + r <= py <= y1 - r:
            return True
        for cx, cy in ((x0 + r, y0 + r), (x1 - r, y0 + r),
                       (x0 + r, y1 - r), (x1 - r, y1 - r)):
            if (px - cx) ** 2 + (py - cy) ** 2 <= r * r:
                return True
        return False

    for y in range(S):
        bg = lerp(RED_TOP, RED_BOTTOM, y / (S - 1))
        for x in range(S):
            px, py = x + 0.5, y + 0.5
            color = bg
            if point_in_poly(px, py, poly):
                color = WHITE
                # punch hole -> back to background
                if (px - hole_cx) ** 2 + (py - hole_cy) ** 2 <= hole_r * hole_r:
                    color = bg
                else:
                    for (lx0, ly0, lx1, ly1) in lines:
                        if in_round_rect(px, py, lx0, ly0, lx1, ly1, line_r):
                            color = bg
                            break
            i = (y * S + x) * 3
            buf[i], buf[i + 1], buf[i + 2] = color

    # box downsample
    out = bytearray(size * size * 3)
    for y in range(size):
        for x in range(size):
            r = g = b = 0
            for dy in range(ss):
                base = ((y * ss + dy) * S + x * ss) * 3
                for dx in range(ss):
                    j = base + dx * 3
                    r += buf[j]; g += buf[j + 1]; b += buf[j + 2]
            n = ss * ss
            o = (y * size + x) * 3
            out[o] = r // n; out[o + 1] = g // n; out[o + 2] = b // n
    return bytes(out)


def write_png(path, size, rgb):
    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        return c + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    raw = bytearray()
    stride = size * 3
    for y in range(size):
        raw.append(0)
        raw.extend(rgb[y * stride:(y + 1) * stride])
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", idat))
        f.write(chunk(b"IEND", b""))


if __name__ == "__main__":
    import os
    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "icons"))
    os.makedirs(out_dir, exist_ok=True)
    for sz, name in [(180, "apple-touch-icon.png"),
                     (192, "icon-192.png"),
                     (512, "icon-512.png")]:
        write_png(os.path.join(out_dir, name), sz, render(sz))
        print("wrote", name)
