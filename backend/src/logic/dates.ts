/**
 * Calendar days (`YYYY-MM-DD`) and wall-clock instants in a household's zone.
 *
 * A due date is a calendar day, never an instant (BR-11): it is stored as a
 * `date`, carried as a string, and only turned into an instant at the moment
 * a reminder has to fire — "9:00 on that day, wherever the household is".
 */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day in `YYYY-MM-DD` form, or null. */
export function toDay(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = DAY.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return value.trim();
}

function parts(day: string): [number, number, number] {
  const m = DAY.exec(day);
  if (!m) throw new Error(`not a day: ${day}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function fmt(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = parts(day);
  return fmt(new Date(Date.UTC(y, m - 1, d + n)));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Add months, clamping to the target month's last day (Jan 31 + 1 → Feb 28/29). */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = parts(day);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return fmt(target);
}

export function isValidZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Today in an IANA zone. An unknown zone degrades to UTC. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** The zone's offset from UTC, in minutes, at one instant. */
function offsetMinutes(timezone: string, at: Date): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * The instant at which the wall clock in `timezone` reads `hour:00` on `day`.
 *
 * DST: the offset is looked up at the guessed instant and the guess corrected
 * once more, so both transition days land on the right hour. A wall time that
 * does not exist (the skipped hour of spring-forward) comes out an hour later,
 * which is what a phone's clock does too.
 */
export function localInstant(day: string, hour: number, timezone: string): Date {
  const [y, m, d] = parts(day);
  const wall = Date.UTC(y, m - 1, d, hour, 0, 0);
  const zone = isValidZone(timezone) ? timezone : 'UTC';
  let guess = wall - offsetMinutes(zone, new Date(wall)) * 60_000;
  guess = wall - offsetMinutes(zone, new Date(guess)) * 60_000;
  return new Date(guess);
}
