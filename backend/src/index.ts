import { Hono } from 'hono';
import { createXenitionApi, defineRouter, jsonNotFound } from '@xenition/sdk/hono';
import { authRouter } from './routers/auth';
import { householdRouter } from './routers/household';
import { itemsRouter } from './routers/items';
import { scansRouter } from './routers/scans';
import { billingRouter } from './routers/billing';
import { accountRouter } from './routers/account';
import { deliverReminders, tickDelivery } from './jobs/deliver';
import { readEnvVar } from './lib';
import { handleError } from './errors';

/**
 * Duebox's worker.
 *
 * `createXenitionApi` is mounted with an EMPTY module list — for its
 * middleware (auth verification, CORS, rate limiting), not its routers,
 * which answer a different envelope than CONTRACT §0.
 */
const app = new Hono();

/** On the ROOT app: Hono does not carry a sub-app's notFound across a prefixed mount. */
app.notFound(jsonNotFound);
app.onError(handleError);

app.get('/health', (c) => c.json({ ok: true, app: 'duebox' }));

/**
 * Reminder delivery without a platform cron.
 *
 * Xenition's deploy pipeline writes its own wrangler.toml with no cron
 * triggers, so `scheduled()` below never fires in production. Delivery is
 * driven two ways instead, both through `tickDelivery` (at most once every
 * ~2 minutes, atomically gated; reminders are claimed before sending):
 *   - GET /api/v1/internal/jobs/tick — public and harmless: it only sends
 *     what is already due. A scheduler (the repo's GitHub Actions workflow)
 *     calls it every 5 minutes;
 *   - any API traffic nudges it in the background, once a minute per isolate.
 */
let lastNudge = 0;
app.use('/api/*', async (c, next) => {
  await next();
  if (c.req.path.includes('/internal/jobs/')) return;
  const now = Date.now();
  if (now - lastNudge < 60_000) return;
  lastNudge = now;
  const work = tickDelivery(c).then(
    () => undefined,
    (error: unknown) => console.error('delivery nudge failed:', error instanceof Error ? error.message : error),
  );
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    // Node dev server: no execution context; the promise already runs.
  }
});

/**
 * A per-isolate token so the cron handler can run the job in-process without
 * a configured JOB_SECRET; an external caller (a manual run, a test) needs
 * `x-job-secret: $JOB_SECRET`.
 */
// Made on first use: Workers forbid random values (and any I/O) in global scope.
let internalToken: string | undefined;
const INTERNAL_TOKEN = () => (internalToken ??= crypto.randomUUID());

const jobsRouter = defineRouter({
  name: 'jobs',
  build(api) {
    api.onError(handleError);
    api.get('/internal/jobs/tick', async (c) => c.json({ success: true, data: await tickDelivery(c) }));
    api.post('/internal/jobs/deliver', async (c) => {
      const header = c.req.header('x-job-secret');
      const secret = readEnvVar(c, 'JOB_SECRET');
      if (!header || (header !== INTERNAL_TOKEN() && header !== secret)) {
        return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Not allowed.' } }, 403);
      }
      return c.json({ success: true, data: await deliverReminders(c) });
    });
  },
});

const api = createXenitionApi({
  modules: [],
  // The app sends its timezone and region on every request (the household is
  // made from them) and an idempotency key on Done/Snooze. Phones don't
  // preflight; the web build does, and refused all three until listed here.
  cors: { allowHeaders: ['x-timezone', 'x-region', 'idempotency-key'] },
  custom: [authRouter, householdRouter, itemsRouter, scansRouter, billingRouter, accountRouter, jobsRouter],
});
api.onError(handleError);
app.route('/api/v1', api);

export default {
  fetch: app.fetch,
  /** Cloudflare cron trigger (wrangler.toml, every 5 minutes): deliver due reminders. */
  async scheduled(_event: unknown, env: Record<string, unknown>, ctx: { waitUntil(p: Promise<unknown>): void }) {
    const request = new Request('https://internal/api/v1/internal/jobs/deliver', { method: 'POST', headers: { 'x-job-secret': INTERNAL_TOKEN() } });
    ctx.waitUntil(
      Promise.resolve(app.fetch(request, env, ctx as never)).then(async (res) => {
        if (!res.ok) console.error('deliver failed:', res.status, await res.text());
      }),
    );
  },
};
