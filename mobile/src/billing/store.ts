import { Platform } from 'react-native';
import type { Purchase, PurchaseIOS, PurchaseAndroid } from 'react-native-iap';
import { api } from '../api/client';
import type { Plan } from '../types';
import { IS_EXPO_GO, PRODUCT_IDS, TRIAL_DAYS } from '../config';
import { purchaseCompleted, purchaseEnded, purchaseStarted, trialStarted } from '../lib/analytics';

/**
 * react-native-iap is loaded LAZILY, and that is not an optimisation.
 *
 * The module reaches for the native bridge at import time. A plain
 * `import * as IAP` therefore throws `__fbBatchedBridgeConfig is not set`
 * anywhere the native side is absent — the web build, and Expo Go — and it
 * throws while the module graph is being evaluated, so it takes down the
 * whole route rather than the one call that needed a store. The paywall then
 * renders as a blank screen with no error anybody can see.
 *
 * Behind `await import()` the failure lands where it belongs: inside
 * `isAvailable()`, which already answers false for "there is no store here",
 * and which every caller already handles.
 */
type IapModule = typeof import('react-native-iap');

let iapPromise: Promise<IapModule | null> | undefined;

function loadIap(): Promise<IapModule | null> {
  // Not even attempted in Expo Go. The import cannot succeed there, and the
  // attempt paints a red error screen over the paywall on its way to being
  // caught. See IS_EXPO_GO in config.ts.
  if (IS_EXPO_GO) return Promise.resolve(null);
  // Cached as the PROMISE, not the module: two callers racing on first launch
  // would otherwise both start an import, and on a slow device that is two
  // evaluations of a large native module.
  iapPromise ??= import('react-native-iap').then(
    (module) => module,
    () => null,
  );
  return iapPromise;
}

/**
 * Buying Duebox Pro.
 *
 * ## The division of labour, and why it is not negotiable
 *
 *   - the **device** completes the purchase and gets back a transaction id
 *     (iOS) or a purchase token (Android);
 *   - the **server** decides whether it is real and what it grants.
 *
 * Nothing here writes an entitlement. `POST /billing/verify` returns the new
 * plan and that return value is the only thing the app believes. An app that
 * unlocks on the store callback alone unlocks for anybody who can fake one.
 *
 * ## The library's API is event-based, and this module is not
 *
 * react-native-iap v16 is OpenIAP: `requestPurchase()` returns nothing useful
 * and the result arrives later on `purchaseUpdatedListener`. That is a fine
 * shape for an app that buys things from many screens and a bad one for a
 * paywall with a single button, so `purchase()` bridges it back into a promise
 * — listeners attached BEFORE the request, both resolved and torn down once,
 * and a timeout so a store that never answers fails visibly instead of leaving
 * a spinner running for the rest of the session.
 *
 * ## None of this runs in Expo Go
 *
 * StoreKit and Play Billing are native. In Expo Go `initConnection` throws, so
 * `isAvailable()` answers honestly and the paywall says so rather than
 * offering a button that cannot work.
 */

export { PRODUCT_IDS };

export type PlanPeriod = 'monthly' | 'yearly';

/** One purchasable plan, with the store's own localised price string. */
export interface StorePlan {
  productId: string;
  period: PlanPeriod;
  /** Exactly as the store formats it — "$9.99", "৳499". Never re-formatted. */
  price: string;
  title: string;
  /** The store's own number and currency, for per-month framing only. */
  amount: number | null;
  currency: string | null;
  /**
   * The store's free intro offer on this product, when there is one AND this
   * store account may still take it (Apple: isEligibleForIntroOfferIOS; Play
   * only lists offers the account is eligible for). Null = no free trial:
   * the paywall must not say "free".
   */
  trial: { days: number } | null;
  /** Play: the offer to buy — the trial offer when there is one, else the base plan. */
  offerToken: string | null;
}

/** The person dismissed the store sheet. Not an error. */
export class PurchaseCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'PurchaseCancelled';
  }
}

let connected = false;

/**
 * Open the store connection, once.
 *
 * Returns false rather than throwing when there is no store — Expo Go, a
 * simulator without a sandbox account, a device missing Play Services. Every
 * caller has a sensible thing to do with false and nothing sensible to do with
 * an exception.
 */
