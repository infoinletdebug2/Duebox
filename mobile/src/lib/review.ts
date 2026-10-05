import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { ANDROID_PACKAGE, APPLE_APP_ID } from '../config';

/**
 * Asking for a review (store-readiness.md). The OS prompt has a hidden quota,
 * so it is a consumable: never after sign-up, never on launch or after an
 * error. Only after a SUCCESS (an item marked done), only after three of
 * them, only 3+ days after first use, and only once, ever.
 */

const COUNT_KEY = 'duebox.review.successes';
const FIRST_KEY = 'duebox.review.firstUse';
const ASKED_KEY = 'duebox.review.asked';
const NEEDED = 3;
const MIN_DAYS = 3;

export async function noteFirstUse(): Promise<void> {
  const first = await AsyncStorage.getItem(FIRST_KEY).catch(() => null);
  if (!first) await AsyncStorage.setItem(FIRST_KEY, String(Date.now())).catch(() => undefined);
}

export async function maybeAskForReview(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if ((await AsyncStorage.getItem(ASKED_KEY)) === '1') return;
    const count = Number((await AsyncStorage.getItem(COUNT_KEY)) ?? '0') + 1;
    await AsyncStorage.setItem(COUNT_KEY, String(count));
    const first = Number((await AsyncStorage.getItem(FIRST_KEY)) ?? Date.now());
    const days = (Date.now() - first) / 86_400_000;
    if (count < NEEDED || days < MIN_DAYS) return;
    if (!(await StoreReview.isAvailableAsync())) return;
    await AsyncStorage.setItem(ASKED_KEY, '1');
    // After the confirmation toast, never instead of it.
    setTimeout(() => void StoreReview.requestReview().catch(() => undefined), 1800);
  } catch {
    /* not available is normal, never an error */
  }
}

/** The manual "Rate Duebox" row — no quota, it is just a link. */
export async function openStoreListing(): Promise<void> {
  const url =
    Platform.OS === 'ios'
      ? APPLE_APP_ID
        ? `itms-apps://itunes.apple.com/app/id${APPLE_APP_ID}?action=write-review`
        : null
      : `market://details?id=${ANDROID_PACKAGE}`;
  if (url) await Linking.openURL(url).catch(() => undefined);
}
