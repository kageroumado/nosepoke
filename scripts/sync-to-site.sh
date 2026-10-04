#!/usr/bin/env bash
# Copy the game's runtime into the kagerou.glass checkout at nosepoke/.
# The site repo is where the published page lives; this repo is where it is made.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
SITE="${1:-$HOME/Developer/kagerou-glass}"
DEST="$SITE/nosepoke"
[[ -f "$SITE/deploy.manifest" ]] || { echo "Not a kagerou.glass checkout: $SITE"; exit 1; }
if [[ -e "$DEST" ]]; then trash "$DEST"; fi
mkdir -p "$DEST/game" "$DEST/vendor/three" "$DEST/assets/3d"
cp "$SRC/index.html" "$SRC/og.png" "$DEST/"
cp "$SRC"/game/{main,oracle,maze,scenery,player,sound,textures,rat}.js "$SRC/game/game.css" "$DEST/game/"
cp "$SRC"/vendor/three/{three.module.min.js,three.core.min.js,GLTFLoader.js,BufferGeometryUtils.js,SkeletonUtils.js,LICENSE} "$DEST/vendor/three/"
cp "$SRC"/assets/3d/{rat.gltf,rat.bin,rat_fur_color.avif,rat_fur_normal.avif,rat_fur_roughness.avif,rat_tail_scales.avif} "$DEST/assets/3d/"
echo "Synced $(find "$DEST" -type f | wc -l | tr -d ' ') files into $DEST"