/**
 * Harness only (web build, never a phone): `localStorage['duebox.harnessStore']
 * = '1'` makes the store answer with sample prices so the paywall and the
 * welcome offer can be screenshotted and tapped through. Purchases still fail.
 */
function harnessStore(): boolean {
  if (Platform.OS !== 'web') return false;
  try {
    return globalThis.localStorage?.getItem('duebox.harnessStore') === '1';
  } catch {
    return false;
  }
}

const HARNESS_PRICES: Record<string, { price: string; amount: number }> = {
  [PRODUCT_IDS.monthly]: { price: '$7.99', amount: 7.99 },
  [PRODUCT_IDS.yearly]: { price: '$39.99', amount: 39.99 },
};

export async function isAvailable(): Promise<boolean> {
  if (harnessStore()) return true;
  if (connected) return true;
  const IAP = await loadIap();
  if (!IAP) return false;
  try {
    await IAP.initConnection();
    connected = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * The plans this store will sell, priced by the store itself.
 *
 * **Prices always come from here, never from the server.** They are localised
 * per storefront and change with currency and region; a price rendered from a
 * server constant is the wrong number for most of the world and a store
 * rejection for the rest.
 */
export async function loadPlans(): Promise<StorePlan[]> {
  const ids = PRODUCT_IDS;
  if (harnessStore()) {
    return (['yearly', 'monthly'] as const).map((period) => ({
      productId: ids[period],
      period,
      price: HARNESS_PRICES[ids[period]]!.price,
      title: period === 'yearly' ? 'Yearly' : 'Monthly',
      amount: HARNESS_PRICES[ids[period]]!.amount,
      currency: 'USD',
      trial: period === 'yearly' ? { days: TRIAL_DAYS } : null,
      offerToken: null,
    }));
  }
  if (!(await isAvailable())) return [];
  const IAP = await loadIap();
  if (!IAP) return [];

  const wanted: Array<{ productId: string; period: PlanPeriod }> = [
    { productId: ids.yearly, period: 'yearly' },
    { productId: ids.monthly, period: 'monthly' },
  ];

  const found = await IAP.fetchProducts({
    skus: wanted.map((entry) => entry.productId),
    type: 'subs',
  }).catch(() => null);

  const products = found ?? [];

  // Apple answers eligibility per subscription GROUP, once for both products.
  let iosEligible = true;
  const group = products.map((p) => (p as { subscriptionGroupIdIOS?: string | null }).subscriptionGroupIdIOS).find(Boolean);
  if (Platform.OS === 'ios' && group) {
    iosEligible = await IAP.isEligibleForIntroOfferIOS(group).catch(() => false);
  }

  const plans = await Promise.all(wanted.map(async (entry) => {
    const product = products.find((candidate) => candidate?.id === entry.productId);
    // A product the store does not return is one that is not configured, not
    // approved yet, or not available in this storefront. Dropping it shows a
    // paywall with one plan instead of one with a blank price.
    if (!product) return [];
    const offers = readOffers(product);
    const trial = Platform.OS === 'ios' ? (iosEligible ? offers.trial : null) : offers.trial;
    return [
      {
        productId: entry.productId,
        period: entry.period,
        price: product.displayPrice ?? '',
        title: product.title ?? (entry.period === 'yearly' ? 'Yearly' : 'Monthly'),
        amount: typeof (product as { price?: unknown }).price === 'number' ? (product as { price: number }).price : null,
        currency: typeof (product as { currency?: unknown }).currency === 'string' ? (product as { currency: string }).currency : null,
        trial: trial ? { days: trial.days } : null,
        offerToken: (trial?.offerToken ?? offers.baseOfferToken) || null,
      },
    ];
  }));
  return plans.flat();
}

type Offer = {
  paymentMode?: string | null;
  type?: string | null;
  period?: { unit?: string; value?: number } | null;
  periodCount?: number | null;
  offerTokenAndroid?: string | null;
  basePlanIdAndroid?: string | null;
  id?: string;
  pricingPhasesAndroid?: { pricingPhaseList?: { priceAmountMicros?: string; billingPeriod?: string; billingCycleCount?: number }[] } | null;
};

const DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };

/** ISO 8601 "P3D" / "P1W" / "P1M" → days. */
function isoDays(iso: string | undefined): number | null {
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(iso ?? '');
  if (!m) return null;
  const [, y, mo, w, d] = m.map((v) => Number(v ?? 0));
  return (y ?? 0) * 365 + (mo ?? 0) * 30 + (w ?? 0) * 7 + (d ?? 0) || null;
}

/**
 * The free-trial offer on a store product, and (Play) the base plan's token.
 * Play lists the base plan and each offer with its own token; the trial is
 * the one whose first pricing phase is free. Apple carries one introductory
 * offer, with paymentMode 'free-trial'.
 */
function readOffers(product: unknown): { trial: { days: number; offerToken: string | null } | null; baseOfferToken: string | null } {
  const offers = (((product as { subscriptionOffers?: Offer[] | null }).subscriptionOffers ?? []) as Offer[]).filter(Boolean);
  let trial: { days: number; offerToken: string | null } | null = null;
  let baseOfferToken: string | null = null;

  for (const offer of offers) {
    const phases = offer.pricingPhasesAndroid?.pricingPhaseList ?? [];
    const freeFirst = phases.length > 1 && phases[0]?.priceAmountMicros === '0';
    if (offer.paymentMode === 'free-trial' || freeFirst) {
      const fromPhase = freeFirst ? isoDays(phases[0]?.billingPeriod) : null;
      const unit = offer.period?.unit ?? '';
      const fromPeriod = offer.period ? (DAYS[unit] ?? 0) * (offer.period.value ?? 1) * (offer.periodCount ?? 1) : null;
      trial ??= { days: fromPhase ?? fromPeriod ?? TRIAL_DAYS, offerToken: offer.offerTokenAndroid ?? null };
    } else if (offer.offerTokenAndroid && phases.length <= 1) {
      baseOfferToken ??= offer.offerTokenAndroid;
    }
  }

  // Older StoreKit shape: the intro offer only as flat fields on the product.
  if (!trial && (product as { introductoryPricePaymentModeIOS?: string }).introductoryPricePaymentModeIOS === 'free-trial') {
    const unit = (product as { introductoryPriceSubscriptionPeriodIOS?: string }).introductoryPriceSubscriptionPeriodIOS ?? 'day';
    const count = Number((product as { introductoryPriceNumberOfPeriodsIOS?: string }).introductoryPriceNumberOfPeriodsIOS ?? 1) || 1;
    trial = { days: (DAYS[unit] ?? 1) * count, offerToken: null };
  }
  return { trial, baseOfferToken };
}

/** How long to wait for the store before calling it a failure. */
const PURCHASE_TIMEOUT_MS = 120_000;

/**
 * Buy one, and return the plan the server granted for it.
 *
 * `finishTransaction` runs only AFTER the server has answered. Finishing first
 * tells the store the purchase is handled while this app has not recorded it —
 * and iOS then stops redelivering the transaction, so a failure at exactly
 * that moment loses the purchase permanently.
 */
/**
 * Who is buying, told to the store so the purchase is tied to this account
 * even if the app dies before /billing/verify answers: Apple's appAccountToken
 * (must be a UUID) and Play's obfuscatedAccountId.
 */
export interface PurchaseFor {
  accountId: string | null;
  /** Play: the offer to buy (StorePlan.offerToken) — the trial offer on yearly. */
  offerToken?: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function purchase(productId: string, buyer: PurchaseFor = { accountId: null }): Promise<Plan> {
  if (!(await isAvailable())) {
    throw new Error('Purchases are not available in this build.');
  }
  const IAP = await loadIap();
  if (!IAP) throw new Error('Purchases are not available in this build.');

  purchaseStarted(productId);
  const result = await new Promise<Purchase>((resolve, reject) => {
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      updated.remove();
      failed.remove();
      fn();
    };

    // Attached BEFORE the request. A store that answers instantly — a cached
    // sandbox purchase does — would otherwise emit before anything is
    // listening, and the promise would hang on a purchase that worked.
    const updated = IAP.purchaseUpdatedListener((event) => {
      if (event.productId !== productId) return;
      finish(() => resolve(event));
    });

    const failed = IAP.purchaseErrorListener((error) => {
      finish(() =>
        reject(
          error?.code === IAP.ErrorCode.UserCancelled
            ? new PurchaseCancelled()
            : new Error(error?.message ?? 'The purchase did not complete.'),
        ),
      );
    });

    const timer = setTimeout(() => {
      finish(() => reject(new Error('The store did not respond. Try again.')));
    }, PURCHASE_TIMEOUT_MS);

    const account = buyer.accountId ?? null;
    IAP.requestPurchase({
      type: 'subs',
      request: {
        apple: { sku: productId, ...(account && UUID.test(account) ? { appAccountToken: account.toLowerCase() } : {}) },
        google: {
          skus: [productId],
          ...(buyer.offerToken ? { subscriptionOffers: [{ sku: productId, offerToken: buyer.offerToken }] } : {}),
          ...(account ? { obfuscatedAccountId: account.slice(0, 64) } : {}),
        },
      },
    }).catch((failure: unknown) => {
      finish(() =>
        reject(
          (failure as { code?: string })?.code === IAP.ErrorCode.UserCancelled
            ? new PurchaseCancelled()
            : failure,
        ),
      );
    });
  }).catch((failure: unknown) => {
    purchaseEnded(productId, failure instanceof PurchaseCancelled);
    throw failure;
  });

  const plan = await verify(result);
  await IAP.finishTransaction({ purchase: result, isConsumable: false }).catch(() => undefined);
  const period = productId === PRODUCT_IDS.yearly ? 'yearly' : 'monthly';
  // The chain the server keys its milestones on: Apple's original transaction, Play's token.
  const chain =
    Platform.OS === 'ios'
      ? `apple:${(result as PurchaseIOS).originalTransactionIdentifierIOS ?? (result as PurchaseIOS).transactionId ?? result.id}`
      : `google:${(result as PurchaseAndroid).purchaseToken ?? result.id}`;
  if (plan.isTrial) trialStarted(plan.trialDays, chain);
  else purchaseCompleted(productId, period, chain);
  return plan;
}

/**
 * Hand one purchase to the server and take back the plan it grants.
 * `restore` marks a Play replay, so the server does not count it as a new sale.
 */
async function verify(result: Purchase, restore = false): Promise<Plan> {
  if (Platform.OS === 'ios') {
    const ios = result as PurchaseIOS;
    return api.post<Plan>('/billing/verify', {
      platform: 'apple',
      transactionId: ios.transactionId ?? ios.id,
      ...(restore ? { restore: true } : {}),
    });
  }
  const android = result as PurchaseAndroid;
  return api.post<Plan>('/billing/verify', {
    platform: 'google',
    productId: android.productId,
    purchaseToken: android.purchaseToken,
    ...(restore ? { restore: true } : {}),
  });
}

/**
 * Restore. Apple requires this button on any paywall it reviews.
 *
 * The two stores need different work. Apple can answer for the whole customer
 * from any one chain id, so the newest owned purchase is enough. Play has no
 * such call, so every owned purchase is replayed through `/verify` — which is
 * idempotent on the chain id, so replaying costs nothing.
 *
 * `null` means "nothing to restore", which is a normal answer and not a
 * failure: it is what somebody who never subscribed will get.
 */
export async function restore(): Promise<Plan | null> {
  if (!(await isAvailable())) return null;
  const IAP = await loadIap();
  if (!IAP) return null;

  const owned = await IAP.getAvailablePurchases().catch(() => []);
  const list = owned ?? [];
  if (list.length === 0) return null;

  if (Platform.OS === 'ios') {
    const newest = list[list.length - 1] as PurchaseIOS | undefined;
    if (!newest) return null;
    const chain = newest.originalTransactionIdentifierIOS ?? newest.transactionId ?? newest.id;
    if (!chain) return null;
    return api.post<Plan>('/billing/restore', { originalTransactionId: chain });
  }

  let plan: Plan | null = null;
  for (const owned of list) {
    plan = await verify(owned, true).catch(() => plan);
  }
  return plan;
}

/** Close the connection. Called when the paywall unmounts. */
export async function disconnect(): Promise<void> {
  if (!connected) return;
  connected = false;
  const IAP = await loadIap();
  await IAP?.endConnection().catch(() => undefined);
}
