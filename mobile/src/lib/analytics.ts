import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { api } from '../api/client';
import { META_ENABLED } from '../config';
import { initMeta, logMetaEvent, logMetaPurchase, metaAnonymousId, requestMetaTracking, type TrackingStatus } from './meta';
import { capture, identify, initPosthog, reset, screen } from './posthog';

/**
 * Product analytics (PostHog) and Meta ads measurement — the ONE entry point.
 *
 *   1. **Never throws.** Measurement must never break sign-up, a purchase or a save.
 *   2. **PostHog is on; Meta is a no-op until configured.** PostHog is the
 *      shared fleet project (`lib/posthog.ts`, off on the web). With
 *      `EXPO_PUBLIC_META_APP_ID` / `EXPO_PUBLIC_META_CLIENT_TOKEN` empty (the
 *      shipped default) nothing goes to Meta. See `app.config.ts`.
 *   3. **No personal data.** Parameters carry counts, flags and product ids —
 *      never a name, an email, a deadline title or anything read from a letter.
 *      PostHog knows a person by account id only.
 *
 * | Function              | PostHog event                  | Meta event                         | Where |
 * |-----------------------|--------------------------------|------------------------------------|-------|
 * | appOpened             | (SDK: Application Opened)      | (SDK auto: fb_mobile_activate_app) | root layout |
 * | screenViewed          | $screen (route pattern)        | —                                  | root layout |
 * | identifyUser          | identify (account id)          | —                                  | root layout, once signed in |
 * | resetUser             | reset                          | —                                  | sign-out |
 * | onboardingStarted     | onboarding_started             | onboarding_started                 | discovery pitch mounts |
 * | onboardingCompleted   | onboarding_completed           | fb_mobile_tutorial_completion      | pitch → Get started / Skip |
 * | registrationCompleted | signed_up                      | fb_mobile_complete_registration    | sign-up / first social sign-in |
 * | signedIn              | signed_in                      | —                                  | sign-in, returning social sign-in |
 * | setupCompleted        | setup_completed                | setup_completed                    | two-tap setup done |
 * | trialStarted          | — (server: trial_started)      | StartTrial                         | setup started the 7-day trial |
 * | offerViewed           | offer_viewed                   | offer_viewed                       | welcome offer opens |
 * | coreActionCompleted   | deadline_saved (every save)    | —                                  | scan confirmed / manual save |
 * |                       | core_action_completed (once)   | core_action_completed              | FIRST deadline saved on this install |
 * | paywallViewed         | paywall_viewed                 | paywall_viewed                     | paywall, non-subscriber |
 * | purchaseStarted       | purchase_started               | —                                  | the store sheet opens |
 * | purchaseEnded         | purchase_cancelled / _failed   | —                                  | the store sheet closes without buying |
 * | purchaseCompleted     | — (server: purchase_completed) | Subscribe + fb_mobile_purchase     | after /billing/verify |
 * | reviewPrompt          | review_prompt_*                | review_prompt_*                    | the review sheet |
 *
 * Whether a trial or a purchase is real is only known on the server, so
 * PostHog gets those from there (`backend/src/posthog.ts`), never from here.
 *
 * `StartTrial` and `Subscribe` are ALSO sent by the server (Conversions API,
 * `backend/src/meta.ts`), deduplicated by event id, so they stay attributable
 * on iOS when the person declines tracking.
 */

const KEYS = {
  firstDeadline: 'duebox.analytics.firstDeadline',
  attStatus: 'duebox.analytics.attStatus',
  attributionSentFor: 'duebox.analytics.attributionSentFor',
} as const;

const reportedPurchases = new Set<string>();

function safe(run: () => void | Promise<void>): void {
  try {
    const result = run();
    if (result && typeof (result as Promise<void>).catch === 'function') (result as Promise<void>).catch(() => undefined);
  } catch {
    // measurement only
  }
}

export function appOpened(): void {
  safe(() => initPosthog());
  safe(() => {
    if (META_ENABLED) initMeta();
  });
}

/** Route pattern only ("item/[id]"), never the id. */
export function screenViewed(name: string): void {
  safe(() => screen(name));
}

/** The signed-in account, by id. The server sends its events under the same id. */
export function identifyUser(userId: string): void {
  safe(() => identify(userId));
}

/** Signed out: the next person on this phone starts fresh. */
export function resetUser(): void {
  safe(() => reset());
}

/** The iOS tracking prompt — after the pitch, never on a cold first frame or over a form. */
export async function requestTracking(): Promise<TrackingStatus> {
  if (!META_ENABLED) return 'unavailable';
  try {
    const status = await requestMetaTracking();
    await AsyncStorage.setItem(KEYS.attStatus, status).catch(() => undefined);
    return status;
  } catch {
    return 'unavailable';
  }
}

export function onboardingStarted(): void {
  safe(() => capture('onboarding_started'));
  safe(() => logMetaEvent('onboarding_started'));
}

