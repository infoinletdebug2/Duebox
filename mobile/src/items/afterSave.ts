import type { useRouter } from 'expo-router';
import { hasAskedForPush, permissionStatus } from '../notifications/push';

type Router = ReturnType<typeof useRouter>;

/**
 * FR-R8: the notification permission is asked AFTER the first item is saved,
 * on an explain-first screen that names that item — never on launch. Every
 * later save just goes where it was going.
 */
export async function routeAfterFirstSave(router: Router, title: string, fallback: () => void): Promise<void> {
  const [asked, status] = await Promise.all([hasAskedForPush(), permissionStatus()]);
  if (!asked && status === 'undetermined') {
    router.replace({ pathname: '/notifications-permission', params: { title } });
    return;
  }
  fallback();
}
