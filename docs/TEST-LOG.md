# Duebox — Test log

What has and has not been verified, in writing (`playbook.md` → "Reporting
status honestly"). Newest first.

## 2026-10-04 — full review + interaction tests

| Check | Result | Proves | Does NOT prove |
|---|---|---|---|
| Typecheck | ✅ 0 errors | | |
| Harness light + dark | ✅ 25/25 each, every screenshot looked at (contact sheets via `harness/sheet.py`) | Every screen renders, both themes | Native |
| **Interaction flows** (`harness/flows.mjs`, free-plan stub) | ✅ **14/14, three runs in a row** | Onboarding (all steps, answers saved, Skip, first-launch routing) · Home Mark done → toast with Undo · strip day → sheet · search narrows · new-item validation + templates · Pro-only reminder → paywall headline · snooze → toast · delete confirm names the consequence · scan confirm saves · read-failed → manual form · notification switch flips · signed-out redirect | Real API, native modules, real taps on a phone |
| Bugs found by the flows and fixed | Delete confirm never opened: a second sheet presented while the first was dismissing (iOS drops it too) → delayed until the menu closes · stub lacked write responses | | |
| Design fixes from looking | New item was empty → one-tap templates + live preview card · onboarding art now on a soft plum panel, throwaway labels removed · web switch thumb teal → white on plum · household members show initials · "7 · unlimited" → "7, no limit" · day-sheet row clipped at the edge | | |

## 2026-10-04 — design v2

| Check | Result | Notes |
|---|---|---|
| Typecheck | ✅ 0 errors | |
| Harness light + dark | ✅ 25/25 each | Expectations updated to sentence-case labels and the new headline |
| Looked at | ✅ Home (light + dark), All items, Item detail | Fixed: strip cells dimmed by `disabled`; countdown pill stretched full width; dark "today" cell too close to the ground |

## 2026-10-04 — mobile app built (no backend yet)

| Check | Result | Proves | Does NOT prove |
|---|---|---|---|
| Mobile typecheck (`tsc --noEmit`, strict) | ✅ 0 errors | Types line up with CONTRACT §1 | Runtime, or that the backend answers these shapes |
| Web export | ✅ | The bundle builds | Native modules |
| Harness light (`shoot.mjs`), Pro stub | ✅ 25/25, expectations on stub data | Every screen renders with realistic data | Real API |
| Harness dark (`--dark`) | ✅ 25/25 | Dark tokens work everywhere | — |
| Harness with `HARNESS_PLAN=free` (paywall, home) | ✅ | Outcome headline + benefits; "store build only" banner on web | Real store prices, purchase, restore |
| Screens looked at | ✅ Onboarding, Welcome, Home (light + dark), All items, Item, Confirm, Scan, Permission, Paywall (Pro + Free), Settings, Join | Hierarchy, countdown as headline, one marigold per screen | — |
| Fixed from looking | Join crashed when an invite had no expiry · row amount truncated → moved under the pill · hero hairline artifact removed · Scan button covered the last row → extra bottom space on tab screens | | |
| Backend | ⛔ not written | — | Every endpoint is unverified |
| Push, camera, IAP, Apple/Google sign-in | ⛔ never run on a phone | — | Need a dev build + EAS project id |
| Onboarding answers → household reminder hour | ⛔ not verified end to end | — | Needs the backend's `PATCH /household` |

## 2026-10-04 — specification only

| Check | Result | Proves | Does NOT prove |
|---|---|---|---|
| Docs written (SRS, CONTRACT, ARCHITECTURE, DESIGN-SYSTEM, SCREENS) | ✅ | The plan exists | Anything about code |
| Token contrast (computed WCAG ratios) | ✅ text 15.3:1, muted 5.4:1, marigold text 8.8:1, late 6.5:1, done 5.2:1 (light); text 15.7:1, muted 7.4:1, marigold 10.6:1, late 7.3:1, done 9.1:1 (dark) | Colour pairs pass AA | How they look on a screen |
| Backend | ⛔ not written | — | — |
| Mobile | ⛔ not written | — | — |
| AI reader on sample letters | ⛔ not run | — | Date accuracy (SRS §19.2) |
| Push on a real phone | ⛔ never run | — | — |
| Deployed | ⛔ no | — | — |

## Template for each run

| Check | Result | Proves | Does NOT prove |
|---|---|---|---|
| Backend typecheck | | Types line up | Column names / SQL strings |
| Backend unit tests | | planner (DST), repeat (month-end), gating, extraction coercion, masking | Anything touching the database |
| Reader check (`scripts/reader-check.ts`, N samples) | | Dates + evidence on real layouts | Phone-photo quality |
| Smoke (`scripts/smoke.mjs`) on the real gateway | | Every route + SQL | Push delivery |
| Cron delivery (dev build, real token) | | Reminder arrives, Done/Snooze actions work | iOS + Android both |
| Harness light + dark | | Every screen renders with stub data | Native modules |
| Screens looked at | | Hierarchy, copy | — |
| Sandbox purchase + restore | | IAP | Production store config |
