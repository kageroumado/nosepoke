#!/bin/zsh
# genfull.sh <outfile> <WxH> <subject-prompt> [refimage]
# One Codex image-generation call for a full-bleed opaque image (floors, cards).
set -u
cd "$(dirname "$0")" || exit 1

STYLE='top-down orthographic view, soft studio key light from the upper left, baked ambient occlusion, matte materials, clean cartoon-realistic style, muted laboratory palette, no watermark'

OUT="$1"; SIZE="$2"; SUBJECT="$3"; REF="${4:-}"
W="${SIZE%x*}"; H="${SIZE#*x}"

PROMPT="Use your built-in image generation tool. Do NOT use the OpenAI API fallback and do NOT ask me any question: proceed autonomously to the end. ${SUBJECT} Style: ${STYLE}. This image is FULL-BLEED and OPAQUE: the artwork fills the entire frame edge to edge with no transparency, no border, no drop shadow around the frame and no vignette. Resize the result to exactly ${W}x${H} pixels with: sips --resampleHeightWidth ${H} ${W} ${OUT} . Verify with sips -g pixelWidth -g pixelHeight ${OUT} . Save as ${OUT} in the current working directory. Reply with the path."

if [ -n "$REF" ]; then
  codex exec -i "$REF" -s workspace-write --skip-git-repo-check -C "$PWD" -- "$PROMPT" >".log/${OUT%.png}.log" 2>&1 </dev/null
else
  codex exec -s workspace-write --skip-git-repo-check -C "$PWD" -- "$PROMPT" >".log/${OUT%.png}.log" 2>&1 </dev/null
fi
echo "done: $OUT (exit $?)"
