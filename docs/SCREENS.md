# Duebox — Screens, routes & states

API: `CONTRACT.md`. Look: `DESIGN-SYSTEM.md`. Every screen designs loading,
error, empty and (where relevant) lapsed-plan and offline states.

## First launch: discovery onboarding (before sign-up)

`/onboarding` — 3 value screens (Snap · Remind · Share; skippable) → **Q1** "What usually slips through?" (category tiles, multi-select — the empty Home suggests these first) → **Q2** "When should reminders arrive?" (Early 8 · Morning 9 · Lunchtime 12 · Evening 18 — applied to the household's reminder hour after sign-up) → summary → **Create my free account** → welcome. No paywall here (FR-B4).

## Navigation

```
onboarding  (first launch only)
(auth)   welcome · sign-in · sign-up · verify · forgot-password · reset-password
(tabs)   home · items · settings                       + ScanFab over home and items
pushed   scan · scan/[id] (reading → confirm) · item/new · item/[id] · item/[id]/edit
         notifications-permission · paywall (modal) · join/[code]
         settings/{account,notifications,reminder-time,household,subscription,export,delete}
         legal/{privacy,terms}
deep links  duebox://item/[id] · duebox://join/[code]
```

Three tabs, not five: Home answers "what's next", Items answers "find one",
Settings holds the rest. Capture is a floating button, not a tab.

## Screens

| # | Route | Shows | FR |
|---|---|---|---|
| 1 | `/(auth)/welcome` | Mark, tray drawing, "Snap the letter. We'll remember the date.", Continue with Apple (iOS) · Google · Email | A1 |
| 2 | `/(auth)/*` | Sign in/up (name, email, password), 6-digit verify (overlay input), forgot/reset | A1 |
| 3 | `/(tabs)/home` | NextUpHero, Inbox strip, Overdue, This week, This month, Later count, permission/plan banners, ScanFab | H1–H5 |
| 4 | `/scan` | Choose Camera · Photos · PDF → capture with PageStrip (≤ 5) → upload progress | S1, S2 |
| 5 | `/scan/[id]` | Reading (thumbnails + honest line) → Confirm (CandidateCards, Save N items) · or No-date state → Type it in | S3–S6 |
| 6 | `/item/new` | Title, Due date (required); "More details": category, action, amount, issuer, reference, repeat, reminders, assignee, notes; **Add item** | I1–I4 |
| 7 | `/item/[id]` | Detail (DESIGN-SYSTEM §6), attachments, history line ("3rd renewal"), Mark done / Snooze / Edit / Delete | I5–I9 |
| 8 | `/item/[id]/edit` | Same form as new, filled; **Save changes** | I1 |
| 9 | `/(tabs)/items` | Search, Segmented Open · Done, category chips (horizontal), list grouped by month | I10 |
| 10 | `/notifications-permission` | Explain-first: bell drawing, sentence naming the just-saved item, **Turn on reminders**, "Not now" | R8 |
| 11 | `/paywall` | Outcome headline by reason, 3 benefits, plans (store prices), trial line, Subscribe, Restore, Terms · Privacy, auto-renew text | B4, B5 |
| 12 | `/(tabs)/settings` | Household card (name, members, plan) + rows: Account, Notifications, Reminder time, Household & members, Subscription, Export, Delete account, Privacy, Terms, Rate Duebox, Support, Version (build) | X |
| 13 | `/settings/notifications` | Deadline reminders, Overdue nudges (per category), system-permission status + "Open Settings" | R9 |
| 14 | `/settings/reminder-time` | Hour picker, timezone (auto, editable) | R3 |
| 15 | `/settings/household` | Name, members (remove, owner), invites (create → share sheet with code + link), Leave | A3, A4, M1 |
| 16 | `/join/[code]` | "Join {household} — invited by {name}" → **Join household** | A3 |
| 17 | `/settings/subscription` | Current plan, usage (items 4 of 5, scans 2 of 3 this month), Manage in store, Restore | B |
| 18 | `/settings/export` | CSV · JSON → share sheet | A6 |
| 19 | `/settings/delete` | Consequence text (owner vs member), type DELETE, **Delete my account** | A5 |
| 20 | `/legal/privacy`, `/legal/terms` | Native text: 4-line summary, then detail | — |

## Key states

- **Home empty (new user):** tray drawing + "Snap a letter with a deadline…" → **Scan your first letter** · "Type one instead". No hero, no sections.
- **Home all done:** stack-of-cards drawing, "Nothing due. Nice." + Later count if any.
- **Loading:** Skeleton of the hero and three rows — never a lone spinner.
- **Reading:** thumbnails + "about 10 seconds" + "You can leave".
- **No date found:** crumpled-page drawing, copy from DESIGN-SYSTEM §7, Retake · Type it in.
- **Offline:** Banner "Offline — showing saved items. Done and snooze will sync." Scan disabled with that reason.
- **Notifications off:** Home banner "Reminders are off — you'll only see deadlines in the app." → Turn on.
- **Plan lapsed:** Home banner once per week; Add/Scan over limit opens the paywall; nothing hidden.
- **Expo Go:** permission screen says reminders need the installed app; everything else works.
- **Long content:** titles wrap to 2 lines then truncate; 200% type stacks the countdown under the title on rows.

## Harness expectations

The live list is `mobile/harness/shoot.mjs` (25 screens). `micro` eyebrows render in capitals (match "NEXT UP", not "Next up"), and words inside text inputs are not page text.
