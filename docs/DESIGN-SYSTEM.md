# Duebox — Design System

The specification; `mobile/src/theme/tokens.ts` implements it. Follows
`knowledge/design.md` and `knowledge/visual-system.md`. Its own palette — plum and marigold, never a stock green or teal.

---

## 0. Design v2 (2026-10-04) — what changed and why

The first pass was correct but plain. v2 spends its boldness in ONE motif:
**the dated card** from the artwork becomes the interface itself.

- **DateTile** — a paper tile, coloured month strip, day numeral (Bricolage).
  The strip says urgency: brick = late, plum = today, marigold = this week,
  plum-soft = later, leaf = done. Every row leads with one; the Next-up card
  and the item screen use large ones.
- **Smart headline** — Home opens with a sentence computed from the data
  ("1 overdue, 2 due this week.") and the money due in 30 days, not a
  greeting or a household name.
- **Fortnight strip** — the next 14 days as date cells; marigold marks where
  something is due, a brick mark on today if something is late; tap a day
  for a sheet of what's on it.
- **Reminder timeline** — the item screen draws its actual reminder dates,
  past ones marked "Sent".
- **Rows speak a sentence** — "In 6 days, renew with State Farm" replaces
  "Renew · State Farm" (no middle-dot meta strings).
- **No ALL-CAPS labels** — `micro` is now 13/18 bold, sentence case.
- **Floating tab bar** — a pill; the active tab expands with its label on
  plum; the marigold Scan button sits beside it on every tab.
- **Ground cooled** from cream `#F7F4F1` to plum-tinted paper `#F5F3F8`
  (text 15.2:1, muted 5.3:1, late 5.9:1 — still AA).

## 1. Who is holding the phone

Someone at the front door with a letter in one hand and the phone in the
other. They have about ten seconds of attention. Later, a notification at
09:00 on a weekday, read on a lock screen.

- **One answer per screen:** *what is due next, and when.* The countdown is the interface.
- **Calm, not alarming.** Most items are weeks away. Red is kept for the genuinely late; nothing else shouts.
- **Fast capture beats rich organisation.** Snap → check → save in under 30 seconds. No folders, no tags.
- **Trust the read.** The AI's date is always shown next to the words it came from, so checking takes one glance.

---

## 2. Concept: "the tidy letter tray"

Paper comes in; Duebox files it as a **dated card** in a quiet tray. A deep
**plum** gives structure and seriousness (the hero, headings, the active
tab). One warm **marigold** is the button you press: Scan, Save, Mark done.
Everything else is warm paper neutrals.

- **Plum** = structure, the Next-up hero, "due soon" emphasis.
- **Marigold** = the single primary action on a screen. One solid marigold element per screen.
- **Brick** = late. Only late.
- **Leaf** = done. Only done.
- **Paper** = everything else.

There is deliberately **no amber/warning hue** — marigold owns warm, so "due
this week" is expressed with plum weight and a countdown pill, not a colour.

---

## 3. The seed

| | |
|---|---|
| **Brand hue** | **Plum** `#2E1A47` — white text 15.5:1. |
| **Accent** | **Marigold** `#F2B33D` with plum-ink text `#2A1640` (8.8:1). Dark mode `#F5BE55` with `#1E1229` (10.6:1). |
| **Ground** | `#F7F4F1` — warm paper with a trace of plum. |
| **Display face** | **Bricolage Grotesque** (600/700) — characterful, great large numerals for countdowns. `@expo-google-fonts/bricolage-grotesque`. |
| **Body face** | **Manrope** (400/500/600/700), `fontVariant: ['tabular-nums']` on every number. `@expo-google-fonts/manrope`. |
| **Radius** (encodes hierarchy) | chip 999 · input 12 · row 14 · card 20 · hero 28 · sheet 28 (top corners) |

