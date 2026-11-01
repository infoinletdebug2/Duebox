#!/usr/bin/env bash
# One Codex image per line of shots.tsv -> art/<name>.png   (bash gen.sh [name ...])
cd "$(dirname "$0")"
LOOK="Square image, 1:1 (1024x1024). The scene FILLS THE WHOLE FRAME from top to bottom, with no empty band at the top: a premium 3D product render of a modern 13-inch iPad Pro in PORTRAIT orientation (thin uniform bezels, aluminium edge, front camera on the long edge), very large: the top of the iPad is about 4 percent below the top edge of the image and the iPad runs off the bottom edge, tilted about 5 degrees. The top 3 percent of the image is plain plum #2E1A47 so it blends into a headline area above it. Background is a smooth deep plum gradient (#2E1A47 at the top to #4A2C6E lower down) with a soft warm marigold (#F2B33D) glow behind the phone and a soft realistic shadow; luxury Apple-keynote studio lighting, ultra sharp, high-end App Store screenshot look. The iPad screen is a clean iPadOS app UI: status bar showing 9:41 with signal, wifi and battery only (no Android icons). App brand colours: plum #2E1A47, marigold #F2B33D, paper #F5F3F8; fonts like Bricolage Grotesque for headings and Manrope for body. Recreate the layout of the attached screenshot faithfully but as polished iPhone UI. Every word on the screen must be spelled exactly as written here and nothing else; keep on-screen text large and legible. No other text, logos or watermarks outside the iPad except what is described. No people, no hands."
gen() {
  name="$1"; ref="$2"; scene="$3"
  [ -f "art/$name.png" ] && { echo "skip $name"; return; }
  codex exec --skip-git-repo-check -s workspace-write -C "$(pwd)" "Use your image generation tool to create ONE image. $LOOK $scene After it is generated, copy the PNG file to art/$name.png in the current directory and reply with just the saved path." -i "ref/$ref" < /dev/null > "logs/$name.log" 2>&1
  [ -f "art/$name.png" ] && echo "done $name" || echo "FAILED $name (see logs/$name.log)"
}
want="$*"
while IFS=$'\t' read -r name ref scene; do
  [ -z "$want" ] || [[ " $want " == *" $name "* ]] || continue
  gen "$name" "$ref" "$scene" &
done < "${TSV:-shots.tsv}"
wait
