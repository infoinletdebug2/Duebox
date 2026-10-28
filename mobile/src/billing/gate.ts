import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/context';

/**
 * The client half of the hard paywall (CONTRACT §3). The server is the
 * authority: every household data route answers 402 SUBSCRIPTION_REQUIRED
 * once the subscription is not live. The root layout already keeps a lapsed
 * household on the paywall; this catches the moment it lapses UNDER an open
 * screen — re-read the plan, then go to the paywall (replace: there is no
 * screen behind it to go back to).
 */
export function usePlanGate() {
  const router = useRouter();
  const { isPro, isOwner, refresh } = useAuth();

  const openPaywall = useCallback(() => router.replace('/paywall'), [router]);

  /** For every request's onError. True when it was the paywall's to handle. */
  const handlePlanError = useCallback(
    (error: unknown): boolean => {
      if (error instanceof ApiError && error.needsSubscription && error.reason !== 'scan_limit') {
        void refresh();
        openPaywall();
        return true;
      }
      return false;
    },
    [openPaywall, refresh],
  );

  return { isPro, isOwner, openPaywall, handlePlanError };
}
