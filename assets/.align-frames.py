#!/usr/bin/env python3
"""Re-center each frame of a 3-frame sprite sheet on the shared alpha centroid.

Generative output places the rat slightly differently in each panel, which reads as
jitter when the frames are cycled. Each panel is shifted so its opaque centre of mass
lands on the mean centre of mass of the three, killing the wobble without redrawing.
"""
import sys
import numpy as np
from PIL import Image

for path in sys.argv[1:]:
    im = Image.open(path).convert("RGBA")
    W, H = im.size
    n = 3
    fw = W // n
    panels = [im.crop((i * fw, 0, (i + 1) * fw, H)) for i in range(n)]

    cents = []
    for p in panels:
        a = np.asarray(p.getchannel("A"), dtype=np.float64)
        tot = a.sum()
        ys, xs = np.mgrid[0:H, 0:fw]
        cents.append(((xs * a).sum() / tot, (ys * a).sum() / tot))

    tx = sum(c[0] for c in cents) / n
    ty = sum(c[1] for c in cents) / n

    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shifts = []
    for i, p in enumerate(panels):
        dx = int(round(tx - cents[i][0]))
        dy = int(round(ty - cents[i][1]))
        shifts.append((dx, dy))
        out.paste(p, (i * fw + dx, dy), p)
    out.save(path)
    print(f"{path}: shifts {shifts}")
