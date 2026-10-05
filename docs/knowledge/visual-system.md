# Visual system

Execution of `design.md`: looking like a product, not a template.

## Seed, not palette
Pick in order, into one tokens file: (1) one brand hue — everything structural; (2) one accent — the button to press, focus, the key figure, nothing else; (3) a near-neutral ground with a trace of the brand hue; (4) two typefaces — characterful display, plain body; (5) a corner style where radius encodes hierarchy. Everything else derives.

- **Ambient light = a lighter tone of the brand hue at 7–22%**, not a complementary hue at ~26%. Opposing strong radials turn the screen pink/sage like a leftover filter. Warmth belongs on the accent.
- If a background tint is nameable as a colour, it's too strong.
- **Semantic colours are separate from the accent**, desaturated, never neon. A warning bar must not share the add-button's colour.

## Surfaces
- Depth from how much light a surface catches, not stacked shadows: translucent panes over the ambient ground, one lit hairline on the top edge.
- Not everything is a card. Border, fill, radius, shadow each say "separate object" — spend them by role; uniform radius+shadow on every block flattens hierarchy.

## Artwork
Inline SVG for static art (themable, free at runtime, sharp). Four rules against the flat-illustration look:
1. One light, the app's light — gradients run from the ambient's corner, shadows fall away.
2. Everything sits on something — soft asymmetric radial ellipse under each object, wider than it.
3. One lit hairline on the light side.
4. No primary colour at full strength — two-tone gradients of one hue give form.

- Blur filters turn to mush on Android; fake soft light with hard wedges or layered low-opacity shapes.
- Prefix gradient ids per drawing (`traps.md`).
- Same-hue shapes a few px apart visually merge — only a screenshot shows it.
- Logo mark: geometric, one gradient (a second smudges at 24px).
- Stock packs (unDraw, Storyset) are licensed but make you look like everyone. **Never ship search-engine images** — copyright problem on both stores.

## Motion
- One orchestrated moment (a figure counting up, an ambient lifting); everything else responds to touch.
- `useReducedMotion` = **no animation**: render the final state instantly.
- Never start an animation during render (`traps.md`).

## Screens
- **Tab bar is absolutely positioned**: keep its height in one module that every screen reads, or the last card can't scroll clear.
- **Auth screens need a shape:** mark, one drawing, one display line carrying the key sentence, then the form in a card.
- **Auth screens must scroll** — a keyboard on a short phone leaves ~300pt; otherwise submit is unreachable.

## Look at it
A typecheck cannot see: `.00` on whole amounts · clipped stat rows · truncated greetings · captions overflowing a ring · chart fills desaturating to grey · wrong grouping (per row vs per day) · indistinguishable chart colours · empty labels reserving a line · shapes merging · dead space under a card · a `+` covering content. All shipped through green typechecks and were caught in screenshots. **Screenshot-and-look is mandatory.**
