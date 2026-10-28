import type { Context } from 'hono';
import type { Purchase } from '@xenition/sdk';
import { isStoreTrial, periodOf, TRIAL_DAYS } from './billing';
import { netValueFor, trackServerEvent } from './meta';
import { capturePosthog } from './posthog';
import { rawRows } from './services';

/**
 * A store subscription's milestones, each counted ONCE per chain (Apple
 * originalTransactionId / Play purchase token), however often the app
 * re-verifies or the store re-sends a notification:
 *
 *   trial      the yearly free trial started            Meta StartTrial (0) · trial_started
 *   converted  that trial's first charge went through   Meta Subscribe       · purchase_completed {type: trial_conversion}
 *   paid       a subscription that never had a trial    Meta Subscribe       · purchase_completed {type: subscription}
 *   ended      the chain stopped (lapsed, refunded)     —                    · subscription_ended {was_trial}
 *
 * Renewals after the first charge are not milestones. Called after
 * /billing/verify, /billing/restore and every store notification.
 * Never throws: measurement must not fail a purchase.
 */
export async function countMilestones(c: Context, purchase: Purchase): Promise<void> {
  try {
    const chain = `${purchase.platform}:${purchase.original_transaction_id}`;
    const user = purchase.user_id;
    const base = {
      product_id: purchase.product_id,
      period: periodOf(c, purchase.product_id),
      platform: purchase.platform,
      sandbox: purchase.environment === 'sandbox',
    };
    const live = purchase.status === 'active' || purchase.status === 'grace';

    if (live && isStoreTrial(purchase)) {
      if (await markOnce(c, chain, 'trial', user)) {
        trackServerEvent(c, { userId: user, eventName: 'StartTrial', eventId: `trial-${chain}`, value: 0, currency: 'USD' });
        capturePosthog(c, 'trial_started', user, { ...base, trial_days: TRIAL_DAYS(c) });
      }
      return;
    }

    if (live) {
      const net = netValueFor(c, purchase.product_id);
      const hadTrial = await hasMark(c, chain, 'trial');
      const mark = hadTrial ? 'converted' : 'paid';
      if (await markOnce(c, chain, mark, user)) {
        trackServerEvent(c, { userId: user, eventName: 'Subscribe', eventId: `${mark}-${chain}`, value: net.value, currency: net.currency });
        capturePosthog(c, 'purchase_completed', user, {
          ...base,
          type: hadTrial ? 'trial_conversion' : 'subscription',
          value: net.value,
          currency: net.currency,
        });
      }
      return;
    }

    if (purchase.status === 'expired' || purchase.status === 'refunded' || purchase.status === 'revoked') {
      if (await markOnce(c, chain, 'ended', user)) {
        const wasTrial = (await hasMark(c, chain, 'trial')) && !(await hasMark(c, chain, 'converted'));
        capturePosthog(c, 'subscription_ended', user, { ...base, reason: purchase.status, was_trial: wasTrial });
      }
    }
  } catch (failure) {
    console.warn('milestones failed:', failure instanceof Error ? failure.message : failure);
  }
}

/** True the first time only. */
async function markOnce(c: Context, chain: string, mark: string, userId: string): Promise<boolean> {
  const rows = await rawRows<{ chain: string }>(
    c,
    `INSERT INTO dx__subscription_mark (chain, mark, user_id) VALUES ($1, $2, $3) ON CONFLICT (chain, mark) DO NOTHING RETURNING chain`,
    [chain, mark, userId],
  );
  return rows.length > 0;
}

async function hasMark(c: Context, chain: string, mark: string): Promise<boolean> {
  const rows = await rawRows<{ chain: string }>(c, `SELECT chain FROM dx__subscription_mark WHERE chain = $1 AND mark = $2`, [chain, mark]);
  return rows.length > 0;
}