### 3.1 Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `ground` | `#F5F3F8` | `#141019` | Screen |
| `surface` | `#FFFFFF` | `#1D1726` | Cards, rows, sheets |
| `surfaceSunk` | `#ECE8F1` | `#0F0C13` | Inputs, segmented track |
| `plum` | `#2E1A47` | `#2A1D3D` (hero) · `#C9B6F2` (text) | Hero, headings, active tab, "soon" emphasis |
| `plumSoft` | `rgba(46,26,71,0.08)` | `rgba(201,182,242,0.12)` | Countdown pill, selected chip |
| `marigold` | `#F2B33D` | `#F5BE55` | Primary button, Scan FAB |
| `onMarigold` | `#2A1640` | `#1E1229` | Text/icon on marigold |
| `marigoldPressed` | `#E0A02A` | `#E8AE40` | Pressed |
| `text` | `#221A2B` | `#EEE9F3` | Primary text (15.3:1 / 15.7:1) |
| `textMuted` | `#6A6175` | `#A79FB3` | Secondary (5.4:1 / 7.4:1) |
| `textFaint` | `#8F8799` | `#6E6679` | Placeholders and disabled only — **never body text** (3.2:1) |
| `line` | `#E5E0EC` | `#2A2333` | Dividers, hairlines |
| `late` | `#B3261E` | `#F28B82` | Overdue text/icon (6.5:1 / 7.3:1) |
| `lateSoft` | `rgba(179,38,30,0.08)` | `rgba(242,139,130,0.12)` | Overdue pill background |
| `done` | `#2F7A4F` | `#7FCB9B` | Done check (5.2:1 / 9.1:1) |
| `doneSoft` | `rgba(47,122,79,0.10)` | `rgba(127,203,155,0.14)` | Done toast |
| `focus` | `#2E1A47` 2 pt ring | `#C9B6F2` | Focus outline |

**Category tints** (icon only, never fills, never text): a single muted set
derived from plum at different lightness — categories are told apart by
**icon**, not colour (design.md §35.5).

### 3.2 Ambient

One plum radial at **8%** from the upper-left of Home only, fading by the
first section. Never marigold, never brick. If you can name the tint, it is
too strong (`visual-system.md`).

### 3.3 Spacing and elevation

Spacing scale (pt): `xs 4 · sm 8 · md 12 · lg 16 · xl 24 · 2xl 32 · 3xl 48`.
Screen gutter 20. Touch targets ≥ 44 × 44.

Elevation: rows have **no** shadow (hairline separators); the Next-up hero has
one soft shadow (`0 8 24 rgba(46,26,71,0.12)`); sheets use the system shadow.
One lit hairline on the hero's top edge (`rgba(255,255,255,0.12)`).

---

## 4. Type

| Role | Face | Size/line | Use |
|---|---|---|---|
| `countdown` | Bricolage 700 | 56/56 | "6" on the Next-up hero |
| `display` | Bricolage 700 | 30/36 | Screen titles |
| `title` | Bricolage 600 | 21/26 | Item title on detail, section headers on Home |
| `headline` | Manrope 600 | 17/22 | Row title |
| `body` | Manrope 400 | 16/22 | |
| `callout` | Manrope 600 | 15/20 | Buttons |
| `caption` | Manrope 500 | 13/18 | Meta: issuer, amount, date |
| `micro` | Manrope 700, sentence case | 13/18 | Small labels — never all caps (v2) |

Dates: "Fri 14 Mar" in rows; "14 March 2027" on detail; relative first
("in 6 days", "tomorrow", "today", "2 days late"). Money: `$412.00`; `$412`
when cents are zero in the hero only.

---

## 5. Components and the kit decision

### 5.1 Decision

**Own kit on React Native primitives, plus two focused libraries:**
`react-native-reanimated` (motion) and `lucide-react-native` (icons). Sheets
are RN `Modal` bottom sheets (they render on web, so the harness can shoot
them). Base primitives are adapted from a shared in-house kit and
restyled with these tokens.

