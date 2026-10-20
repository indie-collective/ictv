#!/usr/bin/env python3
"""Draw a PM5544-style test card (grid, castellated circle, colour bars, grey scale, frequency
gratings, black/white/red patches) as a binary PPM on stdout. The logo is overlaid by
build-testcard.sh.

Usage: build-testcard.py [WIDTH HEIGHT] > card.ppm   (16:9; defaults to 1280x720)
"""
import math
import sys

w = int(sys.argv[1]) if len(sys.argv) > 1 else 1280
h = int(sys.argv[2]) if len(sys.argv) > 2 else 720
s = h / 720.0                    # everything below is designed on a 1280x720 canvas

BG = (88, 88, 88)
WHITE, BLACK = (235, 235, 235), (16, 16, 16)
BARS = [WHITE, (235, 235, 16), (16, 235, 235), (16, 235, 16),
        (235, 16, 235), (235, 16, 16), (16, 16, 235), BLACK]
STEPS = [round(16 + i * (235 - 16) / 7) for i in range(8)]
GRATINGS = [16, 12, 8, 6, 4]     # stripe period in px (the 0.8 ... 4.8 MHz bursts)

cx, cy = w / 2, h / 2
R = 280 * s                      # circle radius, black/white castellation lives in R..R+10
GRID = 80 * s


def grey(v):
    return (v, v, v)


def mix(a, b, t):
    return tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))


def inside(x, dx, dy):
    """Content of the circle, indexed by dy = distance below the centre (in 720p pixels)."""
    u = (x - (cx - R)) / (2 * R)                      # 0..1 across the circle
    if -250 <= dy < -190:
        return BARS[min(7, int(u * 8))]
    if -190 <= dy < -110:
        return grey(STEPS[min(7, int(u * 8))])
    if -110 <= dy < 110:
        return grey(128)
    if 110 <= dy < 190:
        k = min(4, int(u * 5))
        return WHITE if int(dx / s / (GRATINGS[k] / 2)) % 2 == 0 else BLACK
    if 190 <= dy < 250:
        return (BLACK, grey(128), WHITE, (235, 16, 16))[min(3, int(u * 4))]
    return BG


def pixel(x, y):
    px, py = x + 0.5, y + 0.5
    # Frame: alternating black/white blocks along the four edges
    edge = min(px, py, w - px, h - py)
    if edge < 20 * s:
        along = px if min(py, h - py) < 20 * s else py
        return BLACK if int(along / (40 * s)) % 2 else WHITE

    dx, dy = px - cx, py - cy
    d = math.hypot(dx, dy)
    col = BG
    if d < R + 10 * s + 1:
        if d < R:
            col = inside(px, dx, dy / s)
        else:                                          # castellated rim
            seg = int((math.atan2(dy, dx) + math.pi) / (2 * math.pi) * 48)
            col = BLACK if seg % 2 else WHITE
        col = mix(col, BG, min(1.0, max(0.0, d - (R + 10 * s))))
    else:
        # White grid, one line every GRID px through the centre, 2 px wide
        if abs((dx + GRID / 2) % GRID - GRID / 2) < s or abs((dy + GRID / 2) % GRID - GRID / 2) < s:
            col = WHITE
        return col
    # Centre cross inside the circle
    if d < R and (abs(dx) < s or abs(dy) < s):
        col = WHITE
    return col


def main():
    out = sys.stdout.buffer
    out.write(b'P6\n%d %d\n255\n' % (w, h))
    for y in range(h):
        row = bytearray()
        for x in range(w):
            row += bytes(pixel(x, y))
        out.write(row)


main()
