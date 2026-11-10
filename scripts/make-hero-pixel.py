#!/usr/bin/env python3
"""Draws the hero's pixel-art animation strips into public/silat/sprites (no libraries needed).

Run:  python3 scripts/make-hero-pixel.py [preview-dir]

The hero is a little rig: a King-piece body, a headband tail, two fists and two feet. Each animation is a
list of poses; every part is stamped with a dark outline. Change a pose below, run the script, reload the game.
Frames are 32x32, side by side, feet on y = 27 (85% down), facing right. With a preview-dir it also writes
8x enlarged copies there so you can look at them.
"""
import os
import struct
import sys
import zlib

F = 32
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "silat", "sprites")

INK = (60, 60, 60, 255)
COL = {
    "W": (255, 255, 255, 255),  # body
    "S": (215, 215, 215, 255),  # body shade
    "R": (229, 56, 59, 255),    # headband
    "D": (142, 27, 29, 255),    # headband shade
    "G": (150, 150, 150, 255),  # prison stripes
    "E": INK,                   # eyes
    "F": (215, 215, 215, 255),  # feet
    "f": (168, 168, 168, 255),  # feet shade
    "C": (140, 140, 140, 255),  # broken shackle
    "Y": (255, 200, 0, 255),    # sparks, stars
    "B": (28, 176, 246, 255),   # block
    "b": (190, 232, 255, 255),  # block glint
    "P": (200, 190, 175, 255),  # dust
}

BODY = [
    "......WW......",
    "......WW......",
    "....WWWWWW....",
    "....WWWWWS....",
    "......WW......",
    "......WS......",
    ".WWWWWWWWWWWW.",
    "WWWWWWWWWWWWSS",
    "RRRRRRRRRRRRDD",
    "RRRRRRRRRRRDDD",
    "WWWWWWWWWWWWSS",
    ".WWWWWEWWWEWS.",
    ".WWWWWEWWWEWS.",
    ".WWWWWWWWWWSS.",
    "..WWWWWWWWWS..",
    "..GGGGGGGGGG..",
    "..WWWWWWWWWS..",
    "..GGGGGGGGGG..",
    "..WWWWWWWWSS..",
]
BW, BH = len(BODY[0]), len(BODY)
BAND_ROW = 8
SQUASH_ROWS = [13, 10]          # rows dropped when the body squashes
TAILS = [                       # headband tail shapes, from the band's back end
    [(-1, 0), (-2, 0), (-2, 1), (-3, 1), (-4, 1), (-4, 2)],
    [(-1, 0), (-2, 0), (-2, -1), (-3, -1), (-4, -1), (-4, -2)],
    [(-1, 0), (-1, 1), (-2, 1), (-2, 2), (-3, 2), (-3, 3)],
    [(-1, 0), (-2, 0), (-3, 0), (-4, 0), (-5, 0), (-5, 1)],
]


def png(path, w, h, px):
    raw = b"".join(b"\x00" + bytes(px[y * w * 4:(y + 1) * w * 4]) for y in range(h))

    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def stamp(fr, cells, outline=True):
    """Draw a part: its dark outline first, then its pixels, over whatever is already there."""
    if outline:
        for (x, y) in cells:
            for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if n not in cells:
                    fr[n] = INK
    for p, c in cells.items():
        fr[p] = COL[c] if isinstance(c, str) else c