export function onboardingCompleted(slidesSeen: number): void {
  safe(() => capture('onboarding_completed', { slides_seen: slidesSeen }));
  safe(() => logMetaEvent('fb_mobile_tutorial_completion', { fb_success: 1, slides_seen: slidesSeen }));
}

export function registrationCompleted(method: 'email' | 'apple' | 'google'): void {
  safe(() => capture('signed_up', { method }));
  safe(() => logMetaEvent('fb_mobile_complete_registration', { fb_registration_method: method }));
}

export function signedIn(method: 'email' | 'apple' | 'google'): void {
  safe(() => capture('signed_in', { method }));
}

export function setupCompleted(focusCount: number, remindHour: number): void {
  safe(() => capture('setup_completed', { focus_count: focusCount, remind_hour: remindHour }));
  safe(() => logMetaEvent('setup_completed', { focus_count: focusCount, remind_hour: remindHour }));
}

/** `eventId` matches the server's Conversions API copy (`trial-<userId>`). */
export function trialStarted(trialDays: number, userId: string | null | undefined): void {
  safe(() =>
    logMetaEvent('StartTrial', {
      trial_days: trialDays,
      fb_currency: 'USD',
      _valueToSum: 0,
      ...(userId ? { _eventId: `trial-${userId}` } : {}),
    }),
  );
}

export function offerViewed(hasDiscount: boolean): void {
  safe(() => capture('offer_viewed', { discount: hasDiscount }));
  safe(() => logMetaEvent('offer_viewed', { discount: hasDiscount ? 1 : 0 }));
}

/**
 * A deadline saved (every time), then — the first time on this install —
 * `core_action_completed`, the "got to real use" signal ads optimise towards.
 * Someone who saves forty deadlines is one person who got what they came for.
 */
export function coreActionCompleted(source: 'scan' | 'manual'): void {
  safe(() => capture('deadline_saved', { source }));
  safe(async () => {
    if (await AsyncStorage.getItem(KEYS.firstDeadline).catch(() => null)) return;
    await AsyncStorage.setItem(KEYS.firstDeadline, String(Date.now())).catch(() => undefined);
    capture('core_action_completed', { action: 'deadline_saved', source });
    logMetaEvent('core_action_completed', { action: 'deadline_saved', source });
  });
}

export function paywallViewed(reason: string): void {
  safe(() => capture('paywall_viewed', { reason }));
  safe(() => logMetaEvent('paywall_viewed', { reason }));
}

/**
 * A verified purchase. The value is a list-price estimate — the authoritative
 * revenue event is the server's. `eventId` is the store transaction id, the
 * same key the server uses, so Meta counts one purchase.
 */
export function purchaseCompleted(productId: string, period: 'monthly' | 'yearly', eventId: string): void {
  safe(() => {
    if (reportedPurchases.has(productId)) return;
    reportedPurchases.add(productId);
    const valueEstimate = period === 'yearly' ? 34.99 : 4.99;
    logMetaEvent('Subscribe', { fb_content_id: productId, fb_currency: 'USD', _valueToSum: valueEstimate, _eventId: eventId });
    logMetaPurchase(valueEstimate, 'USD', { fb_content_id: productId });
  });
}

/** The store sheet opens. Whether it became a real purchase is the server's purchase_completed. */
export function purchaseStarted(productId: string): void {
  safe(() => capture('purchase_started', { product_id: productId }));
}

/** The store sheet closed without a purchase: the person backed out, or the store failed. */
export function purchaseEnded(productId: string, cancelled: boolean): void {
  safe(() => capture(cancelled ? 'purchase_cancelled' : 'purchase_failed', { product_id: productId }));
}

export function reviewPrompt(event: 'shown' | 'rate' | 'later', trigger: string): void {
  safe(() => capture(`review_prompt_${event}`, { trigger }));
  safe(() => logMetaEvent(`review_prompt_${event}`, { trigger }));
}

/**
 * Tell the backend which Meta install this account is, so the server-side
 * Conversions API can attribute the trial and the purchase. Once per user per
 * install (and again if the ATT answer changes). Device context only.
 */
export function sendAttribution(userId: string | null | undefined): void {
  safe(async () => {
    if (!META_ENABLED || !userId) return;
    const anonId = await metaAnonymousId();
    if (!anonId) return;
    const attStatus = (await AsyncStorage.getItem(KEYS.attStatus).catch(() => null)) ?? 'undetermined';
    const fingerprint = `${userId}:${anonId}:${attStatus}`;
    if ((await AsyncStorage.getItem(KEYS.attributionSentFor).catch(() => null)) === fingerprint) return;
    const constants = Platform.constants as { Model?: string } | undefined;
    await api.patch('/auth/me/attribution', {
      fbAnonId: anonId,
      attStatus,
      installPlatform: Platform.OS,
      appVersion: Constants.expoConfig?.version ?? null,
      osVersion: String(Platform.Version ?? ''),
      deviceModel: constants?.Model ?? null,
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
    });
    await AsyncStorage.setItem(KEYS.attributionSentFor, fingerprint).catch(() => undefined);
  });
}
