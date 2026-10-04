#!/usr/bin/env python3
"""Report size, alpha mode and corner transparency for every PNG given (or all in cwd)."""
import sys, glob, os
from PIL import Image

files = sys.argv[1:] or sorted(glob.glob("*.png"))
print(f"{'file':28} {'size':>11} {'mode':5} {'corners-alpha':>16} {'maxA':>5} verdict")
for f in files:
    im = Image.open(f)
    w, h = im.size
    mode = im.mode
    if mode != "RGBA":
        print(f"{os.path.basename(f):28} {f'{w}x{h}':>11} {mode:5} {'-':>16} {'-':>5} OPAQUE-FAIL")
        continue
    a = im.getchannel("A")
    cs = [a.getpixel(p) for p in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    corner_ok = all(c == 0 for c in cs)
    verdict = "ok" if corner_ok else "CORNERS-OPAQUE"
    print(f"{os.path.basename(f):28} {f'{w}x{h}':>11} {mode:5} {str(cs):>16} {a.getextrema()[1]:>5} {verdict}")
