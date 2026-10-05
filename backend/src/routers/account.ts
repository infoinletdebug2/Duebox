import { defineRouter } from '@xenition/sdk/hono';
import { me, ours, ok, invalid, jsonBody, userId, nowIso, id } from '../lib';
import { requireHousehold } from '../middleware';
import { rawRows, today } from '../services';
import { type ItemRow, type MemberRow, dayOf, instant, intArray, intOrNull } from '../rows';
import { handleError } from '../errors';

/**
 * `account` — push devices (CONTRACT §2.5) and export (§2.7).
 */
export const accountRouter = defineRouter({
  name: 'account',

  build(app, { requireAuth, rateLimit }) {
    app.onError(handleError);

    /** Upsert on every launch: a token can move between accounts on a shared phone. */
    app.post('/devices', requireAuth, rateLimit(30), async (c) => {
      const body = await jsonBody(c);
      const token = typeof body?.expoPushToken === 'string' ? body.expoPushToken.trim() : '';
      const platform = body?.platform === 'ios' || body?.platform === 'android' ? body.platform : null;
      if (!token || token.length > 300) return invalid(c, 'Expected a push token.', { expoPushToken: 'REQUIRED' });
      await rawRows(
        c,
        `INSERT INTO dx__device (id, user_id, expo_push_token, platform, last_seen_at, created_at)
         VALUES ($1::uuid, $2::text, $3::text, $4::text, now(), now())
         ON CONFLICT (expo_push_token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform,
           last_seen_at = now(), disabled_at = NULL`,
        [id(), userId(c), token, platform],
      );
      return ok(c, { ok: true });
    });

    /** On sign-out: this phone stops receiving this account's reminders. */
    app.delete('/devices/:token', requireAuth, async (c) => {
      const token = decodeURIComponent(c.req.param('token'));
      await rawRows(c, `DELETE FROM dx__device WHERE expo_push_token = $1::text AND user_id = $2::text`, [token, userId(c)]);
      return ok(c, { ok: true });
    });

    /**
     * Everything the household has recorded, as CSV or JSON. Never gated
     * (BR-07): a household that stops paying takes its deadlines with it.
     * Returns the file body itself, not the envelope.
     */
    app.get('/export', requireAuth, requireHousehold, rateLimit(10), async (c) => {
      const format = c.req.query('format') === 'json' ? 'json' : 'csv';
      const rows = await ours(c, 'dx__item').whereNull('deleted_at').orderBy('due_date').rows<ItemRow>();
      const members = await ours(c, 'dx__member').rows<MemberRow>();
      const nameOf = (memberId: string | null) => members.find((m) => m.id === memberId)?.display_name ?? '';
      const stamp = today(c);
      const items = rows.map((r) => ({
        title: r.title,
        category: r.category,
        action: r.action,
        status: r.status,
        dueDate: dayOf(r.due_date),
        amount: intOrNull(r.amount_cents) === null ? '' : (Number(r.amount_cents) / 100).toFixed(2),
        issuer: r.issuer ?? '',
        referenceLast4: r.reference_last4 ?? '',
        repeat: r.repeat,
        remindDaysBefore: intArray(r.offsets).join(' '),
        assignedTo: nameOf(r.assignee_id),
        doneAt: instant(r.done_at) ?? '',
        doneBy: nameOf(r.done_by),
        notes: r.notes ?? '',
      }));
      const filename = `duebox-${stamp}.${format}`;
      c.header('content-disposition', `attachment; filename="${filename}"`);
      if (format === 'json') {
        return c.json({ exportedAt: nowIso(), household: me(c).householdName, currency: me(c).currency, items });
      }
      const header = Object.keys(items[0] ?? { title: '', category: '', action: '', status: '', dueDate: '', amount: '', issuer: '', referenceLast4: '', repeat: '', remindDaysBefore: '', assignedTo: '', doneAt: '', doneBy: '', notes: '' });
      const cell = (v: unknown) => {
        const s = String(v ?? '');
        // Formula injection guard: a cell starting with = + - @ is text, not a formula.
        const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
        return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
      };
      const csv = [header.join(','), ...items.map((it) => header.map((h) => cell((it as Record<string, unknown>)[h])).join(','))].join('\r\n');
      return c.body(csv, 200, { 'content-type': 'text/csv; charset=utf-8' });
    });
  },
});
