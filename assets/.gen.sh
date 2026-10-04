#!/bin/zsh
# gen.sh <outfile> <WxH> <subject-prompt> [refimage]
# Runs one Codex image-generation call from the assets directory.
set -u
cd "$(dirname "$0")" || exit 1

STYLE='top-down orthographic view, soft studio key light from the upper left, baked ambient occlusion and a soft contact shadow, matte materials, clean cartoon-realistic style, muted laboratory palette, no text, no watermark, isolated on a fully transparent background'

OUT="$1"; SIZE="$2"; SUBJECT="$3"; REF="${4:-}"

W="${SIZE%x*}"; H="${SIZE#*x}"

PROMPT="Use your built-in image generation tool. Do NOT use the OpenAI API fallback and do NOT ask me any question: proceed autonomously to the end. ${SUBJECT} Style: ${STYLE}. TRANSPARENCY: generate the subject on a flat pure saturated green (#00FF00) chroma-key backdrop (green, never black, because dark parts of the subject must survive the key), then produce a real alpha channel by running the bundled script exactly like this: python \"\${CODEX_HOME:-\$HOME/.codex}/skills/.system/imagegen/scripts/remove_chroma_key.py\" --input <generated> --out ${OUT} --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill . Then resize to exactly ${W}x${H} pixels with: sips --resampleHeightWidth ${H} ${W} ${OUT} . Verify with sips -g pixelWidth -g pixelHeight -g hasAlpha ${OUT} and confirm hasAlpha is yes and the size is exactly ${W}x${H}. Save as ${OUT} in the current working directory. Reply with the path."

if [ -n "$REF" ]; then
  codex exec -i "$REF" -s workspace-write --skip-git-repo-check -C "$PWD" -- "$PROMPT" >".log/${OUT%.png}.log" 2>&1 </dev/null
else
  codex exec -s workspace-write --skip-git-repo-check -C "$PWD" -- "$PROMPT" >".log/${OUT%.png}.log" 2>&1 </dev/null
fi
echo "done: $OUT (exit $?)"
