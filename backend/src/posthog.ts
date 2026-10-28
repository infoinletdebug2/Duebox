import type { Context } from 'hono';
import { bearer, readEnvVar, sdk } from './lib';

/**
 * PostHog from the server — the shared fleet project, the same one the app
 * sends to (`mobile/src/lib/posthog.ts`), told apart by `app: 'duebox'`.
 *
 * Only what the server alone knows is real: a trial that actually started
 * and a purchase the store actually verified. The app sends the funnel up to
 * the store sheet (paywall_viewed, purchase_started, purchase_cancelled /
 * failed); never send from here what the app already sends. `distinct_id` is
 * the account id, the same id the app passes to identify(), so both halves
 * land on one person.
 *
 *   1. **On by default.** The phc_ token is write-only and public (every app
 *      binary carries it), so it is built in; `POSTHOG_TOKEN` /
 *      `POSTHOG_HOST` only override it.
 *   2. **Never throws, never blocks.** The POST runs after the answer has
 *      gone (`waitUntil`) and every failure is dropped.
 *   3. **Test accounts stay out.** The curl suite and the demo seed sign up
 *      at `@duebox.test`; their events would read as real customers.
 *   4. **No personal data.** Account id, product, period, value. Never an
 *      email, a name or anything read from a letter.
 */

const APP = 'duebox';
const DEFAULT_TOKEN = 'phc_kCdWSEDneUZ7QQrBR6jrKqhabvGEbviJzaCKrqZnDavm';
const DEFAULT_HOST = 'https://us.i.posthog.com';

export type PosthogServerEvent = 'trial_started' | 'purchase_completed' | 'subscription_ended';

function background(c: Context, work: Promise<void>): void {
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    // Node dev server: no execution context; the promise already runs.
    void work;
  }
}

/** True for the curl suite's and the demo seed's accounts. Unknown → a real person. */
async function isTestAccount(c: Context): Promise<boolean> {
  const token = bearer(c);
  if (!token) return false;
  const email = await sdk(c)
    .auth.me(token)
    .then((me) => me.email ?? '')
    .catch(() => '');
  return email.toLowerCase().endsWith('.test');
}

export function capturePosthog(
  c: Context,
  event: PosthogServerEvent,
  userId: string,
  properties: Record<string, string | number | boolean | null> = {},
): void {
  const token = readEnvVar(c, 'POSTHOG_TOKEN')?.trim() || DEFAULT_TOKEN;
  const host = (readEnvVar(c, 'POSTHOG_HOST')?.trim() || DEFAULT_HOST).replace(/\/+$/, '');

  background(
    c,
    (async () => {
      try {
        if (await isTestAccount(c)) return;
        const response = await fetch(`${host}/i/v0/e/`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            api_key: token,
            event,
            distinct_id: userId,
            properties: { ...properties, app: APP, source: 'server' },
            timestamp: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) console.warn(`posthog ${event} rejected: ${response.status}`);
      } catch (err) {
        console.warn(`posthog ${event} failed:`, err instanceof Error ? err.message : err);
      }
    })(),
  );
}
