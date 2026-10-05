import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';
import type { Category } from '../types';

/**
 * The discovery onboarding's answers (SCREENS: onboarding). Asked BEFORE
 * sign-up, so they live on the device until there is a household to apply
 * them to. Only two questions, and both change the product:
 *   - what slips through → the empty Home suggests those first;
 *   - when to be reminded → the household's reminder hour (FR-R3).
 */

export interface Discovery {
  categories: Category[];
  remindHour: number;
}

const SEEN_KEY = 'duebox.onboarded';
const ANSWERS_KEY = 'duebox.discovery';
const APPLIED_KEY = 'duebox.discoveryApplied';

let seenMemo: boolean | null = null;

export async function hasOnboarded(): Promise<boolean> {
  if (seenMemo !== null) return seenMemo;
  seenMemo = (await AsyncStorage.getItem(SEEN_KEY).catch(() => null)) === '1';
  return seenMemo;
}

export async function saveDiscovery(answers: Discovery): Promise<void> {
  seenMemo = true;
  await AsyncStorage.multiSet([
    [SEEN_KEY, '1'],
    [ANSWERS_KEY, JSON.stringify(answers)],
  ]).catch(() => undefined);
}

export async function skipDiscovery(): Promise<void> {
  seenMemo = true;
  await AsyncStorage.setItem(SEEN_KEY, '1').catch(() => undefined);
}

export async function loadDiscovery(): Promise<Discovery | null> {
  try {
    const raw = await AsyncStorage.getItem(ANSWERS_KEY);
    return raw ? (JSON.parse(raw) as Discovery) : null;
  } catch {
    return null;
  }
}

/**
 * Once signed in, push the reminder hour to the household — once. Owners only
 * can change it; a member's 403 is fine and simply ignored.
 */
export async function applyDiscovery(): Promise<void> {
  if ((await AsyncStorage.getItem(APPLIED_KEY).catch(() => null)) === '1') return;
  const answers = await loadDiscovery();
  if (!answers) return;
  try {
    await api.patch('/household', { remindHour: answers.remindHour });
  } catch {
    /* member, offline, or not yet created — the default 9:00 stands */
  }
  await AsyncStorage.setItem(APPLIED_KEY, '1').catch(() => undefined);
}
