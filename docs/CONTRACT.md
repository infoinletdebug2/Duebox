# Duebox — Frozen Contract

The agreement between `backend/` and `mobile/`. What the product does:
`SRS.md`. Changing this file is a decision, not an edit. Where this file and
`backend/src/routers/*` disagree after implementation, the routers are the
final word and this file is updated to match.

---

## 0. Laws

1. **Money is integer cents.** SQL `*_cents integer`, wire `*Cents`. `$412.50` is `41250`. Never floats, never negative.
2. **Due dates are `YYYY-MM-DD`** strings (`date` in SQL), in the household timezone. Instants are ISO-8601 UTC (`timestamptz`).
3. **The household comes from the token** (BR-01). No route accepts a household id.
4. **AI output is a draft** (BR-02): only `POST /scans/:id/confirm` turns it into items.
5. **Masking at extraction** (BR-08): references are stored as last 4 only.
6. **Enum values never reach the UI as text.** The app maps `renew` → "Renew".
7. **The phone holds no secret and no Xenition package.** It talks only to this worker over HTTPS.
8. **Envelope** — success `{ "success": true, "data": … }`; failure `{ "success": false, "error": { "code", "message", "fields?", "reason?" } }`.

| HTTP | code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad input (`fields` = field → code; show `message`) |
| 401 | `AUTH_TOKEN_EXPIRED` / `AUTH_INVALID_CREDENTIALS` | |
| 402 | `SUBSCRIPTION_REQUIRED` | Gated action; `reason` = `item_limit` · `scan_limit` · `household` · `custom_reminders` |
| 403 | `FORBIDDEN` | Role (member doing an owner action) |
| 404 | `NOT_FOUND` | Missing, or another household's |
| 409 | `CONFLICT` | State conflict (confirming a confirmed scan, joining while in a household with members) |
| 410 | `GONE` | Expired invite |
| 422 | `READ_FAILED` | The AI could not read a date → manual entry |
| 429 | `RATE_LIMIT_EXCEEDED` | Too fast |
| 503 | `READER_UNAVAILABLE` / `STORE_UNCONFIGURED` | AI key or store keys not configured |

Base: `/api/v1`. Bearer token on everything except auth and store webhooks.

---

## 1. Wire types (`mobile/src/types.ts` mirrors exactly)

