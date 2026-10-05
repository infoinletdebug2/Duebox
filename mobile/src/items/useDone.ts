import { useCallback } from 'react';
import { messageOf } from '../api/client';
import { useMarkDone, useReopen } from '../api/hooks';
import { useToast } from '../ui/Sheet';
import { shortDate } from '../lib/dates';
import { maybeAskForReview } from '../lib/review';
import type { Item } from '../types';

/**
 * Mark done, from anywhere: the toast says what happened (and when the next
 * one is, for a repeating item — FR-I6), offers Undo, and — after enough
 * successes — the review prompt fires AFTER the toast (store-readiness.md).
 */
export function useDone() {
  const done = useMarkDone();
  const reopen = useReopen();
  const toast = useToast();

  const markDone = useCallback(
    (item: Item) => {
      if (item.status === 'done') {
        reopen.mutate(item.id, { onError: (e) => toast({ message: messageOf(e) }) });
        return;
      }
      done.mutate(item.id, {
        onSuccess: ({ next }) => {
          toast({
            message: next ? `Done. Next one: ${shortDate(next.dueDate)}.` : 'Done. One less thing.',
            actionLabel: 'Undo',
            onAction: () => reopen.mutate(item.id),
          });
          void maybeAskForReview();
        },
        onError: (e) => toast({ message: messageOf(e) }),
      });
    },
    [done, reopen, toast],
  );

  return { markDone, pending: done.isPending ? done.variables : null };
}
