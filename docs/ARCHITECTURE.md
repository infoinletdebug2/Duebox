# Duebox — Architecture

Same shape as Clearbill and Keyhaven: an Expo app talks only to Duebox's Hono
worker. The worker holds the Xenition service key, the OpenRouter key and the
Expo access token, and talks to Postgres, private storage, the stores, the AI
reader and the push service. **No Xenition package and no secret on the phone.**

```
 Expo app ── HTTPS (Bearer) ──▶ Duebox worker (Hono, Cloudflare Workers)
   │  presigned PUT (pages)          │ XENITION_API_KEY     │ OPENROUTER_API_KEY     │ EXPO_ACCESS_TOKEN
   ▼                                 ▼                      ▼                        ▼
 Xenition storage ◀─ signed GET ── Xenition gateway       OpenRouter → vision      Expo Push Service
 (private bucket)                  → Postgres (dx__*)     (data_collection: deny)  → APNs / FCM → phones
                                   → Apple / Play billing
                                        ▲
                     Cron trigger */5 ──┘  (reminder delivery)
```

## 1. Stack

**Backend:** Hono 4 on Workers, `@xenition/sdk` (query builder, raw SQL,
transactions, storage, auth, billing module), vitest, wrangler. Local dev on
Node via `@hono/node-server` (`npm run dev`), as Clearbill.

**Mobile:** Expo 57, RN 0.86, expo-router, @tanstack/react-query (+ persisted
cache), react-native-reanimated 4, react-native-gesture-handler,
react-native-svg, lucide-react-native, expo-notifications,
expo-image-picker, expo-image-manipulator, expo-document-picker, expo-image,
expo-secure-store, expo-apple-authentication (lazy), Google sign-in (lazy),
react-native-iap 16 (lazy), expo-store-review, expo-sharing, expo-haptics,
react-native-keyboard-aware-scroll-view; fonts Bricolage Grotesque + Manrope.
UI kit decision: `DESIGN-SYSTEM.md` §5.

## 2. Layout

```
duebox/
├── docs/            SRS · CONTRACT · ARCHITECTURE · DESIGN-SYSTEM · SCREENS · TEST-LOG
├── backend/
│   ├── wrangler.toml          crons = ["*/5 * * * *"]
│   ├── src/
│   │   ├── index.ts           Hono app + `scheduled()` handler
│   │   ├── config.ts          env READER → typed config (worker + Node)
│   │   ├── lib.ts             sdk(c), env, AppError, envelope helpers, scoped()/ours()
│   │   ├── middleware.ts      auth → member → household; rate limits
│   │   ├── billing.ts         planFor(), fails open to free
│   │   ├── schema.ts          migrations (content-addressed; never edit an applied one)
│   │   ├── migrate.ts · seed.ts · dev.ts
│   │   ├── reader.ts          OpenRouter client — the ONLY AI call
│   │   ├── push.ts            Expo push client — the ONLY push call (from Keyhaven)
│   │   ├── logic/             pure + tested
│   │   │   ├── planner.ts     planReminders()
│   │   │   ├── repeat.ts      nextDueDate()
│   │   │   ├── dates.ts       daysLeft(), todayIn(tz), month-end clamp
│   │   │   ├── extract.ts     EXTRACTION_SCHEMA, instructions, coerceExtraction(), maskReference()
│   │   │   ├── gating.ts      canCreate(), canScan(), allowedOffsets()
│   │   │   └── money.ts
│   │   ├── jobs/deliver.ts    cron: due reminders → push
│   │   └── routers/           auth · me · household · items · scans · devices · billing · account
│   └── scripts/               smoke.mjs (every endpoint) · reader-check.ts (sample letters)
└── mobile/
    ├── app/                   routes (SCREENS.md)
    ├── src/                   api/ · auth/ · billing/ · notifications/ · theme/ · ui/ · lib/ · types.ts
    ├── harness/               serve.mjs · shoot.mjs · stub data
    └── assets/
```

## 3. Scan pipeline (FR-S1…S6)

