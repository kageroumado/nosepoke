#!/usr/bin/env python3
"""Tile a floor image 2x2 and score how badly the wrap-around seam shows.

A seamless tile has the same mean absolute difference across the wrap boundary as
across an arbitrary interior boundary. The ratio of the two is the score: 1.0 is
perfect, and the larger it gets the more the seam reads as a visible line.
Writes <name>-tiled.png (downscaled) next to the source for eyeballing.
"""
import sys, os
import numpy as np
from PIL import Image

for path in sys.argv[1:]:
    im = Image.open(path).convert("RGB")
    a = np.asarray(im, dtype=np.float64)
    h, w, _ = a.shape

    def mad(x, y):
        return float(np.abs(x - y).mean())

    seam_h = mad(a[:, -1, :], a[:, 0, :])
    seam_v = mad(a[-1, :, :], a[0, :, :])
    ref_h = float(np.mean([mad(a[:, i, :], a[:, i + 1, :]) for i in range(w // 4, 3 * w // 4, 37)]))
    ref_v = float(np.mean([mad(a[i, :, :], a[i + 1, :, :]) for i in range(h // 4, 3 * h // 4, 37)]))

    rh, rv = seam_h / max(ref_h, 1e-6), seam_v / max(ref_v, 1e-6)
    worst = max(rh, rv)
    verdict = "seamless" if worst < 1.6 else ("faint seam" if worst < 4 else "VISIBLE SEAM")

    tiled = Image.new("RGB", (w * 2, h * 2))
    for p in ((0, 0), (w, 0), (0, h), (w, h)):
        tiled.paste(im, p)
    out = f".log/{os.path.basename(path)[:-4]}-tiled.png"
    tiled.resize((w, h)).save(out)

    print(f"{os.path.basename(path):22} h={rh:5.2f} v={rv:5.2f}  {verdict:13} -> {out}")
