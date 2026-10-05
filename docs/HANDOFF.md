# Duebox — Handoff

Status as of **2026-10-05**. What works, how to run it, and what is still open,
in priority order. Evidence for every "works" is in `TEST-LOG.md`.

## 1. What works today

| Area | State | Evidence |
|---|---|---|
| Backend (Hono + `@xenition/sdk` 0.2.8) | Every route in `CONTRACT.md` built | 218/218 curl checks on the **production** gateway, all 54 routes |
| Database | 15 migrations applied to `app_duebox` on api.xenition.com; billing enabled; 8 products declared | `npm run migrate` |
| AI letter reading | Through Xenition: `sdk.ai.chat` with the page images, `noDataRetention`; the OpenRouter key is the app's AI key stored in Xenition (`scripts/ai-key.ts`); references masked to last 4 | Made-up renewal letter: both deadlines + evidence, 3.3 s |
| Reminders | DST-safe planner, re-planned on every change, Expo Push cron every 5 min, retries | Unit tests + a live delivery through Expo |
| 7-day Pro trial | Starts on the server when setup finishes, once per account; Free afterwards (5 items, 3 scans/month), never locked | curl suite |
| First-run journey | Pitch (5 slides, generated art) → sign-up (email + password only, or Apple/Google) → two-tap setup → welcome offer → Home | Harness 31/31, flows 16/16, live flow 1/1 |
| Apple + Google sign-in | Native lane when the platform holds this app's client ids; otherwise the brokered browser lane; a 412 falls back automatically | Same code path proven in production elsewhere; not yet tried on a device for Duebox |
| Meta measurement | SDK + ATT + attribution hand-off + server Conversions API | Dormant until keys are set (by design) |
| Review prompt | Duebox sheet after the first deadline; once more after 3 done + 3 days; store sheet on Rate; no sentiment gate | Harness shot `43-review-prompt` |

## 2. Run it

See `README.md`. Secrets live only in `backend/.dev.vars` (gitignored) and
Workers secrets: `XENITION_API_KEY`, `EXPO_ACCESS_TOKEN`,
`JOB_SECRET`, store keys, Meta keys. The phone holds no secret.

## 3. Open, in order

1. **Deploy the worker** — `wrangler secret put` each secret, `npm run deploy`, set `EXPO_PUBLIC_API_URL`, rerun `npm run test:api` with `API=https://…`.
2. **Dev build on real phones** (EAS project id → `EXPO_PUBLIC_EAS_PROJECT_ID`): push arrival with Done/Snooze actions, camera scan, Apple and Google native sign-in.
3. **Native sign-in credentials** on the platform (Apple Services ID, Google client ids) so the native sheets are used instead of the browser lane.
4. **Store products**: `duebox_pro_monthly` ($4.99), `duebox_pro_yearly` ($34.99), and the welcome-offer pair `duebox_pro_monthly_offer` / `duebox_pro_yearly_offer`, all on entitlement `pro`; Apple/Google server keys; sandbox purchase + restore.
5. **Meta**: create the Meta app, set `EXPO_PUBLIC_META_APP_ID` + `EXPO_PUBLIC_META_CLIENT_TOKEN` (mobile) and `META_APP_ID` + `META_CAPI_ACCESS_TOKEN` (worker), rebuild; check Events Manager → Test Events. Declare tracking in App Privacy.
6. **Reader benchmark** on 20–30 redacted real letters, phone-photo quality.
7. **Legal review** of `mobile/app/legal/*`.
8. Rotate the OpenRouter key used during development: `OPENROUTER_API_KEY=<new> npx tsx --env-file=.dev.vars scripts/ai-key.ts` (updates it inside Xenition; no redeploy).

## 4. Where things are

- `backend/src/routers/*` — every route; `backend/src/logic/*` — pure, tested logic.
- `backend/scripts/api-test.sh` — the curl suite; `scripts/sql.ts` — a one-statement helper the suite uses to bend time.
- `mobile/app/discover.tsx`, `setup.tsx`, `offer.tsx` — the first-run journey.
- `mobile/src/lib/analytics.ts` — the only measurement entry point; `src/lib/review.ts` + `src/ui/ReviewPrompt.tsx` — ratings.
- `mobile/assets/discover/*.jpg` — artwork (prompts: `mobile/assets/source/PROMPT.md`).
