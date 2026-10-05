import type { Action, Category, Offset, Repeat } from '../types';
import type { IconName } from '../ui/Icon';
import { longDate, mediumDate } from './dates';

/**
 * The only place that turns wire values into words a person reads
 * (CONTRACT §0.6: enum values never reach the UI as text).
 */

let currency = 'USD';

/** Set once from the household (Me.household.currency). */
export function setCurrency(code: string): void {
  if (/^[A-Z]{3}$/.test(code)) currency = code;
}

/** "$412.00" — or "$412" when `compact` and the cents are zero. */
export function money(cents: number | null | undefined, compact = false): string {
  if (cents === null || cents === undefined) return '';
  const whole = compact && Math.abs(cents) % 100 === 0;
  try {
    return (Math.abs(cents) / 100).toLocaleString('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    });
  } catch {
    return (Math.abs(cents) / 100).toFixed(whole ? 0 : 2);
  }
}

/** Parse what a person typed into an amount field → cents, or null. */
export function parseMoney(text: string): number | null {
  const s = text.replace(/[^0-9.]/g, '');
  if (s === '') return null;
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return Number.isFinite(cents) && cents <= 1_000_000_000 ? cents : null;
}

/** Cents → the text shown in an amount field ("412.50"). */
export function moneyInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2);
}

export const CATEGORY: Record<Category, { label: string; icon: IconName }> = {
  id_travel: { label: 'ID & travel', icon: 'passport' },
  vehicle: { label: 'Vehicle', icon: 'car' },
  home: { label: 'Home', icon: 'home' },
  insurance: { label: 'Insurance', icon: 'shield' },
  bills: { label: 'Bills & money', icon: 'receipt' },
  health: { label: 'Health', icon: 'health' },
  kids_school: { label: 'Kids & school', icon: 'school' },
  subscriptions: { label: 'Subscriptions & trials', icon: 'repeat' },
  work: { label: 'Work', icon: 'case' },
  other: { label: 'Other', icon: 'file' },
};

export const CATEGORIES = Object.keys(CATEGORY) as Category[];

export const ACTION: Record<Action, string> = {
  renew: 'Renew',
  pay: 'Pay',
  submit: 'Submit',
  cancel: 'Cancel',
  book: 'Book',
  attend: 'Attend',
  other: 'Due',
};

export const ACTIONS = Object.keys(ACTION) as Action[];

export const REPEAT: Record<Repeat, string> = {
  none: 'Doesn’t repeat',
  monthly: 'Every month',
  quarterly: 'Every 3 months',
  half_yearly: 'Every 6 months',
  yearly: 'Every year',
  years: 'Every few years',
};

export function repeatLabel(repeat: Repeat, years: number | null): string {
  if (repeat === 'years' && years) return `Every ${years} years`;
  return REPEAT[repeat];
}

export const ALL_OFFSETS: Offset[] = [60, 30, 14, 7, 3, 1];
export const FREE_OFFSETS: Offset[] = [7];
export const PRO_DEFAULT_OFFSETS: Offset[] = [30, 7, 1];

/** "30, 7 and 1 days before" */
export function offsetsLabel(offsets: Offset[]): string {
  const sorted = [...offsets].sort((a, b) => b - a);
  if (sorted.length === 0) return 'Only on the day';
  const parts = sorted.map(String);
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return `${list} ${sorted.length === 1 && sorted[0] === 1 ? 'day' : 'days'} before`;
}

/** "9:00" style for the reminder hour. */
export function hourLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
}

/** The countdown words (DESIGN-SYSTEM §4). */
export function countdown(daysLeft: number): string {
  if (daysLeft === 0) return 'Today';
  if (daysLeft === 1) return 'Tomorrow';
  if (daysLeft === -1) return '1 day late';
  if (daysLeft < 0) return `${-daysLeft} days late`;
  return `in ${daysLeft} days`;
}

/** What VoiceOver says for a countdown. */
export function countdownLabel(daysLeft: number): string {
  if (daysLeft === 0) return 'due today';
  if (daysLeft === 1) return 'due tomorrow';
  if (daysLeft < 0) return `${-daysLeft} ${daysLeft === -1 ? 'day' : 'days'} late`;
  return `due in ${daysLeft} days`;
}

/** "Renew by Fri, Mar 14" */
export function dueLine(action: Action, dueDate: string, long = false): string {
  const verb = action === 'other' ? 'Due' : `${ACTION[action]} by`;
  return `${verb} ${long ? longDate(dueDate) : mediumDate(dueDate)}`;
}

/** "•••• 4821" */
export function maskedRef(last4: string | null): string {
  return last4 ? `•••• ${last4}` : '';
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}
