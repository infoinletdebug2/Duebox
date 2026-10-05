import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/context';
import type { GateReason } from '../types';

/**
 * The client half of the gating (CONTRACT §3). The server is the authority
 * (402 + `reason`); this only decides what to SHOW, so someone at a limit sees
 * the paywall before filling in a form that would be refused.
 *
 * Reading, editing, done, snooze, export and deletion are never gated (BR-07).
 */
export function usePlanGate() {
  const router = useRouter();
  const { plan, isPro, isOwner, refresh } = useAuth();

  const openPaywall = useCallback((reason: GateReason) => router.push({ pathname: '/paywall', params: { reason } }), [router]);

  /** Would a new open item go over the free limit? */
  const atItemLimit = !isPro && plan?.limits.openItems != null && plan.usage.openItems >= plan.limits.openItems;
  /** Has this month's scan allowance been used? */
  const atScanLimit = plan != null && plan.usage.scansThisMonth >= plan.limits.scansPerMonth;

  /** Run `go` unless the client already knows it would be refused. */
  const guard = useCallback(
    (reason: GateReason, go: () => void) => {
      if (reason === 'item_limit' && atItemLimit) return openPaywall(reason);
      if (reason === 'scan_limit' && atScanLimit) return openPaywall(reason);
      if ((reason === 'household' || reason === 'custom_reminders') && !isPro) return openPaywall(reason);
      go();
    },
    [atItemLimit, atScanLimit, isPro, openPaywall],
  );

  /** For every mutation's onError: a 402 means a limit was hit under us. */
  const handlePlanError = useCallback(
    (error: unknown): boolean => {
      if (error instanceof ApiError && error.needsSubscription) {
        void refresh();
        openPaywall(error.reason ?? 'item_limit');
        return true;
      }
      return false;
    },
    [openPaywall, refresh],
  );

  return { isPro, isOwner, atItemLimit, atScanLimit, guard, openPaywall, handlePlanError };
}
