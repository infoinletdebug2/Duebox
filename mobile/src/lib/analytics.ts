import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { api } from '../api/client';
import { META_ENABLED } from '../config';
import { initMeta, logMetaEvent, logMetaPurchase, metaAnonymousId, requestMetaTracking, type TrackingStatus } from './meta';

/**
 * Product analytics and Meta ads measurement — the ONE entry point.
 *
 *   1. **Never throws.** Measurement must never break sign-up, a purchase or a save.
 *   2. **No-op until configured.** With `EXPO_PUBLIC_META_APP_ID` /
 *      `EXPO_PUBLIC_META_CLIENT_TOKEN` empty (the shipped default) nothing
 *      leaves the phone. See `app.config.ts`.
 *   3. **No personal data.** Parameters carry counts, flags and product ids —
 *      never a name, an email, a deadline title or anything read from a letter.
 *
 * | Function              | Meta event                         | Where |
 * |-----------------------|------------------------------------|-------|
 * | appOpened             | (SDK auto: fb_mobile_activate_app) | root layout |
 * | onboardingStarted     | onboarding_started                 | discovery pitch mounts |
 * | onboardingCompleted   | fb_mobile_tutorial_completion      | pitch → Get started / Skip |
 * | registrationCompleted | fb_mobile_complete_registration    | sign-up / first social sign-in |
 * | setupCompleted        | setup_completed                    | two-tap setup done |
 * | trialStarted          | StartTrial                         | setup started the 7-day trial |
 * | offerViewed           | offer_viewed                       | welcome offer opens |
 * | coreActionCompleted   | core_action_completed              | FIRST deadline saved (once per install) |
 * | paywallViewed         | paywall_viewed                     | paywall, non-subscriber |
 * | purchaseCompleted     | Subscribe + fb_mobile_purchase     | after /billing/verify |
 * | reviewPrompt          | review_prompt_*                    | the review sheet |
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
  safe(() => {
    if (META_ENABLED) initMeta();
  });
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
  safe(() => logMetaEvent('onboarding_started'));
}

export function onboardingCompleted(slidesSeen: number): void {
  safe(() => logMetaEvent('fb_mobile_tutorial_completion', { fb_success: 1, slides_seen: slidesSeen }));
}

export function registrationCompleted(method: 'email' | 'apple' | 'google'): void {
  safe(() => logMetaEvent('fb_mobile_complete_registration', { fb_registration_method: method }));
}

export function setupCompleted(focusCount: number, remindHour: number): void {
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
  safe(() => logMetaEvent('offer_viewed', { discount: hasDiscount ? 1 : 0 }));
}

/** The first deadline saved — the "got to real use" signal. Once per install. */
export function coreActionCompleted(source: 'scan' | 'manual'): void {
  safe(async () => {
    if (!META_ENABLED) return;
    if (await AsyncStorage.getItem(KEYS.firstDeadline).catch(() => null)) return;
    await AsyncStorage.setItem(KEYS.firstDeadline, String(Date.now())).catch(() => undefined);
    logMetaEvent('core_action_completed', { action: 'deadline_saved', source });
  });
}

export function paywallViewed(reason: string): void {
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

export function reviewPrompt(event: 'shown' | 'rate' | 'later', trigger: string): void {
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