def body_cells(p):
    rows = [r for r in range(BH) if r not in SQUASH_ROWS[:p["squash"]]]
    cells, band = {}, None
    if p["lying"]:
        # Flat on its back, head to the left.
        for i, r in enumerate(rows):
            for c in range(BW):
                ch = BODY[r][c]
                if ch != ".":
                    cells[(5 + i + p["bx"], 26 - (BW - 1 - c) + p["by"])] = ch
    else:
        bottom = 24 + p["by"]
        for i, r in enumerate(rows):
            y = bottom - (len(rows) - 1 - i)
            shift = round(p["lean"] * (len(rows) - 1 - i) / (len(rows) - 1))
            for c in range(BW):
                ch = BODY[r][c]
                if ch != ".":
                    cells[(9 + p["bx"] + shift + c, y)] = ch
            if r == BAND_ROW:
                band = (9 + p["bx"] + shift, y)
    # Eyes: the two E columns, drawn open, shut, hurt or happy.
    eyes = sorted(k for k, v in cells.items() if v == "E")
    if p["eyes"] != "open" and eyes and not p["lying"]:
        top = min(y for _, y in eyes)
        for (x, y) in eyes:
            if p["eyes"] == "happy":
                cells[(x, y)] = "E" if y == top else "W"
            else:
                cells[(x, y)] = "W" if y == top else "E"
        if p["eyes"] == "hurt":
            for (x, y) in eyes:
                if y != top:
                    cells[(x - 1, y)] = "E"
    return cells, band


def fist(x, y):
    c = {(x + i, y + j): "W" for i in range(3) for j in range(3)}
    c[(x + 2, y + 2)] = "S"
    return c


def foot(x, y, cuff=False):
    c = {(x + i, y): "F" for i in range(4)}
    c.update({(x + i, y + 1): "f" for i in range(4)})
    if cuff:
        c[(x, y)] = "C"
        c[(x + 1, y)] = "C"
    return c


def line(x0, y0, x1, y1):
    pts, dx, dy = [], abs(x1 - x0), -abs(y1 - y0)
    sx, sy, err = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1), dx - abs(y1 - y0)
    err = dx + dy
    while True:
        pts.append((x0, y0))
        if x0 == x1 and y0 == y1:
            return pts
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def pose(**kw):
    p = dict(bx=0, by=0, lean=0, squash=0, tail=0, eyes="open", lh=(5, 17), rh=(24, 15), lf=(9, 25), rf=(19, 25),
             leg=False, lying=False, fx=[])
    p.update(kw)
    return p


def draw(p):
    fr = {}
    cells, band = body_cells(p)
    hx, hy = p["bx"], p["by"]
    if band and p["tail"] is not None:
        t = TAILS[p["tail"]]
        stamp(fr, {(band[0] + dx, band[1] + dy): ("D" if i >= len(t) - 2 else "R") for i, (dx, dy) in enumerate(t)})
    if p["lh"]:
        stamp(fr, fist(p["lh"][0] + hx, p["lh"][1] + hy))
    if p["lf"]:
        stamp(fr, foot(*p["lf"], cuff=True))
    stamp(fr, cells)
    if p["leg"] and p["rf"]:
        hipx, hipy = 19 + p["bx"], 23 + p["by"]
        leg = {}
        for (x, y) in line(hipx, hipy, p["rf"][0], p["rf"][1]):
            leg[(x, y)] = "W"
            leg[(x, y + 1)] = "S"
        stamp(fr, leg)
    if p["rf"]:
        stamp(fr, foot(*p["rf"]))
    if p["rh"]:
        stamp(fr, fist(p["rh"][0] + hx, p["rh"][1] + hy))
    for kind, x, y in p["fx"]:
        stamp(fr, FX[kind](x, y), outline=False)
    return fr


def star(x, y):
    return {(x, y): COL["W"], (x - 1, y): "Y", (x + 1, y): "Y", (x, y - 1): "Y", (x, y + 1): "Y",
            (x - 2, y): "Y", (x + 2, y): "Y", (x, y - 2): "Y", (x, y + 2): "Y"}


