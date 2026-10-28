import type { Context } from 'hono';
import { AppleStore, GoogleStore } from '@xenition/sdk';
import type { EntitlementCheck, Purchase } from '@xenition/sdk';
import { sdk, readEnvVar, env, scoped } from './lib';
import { maxMembers, proEntitlement, productIds, proScans, trialDays } from './config';
import { todayIn } from './logic/dates';

/**
 * Duebox Pro — a hard paywall (SRS FR-B1…B5, CONTRACT §3).
 *
 * There is no free tier and no server-granted trial: a household is either
 * entitled through a store subscription verified here, or locked. The free
 * trial is the stores' own introductory offer on the yearly plan (3 days,
 * card upfront, configured in App Store Connect / Play Console), so the store
 * decides who is eligible and when the first charge lands.
 *
 * The household is the subscribed thing: access reads the **owner's**
 * entitlement, so a partner's phone gets exactly what the owner pays for.
 *
 * Three things the SDK's `check()` does not answer yet (see the SDK notes in
 * docs/HANDOFF.md), worked out here from the stored purchase:
 *   - a store free trial is still a 'purchase' to the SDK (isTrial is only
 *     its own server trial) — read from the store payload instead;
 *   - Apple billing grace keeps the purchase 'grace' but its expiry is in the
 *     past, so check() says expired — grace keeps access here;
 *   - old server-trial rows (the soft model) must not unlock anything.
 */

export const PRO = (c: Context) => proEntitlement(env(c));
/** Copy only: the length of the stores' yearly intro offer. The stores decide. */
export const TRIAL_DAYS = (c: Context) => trialDays(env(c));
export const PRODUCT_IDS = (c: Context) => productIds(env(c));

/** Apple's server API client, or null on a deployment without credentials. */
export function appleStore(c: Context): AppleStore | null {
  const keyId = readEnvVar(c, 'APPLE_KEY_ID');
  const issuerId = readEnvVar(c, 'APPLE_ISSUER_ID');
  const privateKey = readEnvVar(c, 'APPLE_PRIVATE_KEY');
  const bundleId = readEnvVar(c, 'APPLE_BUNDLE_ID');
  if (!keyId || !issuerId || !privateKey || !bundleId) return null;
  return new AppleStore({
    keyId,
    issuerId,
    // Wrangler secrets cannot hold newlines; the PEM is stored with `\n` escaped.
    privateKey: privateKey.replace(/\\n/g, '\n'),
    bundleId,
    // `auto`: TestFlight and App Review purchases exist only in sandbox, and
    // App Review buys against THIS production server — sandbox must unlock.
    environment: 'auto',
  });
}

