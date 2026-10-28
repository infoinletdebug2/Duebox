# Duebox icon

Current master (2026-10-28): `master.png`, the "envelope clock": a warm-white
envelope whose flap carries two plum clock hands meeting at a marigold dot, on
plum. Picked by the owner from nine Codex concepts (`design/logo/`: prompts in
`logos-r1.tsv` / `logos.tsv`, script `gen.sh`; the concept PNGs stay local).
`mark.svg` is its flat vector twin, the same drawing as `Mark` in
`src/ui/artwork.tsx`; it is what the app draws at 32–52 px.

Prompt (Codex image tool, via `design/logo/gen.sh`):

> An envelope seen from the front; its triangular flap is drawn as the hands of a clock pointing up and to the right, with a small marigold dot at the clock centre. One bold continuous shape, white envelope on the plum background.
> + the shared style in `gen.sh`: square 1024, full bleed, no text, plum #4A2F6E→#24133A, marigold #F2B33D sparingly, warm white, minimal, readable at 40px.

Regenerate every size: `node assets/source/render-raster.mjs`.

## Discovery, setup and offer artwork (2026-10-05)

Generated with the Codex CLI image tool, then resized to 828 px JPEG into
`assets/discover/`. Shared style suffix for every image:

> Portrait 9:16 (1024x1792). Editorial premium 3D illustration for a mobile app onboarding screen. Subject only in the upper 55% of the frame. Palette: deep plum (#2E1A47) background and shadows, warm paper whites, marigold (#F2B33D) as the single warm accent. The bottom 45% fades smoothly into solid deep plum #1E1229 with nothing in it (text will sit there). Style: calm, tactile clay/paper 3D, soft studio light, soft shadows, NO text, no readable letters or numbers, no logos, no watermark, no UI chrome.

| File | Subject |
|---|---|
| problem | A messy stack of household mail on a hallway console table; one letter with a marigold sticky tab |
| scan | A hand holding a phone over a renewal letter; a marigold scan line; a tidy dated card lifting out of the screen |
| read | A letter with one line highlighted in marigold, connected by a thread to a blank calendar-page card |
| remind | Three floating paper notification cards with marigold bell/clock emblems and a calendar tile |
| together | Two pairs of hands filing cards into one shared wooden tray |
| gift | A paper gift box with a marigold ribbon, light and small cards rising out of it |
| setup | A tidy wooden letter tray of colour-tabbed cards beside a brass alarm clock |

## Hero banners (assets/hero, 2026-10-05)

4:3 crops (828x621) of the discovery scenes above, used by `src/ui/HeroBanner.tsx`:
auth ← scan · account ← read · export ← setup · delete ← problem · notify ← remind ·
household ← together · subscription ← gift. Bespoke 4:3 scenes can replace any of
them later with the same file name.
