# Design principles

Goal: a product that is easy to understand, easy to use, coherent and fit for the user's task — not a trendy interface.

**If a component kit is in use** (tokens, ramps, contrast, states, motion, paywall/onboarding/permission screens already exist): satisfy these rules by *choosing*, not building. Pick a seed (one brand colour, neutral temperature, two fonts, corner style); never write literal colours/spacing/radii/font sizes; import components rather than generating `Button.tsx`. Your work is the words, which state shows when, where the paywall sits, how many onboarding steps. If the kit ships alternate designs (e.g. `V2`/`V3` with identical props), pick one per app, deliberately, beside the seed. A big kit makes clutter easier, so §2 and §7 matter more.

---

## Product first
1. **Purpose before screens.** Who is the user, the main job, the recurring action, the first meaningful success, what must be visible now, what can hide, what is cut from v1. Don't start with a dashboard or code.
2. **Task, not template.** No dashboard, metric cards, feeds, charts, sidebars, tab bars or profile sections unless a real need asks. The main interaction dominates (habit app → complete today's habits).
3. **20% rule.** Expose the ~20% used most; reveal the rest progressively (secondary screens, menus, expanders, sheets, advanced settings).
4. **Time-to-value.** `Open → setup that matters → first useful action → success`, not intro slides → long form → permissions → tutorial → empty dashboard. Ask only questions that change the experience; default the rest.
5. **One dominant action per screen.** Secondary actions quieter; never five equal buttons.

## Hierarchy and restraint
6. **Hierarchy before styling** — primary/secondary/tertiary via size, type, spacing, contrast, position, grouping. Must still read with decoration removed.
7. **Reduce noise.** Not by default: borders on everything, shadows on every card, gradients, badge spam, needless icons, nested cards, blobs, oversized headers, random charts, competing CTAs. Subtract first.
8. **Avoid generic AI UI:** purple/blue gradient dashboards, metric-card rows, giant "Welcome back", icon-in-rounded-square on every row, pill overload, purposeless glass, random bento, fake feeds, whitespace-as-premium, sparkles on AI features, cards in cards. Ask: would an experienced designer pick this for this problem?
9. **Spacing is structure** — related things closer; one scale (xs…2xl), no arbitrary values.
10. **Typography before containers.** Separate content by: spacing → type → grouping → divider → subtle surface → card. Few sizes and weights.
11. **Containers earn their place** — distinct interactive object, meaningful group, needed elevation, repeated items.
12. **Tokens:** colour (background, surface, surfaceMuted, textPrimary, textSecondary, border, primary, primaryForeground, success, warning, danger), type (caption, body, bodyStrong, label, heading1–3, display), spacing (xs–2xl), radius (sm, md, lg, full).
13. **Reusable components with variants** (`Button.variant = primary|secondary|ghost|danger`), never `BlueButton`/`DeleteRedButton`.
34. **Match density to the product** (expertise, task complexity, volume, screen size, frequency). Whitespace serves hierarchy, not filler.

## States and flows
14. **Design states, not screenshots:** default, loading, empty, error, success, disabled, selected, offline, permission denied, long/missing content, first use, returning use.
15. **Empty states** say what belongs here, why it matters, what to do next — plus the action. Never just "No data".
16. **Minimal forms:** only what's needed now; right input types, defaults, short labels, inline validation, outcome labels ("Save changes", not "Submit").
17. **Contextual permissions:** explain the benefit, then the native prompt; never on launch unless essential.
18. **Progressive disclosure** for advanced options.
19–20. **Don't ask what can be inferred**; strong defaults for navigation, spacing, type, auth, validation, loading/empty/error, accessibility, timestamps.
23. **Preserve unrelated work** when editing — change only what the request touches.
24–26. **Safe experimentation:** undo, drafts, confirmation for destructive acts only. Friction proportional to risk. State the consequence: "Delete 'X'? This removes the project and its unpublished versions. This cannot be undone." — not "Are you sure?"
27–28. **Paywall after value:** `Discover → Try → Value → Meaningful limit → Upgrade`; explain the outcome unlocked, no giant feature lists. Never paywall basic trust: own data, export, security, backups.
29. **Navigation fits the mental model**; no sidebar → submenu → tabs → nested tabs. User always knows where they are and how to go back.
30–31. **Mobile is not shrunk desktop:** safe areas, thumb reach, touch targets, keyboard, platform patterns, sheets, dynamic text. Prefer familiar interactions.
32–33. **Recognition over recall** (autocomplete, recents, previews); **optimise for scanning** — headings, labels, numbers, no paragraphs in functional UI.
37. **Visible status:** meaningful stages, not "Generating…"; don't fake precision.
38. **Errors aid recovery:** what happened, what to do, is work safe. No stack traces.
39–40. Autosave with visible status (Saving / Saved / Offline changes). Draft vs preview vs production must be unambiguous.
41–43. New users get guidance to first value; returning users get fast access to ongoing work. Checklists only until activation. Measure activation (made/used something), not onboarding completion.
44–45. Ask clarifying questions only when answers change behaviour/architecture (payments: one-time or subscription?). Otherwise assume, proceed, summarise the assumption.
46. **Accessibility is foundational:** contrast, scalable text, screen-reader labels, semantic controls, touch targets, focus, no colour-only state, reduced motion.
47–48. **Copy is UX:** no filler ("Manage everything in one place"); outcome button labels; no jargon (payload, schema, endpoint) for normal users.
49. **Human-in-the-loop** for high-risk actions: prepare → human reviews → execute (payments, publishing, deletes, customer messages).

---

## Colour system (define before screens)
- Analyse first: category, audience, tone, frequency, light/dark, density, accessibility, needed semantic states, brand constraints.
- Define: primary, optional secondary, neutral scale, background/surfaces, text tiers, borders, semantic (success/warning/danger/info), interaction states (pressed, selected, disabled, focus). No colours invented per screen.
- **Primary** only for primary CTA, selected nav, focus, key progress. Don't paint screens with it.
- **Secondary** optional — only for a real distinction. Omit if primary handles hierarchy.
- **Neutrals do most of the work**; UI should hold together with brand colour removed.
- **Semantic ≠ brand.** No decorative green, no red for non-destructive emphasis, no yellow for variety.
- Neutrals + one main accent per screen; data palettes stay inside charts.
- Tonal variants (subtle, default, pressed, strong) from the same hue, not new hues.
- Light/dark defined semantically per mode, not inverted; keep surfaces distinct and semantics not over-luminous in dark.
- Contrast WCAG AA: 4.5:1 text, 3:1 large text and meaningful graphics. Never colour alone.
- Gradients rare: hero art, promotional surfaces, meaningful continuous data.
- Typical: one primary, 0–1 accent, one neutral family, semantic set. No mechanical 60/30/10.

## Motion
- Every animation has a purpose: continuity, cause/effect, state change, feedback, origin/destination, brief focus, physical manipulation, perceived wait.
- Avoid: meaningless floating, constant background motion, bounce on every button, long transitions, animated gradients behind UI, entrance replay on every visit or rerender.
- Durations (guides): micro 100–180ms, small layout 160–240ms, screen/sheet 220–320ms, rare emphasis < 400ms. Never delay task completion for an animation.
- Platform easing or springs; no cartoon elasticity unless the brand calls for it. Gestures track the finger continuously.
- Preserve spatial continuity (list item → detail, button → sheet).
- Loading: none for instant; spinner for short uncertain waits; skeleton matching real layout; stages for multi-step work.
- Celebrate proportionally — no confetti for routine actions. Haptics for toggles, completion, snap points, destructive confirm — not every tap.
- Reduced motion: remove decorative movement, swap large transitions for fades/instant; nothing critical depends on animation. Don't animate text being read or move controls from under the finger.
- Use shared motion tokens (`duration.instant/fast/normal/slow`, `easing.standard/enter/exit`, `spring.gentle/responsive`), not per-screen logic.
- Budget check: what does it communicate, would it be understood without, is something else competing, will repetition annoy? No answer → remove.

---

## Final critique (before shipping a screen)
Purpose clear in seconds · hierarchy obvious · primary action clear · anything removable · advanced features exposed too early · components/tokens reused · generic-AI smell · mobile quality (safe areas, targets, thumb, keyboard, gestures) · colour discipline (neutral-dominant, no stray hexes/gradients) · motion purposeful, fast, reduced-motion aware · loading/empty/error/success handled · accessibility · fast to value · paywall placement · could it be simpler. Fix major findings before presenting.
