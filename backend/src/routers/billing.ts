import type { Context } from 'hono';
import { defineRouter } from '@xenition/sdk/hono';
import { handleAppleNotification, handleGoogleNotification } from '@xenition/sdk';
import type { RecordPurchaseInput } from '@xenition/sdk';
import { ok, fail, invalid, jsonBody, userId, parseText } from '../lib';
import { PRO, PRODUCT_IDS, TRIAL_DAYS, appleStore, googleStore, billing, forgetEntitlement, planPayload, startTrialOnce } from '../billing';
import { requireHousehold, requireOwner } from '../middleware';
import { householdRow } from '../services';
import { netValueFor, trackServerEvent } from '../meta';
import { handleError } from '../errors';

/**
 * `billing` — the subscription over HTTP (SRS FR-B1…B5, CONTRACT §2.6).
 *
 * **The device never says what it bought.** It hands over a transaction id
 * (Apple) or a purchase token (Play) and the server asks the store.
 */
export const billingRouter = defineRouter({
  name: 'billing',

  build(app, { requireAuth, rateLimit }) {
    app.onError(handleError);

    app.get('/billing/plan', requireAuth, requireHousehold, async (c) => {
      return ok(c, await planPayload(c, await householdRow(c)));
    });

    /**
     * The catalog: ids and periods, never prices — StoreKit and Play render
     * those, localised. `offer` marks the one-time welcome-offer products.
     */
    app.get('/billing/products', requireAuth, async (c) => {
      const platform = c.req.query('platform');
      if (platform !== 'apple' && platform !== 'google') return invalid(c, 'Pass platform=apple or platform=google.');
      const ids = PRODUCT_IDS(c);
      return ok(c, {
        trialDays: TRIAL_DAYS(c),
        entitlement: PRO(c),
        products: [
          { productId: ids.monthly, label: 'Monthly', period: 'month', highlight: false, offer: false },
          { productId: ids.yearly, label: 'Yearly', period: 'year', highlight: true, offer: false },
          { productId: ids.offerMonthly, label: 'Monthly', period: 'month', highlight: false, offer: true },
          { productId: ids.offerYearly, label: 'Yearly', period: 'year', highlight: true, offer: true },
        ],
      });
    });

    app.post('/billing/verify', requireAuth, requireOwner, rateLimit(20), async (c) => {
      const body = await jsonBody(c);
      if (!body) return invalid(c, 'Expected a JSON body.');
      const uid = userId(c);
      const platform = body.platform === 'apple' || body.platform === 'google' ? body.platform : null;
      if (!platform) return invalid(c, 'A platform of apple or google is required.');

      let record: RecordPurchaseInput;
      let eventId: string;
      if (platform === 'apple') {
        const store = appleStore(c);
        if (!store) return storeUnconfigured(c, 'apple');
        const transactionId = parseText(body.transactionId, 120);
        if (!transactionId.ok) return invalid(c, 'A transaction id is required.');
        record = await store.verify({ userId: uid, transactionId: transactionId.value });
        eventId = transactionId.value;
      } else {
        const store = googleStore(c);
        if (!store) return storeUnconfigured(c, 'google');
        const productId = parseText(body.productId, 200);
        const purchaseToken = parseText(body.purchaseToken, 4000);
        if (!productId.ok || !purchaseToken.ok) return invalid(c, 'A product id and a purchase token are required.');
        record = await store.verify({ userId: uid, productId: productId.value, purchaseToken: purchaseToken.value, kind: 'subscription' });
        // Play auto-refunds anything not acknowledged within 3 days.
        await store
          .acknowledge({ productId: productId.value, purchaseToken: purchaseToken.value, kind: 'subscription' })
          .catch((err) => console.error('play acknowledge failed:', err instanceof Error ? err.message : err));
        eventId = purchaseToken.value.slice(0, 64);
      }

      await billing(c).recordPurchase(record);
      forgetEntitlement(c, uid);
      const productId = (record as { productId?: string }).productId ?? '';
      const net = netValueFor(c, productId);
      trackServerEvent(c, { userId: uid, eventName: 'Subscribe', eventId, value: net.value, currency: net.currency });
      return ok(c, await planPayload(c, await householdRow(c)));
    });

    /** Apple restore. Play replays its owned purchases through /verify. */
    app.post('/billing/restore', requireAuth, requireOwner, rateLimit(20), async (c) => {
      const body = await jsonBody(c);
      const uid = userId(c);
      const store = appleStore(c);
      if (!store) return storeUnconfigured(c, 'apple');
      const originalTransactionId = parseText(body?.originalTransactionId, 120);
      if (!originalTransactionId.ok) return invalid(c, 'An original transaction id is required.');
      const records = await store.restore({ userId: uid, originalTransactionId: originalTransactionId.value });
      for (const record of records) await billing(c).recordPurchase(record);
      forgetEntitlement(c, uid);
      return ok(c, { ...(await planPayload(c, await householdRow(c))), restored: records.length });
    });

    /** Retry for a trial whose start was swallowed at setup. Once per account. */
    app.post('/billing/trial', requireAuth, requireOwner, rateLimit(10), async (c) => {
      const uid = userId(c);
      const started = await startTrialOnce(c, uid);
      const plan = await planPayload(c, await householdRow(c));
      if (!started && !plan.isTrial) return fail(c, 'CONFLICT', 'This account has already used its free trial.', 409);
      if (started) trackServerEvent(c, { userId: uid, eventName: 'StartTrial', eventId: `trial-${uid}` });
      return ok(c, plan);
    });

    /* ── stores calling us: unauthenticated, verified by the SDK, deduped ── */

    app.post('/billing/apple/notifications', async (c) => {
      const store = appleStore(c);
      if (!store) return c.json({ ok: false }, 503);
      const body = await jsonBody(c);
      const signedPayload = typeof body?.signedPayload === 'string' ? body.signedPayload : '';
      if (!signedPayload) return c.json({ ok: false }, 400);
      await handleAppleNotification({ billing: billing(c), apple: store, signedPayload });
      return c.json({ ok: true });
    });

    app.post('/billing/google/notifications', async (c) => {
      const store = googleStore(c);
      if (!store) return c.json({ ok: false }, 503);
      const body = await jsonBody(c);
      await handleGoogleNotification({ billing: billing(c), google: store, body: (body ?? {}) as Record<string, unknown> });
      return c.json({ ok: true });
    });
  },
});

function storeUnconfigured(c: Context, platform: 'apple' | 'google') {
  return fail(c, 'STORE_UNCONFIGURED', `Subscriptions are not available in this build (${platform} is not configured).`, 503);
}