```ts
type Role = 'owner' | 'member';
type Category = 'id_travel' | 'vehicle' | 'home' | 'insurance' | 'bills' | 'health'
              | 'kids_school' | 'subscriptions' | 'work' | 'other';
type Action = 'renew' | 'pay' | 'submit' | 'cancel' | 'book' | 'attend' | 'other';
type Repeat = 'none' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'years';
type ItemStatus = 'open' | 'done';
type Offset = 60 | 30 | 14 | 7 | 3 | 1;                 // days before the due date
type ScanStatus = 'uploading' | 'reading' | 'review' | 'confirmed' | 'failed';
type Confidence = 'high' | 'medium' | 'low';

interface Member { id: string; displayName: string; initial: string; role: Role; isMe: boolean }

interface Item {
  id: string;
  title: string;                       // 1..80
  category: Category;
  action: Action;
  status: ItemStatus;
  dueDate: string;                     // YYYY-MM-DD
  daysLeft: number;                    // server-computed in household tz; negative = late
  amountCents: number | null;
  issuer: string | null;               // "State Farm", "DMV"
  referenceLast4: string | null;
  notes: string | null;                // ≤ 1000
  repeat: Repeat;
  repeatYears: number | null;          // 2..10 when repeat = 'years'
  offsets: Offset[];                   // before-due reminders; due-day + overdue are implicit
  assigneeId: string | null;           // Member.id
  attachmentCount: number;
  nextReminderAt: string | null;       // ISO instant
  doneAt: string | null;
  doneById: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ItemDetail extends Item {
  attachments: { documentId: string; pages: { id: string; index: number; mime: string; url: string }[] }[]; // url = 15-min signed
  evidence: string | null;             // the words the AI took the date from
  seriesCount: number;                 // occurrences so far, for "3rd renewal"
}

interface ItemInput {                  // create / update / confirm
  title: string; dueDate: string;
  category?: Category; action?: Action;
  amountCents?: number | null; issuer?: string | null; referenceLast4?: string | null; notes?: string | null;
  repeat?: Repeat; repeatYears?: number | null;
  offsets?: Offset[];                  // Free: must equal the default or omitted (else 402 custom_reminders)
  assigneeId?: string | null;
}

interface Candidate {                  // one item the AI found on a scan
  key: string;                         // stable within the scan, "c1".."c3"
  title: string | null; category: Category; action: Action;
  dueDate: string | null; evidence: string | null;
  amountCents: number | null; currency: string | null;
  issuer: string | null; referenceLast4: string | null;
  repeat: Repeat; notes: string | null;
  confidence: { title: Confidence; dueDate: Confidence; amount: Confidence };
}

interface Scan {
  id: string; status: ScanStatus; pageCount: number;
  pages: { id: string; index: number; mime: string; url: string | null }[];
  candidates: Candidate[];             // empty until status = 'review'
  readError: 'no_date' | 'unreadable' | 'not_document' | 'timeout' | null;
  createdAt: string;
}

interface Plan {
  tier: 'free' | 'pro';
  source: 'store' | 'none';
  renewsAt: string | null; expiresAt: string | null;
  limits: { openItems: number | null; scansPerMonth: number; members: number };   // null = unlimited
  usage: { openItems: number; scansThisMonth: number; month: string };
}

interface Home {
  nextUp: Item | null;
  overdue: Item[];                     // oldest first
  thisWeek: Item[];                    // daysLeft 0..7
  thisMonth: Item[];                   // daysLeft 8..31
  laterCount: number;
  inbox: { id: string; pageCount: number; status: ScanStatus; createdAt: string }[];   // unconfirmed scans
  plan: Plan;
  members: Member[];
}

interface Me {
  user: { id: string; email: string; name: string | null; emailVerified: boolean };
  household: { id: string; name: string; timezone: string; currency: string; remindHour: number };
  role: Role; memberId: string;
  prefs: { reminders: boolean; overdue: boolean };
  plan: Plan;
}
```

---

## 2. Endpoints

### 2.1 Auth (public; hand-written over `@xenition/sdk` — copy Clearbill's `routers/auth.ts`, same shapes)

`POST /auth/register {email, password, name, timezone}` · `/auth/login` · `/auth/refresh` · `/auth/logout {refreshToken}` ·
`/auth/send-code` · `/auth/verify-code` · `/auth/forgot-password` · `/auth/reset-password` · `/auth/change-password {currentPassword, newPassword}` ·
`GET /auth/social/providers` · `GET /auth/social/:provider/start?returnTo` · `POST /auth/social/complete {code}` · `POST /auth/social/id-token {provider, idToken, nonce?, name?}`

Tokens: `{accessToken, refreshToken, expiresAt, user}`. The first `GET /auth/me` after sign-up creates the household (FR-A2) from the `x-timezone` and `x-region` headers the app sends on every request (CORS must allow `x-timezone`, `x-region`, `idempotency-key`).

### 2.2 Me, household, members

