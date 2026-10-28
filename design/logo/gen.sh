#!/usr/bin/env bash
# Duebox logo concepts, one Codex image at a time; existing files are skipped.
# usage: bash design/logo/gen.sh
cd "$(dirname "$0")"
OUT=out
mkdir -p "$OUT"
STYLE="Absolutely NO envelopes, no mail icons, no chat bubbles, no notification badges. Premium modern app icon / logo mark for Duebox, an app that reads your letters and reminds you before deadlines. Square 1024x1024, full-bleed, NO rounded corners, NO text, no letters except where the concept asks for a letter shape, no numbers, no watermark. Background: deep plum diagonal gradient (#4A2F6E to #24133A). Accent: marigold #F2B33D used sparingly. Main shapes in warm white. Style: minimal, geometric, confident, memorable, like a top App Store icon in 2026; must stay readable at 40px; one soft light from the upper-left, subtle depth, no clutter."
while IFS=$'\t' read -r name aspect desc; do
  [ -z "$name" ] && continue
  [ -f "$OUT/$name.png" ] && { echo "skip $name"; continue; }
  echo "gen $name $(date +%H:%M:%S)"
  codex exec --skip-git-repo-check -s danger-full-access -C "$(pwd -W)/$OUT" \
    "Use your image generation tool to create ONE image at aspect $aspect and save it in the current directory as $name.png (exactly that file name; if the tool saves elsewhere, copy it here). Do not create or modify any other files. Image: $desc $STYLE" < /dev/null >> codex.log 2>&1
  ls -la "$OUT/$name.png" 2>/dev/null || echo "MISSING $name"
done < logos.tsv
echo "done logos"