FX = {
    "star": star,
    "spark": lambda x, y: {(x - 1, y - 1): "Y", (x + 1, y - 1): "Y", (x - 1, y + 1): "Y", (x + 1, y + 1): "Y", (x - 2, y - 2): "Y", (x + 2, y + 2): "Y", (x + 2, y - 2): "Y", (x - 2, y + 2): "Y"},
    "dot": lambda x, y: {(x, y): "Y", (x + 1, y): "Y", (x, y + 1): "Y", (x + 1, y + 1): "Y"},
    "dust": lambda x, y: {(x, y): "P", (x + 1, y): "P", (x, y - 1): "P", (x + 2, y): "P", (x + 1, y - 1): "P"},
    "puff": lambda x, y: {(x, y): "P", (x + 1, y - 1): "P"},
    "shield": lambda x, y: {**{(x, y + i): "B" for i in range(1, 9)}, (x - 1, y): "B", (x - 1, y + 9): "B", **{(x + 1, y + i): "b" for i in range(2, 8)}},
    "glint": lambda x, y: {**{(x, y + i): "b" for i in range(2, 8)}, (x - 1, y + 1): "b", (x - 1, y + 8): "b"},
    "whoosh": lambda x, y: {(x + i, y): COL["W"] for i in range(4)},
}

