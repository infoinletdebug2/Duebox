import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { ANDROID_PACKAGE, APPLE_APP_ID } from '../config';
import { reviewPrompt } from './analytics';

/**
 * Asking for a review.
 *
 * ## The flow
 *
 * At two moments of real value a small Duebox sheet rises
 * (`ui/ReviewPrompt.tsx`): what just happened, one sentence of why a rating
 * helps, and **Rate Duebox** / **Not now**.
 *
 *   1. `first_save` — the first deadline saved (typed in or from a scan);
 *   2. `done` — only for someone who said "Not now" (or never saw the first):
 *      after three deadlines marked done AND three days of use.
 *
 * At most two offers, ever. **Rate** opens the store's own in-app rating
 * sheet, or the listing's review page where that sheet is unavailable, so the
 * tap always leads somewhere. The Rate row in Settings is always there.
 *
 * ## Store rules this follows
 *
 *   - **No sentiment gate.** Asking "do you like the app?" first, or routing
 *     unhappy people away from the store, is against both stores' rules. One
 *     neutral ask; everybody who taps Rate reaches the store.
 *   - **The OS sheet has a hidden quota** (Apple: three a year), so it is
 *     requested only from an explicit tap, never on a timer.
 *   - Never after sign-up, never on launch, never on top of an error.
 */

export type ReviewTrigger = 'first_save' | 'done';

const KEYS = {
  firstSeen: 'duebox.review.firstSeen',
  dones: 'duebox.review.dones',
  offers: 'duebox.review.offers',
  rated: 'duebox.review.rated',
} as const;

const SECOND_OFFER_MIN_DONES = 3;
const SECOND_OFFER_MIN_DAYS = 3;
const MAX_OFFERS = 2;

async function read(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // An unpersisted counter means never asking — which harms nobody.
  }
}

type Listener = (trigger: ReviewTrigger) => void;
const listeners = new Set<Listener>();

/** `ui/ReviewPrompt.tsx` subscribes once, at the root. */
export function onReviewOffer(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(trigger: ReviewTrigger): void {
  for (const listener of listeners) listener(trigger);
}

function platformSupportsReview(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/** Call on launch, so the day floor has something to count from. */
export async function noteFirstUse(): Promise<void> {
  if (await read(KEYS.firstSeen)) return;
  await write(KEYS.firstSeen, String(Date.now()));
}

/** A deadline was saved. The first one ever on this install is the moment. */
export async function noteDeadlineSaved(): Promise<boolean> {
  if (!platformSupportsReview()) return false;
  if (await read(KEYS.rated)) return false;
  if (Number((await read(KEYS.offers)) ?? '0') > 0) return false;
  await write(KEYS.offers, '1');
  emit('first_save');
  return true;
}

/** A deadline was marked done. Counts toward the one follow-up offer. */
export async function noteDone(): Promise<boolean> {
  if (!platformSupportsReview()) return false;
  if (await read(KEYS.rated)) return false;
  const count = Number((await read(KEYS.dones)) ?? '0') + 1;
  await write(KEYS.dones, String(count));
  const offers = Number((await read(KEYS.offers)) ?? '0');
  if (offers >= MAX_OFFERS || count < SECOND_OFFER_MIN_DONES) return false;
  const firstSeen = Number((await read(KEYS.firstSeen)) ?? '0');
  if (firstSeen > 0 && Date.now() - firstSeen < SECOND_OFFER_MIN_DAYS * 86_400_000) return false;
  await write(KEYS.offers, String(offers + 1));
  emit('done');
  return true;
}

/** "Rate Duebox": the in-app store sheet when available, the listing otherwise. */
export async function rateNow(trigger: ReviewTrigger): Promise<void> {
  reviewPrompt('rate', trigger);
  await write(KEYS.rated, String(Date.now()));
  try {
    if ((await StoreReview.isAvailableAsync()) && (await StoreReview.hasAction())) {
      await StoreReview.requestReview();
      return;
    }
  } catch {
    // fall through to the listing
  }
  if (canOpenStoreListing()) await openStoreListing();
}

export function notNow(trigger: ReviewTrigger): void {
  reviewPrompt('later', trigger);
}

/** The Settings row hides itself until this platform's store id exists. */
export function canOpenStoreListing(): boolean {
  return Platform.OS === 'ios' ? APPLE_APP_ID.length > 0 : ANDROID_PACKAGE.length > 0;
}

/** The manual "Rate Duebox" row — no quota, it is just a link. */
export async function openStoreListing(): Promise<void> {
  const url =
    Platform.OS === 'ios'
      ? `https://apps.apple.com/app/id${APPLE_APP_ID}?action=write-review`
      : `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}&showAllReviews=true`;
  await Linking.openURL(url).catch(() => undefined);
}

/** Harness / debug only: show the sheet regardless of the gates. */
export function previewReviewOffer(trigger: ReviewTrigger = 'first_save'): void {
  emit(trigger);
}
