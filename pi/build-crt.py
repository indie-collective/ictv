#!/usr/bin/env python3
"""Render the CRT look (scanlines, RGB stripes, vignette, bezel) as one premultiplied BGRA
image for mpv's overlay-add. Same maths as the old pi/mpv/shaders/crt.glsl, but drawn once
instead of per frame: a GPU pass at 1080p60 is too much for the Pi 4.

Every step is either "multiply by k" or "mix towards a colour", so the whole stack folds into
out = video * (1 - A) + P, which is exactly a premultiplied overlay with alpha A and colour P.

Usage: build-crt.py WIDTH HEIGHT OUT.bgra
"""
import math
import os
import sys

SCANLINE_DARKEN = 0.5625  # two stacked rgba(0,0,0,.25) lines
TINT_STRENGTH = 0.06      # red/blue stripe alpha (green is a third of it)
VIGNETTE_START = 0.82
BEZEL_RADIUS = 0.12       # corner radius, in half-heights
LED_COLOR = (255, 40, 30)  # power LED on the bottom right of the bezel


def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def main():
    w, h, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    aspect = w / h
    aa = 2.0 / h

    # RGB stripe per column, applied twice: k (keep factor) and premultiplied colour
    stripes = []
    for x in range(w):
        col = x % 3
        a = TINT_STRENGTH if col != 1 else TINT_STRENGTH / 3
        tint = (1.0, 0.0, 0.0) if col == 0 else (0.0, 1.0, 0.0) if col == 1 else (0.0, 0.0, 1.0)
        k = (1 - a) ** 2
        p = tuple(t * a * (1 - a) + t * a for t in tint)
        stripes.append((k, p))

    buf = bytearray(w * h * 4)
    i = 0
    for y in range(h):
        v = (y + 0.5) / h
        scan = SCANLINE_DARKEN if y % 2 else 1.0
        apy = abs(v * 2 - 1)
        for x in range(w):
            u = (x + 0.5) / w
            # Scanlines come before the tint, so they dim the video but not the tint itself
            k, (pr, pg, pb) = stripes[x]
            k *= scan

            d = math.hypot(u - 0.5, v - 0.5) * 1.41421356
            m = 1.0 - min(1.0, max(0.0, (d - VIGNETTE_START) / (1.0 - VIGNETTE_START)))

            apx = abs(u * 2 - 1)
            ix = 1.0 - 2.0 * (0.014 + 0.008 * apy * apy)
            iy = 1.0 - 2.0 * (0.011 + 0.009 * apx * apx)
            qx, qy = apx / ix * aspect, apy / iy
            ex, ey = qx - (aspect - BEZEL_RADIUS), qy - (1.0 - BEZEL_RADIUS)
            sd = math.hypot(max(ex, 0.0), max(ey, 0.0)) + min(max(ex, ey), 0.0) - BEZEL_RADIUS
            m *= 1.0 - smoothstep(-aa, aa, sd)

            k *= m
            buf[i] = round(pb * m * 255)
            buf[i + 1] = round(pg * m * 255)
            buf[i + 2] = round(pr * m * 255)
            buf[i + 3] = round((1 - k) * 255)
            i += 4

    # Power LED: bright core plus a soft glow, composited over the finished overlay
    cx, cy, r = w - 0.07 * h, h - 0.0095 * h, 0.003 * h
    for y in range(int(cy - 5 * r), min(h, int(cy + 5 * r) + 1)):
        for x in range(int(cx - 5 * r), min(w, int(cx + 5 * r) + 1)):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r
            c = max(1.0 - smoothstep(0.9, 1.1, d), 0.45 * math.exp(-d * d / 2.5))
            if c <= 0.003:
                continue
            j = (y * w + x) * 4
            inv = 1.0 - c
            for k, ch in ((0, 2), (1, 1), (2, 0)):
                buf[j + k] = min(255, round(buf[j + k] * inv + LED_COLOR[ch] * c))
            buf[j + 3] = min(255, round(buf[j + 3] * inv + 255 * c))

    with open(out + '.tmp', 'wb') as f:
        f.write(buf)
    os.replace(out + '.tmp', out)


if __name__ == '__main__':
    main()
