# Deploying Duebox

Duebox runs on **Xenition's own app hosting** as one Cloudflare Worker at

**https://duebox.xenition.com**

- **API**: `/api/v1/*` and `/health`
- **Website**: `/`, `/privacy`, `/terms`, `/support`, `/delete-account`

It uses the Xenition app `app_duebox` (database, storage, auth, billing, AI).

---

## Before you deploy: the files to check

| File | Check | Why |
|---|---|---|
| `~/.xenition-admin.env` | `XENITION_EMAIL` / `XENITION_PASSWORD` of the account that **owns `app_duebox`** | Any other account gets a new, empty app |
| `backend/src/config.ts` | Plan ids, trial days, limits, URLs, AI model | **Production uses these code defaults.** `.dev.vars` and `wrangler.toml [vars]` are NOT sent |
| `backend/src/billing.ts` | Store clients read `APPLE_*` / `GOOGLE_*` env | Not set in production yet → purchases answer 503 `STORE_UNCONFIGURED` |
| `backend/package.json` | `@xenition/sdk` **0.2.9 or later** | Older versions break inside Workers |
| `backend/src/schema.ts` | New migration? Run `cd backend && npm run migrate` **first** | The deploy does not run migrations |
| `website/build.mjs` + page list in `deploy/xenition.mjs` | A new web page must be in **both** | A page missing from the list shows the home page |
| `mobile/.env` | `EXPO_PUBLIC_API_URL=https://duebox.xenition.com` to use production | Empty = the app uses your local backend on the LAN |

Then:

```bash
cd backend && npx tsc --noEmit && npm test
cd .. && node --env-file=$HOME/.xenition-admin.env deploy/xenition.mjs
cd backend && API=https://duebox.xenition.com npm run test:api
```

The last one should end with `ALL PASSED`. It takes about 4 minutes (it waits out the sign-in
rate limit twice) and creates and deletes its own throwaway accounts.

---

## Reminders in production (no platform cron)

The pipeline writes its own `wrangler.toml` (`gateway/internal/appmgr/deploy.go`, `wranglerTomlSite`)
with **no cron triggers**, so the Worker's `scheduled()` never fires there. Delivery is driven by:

1. **`.github/workflows/reminders.yml`** — GitHub Actions calls
   `GET https://duebox.xenition.com/api/v1/internal/jobs/tick` every 5 minutes (GitHub may delay a run).
2. **API traffic** — any request nudges delivery in the background, at most once a minute per isolate.

Both go through `tickDelivery`: at most one run every ~2 minutes (an atomic gate on `dx__job_tick`),
and each reminder is **claimed** before it is pushed, so extra or overlapping calls can never
double-send. The tick is public on purpose: it only sends what is already due and returns counts.
A reminder that is late by up to 24 hours is still sent.

If Xenition's pipeline gains cron support, add `crons = ["*/5 * * * *"]` there and the
`scheduled()` handler takes over; the workflow can then be removed.

---

## Configuration: where everything lives

| Setting | Where | Notes |
|---|---|---|
| Xenition service key | Installed on the Worker by the pipeline | Never set by hand |
| **AI key (OpenRouter)** | **In Xenition**, the app's own AI key | `cd backend && OPENROUTER_API_KEY=… npx tsx --env-file=.dev.vars scripts/ai-key.ts` registers or rotates it. No redeploy |
| Plan ids, trial, limits, model | Code defaults in `backend/src/config.ts` | Change in code, then redeploy |
| Store keys, Meta CAPI, Expo access token | Not set yet | Need Worker secrets on Xenition's Cloudflare account, or pipeline support |
| Mobile → API | `mobile/.env` `EXPO_PUBLIC_API_URL` | The app adds `/api/v1` |

---

## Store listing URLs

| Field | URL |
|---|---|
| Website | https://duebox.xenition.com |
| Privacy policy | https://duebox.xenition.com/privacy |
| Terms | https://duebox.xenition.com/terms |
| Support | https://duebox.xenition.com/support |
| Account deletion (Google Play) | https://duebox.xenition.com/delete-account |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `/health` fine, every other route **502** | SDK older than 0.2.8 inside Workers | Upgrade the SDK, redeploy |
| `the bare name 'duebox' belongs to another app` | Signed in as an account that doesn't own `app_duebox` | Use the owner account |
| `sign-in failed` | Wrong path or credentials | The path is `/auth/login` (no `/v1`) |
| Scanning answers 503 "not working on this server" | No OpenRouter key on `app_duebox` in Xenition, or it was rejected | Run `scripts/ai-key.ts` |
| Reminders never arrive | The workflow is disabled (GitHub disables schedules on inactive repos after 60 days) or the phone has no push token | Re-enable it in the Actions tab; push needs a dev/store build |
| A transient 502/522 in the curl suite | Gateway hiccup | Rerun; check `curl https://api.xenition.com/...` |
| Curl suite shows 429s | Sign-in allows 10 requests a minute per IP | The suite waits; don't run two at once |
