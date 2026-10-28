import type { Context } from 'hono';
import { defineRouter } from '@xenition/sdk/hono';
import { handleAppleNotification, handleGoogleNotification } from '@xenition/sdk';
import type { RecordPurchaseInput } from '@xenition/sdk';
import { ok, fail, invalid, jsonBody, userId, parseText } from '../lib';
import { PRO, PRODUCT_IDS, TRIAL_DAYS, appleStore, googleStore, billing, forgetAccess, planPayload } from '../billing';
import { requireHousehold, requireOwner } from '../middleware';
import { householdRow } from '../services';
import { countMilestones } from '../milestones';
import { handleError } from '../errors';

/**
 * `billing` — the subscription over HTTP (SRS FR-B1…B5, CONTRACT §2.6).
 * Hard paywall: no free tier and no server trial; the only free time is the
 * stores' own 3-day intro offer on yearly, with the card taken upfront.
 *
 * **The device never says what it bought.** It hands over a transaction id
 * (Apple) or a purchase token (Play) and the server asks the store. Trial
 * starts, conversions and endings are counted once per chain (milestones.ts).
 */
export const billingRouter = defineRouter({
  name: 'billing',

  build(app, { requireAuth, rateLimit }) {
    app.onError(handleError);

    /** Never gated: the paywall reads it to decide whether to stand aside. */
    app.get('/billing/plan', requireAuth, requireHousehold, async (c) => {
      return ok(c, await planPayload(c, await householdRow(c)));
    });

    /**
     * The catalog: ids and periods, never prices — StoreKit and Play render
     * those, localised. `trial` marks the product that carries the stores'
     * free intro offer (yearly); the store still decides eligibility.
     */
    app.get('/billing/products', requireAuth, async (c) => {
      const platform = c.req.query('platform');
      if (platform !== 'apple' && platform !== 'google') return invalid(c, 'Pass platform=apple or platform=google.');
      const ids = PRODUCT_IDS(c);
      return ok(c, {
        trialDays: TRIAL_DAYS(c),
        entitlement: PRO(c),
        products: [
          { productId: ids.yearly, label: 'Yearly', period: 'year', highlight: true, trial: true },
          { productId: ids.monthly, label: 'Monthly', period: 'month', highlight: false, trial: false },
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
      if (platform === 'apple') {
        const store = appleStore(c);
        if (!store) return storeUnconfigured(c, 'apple');
        const transactionId = parseText(body.transactionId, 120);
        if (!transactionId.ok) return invalid(c, 'A transaction id is required.');
        record = await store.verify({ userId: uid, transactionId: transactionId.value });
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
      }

      const purchase = await billing(c).recordPurchase(record);
      forgetAccess(c, uid);
      // Trial started / first charge / restore: counted once per chain, so a
      // Play restore replaying owned purchases through here counts nothing new.
      await countMilestones(c, purchase);
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
      for (const record of records) await countMilestones(c, await billing(c).recordPurchase(record));
      forgetAccess(c, uid);
      return ok(c, { ...(await planPayload(c, await householdRow(c))), restored: records.length });
    });

    /*
     * ── stores calling us ──────────────────────────────────────────────────
     * Unauthenticated. The SDK treats a notification as a trigger and
     * re-reads the purchase from the store with our own credentials, so a
     * forged body changes nothing; it is deduplicated on the store's id.
     * The refreshed purchase is where a trial converting to paid, or a
     * subscription ending, is noticed.
     */

    app.post('/billing/apple/notifications', async (c) => {
      const store = appleStore(c);
      if (!store) return c.json({ ok: false }, 503);
      const body = await jsonBody(c);
      const signedPayload = typeof body?.signedPayload === 'string' ? body.signedPayload : '';
      if (!signedPayload) return c.json({ ok: false }, 400);
      const result = await handleAppleNotification({ billing: billing(c), apple: store, signedPayload });
      if (result.purchase) await countMilestones(c, result.purchase);
      else if (result.reason === 'unknown_purchase') console.warn('apple notification for a chain no account has verified yet:', result.notificationType);
      return c.json({ ok: true });
    });

    app.post('/billing/google/notifications', async (c) => {
      const store = googleStore(c);
      if (!store) return c.json({ ok: false }, 503);
      const body = await jsonBody(c);
      const result = await handleGoogleNotification({ billing: billing(c), google: store, body: (body ?? {}) as Record<string, unknown> });
      if (result.purchase) await countMilestones(c, result.purchase);
      else if (result.reason === 'unknown_purchase') console.warn('play notification for a token no account has verified yet:', result.notificationType);
      return c.json({ ok: true });
    });
  },
});

function storeUnconfigured(c: Context, platform: 'apple' | 'google') {
  return fail(c, 'STORE_UNCONFIGURED', `Subscriptions are not available in this build (${platform} is not configured).`, 503);
}
