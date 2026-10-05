import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Has this phone seen the discovery pitch (app/discover.tsx)? Shown once per
 * install, before sign-up. The questions that used to live here moved to the
 * post-sign-in setup (app/setup.tsx), where the answers go straight to the
 * household instead of waiting on the device.
 */

const SEEN_KEY = 'duebox.onboarded';

let seenMemo: boolean | null = null;

export async function hasOnboarded(): Promise<boolean> {
  if (seenMemo !== null) return seenMemo;
  seenMemo = (await AsyncStorage.getItem(SEEN_KEY).catch(() => null)) === '1';
  return seenMemo;
}

export async function skipDiscovery(): Promise<void> {
  seenMemo = true;
  await AsyncStorage.setItem(SEEN_KEY, '1').catch(() => undefined);
}