1. **Pick** — camera / library / PDF on the phone; images resized to ≤ 1600 px, JPEG 0.7 (`expo-image-manipulator`).
2. **Create** — `POST /scans {pages}` → rows `dx__document(purpose='scan', status='uploading')` + `dx__page`; returns one presigned PUT per page (`sdk.storage.createUploadUrl`, 15 min).
3. **Upload** — the phone PUTs each page straight to storage, then calls read.
4. **Read** — `POST /scans/:id/read`: check allowance → `status='reading'` → signed GET URLs for the pages → `reader.readDocument()` → `coerceExtraction()` → mask references → store `draft` (candidates), `model`, `read_ms` → `status='review'`; increment `dx__usage.scans`. Failure → `status='failed'`, `read_error`, 422.
5. **Confirm** — `POST /scans/:id/confirm {items}` in one transaction: insert items, link `dx__item_document`, plan reminders, `status='confirmed'`.

### 3.1 The reader

- Model: `google/gemini-2.5-flash` via OpenRouter (proven in Clearbill), `temperature: 0`, `response_format: json_schema (strict)`, `provider.data_collection: 'deny'`, timeout 25 s.
- Instructions, in short: "Find every action with a deadline in this document (max 3). For each, return the exact words the date came from as `evidence`. If there is no explicit date, return `dueDate: null` — never guess. Mask any reference number to its last 4 characters. Choose category and action from the lists."
- Schema (abridged):

```json
{ "documentType": "renewal_notice|bill|form|letter|receipt|screenshot|other",
  "candidates": [ { "title": "string", "category": "<Category>", "action": "<Action>",
                    "dueDate": "YYYY-MM-DD|null", "evidence": "string|null",
                    "amount": "string|null", "currency": "ISO-4217|null",
                    "issuer": "string|null", "reference": "string|null",
                    "repeat": "<Repeat>", "notes": "string|null",
                    "confidence": { "title": "high|medium|low", "dueDate": "…", "amount": "…" } } ] }
```

- `coerceExtraction()` is pure and tested: parses `amount` strings to cents, rejects dates that do not exist or are > 10 years out, drops candidates with no title and no date, re-masks `reference` (BR-08), caps at 3. Zero usable candidates → `READ_FAILED(no_date)`.
- Logs: model, pages, ms, parsed, error class. **Never** document text (BR-10).

## 4. Reminder planner (`logic/planner.ts`, FR-R1…R7)

```ts
planReminders({ dueDate, offsets, remindHour, timezone, now, status }): { kind, offsetDays, fireAt }[]
```

- `status === 'done'` → `[]`.
- For each offset in `offsets`: `fireAt = localInstant(dueDate − offset days, remindHour, timezone)`; keep if `> now`.
- Due-day: `localInstant(dueDate, remindHour)`; if past and due today → `now + 1 h`.
- Overdue: `localInstant(dueDate + 1 day, remindHour)` once.
- DST-safe: compute the local wall-clock time with `Intl.DateTimeFormat` in the zone, then convert; tests cover spring-forward and fall-back days in `America/New_York` and `Europe/London`.

**Re-plan** (any change to due date, offsets, status, hour, timezone):
`UPDATE dx__reminder SET canceled_at = now() WHERE item_id = $1 AND sent_at IS NULL AND kind <> 'snooze'`, then insert the new plan. Snooze rows survive edits.

## 5. Delivery (`jobs/deliver.ts`, cron every 5 minutes)

```sql
SELECT r.id, r.kind, r.offset_days, i.*, h.timezone
FROM dx__reminder r JOIN dx__item i ON i.id = r.item_id JOIN dx__household h ON h.id = r.household_id
WHERE r.fire_at <= now() AND r.sent_at IS NULL AND r.canceled_at IS NULL AND r.attempts < 3
  AND i.status = 'open' AND i.deleted_at IS NULL AND h.deleted_at IS NULL
ORDER BY r.fire_at LIMIT 500
```

