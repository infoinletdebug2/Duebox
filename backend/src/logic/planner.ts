import { addDays, addMonths, localInstant, todayIn } from './dates';

/**
 * The reminder planner (ARCHITECTURE §4, FR-R1…R7) and the repeat rule
 * (§6, FR-I6). Pure: no clock, no database — `now` is passed in.
 */

export const OFFSETS = [60, 30, 14, 7, 3, 1] as const;
export type Offset = (typeof OFFSETS)[number];
/** FR-R1: Free items remind 7 days before; Pro items start at 30, 7 and 1. */
export const FREE_OFFSETS: Offset[] = [7];
export const PRO_DEFAULT_OFFSETS: Offset[] = [30, 7, 1];

export const REPEATS = ['none', 'monthly', 'quarterly', 'half_yearly', 'yearly', 'years'] as const;
export type Repeat = (typeof REPEATS)[number];

export type ReminderKind = 'before' | 'due' | 'overdue' | 'snooze';

export interface PlannedReminder {
  kind: ReminderKind;
  offsetDays: number | null;
  fireAt: string;
}

export interface PlanInput {
  dueDate: string;
  offsets: readonly number[];
  remindHour: number;
  timezone: string;
  status: 'open' | 'done';
  now: Date;
}

export function planReminders(input: PlanInput): PlannedReminder[] {
  if (input.status === 'done') return [];
  const { dueDate, remindHour, timezone, now } = input;
  const out: PlannedReminder[] = [];
  const nowMs = now.getTime();

  const offsets = [...new Set(input.offsets)].sort((a, b) => b - a);
  for (const offset of offsets) {
    const at = localInstant(addDays(dueDate, -offset), remindHour, timezone);
    if (at.getTime() > nowMs) out.push({ kind: 'before', offsetDays: offset, fireAt: at.toISOString() });
  }

  const dueAt = localInstant(dueDate, remindHour, timezone);
  if (dueAt.getTime() > nowMs) {
    out.push({ kind: 'due', offsetDays: 0, fireAt: dueAt.toISOString() });
  } else if (todayIn(timezone, now) === dueDate) {
    // Added on the day itself, after the reminder hour: one nudge in an hour.
    out.push({ kind: 'due', offsetDays: 0, fireAt: new Date(nowMs + 3_600_000).toISOString() });
  }

  const overdueAt = localInstant(addDays(dueDate, 1), remindHour, timezone);
  if (overdueAt.getTime() > nowMs) out.push({ kind: 'overdue', offsetDays: -1, fireAt: overdueAt.toISOString() });

  return out;
}

/** A snooze is one reminder, `days` from now at the household's hour. */
export function snoozeAt(days: number, remindHour: number, timezone: string, now: Date): string {
  const day = addDays(todayIn(timezone, now), days);
  return localInstant(day, remindHour, timezone).toISOString();
}

/**
 * The next occurrence of a repeating item, counted from the OLD due date
 * (BR-11): paying a monthly bill late does not move next month's date.
 */
export function nextDueDate(dueDate: string, repeat: Repeat, repeatYears: number | null): string | null {
  switch (repeat) {
    case 'monthly':
      return addMonths(dueDate, 1);
    case 'quarterly':
      return addMonths(dueDate, 3);
    case 'half_yearly':
      return addMonths(dueDate, 6);
    case 'yearly':
      return addMonths(dueDate, 12);
    case 'years':
      return addMonths(dueDate, 12 * Math.min(10, Math.max(2, repeatYears ?? 2)));
    default:
      return null;
  }
}
