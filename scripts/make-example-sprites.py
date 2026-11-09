#!/usr/bin/env python3
"""Draws the example sprite sheets in public/silat/sprites (no libraries needed). Run: python3 scripts/make-example-sprites.py

They show the format the game expects: 256x256 frames side by side, transparent background,
feet on the faint guide line (85% down), frame number as dots in the corner.
"""
import os
import struct
import zlib

F = 256          # frame size
FEET = int(F * 0.85)


def png(path, w, h, px):
    raw = b"".join(b"\x00" + bytes(px[y * w * 4:(y + 1) * w * 4]) for y in range(h))
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


class Canvas:
    def __init__(self, frames):
        self.w, self.h = F * frames, F
        self.px = bytearray(self.w * self.h * 4)

    def dot(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            i = (y * self.w + x) * 4
            self.px[i:i + 4] = bytes(c)

    def ellipse(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry), int(cy + ry) + 1):
            for x in range(int(cx - rx), int(cx + rx) + 1):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                    self.dot(x, y, c)

    def rect(self, x0, y0, x1, y1, c):
        for y in range(int(y0), int(y1)):
            for x in range(int(x0), int(x1)):
                self.dot(x, y, c)


INK = (60, 60, 60, 255)
SKIN = (245, 215, 170, 255)
SUIT = (255, 150, 0, 255)
STRIPE = (60, 60, 60, 120)
BAND = (229, 56, 59, 255)
GUIDE = (0, 160, 255, 70)
RED = (255, 75, 75, 255)


def figure(cv, f, dx=0.0, dy=0.0, lean=0.0, hurt=False):
    ox = f * F + F / 2 + dx
    body = SUIT if not hurt else RED
    # guide line where the feet go, and frame-number dots
    cv.rect(f * F + 8, FEET, f * F + F - 8, FEET + 2, GUIDE)
    for k in range(f + 1):
        cv.ellipse(f * F + 14 + k * 12, 14, 4, 4, INK)
    # feet, body (outline first), stripes, head, headband
    cv.ellipse(ox - 22, FEET - 6 + dy * 0.2, 18, 8, INK)
    cv.ellipse(ox + 22 + lean * 40, FEET - 6 + dy * 0.2 - lean * 30, 18, 8, INK)
    cv.ellipse(ox + lean * 20, 150 + dy, 52, 62, INK)
    cv.ellipse(ox + lean * 20, 150 + dy, 46, 56, body)
    for sy in (135, 160, 185):
        cv.rect(ox + lean * 20 - 40, sy + dy, ox + lean * 20 + 40, sy + 6 + dy, STRIPE)
    cv.ellipse(ox + lean * 34, 74 + dy, 36, 36, INK)
    cv.ellipse(ox + lean * 34, 74 + dy, 31, 31, SKIN)
    cv.rect(ox + lean * 34 - 32, 60 + dy, ox + lean * 34 + 32, 72 + dy, BAND)


def sheet(name, poses):
    cv = Canvas(len(poses))
    for f, pose in enumerate(poses):
        figure(cv, f, **pose)
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "silat", "sprites", name)
    png(path, cv.w, cv.h, cv.px)
    print("wrote", name, f"({cv.w}x{cv.h}, {len(poses)} frames)")


sheet("example-idle.png", [dict(dy=0), dict(dy=-4), dict(dy=-7), dict(dy=-4)])
sheet("example-kick.png", [dict(lean=-0.2), dict(lean=0.3, dy=-6), dict(lean=0.6, dy=-8), dict(lean=0.2)])
sheet("example-hit.png", [dict(dx=-12, hurt=True), dict(dx=10, hurt=True), dict(dx=-4)])
