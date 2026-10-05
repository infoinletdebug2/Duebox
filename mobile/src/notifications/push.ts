import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, newIdempotencyKey } from '../api/client';
import { EAS_PROJECT_ID, IS_EXPO_GO } from '../config';

/**
 * Reminders by push (SRS FR-R, ARCHITECTURE §8).
 *
 * The worker sends every reminder through the Expo Push Service; this module
 * only (1) asks for permission at the right moment, (2) hands the device's
 * Expo push token to the worker, and (3) turns a tapped notification or one of
 * its actions (Done, Snooze 1 day) into an API call.
 *
 * `expo-notifications` is loaded LAZILY and never in Expo Go or on web
 * (traps.md): remote push is not available in Expo Go, and a native module
 * that throws while the module graph evaluates takes the whole app down.
 */

type NotificationsModule = typeof import('expo-notifications');
let modPromise: Promise<NotificationsModule | null> | undefined;

function load(): Promise<NotificationsModule | null> {
  if (IS_EXPO_GO || Platform.OS === 'web') return Promise.resolve(null);
  modPromise ??= import('expo-notifications').then((m) => m, () => null);
  return modPromise;
}

/** Whether this build can receive push at all (false in Expo Go and on web). */
export async function pushSupported(): Promise<boolean> {
  return (await load()) !== null;
}

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function permissionStatus(): Promise<PushPermission> {
  const N = await load();
  if (!N) return 'unsupported';
  const result = await N.getPermissionsAsync().catch(() => null);
  if (!result) return 'unsupported';
  if (result.granted) return 'granted';
  return result.canAskAgain ? 'undetermined' : 'denied';
}

const ASKED_KEY = 'duebox.pushAsked';

/** Has the explain-first screen been shown (FR-R8)? Shown once, after the first save. */
export async function hasAskedForPush(): Promise<boolean> {
  return (await AsyncStorage.getItem(ASKED_KEY).catch(() => null)) === '1';
}

export async function markAskedForPush(): Promise<void> {
  await AsyncStorage.setItem(ASKED_KEY, '1').catch(() => undefined);
}

/** The system prompt — only ever called from the explain-first screen. */
export async function requestPermission(): Promise<PushPermission> {
  const N = await load();
  if (!N) return 'unsupported';
  await markAskedForPush();
  const result = await N.requestPermissionsAsync().catch(() => null);
  if (result?.granted) {
    await registerPush();
    return 'granted';
  }
  return result?.canAskAgain ? 'undetermined' : 'denied';
}

let currentToken: string | null = null;

/** Register this device with the worker. Safe to call on every launch. */
export async function registerPush(): Promise<string | null> {
  const N = await load();
  if (!N) return null;
  const perm = await N.getPermissionsAsync().catch(() => null);
  if (!perm?.granted) return null;
  try {
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('reminders', {
        name: 'Deadline reminders',
        importance: N.AndroidImportance.HIGH,
        lightColor: '#F2B33D',
      });
    }
    const token = await N.getExpoPushTokenAsync(EAS_PROJECT_ID ? { projectId: EAS_PROJECT_ID } : undefined);
    currentToken = token.data;
    await api.post('/devices', { expoPushToken: token.data, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
    return token.data;
  } catch (error) {
    // No EAS project id, no network, or a simulator: reminders still show in-app.
    console.warn('push: registration failed', (error as Error)?.message);
    return null;
  }
}

/** On sign-out: this phone must stop getting the household's reminders. */
export async function unregisterPush(): Promise<void> {
  if (!currentToken) return;
  const token = currentToken;
  currentToken = null;
  await api.delete(`/devices/${encodeURIComponent(token)}`).catch(() => undefined);
}

export const CATEGORY_ITEM_DUE = 'item_due';
const ACTION_DONE = 'done';
const ACTION_SNOOZE = 'snooze_1';

/**
 * Foreground display, the Done / Snooze actions, and taps. Returns a cleanup.
 * `onOpenItem` routes to the item; actions call the API with an idempotency
 * key, because the OS may deliver a response twice.
 */
export async function installNotificationHandlers(onOpenItem: (itemId: string) => void, onChanged: () => void): Promise<() => void> {
  const N = await load();
  if (!N) return () => undefined;

  N.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });

  await N.setNotificationCategoryAsync(CATEGORY_ITEM_DUE, [
    { identifier: ACTION_DONE, buttonTitle: 'Mark done', options: { opensAppToForeground: false } },
    { identifier: ACTION_SNOOZE, buttonTitle: 'Snooze 1 day', options: { opensAppToForeground: false } },
  ]).catch(() => undefined);

  const handle = async (response: import('expo-notifications').NotificationResponse) => {
    const itemId = (response.notification.request.content.data as { itemId?: string } | undefined)?.itemId;
    if (!itemId) return;
    if (response.actionIdentifier === ACTION_DONE) {
      await api.post(`/items/${itemId}/done`, undefined, newIdempotencyKey()).catch(() => undefined);
      onChanged();
    } else if (response.actionIdentifier === ACTION_SNOOZE) {
      await api.post(`/items/${itemId}/snooze`, { days: 1 }, newIdempotencyKey()).catch(() => undefined);
      onChanged();
    } else {
      onOpenItem(itemId);
    }
  };

  // A tap that cold-started the app.
  const last = await N.getLastNotificationResponseAsync().catch(() => null);
  if (last) void handle(last);

  const sub = N.addNotificationResponseReceivedListener((r) => void handle(r));
  return () => sub.remove();
}