**Considered and rejected for v1: HeroUI Native** (`heroui-native` 1.0.x, on
Uniwind/Tailwind v4). It looks polished and its peer deps fit Expo 57 /
RN 0.86, but HeroUI's own docs say it is *not recommended for web*. This
folder verifies every screen through the **web export + headless Chrome
harness** (`playbook.md`); a kit that breaks the web build removes our only
way to look at screens without a phone. Revisit if HeroUI Native adds web
support — the token names below map 1:1 onto its CSS variables
(`--accent`, `--background`, `--surface`, `--danger`, `--success`).

Rule either way: **one component language**. No screen styles a one-off button.

### 5.2 Primitives (`src/ui/`)

| Component | Variants / notes |
|---|---|
| `Button` | `primary` (marigold) · `secondary` (plumSoft) · `ghost` · `danger` (brick text); sizes `lg` 52 · `md` 44; loading state keeps width |
| `IconButton` | 44 hit area |
| `Field` | label above, sunk input, inline error under; `minWidth: 0`, `borderWidth: 0` on the input (web traps) |
| `DateField` | opens a sheet with quick picks (Today, +1 week, +1 month, +1 year) and a calendar |
| `AmountField` | currency prefix, decimal keypad, stores cents |
| `Chip` · `Segmented` · `Switch` | |
| `ListRow` · `Group` | grouped settings rows with hairlines |
| `Sheet` · `ConfirmSheet` | Modal bottom sheet; destructive confirm names the object |
| `Toast` | bottom, above the tab bar; one at a time |
| `Banner` | permission-off, plan-lapsed, offline |
| `EmptyState` · `ErrorState` · `Skeleton` | |
| `Screen` | safe area, keyboard-aware scroll, `flex: 1` on the non-scrolling branch only (`traps.md`) |

### 5.3 Domain components

| Component | Notes |
|---|---|
| **NextUpHero** | Plum card, radius 28: eyebrow "NEXT UP", category icon, title (2 lines max), `countdown` numeral + "days" (or "Today" / "2 days late" in late), action + date + amount caption, **Mark done** (marigold, `md`). |
| **DueRow** | Done circle (tap → check fills, success haptic, toast with Undo) · category icon (plum, 20 pt, no coloured square) · title + "Renew · State Farm" · right: **CountdownPill**, then the amount and the assignee initial when household > 1. Swipe actions: v1.1 candidate. |
| **CountdownPill** | `in 6 days` (plumSoft) · `Today` (plum solid, white) · `3 days late` (lateSoft + late text + clock icon — never colour alone). |
| **ScanFab** | Marigold, 64 pt circle, camera icon, bottom-right in the thumb zone, a **sibling** of the tab bar (Android elevation trap). Long-press → "Type one instead". |
| **CandidateCard** | Confirm screen: due date as `title` + the **evidence quote** under it in a sunk block ("Renew by 14 March 2027"), then title, category, action, amount, issuer; low-confidence fields carry a "Check this" chip; a remove (×) per card. |
| **ReminderPicker** | Chips 60 · 30 · 14 · 7 · 3 · 1 days; Free shows 7 selected and the rest locked with a small "Pro" tag (opens paywall on tap). |
| **AttachmentStrip** | Page thumbnails (radius 12), tap → full-screen viewer with pinch-zoom. |
| **PageStrip** | During camera capture: captured pages, retake, add. |

---

## 6. Screen notes

### Home

```
┌──────────────────────────────────────┐
│ Duebox                         ⚙︎     │
│ ┌──────────────────────────────────┐ │
│ │ NEXT UP                    🚗     │ │  NextUpHero (plum)
│ │ Car insurance                     │ │
│ │ 6  days        Renew · Fri 14 Mar │ │
│ │                $412.00            │ │
│ │                   [ Mark done ]   │ │  marigold
│ └──────────────────────────────────┘ │
│ 2 scans waiting to be checked      ›  │  Inbox strip
│ OVERDUE                               │
│ 🏠 Council tax      Pay   3 days late │  late pill
│ THIS WEEK                             │
│ 🎓 School trip form Submit  in 2 days │
│ THIS MONTH                            │
│ 📺 Streaming trial  Cancel in 18 days │
│ Later · 14 items                   ›  │
│                                 (📷)  │  ScanFab
│  Home        All items      Settings  │
└──────────────────────────────────────┘
```