1. Recipients: the assignee's user, else every active member; filtered by `dx__profile.prefs_*` (overdue kind uses `prefs_overdue`).
2. Tokens: `dx__device` where `disabled_at IS NULL`.
3. Message: title `"{Action} {title}"`, body `"in 6 days · $412.00"` / `"today"` / `"was due yesterday"`; `data: {itemId, url: 'duebox://item/<id>'}`; `categoryId: 'item_due'` (Done / Snooze actions).
4. Send in batches of 100 to Expo Push (`push.ts`, copied from Keyhaven). `DeviceNotRegistered` → `disabled_at = now()`.
5. `sent_at = now()` on success; `attempts + 1` on a transient failure (retried next run).

A reminder whose time passed more than 24 h ago (worker outage) is marked
sent without pushing — a stale "due in 7 days" is worse than none; the in-app
Overdue section covers it.

## 6. Repeat (`logic/repeat.ts`, FR-I6, BR-11)

`nextDueDate(dueDate, repeat, repeatYears)` adds 1/3/6/12 months or N years
to the **old due date**, clamping to the month's last day. `POST /items/:id/done`
in one transaction: mark done → insert the next occurrence (`source='repeat'`,
same `series_id`, offsets kept) → plan its reminders → cancel the old item's.

## 7. Gating, usage, privacy

- `planFor(owner)` reads the billing module entitlement `pro`; any error → free (BR-12, logged).
- `+limit`: `SELECT count(*) FROM dx__item WHERE household_id=$1 AND status='open' AND deleted_at IS NULL`.
- `+scan allowance`: `dx__usage` row for `YYYY-MM` in the household timezone.
- Rate limits: auth 10/min per IP; `/scans/:id/read` 20/hour per user.
- Deletion: rows first (cascade), then storage objects (`sdk.storage.delete`), failures logged, never block.

## 8. Mobile notes

- **Push registration:** after permission is granted, `getExpoPushTokenAsync({projectId})` → `POST /devices`; repeat on every launch. Notification categories (`item_due`: Done, Snooze 1 day) registered at start-up; the response handler calls the API with an `Idempotency-Key` and works from a killed state.
- **Expo Go:** push tokens and notification actions need a dev build (Expo SDK 53+ removed remote push from Expo Go on Android). The app must still run in Expo Go: guard with `IS_EXPO_GO` and show the permission screen as "available in the installed app" (`traps.md`).
- **Native-only modules** (IAP, Google sign-in, Apple sign-in) load lazily and never in Expo Go.
- **Offline:** v1 shows cached React Query data while the app is open; Done/Snooze carry an `Idempotency-Key` so a retry is safe. A persisted cache + replay queue is v1.1 (not built).
- **API base:** derived from the host Expo serves from in dev; `EXPO_PUBLIC_API_URL` in builds. Never `localhost`.

## 9. Config

| Name | Where | Notes |
|---|---|---|
| `XENITION_API_KEY`, `XENITION_API_URL` | worker secret / var | service key for **this** app only |
| `OPENROUTER_API_KEY` | worker secret | never in the bundle |
| `OPENROUTER_BASE_URL`, `READER_MODEL` | var | `https://openrouter.ai/api/v1`, `google/gemini-2.5-flash` |
| `EXPO_ACCESS_TOKEN` | worker secret | Expo push security (enable "enhanced push security") |
| `PRO_MONTHLY_ID`, `PRO_YEARLY_ID` | var | byte-identical to the app's `EXPO_PUBLIC_*` |
| `FREE_OPEN_ITEMS`, `FREE_SCANS`, `PRO_SCANS`, `MAX_MEMBERS` | var | 5 / 3 / 100 / 5 |
| `DOC_BUCKET`, `DOC_URL_TTL_SECONDS` | var | private bucket, 900 |
| Apple / Google store keys | secret | as Slatebook |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_PRO_MONTHLY_ID`, `EXPO_PUBLIC_PRO_YEARLY_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_IOS_STORE_ID`, `EXPO_PUBLIC_ANDROID_PACKAGE` | `mobile/.env` | public ids only |
