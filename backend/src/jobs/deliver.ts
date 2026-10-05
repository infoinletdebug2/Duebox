import type { Context } from 'hono';
import { appScheme } from '../config';
import { env } from '../lib';
import { daysBetween, todayIn } from '../logic/dates';
import { rawRows } from '../services';
import { sendBatch, isExpoToken, type PushMessage } from '../push';
import { dayOf, intOrNull } from '../rows';

/**
 * Reminder delivery (ARCHITECTURE §5) — the cron, every 5 minutes.
 *
 * Runs without a signed-in user, so every query names its rows explicitly.
 * Idempotent: a reminder is sent at most once (`sent_at`), a transient push
 * failure is retried on the next run (`attempts < 3`), and anything more
 * than 24 hours late is marked sent without a push — a stale "due in 7 days"
 * is worse than none; the app's Overdue section covers it.
 */

interface DueRow {
  id: string;
  kind: 'before' | 'due' | 'overdue' | 'snooze';
  fire_at: string;
  item_id: string;
  title: string;
  action: string;
  due_date: string;
  amount_cents: number | string | null;
  assignee_id: string | null;
  household_id: string;
  timezone: string;
  currency: string;
}

const STALE_MS = 24 * 3_600_000;

const VERB: Record<string, string> = { renew: 'Renew', pay: 'Pay', submit: 'Send in', cancel: 'Cancel', book: 'Book', attend: 'Go to' };

export function reminderText(r: { title: string; action: string; dueDate: string; amountCents: number | null; currency: string }, today: string) {
  const verb = VERB[r.action];
  const title = verb && !r.title.toLowerCase().startsWith(verb.toLowerCase()) ? `${verb} ${lowerFirst(r.title)}` : r.title;
  const days = daysBetween(today, r.dueDate);
  const when =
    days > 1 ? `Due in ${days} days`
    : days === 1 ? 'Due tomorrow'
    : days === 0 ? 'Due today'
    : days === -1 ? 'Was due yesterday'
    : `Was due ${-days} days ago`;
  const amount = r.amountCents !== null ? ` · ${money(r.amountCents, r.currency)}` : '';
  return { title, body: `${when}${amount}` };
}

function lowerFirst(s: string): string {
  // "Car insurance" → "car insurance", but keep "DMV" and "Netflix" as written.
  const first = s.split(' ')[0] ?? '';
  return first.length > 1 && first === first.toUpperCase() ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export async function deliverReminders(c: Context): Promise<{ due: number; sent: number; skipped: number; failed: number }> {
  // Reminders of items that were done or deleted since planning: retire them.
  await rawRows(
    c,
    `UPDATE dx__reminder r SET canceled_at = now() FROM dx__item i
     WHERE i.id = r.item_id AND r.sent_at IS NULL AND r.canceled_at IS NULL AND r.fire_at <= now()
       AND (i.status <> 'open' OR i.deleted_at IS NOT NULL)`,
  );

  const due = await rawRows<DueRow>(
    c,
    `SELECT r.id, r.kind, r.fire_at, i.id AS item_id, i.title, i.action, i.due_date, i.amount_cents, i.assignee_id,
            r.household_id, h.timezone, h.currency
     FROM dx__reminder r
     JOIN dx__item i ON i.id = r.item_id
     JOIN dx__household h ON h.id = r.household_id
     WHERE r.fire_at <= now() AND r.sent_at IS NULL AND r.canceled_at IS NULL AND r.attempts < 3
       AND i.status = 'open' AND i.deleted_at IS NULL AND h.deleted_at IS NULL
     ORDER BY r.fire_at LIMIT 500`,
  );
  if (due.length === 0) return { due: 0, sent: 0, skipped: 0, failed: 0 };

  const households = [...new Set(due.map((d) => d.household_id))];
  const members = await rawRows<{ id: string; household_id: string; user_id: string }>(
    c,
    `SELECT id, household_id, user_id FROM dx__member WHERE household_id = ANY($1::uuid[]) AND removed_at IS NULL`,
    [households],
  );
  const userIds = [...new Set(members.map((m) => m.user_id))];
  const profiles = userIds.length
    ? await rawRows<{ user_id: string; prefs_reminders: boolean; prefs_overdue: boolean }>(
        c,
        `SELECT user_id, prefs_reminders, prefs_overdue FROM dx__profile WHERE user_id = ANY($1::text[])`,
        [userIds],
      )
    : [];
  const devices = userIds.length
    ? await rawRows<{ user_id: string; expo_push_token: string }>(
        c,
        `SELECT user_id, expo_push_token FROM dx__device WHERE user_id = ANY($1::text[]) AND disabled_at IS NULL`,
        [userIds],
      )
    : [];

  const scheme = appScheme(env(c));
  const now = Date.now();
  const sentIds: string[] = [];
  const skippedIds: string[] = [];
  const outbox: { reminderId: string; message: PushMessage }[] = [];

  for (const r of due) {
    if (now - new Date(r.fire_at).getTime() > STALE_MS) {
      skippedIds.push(r.id);
      continue;
    }
    const household = members.filter((m) => m.household_id === r.household_id);
    const assignee = r.assignee_id ? household.find((m) => m.id === r.assignee_id) : undefined;
    const recipients = (assignee ? [assignee] : household).filter((m) => {
      const p = profiles.find((x) => x.user_id === m.user_id);
      if (!p) return true;
      return r.kind === 'overdue' ? p.prefs_overdue !== false : p.prefs_reminders !== false;
    });
    const tokens = devices.filter((d) => recipients.some((m) => m.user_id === d.user_id) && isExpoToken(d.expo_push_token));
    if (tokens.length === 0) {
      skippedIds.push(r.id);
      continue;
    }
    const text = reminderText(
      { title: r.title, action: r.action, dueDate: dayOf(r.due_date), amountCents: intOrNull(r.amount_cents), currency: r.currency },
      todayIn(r.timezone),
    );
    for (const t of tokens) {
      outbox.push({
        reminderId: r.id,
        message: { to: t.expo_push_token, title: text.title, body: text.body, categoryId: 'item_due', data: { itemId: r.item_id, url: `${scheme}://item/${r.item_id}` } },
      });
    }
  }

  const failedIds = new Set<string>();
  const okIds = new Set<string>();
  for (let i = 0; i < outbox.length; i += 100) {
    const chunk = outbox.slice(i, i + 100);
    try {
      const accepted = await sendBatch(c, chunk.map((o) => o.message));
      chunk.forEach((o, j) => (accepted[j] ? okIds : failedIds).add(o.reminderId));
    } catch (error) {
      console.error('push batch failed:', error instanceof Error ? error.message : error);
      chunk.forEach((o) => failedIds.add(o.reminderId));
    }
  }
  // Delivered to at least one phone counts as sent; a dead token alone is not retried.
  for (const reminderId of okIds) {
    sentIds.push(reminderId);
    failedIds.delete(reminderId);
  }

  const done = [...sentIds, ...skippedIds];
  if (done.length) await rawRows(c, `UPDATE dx__reminder SET sent_at = now() WHERE id = ANY($1::uuid[])`, [done]);
  if (failedIds.size) await rawRows(c, `UPDATE dx__reminder SET attempts = attempts + 1 WHERE id = ANY($1::uuid[])`, [[...failedIds]]);
  return { due: due.length, sent: sentIds.length, skipped: skippedIds.length, failed: failedIds.size };
}
