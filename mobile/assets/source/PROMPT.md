# Duebox icon

Current master: `mark.svg` (vector, matches `Mark` in `src/ui/artwork.tsx`).

Optional AI master (same flow as Clearbill — `google/gemini-3-pro-image-preview` via OpenRouter):

> Design a premium iOS app icon for "Duebox", a calm app that reads letters and reminds you before deadlines.
> Square 1024x1024, full-bleed, NO rounded corners, NO text.
> Concept: a single white paper card, straight, with a marigold (#F2B33D) folded top-right corner and a bold deep-plum check mark,
> on a deep plum background (#4A2F6E to #24133A diagonal gradient), one soft light from the upper-left, a soft shadow under the card.
> Style: modern, minimal, geometric, slightly dimensional, readable at 40px. No people, no frames.

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
