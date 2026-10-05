# Playbook

How an app gets built. `design.md` is the principles; this is the mechanics.

## Layout
```
<repo>/
├── docs/      SRS.md (verbatim), CONTRACT.md, ARCHITECTURE.md, DESIGN-SYSTEM.md, TEST-LOG.md, knowledge/
├── backend/   Hono on Cloudflare Workers + @xenition/sdk
└── mobile/    Expo Router
```
Each app has its own `.gitignore` and `README.md`. Commit often and small.

## Before code
1. **SRS into `docs/SRS.md` verbatim** — the delivered text is the contract; never paraphrase.
2. **`CONTRACT.md` first** — envelope shape, money representation, privacy boundary, what a client may send. Both halves are written against it.
3. **Decide the seed** (`visual-system.md`).
4. **Write down what is out of scope.**

## Money / data non-negotiables
- Money is integer cents everywhere. Never a float.
- The household/team/workspace is the privacy boundary, resolved server-side from the caller's membership row. No route accepts a scope id from the client. `WHERE tenant_id = $1` is not isolation when one engine key serves every user.
- Direction lives in a `type` column, never a negative amount. Transfers are neither income nor expense.
- Financial rows are soft-deleted; derive the soft-deleted set from migration SQL.

## Configuration
- One config module per half. `mobile/src/config.ts` reads `EXPO_PUBLIC_*` (see `traps.md`).
- `backend/src/config.ts` takes an **env reader**: the worker reads from the request context (no `process.env` on Workers at request time); `migrate`/`seed` run in plain Node.
- Both `.env.example` committed and cross-referenced; product ids byte-identical across halves. `.env` and `.dev.vars` gitignored.

## Backend
```bash
cd backend && npm install
cp .dev.vars.example .dev.vars   # fill in the API key
npm run migrate                  # once per deploy, before traffic
npm run seed                     # optional demo data
npm run dev                      # http://localhost:8787
npm test
```
- Migrations are content-addressed: never edit an applied one; ship a new id.
- No DDL in a request path.
- If your envelope differs from the SDK modules', mount module *clients*, not routers. `modules.use()` in the worker (no DDL), `modules.enable()` in migrate (DDL, idempotent).

## Mobile
- `npm start` (Expo Go) is fine except for native modules. Sign-in providers, IAP, biometrics need a dev build: `npx expo run:android` / `run:ios`.
- Derive the worker's LAN address from the host Expo serves the bundle from. Never hardcode `localhost` — it fails on real devices as "server down".

## Verify without a phone
```bash
npx expo export --platform web --output-dir dist-web
node harness/serve.mjs   # build on 8080 + API stub
node harness/shoot.mjs   # every screen → harness/shots/
```
- Drive the exported build, not Metro. Headless Chrome over raw CDP (no Puppeteer). Seed the session into `localStorage`. Shoot at 393×852.
- `serve.mjs --web-only` skips the stub and hits the real worker — the true end-to-end run.
- **Open the screenshots and look.** It cannot test native code; assert the app mounted and poll (see `traps.md`).

## Smoke every endpoint before "done"
- A typecheck can't see column names (strings). A filter on a nonexistent `status` column shipped and broke a feature in production.
- `backend/scripts/smoke.mjs`: sign in as the seeded demo account, hit every route, writes clean up after themselves. Run against the live worker.
- A static column checker produced only false positives and was dropped — a check that cries wolf is worse than none.
- Expect the suite's first failures to be its own bugs (missing query param, missing field, missing optimistic-lock version). Fix until green, then trust it.

## Order of work
1. Backend schema + routers, tests on pure logic.
2. Run against the real gateway early.
3. Mobile shell: tokens, primitives, navigation.
4. Screens, data-bearing first.
5. Export, shoot, look, fix. Repeat.
6. Store readiness early — late, it costs weeks of review cycles.
7. Then a dev build on a real phone.

## Report status honestly
Always distinguish in writing: **ran against production** (which data/endpoints) · **rendered in harness** · **typechecks** · **never run on a phone** · **not deployed**. Detail goes in `docs/TEST-LOG.md`.