Icons above are placeholders for lucide icons — no emoji in the product.

### Scan → Reading → Confirm

Camera full-screen with a soft document guide, page strip, "Done (2)". Reading:
the thumbnails, a slow honest progress line, "Reading your letter… about 10
seconds. You can leave — it'll wait in your inbox." Confirm: "We found 2
deadlines. Check the dates." → CandidateCards → **Save 2 items** (marigold).

### Item detail

Big title, CountdownPill, "Renew by Friday 14 March 2027", amount, issuer,
reference •••• 4821, repeat, reminders ("30, 7 and 1 days before, at 9:00"),
assignee, attachments, notes. Bottom bar: **Mark done** (marigold) · Snooze ·
Edit (overflow: Delete).

### Paywall

Outcome headline by `reason`: "Track everything with a deadline" (item limit),
"Read every letter for you" (scan limit), "Share with your household"
(household), "Remind me the way I want" (custom reminders). Three benefit lines,
plan selector (yearly default with trial line), **Start free trial** /
**Subscribe**, Restore, Terms · Privacy, auto-renew text.

---

## 7. Copy

| Moment | Copy |
|---|---|
| Welcome | "Snap the letter. We'll remember the date." |
| Empty home | "Snap a letter with a deadline. We'll read it and remind you before it's due." |
| Reading | "Reading your letter… about 10 seconds. You can leave — it'll wait in your inbox." |
| Confirm | "Check the dates. You're the final say." |
| No date found | "We couldn't find a date in this one. Type it in — the photo stays attached." |
| Permission ask | "Turn on reminders so we can tell you 7 days before Car insurance is due." |
| Done (repeating) | "Done. Next renewal: 14 Mar 2028." |
| Done (one-off) | "Done. One less thing." |
| Delete | "Delete "Car insurance"? Its reminders and 2 attached pages are deleted too. This can't be undone." |
| Push | "Renew Car insurance — in 7 days · $412.00" |

Never "Submit", never "Oops", never "Something went wrong" without the next step.

---

## 8. Motion

| Moment | Motion | Duration |
|---|---|---|
| Mark done (the one orchestrated moment) | Row check draws, row collapses; hero cross-fades to the next item; success haptic | 220 ms + 240 ms |
| Swipe row | Tracks the finger; snaps with `spring.responsive` | — |
| Sheet | System spring | ~280 ms |
| Countdown on first Home load per day | No count-up — numbers are read, not watched | — |
| Reading | Indeterminate line, slow, no fake percentage | — |

Tokens: `duration.fast 150 · normal 220 · slow 300`; `spring.responsive
{damping: 20, stiffness: 260}`. Reduce Motion = **no animation**, final state
instantly. Haptics: done (success), snooze (light), delete confirm (warning). No
haptic on plain taps.

---

## 9. Artwork

Inline SVG, light from the upper-left (matching the ambient), every object
grounded on a soft asymmetric ellipse, one lit hairline on the light side,
two-tone gradients of one hue, ids prefixed `dx-<drawing>-`:

- **Welcome:** an envelope half out of a paper tray, a dated card rising from it.
- **Empty home:** the tray, empty, with a small marigold clip.
- **All done (no open items):** a neat stack of cards with a leaf check.
- **Read failed:** a crumpled page with a pencil.

App icon: a plum rounded square, a white card with a marigold corner fold and a
small check — geometric, one gradient (prompt in `mobile/assets/source/PROMPT.md`).

---

## 10. Critique before "done"

- [ ] Is the next deadline the biggest thing on Home?
- [ ] Is marigold used once per screen, and brick only for late?
- [ ] Is every state clear without colour (icons/words on pills)?
- [ ] Is the AI's evidence shown under every extracted date?
- [ ] Does the countdown read correctly to VoiceOver ("due in six days")?
- [ ] Light + dark, 200% type, 393 × 852 screenshots looked at — not just generated.
