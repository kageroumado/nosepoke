# nosepoke

You are a lab rat, seen from inside: a first-person browser game at five centimeters off the
floor. You walk a maze of forks and press a lever. Every choice you make was sealed with
SHA-256 before you made it, and at the end you can check. In the second session, knowing
this, you try to beat the predictions.

Play it at [kagerou.glass/nosepoke](https://kagerou.glass/nosepoke/).

## Play locally

```sh
python3 -m http.server 8134 --bind 127.0.0.1
```

Open **http://127.0.0.1:8134/**. It needs WebGL 2. Everything loads locally, with no build step
and no runtime CDN.

**W S** or arrows move, **A D** or the mouse turn (click to capture the mouse), **E** or
space interacts, and shift runs. On touch, drag the left side to walk, drag the right side
to look, and tap ● to interact. About ten minutes.

## Layout

| Path | Contents |
|---|---|
| `game/` | The first-person game: director, oracle, apparatus, scenery, sound |
| `shared/`, `harness/` | Learning model, schedule implementations, signatures, figures and save tools |
| `studies.html`, `day/`, `night/`, `park/`, `epilogue/` | Extended experiments on the TD(λ) engine |
| `scenes/rat.blend`, `scripts/build_rat.py` | Editable rat and its reproducible Blender generator |
| `assets/3d/`, `vendor/three/` | The rat model and fur maps, pinned Three.js r185 |

## Tests

```sh
npm install
node --test harness/oracle.test.mjs
npm test
```

## License

MIT. Three.js ships under its own MIT license in `vendor/three/LICENSE`.
