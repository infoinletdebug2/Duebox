import AsyncStorage from '@react-native-async-storage/async-storage';
import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/**
 * An invite link opened while signed out (SCREENS §1: "a pending join/[code]
 * deep link survives sign-in").
 *
 * The root guard sends a signed-out person from `/join/ABC123` to welcome. The
 * join screen parks the code here first; whichever auth screen finishes the
 * sign-in hands them back to it instead of to onboarding — a member must
 * never be walked through creating a second household by accident.
 *
 * Memory first (same session), AsyncStorage behind it (the app was killed
 * while they went to find their password).
 */
const KEY = 'duebox.pendingJoin';
let memo: string | null = null;

export function rememberJoin(code: string): void {
  memo = code;
  void AsyncStorage.setItem(KEY, code).catch(() => undefined);
}

export async function takePendingJoin(): Promise<string | null> {
  const stored = memo ?? (await AsyncStorage.getItem(KEY).catch(() => null));
  memo = null;
  void AsyncStorage.removeItem(KEY).catch(() => undefined);
  return stored && /^[A-Za-z0-9]{6,12}$/.test(stored) ? stored : null;
}

/** Where to go once signed in: a waiting invite, else the entry router at `/`. */
export async function routeAfterAuth(router: Router): Promise<void> {
  const code = await takePendingJoin();
  if (code) router.replace({ pathname: '/join/[code]', params: { code } });
  else router.replace('/');
}
