/**
 * Business dates are `YYYY-MM-DD` strings in the family's time zone.
 *
 * NEVER `new Date('YYYY-MM-DD')`: it parses as UTC midnight and displays as
 * the previous day anywhere west of Greenwich — every US family. Everything
 * here does arithmetic on UTC and formats with timeZone 'UTC', so the digits
 * that went in are the digits that come out.
 */

const DAY_MS = 86_400_000;

function ms(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

function fromMs(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(ms(value));
}

export function addDays(day: string, n: number): string {
  return fromMs(ms(day) + n * DAY_MS);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((ms(b) - ms(a)) / DAY_MS);
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(day: string): number {
  const js = new Date(ms(day)).getUTCDay();
  return js === 0 ? 7 : js;
}

export function weekStart(day: string): string {
  return addDays(day, -(isoWeekday(day) - 1));
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function addMonths(day: string, n: number): string {
  const d = new Date(ms(monthStart(day)));
  d.setUTCMonth(d.getUTCMonth() + n);
  return fromMs(d.getTime());
}

/** The device's local today — only as a fallback before the server says. */
export function localToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmt(day: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(new Date(ms(day)));
}

/** "Tuesday" */
export const weekdayName = (day: string) => fmt(day, { weekday: 'long' });
/** "Tue" */
export const weekdayShort = (day: string) => fmt(day, { weekday: 'short' });
/** "October" */
export const monthName = (day: string) => fmt(day, { month: 'long' });
/** "October 2026" */
export const monthYear = (day: string) => fmt(day, { month: 'long', year: 'numeric' });
/** "Oct 7" */
export const shortDate = (day: string) => fmt(day, { month: 'short', day: 'numeric' });
/** "Tue, Oct 7" */
export const mediumDate = (day: string) => fmt(day, { weekday: 'short', month: 'short', day: 'numeric' });
/** "October 7, 2026" */
export const longDate = (day: string) => fmt(day, { month: 'long', day: 'numeric', year: 'numeric' });
/** "7" */
export const dayOfMonth = (day: string) => String(Number(day.slice(8, 10)));

/** "Today", "Tomorrow", "Yesterday", or "Tue, Oct 7". */
export function relativeDay(day: string, today: string): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return mediumDate(day);
}

/** A 6×7 month grid of dates (Monday-first), padded with neighbouring days. */
export function monthGrid(anyDay: string): string[] {
  const first = monthStart(anyDay);
  const start = weekStart(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Same day-of-month n months later, clamped to the month's end (31 Jan + 1 = 28/29 Feb). */
export function shiftMonths(day: string, n: number): string {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7)) - 1 + n;
  const target = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(Number(day.slice(8, 10)), last));
  return target.toISOString().slice(0, 10);
}

/** "Oct" */
export const monthShort = (day: string) => fmt(day, { month: 'short' });
/** "M" — first letter of the weekday. */
export const weekdayLetter = (day: string) => fmt(day, { weekday: 'narrow' });
