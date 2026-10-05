# Duebox

Life-admin deadline keeper. Snap a letter, bill, renewal notice or form; the
AI reads the deadline (and shows the words it came from); you confirm one
card; Duebox reminds you 30, 7 and 1 days ahead by push, and schedules the
next one when you mark a repeating item done. Shared with your household on Pro.

**First run:** a five-screen value pitch → sign up (Apple, Google, or email +
password) → two-tap setup → a 7-day Pro trial starts → a one-time welcome
offer → Home.

| Read | For |
|---|---|
| `docs/HANDOFF.md` | **Start here** — status, how to run, what is open |
| `docs/SRS.md` | Requirements (FR-*), business rules (BR-*), market research, pricing |
| `docs/CONTRACT.md` | API + database (`dx__*`) — the agreement between backend and app |
| `docs/ARCHITECTURE.md` | Scan pipeline, reminder planner, cron delivery, repeat math |
| `docs/DESIGN-SYSTEM.md` | "The tidy letter tray": plum, marigold, paper |
| `docs/SCREENS.md` | Every route and its states |
| `docs/TEST-LOG.md` | What has and has not been verified |
| `docs/knowledge/` | The engineering knowledge base: design rules, traps, store readiness |

## Stack

- **Mobile:** Expo + React Native + Expo Router + React Query. **No Xenition package on the phone.**
- **Backend:** Hono on Cloudflare Workers + `@xenition/sdk` (Postgres, auth, storage, billing).
- **AI reading:** OpenRouter vision model, worker only. **Push:** Expo Push, worker only (cron every 5 min).
- **Measurement:** Meta SDK + Conversions API, dormant until a Meta App ID is configured.

## Run it

```bash
# Backend
cd backend
npm install
cp .dev.vars.example .dev.vars   # Xenition service key FOR DUEBOX + OPENROUTER_API_KEY
npm run migrate                  # once per deploy
npm run dev                      # http://localhost:8787
npm test                         # unit tests (planner, DST, repeats, extraction)
npm run test:api                 # curl suite: every route against the running worker

# Mobile
cd ../mobile
npm install
cp .env.example .env
npx expo start                   # Expo Go: everything except push, IAP, native sign-in
npx expo run:ios                 # dev build (push + purchases + native sign-in)

# Every screen without a phone
npx expo export --platform web --output-dir dist-web
node harness/serve.mjs & node harness/shoot.mjs          # every screen on stub data (--dark too)
HARNESS_PLAN=free node harness/serve.mjs & node harness/flows.mjs   # tap-through flows
node harness/serve.mjs --web-only & node harness/flows.mjs --live   # one journey against the real worker
```