| Method | Path | Access | Body → data |
|---|---|---|---|
| GET | `/auth/me` | user | → `Me` |
| PATCH | `/auth/me` | user | `{name?, prefs?: {reminders?, overdue?}}` → `Me` |
| PATCH | `/household` | owner | `{name?, timezone?, currency?, remindHour? (0..23)}` → `Me` (re-plans reminders) |
| GET | `/household/members` | member | → `Member[]` |
| DELETE | `/household/members/:id` | owner | removes; their assigned items become unassigned |
| POST | `/household/leave` | member | leaves; a fresh solo household is created on next `/auth/me` |
| POST | `/household/invites` | owner **+pro** | → `{code, link, expiresAt}` |
| GET | `/household/invites` | owner | → `{id, code, expiresAt}[]` |
| DELETE | `/household/invites/:id` | owner | revoke |
| GET | `/household/invites/lookup/:code` | user | → `{householdName, invitedBy, expiresAt}` |
| POST | `/household/join` | user | `{code}` → `{joined: true}` (only if the caller's own household has no other members — else 409 with a readable message; their items move with them) |

### 2.3 Home and items

| Method | Path | Access | Body → data |
|---|---|---|---|
| GET | `/home` | member | → `Home` |
| GET | `/items` | member | `?status=open\|done&category&q&cursor` → `{items: Item[], nextCursor}` (open: due asc; done: doneAt desc; 30 per page) |
| GET | `/items/:id` | member | → `ItemDetail` |
| POST | `/items` | member **+limit** | `ItemInput` → `ItemDetail` |
| PATCH | `/items/:id` | member | `Partial<ItemInput>` → `ItemDetail` (re-plans reminders) |
| POST | `/items/:id/done` | member | → `{item: Item, next: Item \| null}` (next = created occurrence, FR-I6) |
| POST | `/items/:id/reopen` | member **+limit** | → `Item` |
| POST | `/items/:id/snooze` | member | `{days: 1\|3\|7}` → `Item` |
| DELETE | `/items/:id` | member | soft-deletes the item, deletes its files and reminders |

`done` and `snooze` accept header `Idempotency-Key` (the notification action and the offline queue retry them).

### 2.4 Scans and attachments

| Method | Path | Access | Body → data |
|---|---|---|---|
| POST | `/scans` | member | `{source: 'camera'\|'library'\|'pdf', pages: [{mime: 'image/jpeg'\|'application/pdf', bytes}]}` → `{scan: Scan, uploads: [{pageId, uploadUrl}]}` (PUT each page to `uploadUrl`) |
| POST | `/scans/:id/read` | member **+scan allowance** | → `Scan` (`review`), or 422 `READ_FAILED` with the scan `failed` |
| GET | `/scans/:id` | member | → `Scan` |
| POST | `/scans/:id/confirm` | member **+limit** | `{items: (ItemInput & {candidateKey?: string})[]}` (1..3) → `{items: ItemDetail[]}`; the scan's pages attach to every created item |
| DELETE | `/scans/:id` | member | discards an unconfirmed scan and its files |
| POST | `/items/:id/attachments` | member | `{pages: [{mime, bytes}]}` → `{documentId, uploads: [{pageId, uploadUrl}]}` |
| DELETE | `/items/:id/attachments/:documentId` | member | |

`GET /export?format=csv|json` returns the file body directly, not the envelope.

Upload limits: image ≤ 4 MB each (after device resize), PDF ≤ 15 MB, ≤ 5 images or 1 PDF per scan.

### 2.5 Devices (push)

| Method | Path | Access | Body → data |
|---|---|---|---|
| POST | `/devices` | user | `{expoPushToken, platform: 'ios'\|'android'}` → `{ok: true}` (upsert; re-registers on every launch) |
| DELETE | `/devices/:token` | user | on sign-out |

### 2.6 Billing (same as Slatebook)

| Method | Path | Access | Body → data |
|---|---|---|---|
| GET | `/billing/plan` | member | → `Plan` |
| GET | `/billing/products` | member | `?platform` → `{productId, label, period: 'month'\|'year', highlight}[]` |
| POST | `/billing/verify` | owner | `{platform: 'apple', transactionId}` or `{platform: 'google', productId, purchaseToken}` → `Plan` |
| POST | `/billing/restore` | owner | `{originalTransactionId}` (Apple; Google replays `/verify`) → `Plan` |
| POST | `/billing/apple/notifications` | Apple-signed | App Store Server Notifications v2 |
| POST | `/billing/google/notifications` | Pub/Sub-signed | RTDN |

### 2.7 Account

| Method | Path | Access | Body → data |
|---|---|---|---|
| GET | `/export` | member | `?format=csv\|json` → file body (`text/csv` or `application/json`), never gated |
| DELETE | `/auth/me` | user | `{password} \| {confirmation: 'DELETE'}` → `{deleted: true}` (FR-A5) |

---

## 3. Gating summary

| Mark | Rule | Free | Pro |
|---|---|---|---|
| **+limit** | open items after the write ≤ limit | 5 | unlimited |
| **+scan allowance** | `read` calls this month < allowance | 3 | 100 |
| **+pro** | invites | ✗ | up to 4 members |
| `offsets` ≠ default | custom reminders | ✗ (402 `custom_reminders`) | ✓ |

Never gated: reading anything, editing, done, reopen within limit, snooze,
delete, attachments, export, account deletion (BR-07). Plan lookups fail
open to **free** (BR-12).

---

## 4. Database (Postgres via `@xenition/sdk`, prefix `dx__`)

```sql
dx__profile   (user_id text pk, name text, prefs_reminders bool default true, prefs_overdue bool default true,
               created_at timestamptz, updated_at timestamptz)

dx__household (id uuid pk default gen_random_uuid(), owner_user_id text not null, name text not null default 'Your home',
               timezone text not null, currency text not null default 'USD', remind_hour smallint not null default 9
               check (remind_hour between 0 and 23),
               created_at, updated_at, deleted_at timestamptz)

dx__member    (id uuid pk, household_id uuid fk → dx__household on delete cascade, user_id text not null,
               role text check (role in ('owner','member')), display_name text, email text,
               removed_at timestamptz, created_at, updated_at)
               unique (user_id) where removed_at is null

dx__invite    (id uuid pk, household_id uuid fk cascade, code_hash text unique, created_by uuid → dx__member,
               expires_at timestamptz, accepted_at, accepted_by text, revoked_at, created_at)

dx__item      (id uuid pk, household_id uuid fk cascade, series_id uuid not null,      -- same for every occurrence
               title text not null check (char_length(title) between 1 and 80),
               category text not null, action text not null, status text not null default 'open'
               check (status in ('open','done')),
               due_date date not null, amount_cents integer check (amount_cents >= 0),
               issuer text, reference_last4 text check (char_length(reference_last4) <= 4), notes text,
               repeat text not null default 'none', repeat_years smallint,
               offsets smallint[] not null default '{7}',
               assignee_id uuid → dx__member on delete set null,
               source text not null check (source in ('scan','manual','repeat')), evidence text,
               done_at timestamptz, done_by uuid,
               created_by uuid, deleted_at timestamptz, created_at, updated_at)
               index (household_id, status, due_date) where deleted_at is null

dx__reminder  (id uuid pk, household_id uuid fk cascade, item_id uuid fk → dx__item on delete cascade,
               kind text check (kind in ('before','due','overdue','snooze')), offset_days smallint,
               fire_at timestamptz not null, sent_at timestamptz, attempts smallint default 0,
               canceled_at timestamptz, created_at)
               index (fire_at) where sent_at is null and canceled_at is null

dx__document  (id uuid pk, household_id uuid fk cascade, purpose text check (purpose in ('scan','attachment')),
               status text not null,                       -- ScanStatus; attachments go straight to 'confirmed'
               source text, page_count smallint, draft jsonb, model text, read_error text, read_ms integer,
               created_by uuid, confirmed_at timestamptz, deleted_at timestamptz, created_at, updated_at)

dx__item_document (item_id uuid fk cascade, document_id uuid fk cascade, household_id uuid,
               primary key (item_id, document_id))

dx__page      (id uuid pk, household_id uuid, document_id uuid fk cascade, idx smallint,
               storage_key text not null, mime text, bytes integer, created_at)

dx__device    (id uuid pk, user_id text not null, expo_push_token text unique not null, platform text,
               last_seen_at timestamptz, disabled_at timestamptz, created_at)

dx__usage     (household_id uuid, month text, scans integer default 0, primary key (household_id, month))
```

Soft-deleted: `dx__item`, `dx__document`, `dx__household` (derive the set
from the migration SQL — `traps.md`). Everything cascades from
`dx__household` for account deletion; storage objects are deleted after rows.
