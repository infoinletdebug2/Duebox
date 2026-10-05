# Duebox

Life-admin deadline keeper. Snap a letter, bill, renewal notice or form; the
AI reads the deadline (and shows the words it came from); you confirm one
card; Duebox reminds you 30, 7 and 1 days ahead by push, and schedules the
next one when you mark a repeating item done. Shared with your household on Pro.

| Read | For |
|---|---|
| `docs/SRS.md` | Requirements (FR-*), business rules (BR-*), market research, pricing, acceptance tests |
| `docs/DESIGN-SYSTEM.md` | "The tidy letter tray": plum, marigold, paper; kit decision |
| `docs/SCREENS.md` | Every route and its states; harness expectations |
| `docs/CONTRACT.md` | API + database (`dx__*`) |
| `docs/ARCHITECTURE.md` | Scan pipeline, reminder planner, cron delivery, repeat math |
| `docs/TEST-LOG.md` | What has and has not been verified |

**Status:** mobile app built — onboarding, auth, home, scan → read → confirm, items, reminders, paywall/IAP, household, settings, export, delete, privacy, terms. Typecheck clean; harness 25/25 light + dark; interaction flows 14/14 — all on stub data. **Backend not written yet** — nothing has run against a real server or on a phone. See `docs/TEST-LOG.md`.

## Stack

- **Mobile:** Expo + React Native + Expo Router + React Query. **No Xenition package on the phone.**
- **Backend:** Hono on Cloudflare Workers + `@xenition/sdk` (Postgres, auth, storage, billing).
- **AI reading:** OpenRouter vision model, worker only. **Push:** Expo Push Service, worker only (cron every 5 min).

## Run it (once built)

```bash
# Backend
cd backend
npm install
cp .dev.vars.example .dev.vars   # Xenition service key FOR DUEBOX + OPENROUTER_API_KEY + EXPO_ACCESS_TOKEN
npm run migrate                  # once per deploy
npm run dev                      # http://localhost:8787
npm test                         # planner, repeat, gating, extraction
npm run smoke                    # every endpoint against the running worker

# Mobile
cd ../mobile
npm install
cp .env.example .env
npx expo start                   # Expo Go: everything except push, IAP, Apple/Google sign-in
npx expo run:ios                 # dev build (push + purchases)

# Every screen without a phone
npx expo export --platform web --output-dir dist-web
node harness/serve.mjs && node harness/shoot.mjs        # every screen (--dark for dark)
HARNESS_PLAN=free node harness/serve.mjs && node harness/flows.mjs   # tap-through flows
python harness/sheet.py shots                            # contact sheets to look at
```

## Before the stores

1. Mint a Xenition service key for Duebox; set worker secrets; `migrate` + `smoke`.
2. Benchmark the reader on 20–30 redacted real letters; pick the model.
3. Create `duebox_pro_monthly` ($4.99) and `duebox_pro_yearly` ($34.99, 7-day intro trial) in both stores.
4. EAS project id + push credentials (APNs key, FCM v1); enable Expo enhanced push security.
5. Legal review of `app/legal/*`.
6. Dev build on real iOS and Android phones: scan, reminders, Done/Snooze from the notification, purchase/restore.
