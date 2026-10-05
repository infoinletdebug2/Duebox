# Duebox — Test log

What has and has not been verified, in writing (`playbook.md` → "Reporting
status honestly"). Newest first.

## 2026-10-05 (evening) — pre-phone audit against Clearbill's fixes

| Check | Result | Notes |
|---|---|---|
| AI through the Xenition SDK | ✅ | `sdk.ai.chat` with the page image, `noDataRetention`; OpenRouter key registered in Xenition for `app_duebox`, removed from the worker. Sample letter: both deadlines, 3.3 s |
| SDK | ✅ 0.2.8 | The version that works inside Cloudflare Workers |
| **Bug: deleted files stayed in storage** | Fixed | `storage.delete` encoded the slashes; delete now uses literal slashes. Proven: page URL 200 → 404 after deleting the attachment |
| Bug: a read before the upload landed cost an AI call and a scan | Fixed | One-byte probe first → 409; proven: scan count unchanged |
| Page URLs cached a 404 for hours | Fixed | One-off `?v=` on every signed URL |
| Password reset | Code-based | The platform emails a 6-digit code (not a link): Forgot → code screen with the email carried; Account → same screen after proving the current password |
| Trial users could not subscribe | Fixed | Paywall and Subscription treated the trial as "subscribed"; now only a store subscription is |
| A trial that failed to start | Fixed | Subscription offers "Start my 7-day free trial" (`POST /billing/trial`) |
| Offer in Expo Go | Fixed | Shows list prices (USD) with the discount struck through, value strip, a note that purchase happens in the store build |
| "Today" | Fixed | Follows the household's time zone, as the server does |
| curl suite | ✅ **218/218** on the production gateway (one earlier run hit a transient gateway 522; rerun clean) | |
| Harness | ✅ 31/31 screens · flows 16/16 · live journey 1/1 | |

## 2026-10-05 (later) — every backend route covered; two password bugs found and fixed

| Check | Result | Notes |
|---|---|---|
| Route coverage | ✅ **54/54 routes** called by `scripts/api-test.sh` | Added: send-code, forgot/reset password, change-password success, social start/complete/id-token, logout, restore, Apple/Google store webhooks, remove member, delete device |
| curl suite on the production gateway | ✅ **213/213 checks** | Waits out the 10/min auth rate limit twice (~2 min longer) |
| **Bug: change password** | Fixed | The gateway has no change-password route (404 on every path/method probed). Now: the current password is proven, then a reset code is emailed and the app opens the code screen to finish |
| **Bug: forgot password** | Fixed | The gateway keys a reset by (email, code); the reset screen sent only the token, so no reset could ever complete. The screen now carries the email and lets you type the 6-digit code (or arrive by link) |
| Harness after the fix | ✅ 28/28 light, 28/28 dark | |
| Not provable here | ⛔ receiving the reset email and finishing a real reset (needs an inbox) | Try it on your phone with a real address |

## 2026-10-05 — backend built and tested live; first-run journey; Meta; reviews

| Check | Result | Proves | Does NOT prove |
|---|---|---|---|
| Backend typecheck | ✅ 0 errors | | |
| Backend unit tests (`npm test`) | ✅ 20/20 | DST-safe reminder instants (New York, London, Dhaka), planner, month-end repeats, extraction coercion, masking, reminder wording | Anything touching the database |
| Migrations on the **production** gateway (`app_duebox`) | ✅ 15 applied, billing enabled, 8 products declared | Schema is valid Postgres on the real platform | — |
| **curl API suite** (`bash scripts/api-test.sh`) against the real gateway | ✅ **173/173 checks**, run three times | Every route and its SQL: auth, household on first /auth/me, setup + 7-day trial once, offer flag, attribution, items (search, edit, snooze/done idempotency, monthly repeat made once, reopen, delete), attachments with a real PUT to storage, Free limits (402 item_limit / custom_reminders / household), invites, join with own deadlines, leave, export CSV/JSON, deletion with password proof | Store purchases (no store keys yet) |
| AI read of a made-up renewal letter (`scripts/sample-letter.jpg`) | ✅ both deadlines found with the exact evidence; 4.8 s; confirmed into a deadline with its page attached | The OpenRouter path end to end | Accuracy on real, messy phone photos (benchmark still owed) |
| Reminder delivery job | ✅ a due reminder picked up and sent to Expo Push; the fake token refused → kept for retry (`attempts 1`, not sent) | Cron path, Expo integration, retry bookkeeping | Arrival on a real phone |
| Mobile typecheck | ✅ 0 errors | | |
| Harness (stub) | ✅ 28/28 screens, including discover, setup, offer, review sheet | Every screen renders | Native modules |
| Tap-through flows (stub) | ✅ 16/16 | Pitch (next/back/skip, flag), routing, setup sends `{focus, remindHour}`, offer marks itself seen server-side and asks once before leaving, plus home/item/scan/settings flows | — |
| **Live flow** (`node harness/flows.mjs --live`, real worker + gateway) | ✅ 1/1 | A new person: sign up (email + password only) → setup → "7 days of Pro have started" offer → Home suggests the picked category → add a deadline → it shows on Home (31 days left). Account deleted after | Native sign-in sheets, push, IAP |
| Bugs found and fixed | CORS refused `x-timezone`/`x-region`/`idempotency-key` from a browser (phones unaffected) · empty Home repeated "Your tray is empty" · setup tile label wrapped mid-word · test script counted days in UTC instead of the household zone | | |
| Not yet | ⛔ store sandbox purchase/restore · Apple/Google native sign-in on a device · push on a phone · Meta events (dormant until an App ID is set) · deploy to Workers | | |

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