export function googleStore(c: Context): GoogleStore | null {
  const packageName = readEnvVar(c, 'GOOGLE_PACKAGE_NAME');
  const clientEmail = readEnvVar(c, 'GOOGLE_CLIENT_EMAIL');
  const privateKey = readEnvVar(c, 'GOOGLE_PRIVATE_KEY');
  if (!packageName || !clientEmail || !privateKey) return null;
  return new GoogleStore({ packageName, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') });
}

export function billing(c: Context) {
  return sdk(c).modules.billing;
}

/* ── reading the store purchase ───────────────────────────────────────────── */

/**
 * Is this purchase in the stores' free intro period right now?
 *   Apple: the latest transaction carries offerType 1 (introductory); a
 *          renewal after the trial is a new transaction without it.
 *   Google: the subscription was bought through an offer (the free-trial
 *          offer) and its latest order is still the first one — Play numbers
 *          every renewal order `<first>..N`.
 */
export function isStoreTrial(purchase: Purchase): boolean {
  const raw = purchase.raw ?? {};
  if (purchase.platform === 'apple') {
    const offerType = Number((raw as { offerType?: unknown }).offerType);
    const discount = String((raw as { offerDiscountType?: unknown }).offerDiscountType ?? 'FREE_TRIAL');
    return offerType === 1 && discount === 'FREE_TRIAL';
  }
  if (purchase.platform === 'google') {
    const lines = ((raw as { lineItems?: unknown }).lineItems ?? []) as { offerDetails?: { offerId?: string } }[];
    const viaOffer = lines.some((line) => Boolean(line.offerDetails?.offerId));
    const order = String((raw as { latestOrderId?: unknown }).latestOrderId ?? '');
    return viaOffer && order !== '' && !order.includes('..');
  }
  return false;
}

/** Will it renew (or, in a trial, convert)? Apple keeps it on the purchase row; Play in the line item. */
export function willRenew(purchase: Purchase): boolean {
  if (purchase.platform === 'google') {
    const lines = ((purchase.raw as { lineItems?: unknown }).lineItems ?? []) as { autoRenewingPlan?: { autoRenewEnabled?: boolean } }[];
    if (lines.length > 0) return lines.some((line) => line.autoRenewingPlan?.autoRenewEnabled === true);
  }
  return purchase.auto_renewing;
}

export type AccessStatus = 'trial' | 'active' | 'grace' | 'billing_retry' | 'expired' | 'none';

export interface Access {
  entitled: boolean;
  status: AccessStatus;
  /** The store purchase behind it, newest first; null when there never was one. */
  purchase: Purchase | null;
  check: EntitlementCheck | null;
  /** Billing could not answer: access was granted for this request (logged). */
  unknown: boolean;
}

/**
 * The owner's access, cached on the request: Home, the gate and the plan
 * payload all ask. Fails OPEN when billing cannot answer (BR-12): a platform
 * outage must not lock out someone who pays; it is logged, and the next
 * request asks again.
 */
const ACCESS = 'duebox:access';
export async function accessOf(c: Context, ownerUserId: string): Promise<Access> {
  const key = `${ACCESS}:${ownerUserId}`;
  const hit = c.get(key as never) as Access | undefined;
  if (hit !== undefined) return hit;

  let value = await readAccess(c, ownerUserId);
  // Past its date but still 'active' on our side: the renewal notification may
  // simply not have arrived. Ask the store once before locking anyone out.
  const p = value.purchase;
  if (!value.entitled && p && p.status === 'active' && p.expires_at && recentlyLapsed(p.expires_at)) {
    if (await refreshFromStore(c, p)) value = await readAccess(c, ownerUserId);
  }
  c.set(key as never, value as never);
  return value;
}

function recentlyLapsed(expiresAt: string): boolean {
  const ago = Date.now() - new Date(expiresAt).getTime();
  return ago > 0 && ago < 14 * 24 * 60 * 60 * 1000;
}

/** Re-read one purchase from its store and record the answer. False when the store cannot be asked. */
async function refreshFromStore(c: Context, purchase: Purchase): Promise<boolean> {
  try {
    if (purchase.platform === 'apple') {
      const store = appleStore(c);
      if (!store) return false;
      await billing(c).recordPurchase(await store.verify({ userId: purchase.user_id, transactionId: purchase.transaction_id }));
      return true;
    }
    if (purchase.platform === 'google') {
      const store = googleStore(c);
      if (!store) return false;
      await billing(c).recordPurchase(
        await store.verify({ userId: purchase.user_id, productId: purchase.product_id, purchaseToken: purchase.original_transaction_id, kind: 'subscription' }),
      );
      return true;
    }
  } catch (failure) {
    console.warn('store re-check failed:', failure instanceof Error ? failure.message : failure);
  }
  return false;
}

async function readAccess(c: Context, ownerUserId: string): Promise<Access> {
  let value: Access;
  try {
    const [check, purchases] = await Promise.all([
      billing(c).check(ownerUserId, PRO(c)),
      billing(c).listPurchases(ownerUserId, { limit: 20 }),
    ]);
    const ids = new Set(Object.values(PRODUCT_IDS(c)));
    const ours = purchases
      .filter((p) => ids.has(p.product_id) && p.platform !== 'stripe')
      .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
    // A live chain beats a newer dead one (a resubscribe after a lapse).
    const purchase = ours.find((p) => p.status === 'active' || p.status === 'grace') ?? ours[0] ?? null;

    // Support grants still count; the soft model's server trials do not.
    const granted = check.allowed && check.source !== 'trial';
    const grace = purchase?.status === 'grace';
    const entitled = granted || grace;

    let status: AccessStatus;
    if (grace) status = 'grace';
    else if (entitled && purchase && purchase.status === 'active' && isStoreTrial(purchase)) status = 'trial';
    else if (entitled) status = 'active';
    else if (purchase?.status === 'on_hold') status = 'billing_retry';
    else if (purchase) status = 'expired';
    else status = 'none';

    value = { entitled, status, purchase, check, unknown: false };
  } catch (failure) {
    console.error('billing access failed:', failure instanceof Error ? failure.message : failure);
    value = { entitled: true, status: 'none', purchase: null, check: null, unknown: true };
  }
  return value;
}

export function forgetAccess(c: Context, ownerUserId: string): void {
  c.set(`${ACCESS}:${ownerUserId}` as never, undefined as never);
}

/* ── the plan payload ─────────────────────────────────────────────────────── */

export interface Plan {
  /** The one field a screen branches on: false = the paywall. */
  entitled: boolean;
  status: AccessStatus;
  /** In the stores' free intro period. */
  isTrial: boolean;
  /** When the trial ends and the first charge lands (or would, if it renews). */
  trialEndsAt: string | null;
  /** Next renewal while it will renew. */
  renewsAt: string | null;
  /** When access ends if nothing renews. */
  expiresAt: string | null;
  willRenew: boolean;
  productId: string | null;
  period: 'monthly' | 'yearly' | null;
  platform: 'apple' | 'google' | null;
  /** True until this account has bought anything: may be offered the store's free trial. */
  trialEligible: boolean;
  /** Copy for the yearly intro offer when the store cannot say. */
  trialDays: number;
  limits: { scansPerMonth: number; members: number };
  usage: { openItems: number; scansThisMonth: number; month: string };
}

export function periodOf(c: Context, productId: string | null): 'monthly' | 'yearly' | null {
  if (!productId) return null;
  const ids = PRODUCT_IDS(c);
  if (productId === ids.yearly) return 'yearly';
  if (productId === ids.monthly) return 'monthly';
  return null;
}

/** The household's plan with live usage — `GET /billing/plan`, `Me.plan`, `Home.plan`. */
export async function planPayload(c: Context, household: { id: string; owner_user_id: string; timezone: string }): Promise<Plan> {
  const access = await accessOf(c, household.owner_user_id);
  const month = todayIn(household.timezone).slice(0, 7);
  const db = scoped(c);
  const open = await db.from('dx__item').where('household_id', household.id).where('status', 'open').whereNull('deleted_at').count();
  const usage = await db.from('dx__usage').where('household_id', household.id).where('month', month).first<{ scans: number | string }>();

  const p = access.purchase;
  const renews = p ? willRenew(p) : false;
  const expiresAt = p?.expires_at ?? access.check?.expiresAt ?? null;
  const read = env(c);
  return {
    entitled: access.entitled,
    status: access.status,
    isTrial: access.status === 'trial',
    trialEndsAt: access.status === 'trial' ? expiresAt : null,
    renewsAt: access.entitled && renews && access.status !== 'trial' ? expiresAt : null,
    expiresAt,
    willRenew: renews,
    productId: p?.product_id ?? null,
    period: periodOf(c, p?.product_id ?? null),
    platform: p && (p.platform === 'apple' || p.platform === 'google') ? p.platform : null,
    trialEligible: !access.unknown && p === null,
    trialDays: TRIAL_DAYS(c),
    limits: { scansPerMonth: proScans(read), members: maxMembers(read) },
    usage: { openItems: Number(open), scansThisMonth: Number(usage?.scans ?? 0), month },
  };
}