UP = dict(lh=(4, 9), rh=(25, 9))
ANIMS = {
    # Ready stance: breathing, the headband tail flutters, a blink.
    "idle": [
        pose(tail=0),
        pose(tail=1),
        pose(tail=0, squash=1, lh=(5, 18), rh=(24, 16)),
        pose(tail=2, squash=1, lh=(5, 18), rh=(24, 16)),
        pose(tail=0, squash=1, eyes="shut", lh=(5, 18), rh=(24, 16)),
        pose(tail=1),
    ],
    # Crouch, chamber the leg, snap it out, hold, come back.
    "kick": [
        pose(squash=1, lean=-1, tail=2, lh=(5, 17), rh=(22, 14)),
        pose(by=-1, lean=-1, tail=1, rf=(21, 21), lh=(4, 17), rh=(22, 13)),
        pose(by=-1, lean=-3, tail=3, rf=(25, 17), leg=True, lh=(3, 19), rh=(19, 13), fx=[("star", 29, 14)]),
        pose(by=-1, lean=-3, tail=1, rf=(25, 17), leg=True, lh=(3, 19), rh=(19, 13), fx=[("spark", 29, 14)]),
        pose(lean=-1, tail=2, rf=(21, 23), lh=(5, 17), rh=(23, 14)),
    ],
    # Knocked back, then steady again.
    "hit": [
        pose(bx=-1, lean=-2, eyes="hurt", tail=3, lh=(5, 12), rh=(24, 11), fx=[("star", 26, 17)]),
        pose(bx=-2, lean=-3, eyes="hurt", tail=1, lf=(7, 25), rf=(17, 24), lh=(4, 11), rh=(23, 10), fx=[("spark", 26, 17)]),
        pose(bx=-1, lean=-1, eyes="hurt", tail=2, lf=(8, 25), rf=(18, 25)),
        pose(eyes="shut", tail=0),
    ],
    # A quick hop to the next square.
    "step": [
        pose(squash=2, tail=1, lh=(5, 19), rh=(24, 18)),
        pose(by=-4, lean=1, tail=2, lf=(10, 22), rf=(18, 21), lh=(5, 15), rh=(24, 12), fx=[("dust", 7, 27), ("dust", 21, 27)]),
        pose(by=-2, lean=1, tail=2, lf=(10, 24), rf=(19, 23), lh=(5, 14), rh=(24, 13), fx=[("puff", 6, 26), ("puff", 24, 26)]),
        pose(squash=2, tail=1, lh=(4, 19), rh=(25, 18), fx=[("dust", 4, 27), ("dust", 24, 27)]),
    ],
    # Forearms crossed, braced behind a flash of Block.
    "block": [
        pose(lean=-1, tail=2, lh=(21, 16), rh=(21, 12), fx=[("glint", 27, 9)]),
        pose(bx=-1, lean=-1, squash=1, tail=3, lh=(22, 16), rh=(22, 12), fx=[("shield", 27, 9), ("spark", 29, 13)]),
        pose(lean=-1, tail=0, lh=(21, 16), rh=(21, 12), fx=[("shield", 27, 9)]),
        pose(tail=1, fx=[("glint", 27, 9)]),
    ],
    # Lean out of the way and back.
    "dodge": [
        pose(bx=-1, lean=-3, tail=3, lh=(4, 15), rh=(21, 12), fx=[("whoosh", 25, 10), ("whoosh", 26, 16)]),
        pose(bx=-3, lean=-4, tail=3, lf=(6, 25), rf=(16, 25), lh=(4, 14), rh=(21, 11), fx=[("whoosh", 22, 9), ("whoosh", 24, 14), ("whoosh", 23, 20)]),
        pose(bx=-1, lean=-2, tail=1, lf=(8, 25), rf=(18, 25), lh=(5, 16), rh=(23, 13)),
        pose(tail=0),
    ],
    # Fists in the air, jumping.
    "win": [
        pose(squash=1, eyes="happy", tail=1, lh=(4, 12), rh=(25, 12)),
        pose(by=-3, eyes="happy", tail=2, lf=(10, 23), rf=(18, 23), **UP, fx=[("dust", 6, 27), ("dust", 22, 27)]),
        pose(by=-4, eyes="happy", tail=2, lf=(10, 22), rf=(18, 22), **UP, fx=[("dot", 2, 6), ("dot", 28, 4)]),
        pose(by=-2, eyes="happy", tail=0, lf=(10, 24), rf=(18, 24), **UP, fx=[("dot", 1, 9), ("dot", 29, 8)]),
        pose(squash=2, eyes="happy", tail=1, lh=(4, 14), rh=(25, 14), fx=[("dust", 4, 27), ("dust", 24, 27)]),
        pose(squash=1, eyes="happy", tail=1, lh=(4, 12), rh=(25, 12)),
    ],
    # Staggers, falls on its back, sees stars. The last frame stays.
    "ko": [
        pose(bx=-1, lean=-2, eyes="hurt", tail=3, lh=(5, 12), rh=(24, 11), fx=[("star", 26, 15)]),
        pose(bx=-2, lean=-5, eyes="hurt", tail=1, lf=(8, 25), rf=(17, 23), lh=(3, 10), rh=(22, 8)),
        pose(lying=True, by=-2, tail=None, lf=(25, 17), rf=(25, 21), lh=None, rh=(19, 14), fx=[("dust", 3, 27), ("dust", 23, 27)]),
        pose(lying=True, tail=None, lf=(25, 20), rf=(25, 24), lh=None, rh=(19, 17)),
        pose(lying=True, tail=None, lf=(25, 20), rf=(25, 24), lh=None, rh=(19, 17), fx=[("dot", 6, 6), ("dot", 13, 4), ("dot", 20, 6)]),
        pose(lying=True, tail=None, lf=(25, 20), rf=(25, 24), lh=None, rh=(19, 17), fx=[("dot", 9, 4), ("dot", 16, 6), ("dot", 23, 4)]),
    ],
}


def strip(frames, scale=1):
    w, h = F * len(frames) * scale, F * scale
    px = bytearray(w * h * 4)
    for i, p in enumerate(frames):
        for (x, y), c in draw(p).items():
            if 0 <= x < F and 0 <= y < F:
                for sy in range(scale):
                    for sx in range(scale):
                        o = ((y * scale + sy) * w + (i * F + x) * scale + sx) * 4
                        px[o:o + 4] = bytes(c)
    return w, h, px


if __name__ == "__main__":
    preview = sys.argv[1] if len(sys.argv) > 1 else None
    for name, frames in ANIMS.items():
        png(os.path.join(OUT, f"hero-{name}.png"), *strip(frames))
        if preview:
            png(os.path.join(preview, f"hero-{name}.png"), *strip(frames, 8))
        print(f"hero-{name}.png  {len(frames)} frames")
