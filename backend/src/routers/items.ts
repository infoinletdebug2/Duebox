import type { Context } from 'hono';
import { defineRouter } from '@xenition/sdk/hono';
import { me, ours, env, ok, created, invalid, fail, notFound, jsonBody, id, AppError } from '../lib';
import { maxImageBytes, maxPdfBytes } from '../config';
import { requireHousehold, assertRoomFor, assertOffsetsAllowed, proNow } from '../middleware';
import { planPayload } from '../billing';
import { ACTIONS, CATEGORIES, maskReference, type Action, type Category } from '../logic/extract';
import { FREE_OFFSETS, OFFSETS, PRO_DEFAULT_OFFSETS, REPEATS, nextDueDate, snoozeAt, type Repeat } from '../logic/planner';
import { toDay } from '../logic/dates';
import {
  type Statement,
  deleteStored,
  householdRow,
  itemDetail,
  itemsWire,
  ownItem,
  rawRows,
  remember,
  remembered,
  replanStatements,
  transaction,
  uploadUrl,
} from '../services';
import { type ItemRow, type MemberRow, dayOf, intArray, intOrNull, memberWire } from '../rows';
import { handleError } from '../errors';

/**
 * `items` — Home, the list, one item, and its lifecycle (SRS FR-I, FR-R).
 */

export interface ItemFields {
  title: string;
  dueDate: string;
  category: Category;
  action: Action;
  amountCents: number | null;
  issuer: string | null;
  referenceLast4: string | null;
  notes: string | null;
  repeat: Repeat;
  repeatYears: number | null;
  offsets: number[];
  assigneeId: string | null;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; field: string; message: string };

function cleanText(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const t = value.replace(/\s+/g, ' ').trim();
  return t.length === 0 ? null : t.slice(0, max);
}

/**
 * Validate an `ItemInput` (CONTRACT §1). With `base`, the body is a partial
 * patch over it; without, `title` and `dueDate` are required.
 */
export function parseItemInput(body: Record<string, unknown>, base: ItemFields | null, defaultOffsets: number[]): Parsed<ItemFields> {
  const out: ItemFields = base
    ? { ...base }
    : {
        title: '',
        dueDate: '',
        category: 'other',
        action: 'other',
        amountCents: null,
        issuer: null,
        referenceLast4: null,
        notes: null,
        repeat: 'none',
        repeatYears: null,
        offsets: defaultOffsets,
        assigneeId: null,
      };

  if (body.title !== undefined || !base) {
    const t = typeof body.title === 'string' ? body.title.replace(/\s+/g, ' ').trim() : '';
    if (t.length < 1 || t.length > 80) return { ok: false, field: 'title', message: 'Give it a name (up to 80 characters).' };
    out.title = t;
  }
  if (body.dueDate !== undefined || !base) {
    const d = toDay(body.dueDate);
    if (!d) return { ok: false, field: 'dueDate', message: 'Choose the date it’s due.' };
    out.dueDate = d;
  }
  if (body.category !== undefined) {
    if (!CATEGORIES.includes(body.category as Category)) return { ok: false, field: 'category', message: 'Choose a category.' };
    out.category = body.category as Category;
  }
  if (body.action !== undefined) {
    if (!ACTIONS.includes(body.action as Action)) return { ok: false, field: 'action', message: 'Choose what needs doing.' };
    out.action = body.action as Action;
  }
  if (body.amountCents !== undefined) {
    const v = body.amountCents;
    if (v === null) out.amountCents = null;
    else if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1_000_000_000) out.amountCents = v;
    else return { ok: false, field: 'amountCents', message: 'Amounts are whole cents, zero or more.' };
  }
  if (body.issuer !== undefined) out.issuer = cleanText(body.issuer, 80);
  // BR-08: a full reference number never lands in the database.
  if (body.referenceLast4 !== undefined) out.referenceLast4 = body.referenceLast4 === null ? null : maskReference(body.referenceLast4);
  if (body.notes !== undefined) {
    if (typeof body.notes === 'string' && body.notes.length > 1000) return { ok: false, field: 'notes', message: 'Notes can be up to 1,000 characters.' };
    out.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
  }
  if (body.repeat !== undefined) {
    if (!REPEATS.includes(body.repeat as Repeat)) return { ok: false, field: 'repeat', message: 'Choose how often it repeats.' };
    out.repeat = body.repeat as Repeat;
  }
  if (body.repeatYears !== undefined) {
    const v = body.repeatYears;
    if (v === null) out.repeatYears = null;
    else if (typeof v === 'number' && Number.isInteger(v) && v >= 2 && v <= 10) out.repeatYears = v;
    else return { ok: false, field: 'repeatYears', message: 'Choose every 2 to 10 years.' };
  }
  if (out.repeat === 'years' && !out.repeatYears) out.repeatYears = 2;
  if (out.repeat !== 'years') out.repeatYears = null;
  if (body.offsets !== undefined) {
    const list = Array.isArray(body.offsets) ? body.offsets : null;
    if (!list || list.some((o) => !OFFSETS.includes(o as never))) {
      return { ok: false, field: 'offsets', message: 'Reminders can be 60, 30, 14, 7, 3 or 1 days before.' };
    }
    out.offsets = [...new Set(list as number[])].sort((a, b) => b - a);
  }
  if (body.assigneeId !== undefined) {
    if (body.assigneeId !== null && (typeof body.assigneeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.assigneeId))) {
      return { ok: false, field: 'assigneeId', message: 'Choose someone in your household.' };
    }
    out.assigneeId = (body.assigneeId as string | null) ?? null;
  }
  return { ok: true, value: out };
}

export function fieldsOfRow(row: ItemRow): ItemFields {
  return {
    title: row.title,
    dueDate: dayOf(row.due_date),
    category: row.category,
    action: row.action,
    amountCents: intOrNull(row.amount_cents),
    issuer: row.issuer,
    referenceLast4: row.reference_last4,
    notes: row.notes,
    repeat: row.repeat,
    repeatYears: intOrNull(row.repeat_years),
    offsets: intArray(row.offsets),
    assigneeId: row.assignee_id,
  };
}

/** The assignee must be a current member of THIS household (BR-01). */
export async function assertAssignee(c: Context, assigneeId: string | null): Promise<void> {
  if (!assigneeId) return;
  const found = await ours(c, 'dx__member').where('id', assigneeId).whereNull('removed_at').first();
  if (!found) throw new AppError('VALIDATION_ERROR', 'Choose someone in your household.', 400, { assigneeId: 'INVALID' });
}

export async function defaultOffsets(c: Context): Promise<number[]> {
  return (await proNow(c)) ? PRO_DEFAULT_OFFSETS : FREE_OFFSETS;
}

export function insertItemStatement(
  householdId: string,
  itemId: string,
  seriesId: string,
  f: ItemFields,
  meta: { source: 'scan' | 'manual' | 'repeat'; evidence: string | null; createdBy: string },
): Statement {
  return {
    sql: `INSERT INTO dx__item (id, household_id, series_id, title, category, action, status, due_date, amount_cents, issuer,
            reference_last4, notes, repeat, repeat_years, offsets, assignee_id, source, evidence, created_by, created_at, updated_at)
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::text, 'open', $7::date, $8::integer, $9::text,
            $10::text, $11::text, $12::text, $13::smallint, $14::smallint[], $15::uuid, $16::text, $17::text, $18::uuid, now(), now())`,
    params: [
      itemId, householdId, seriesId, f.title, f.category, f.action, f.dueDate, f.amountCents, f.issuer,
      f.referenceLast4, f.notes, f.repeat, f.repeatYears, f.offsets, f.assigneeId, meta.source, meta.evidence, meta.createdBy,
    ],
  };
}

async function listOpen(c: Context): Promise<ItemRow[]> {
  return ours(c, 'dx__item').where('status', 'open').whereNull('deleted_at').orderBy('due_date').limit(1000).rows<ItemRow>();
}

export const itemsRouter = defineRouter({
  name: 'items',

  build(app, { requireAuth }) {
    app.onError(handleError);

    /** Home in one round trip (CONTRACT §1 `Home`). */
    app.get('/home', requireAuth, requireHousehold, async (c) => {
      const household = await householdRow(c);
      const open = await itemsWire(c, await listOpen(c));
      const overdue = open.filter((i) => i.daysLeft < 0);
      const inbox = await ours(c, 'dx__document')
        .where('purpose', 'scan')
        .whereIn('status', ['review', 'failed'])
        .whereNull('deleted_at')
        .orderBy('created_at', 'desc')
        .limit(10)
        .rows<{ id: string; page_count: number | string; status: string; created_at: string }>();
      const members = await ours(c, 'dx__member').whereNull('removed_at').orderBy('created_at').rows<MemberRow>();
      return ok(c, {
        nextUp: open.find((i) => i.daysLeft >= 0) ?? open[0] ?? null,
        overdue,
        thisWeek: open.filter((i) => i.daysLeft >= 0 && i.daysLeft <= 7),
        thisMonth: open.filter((i) => i.daysLeft > 7 && i.daysLeft <= 31),
        laterCount: open.filter((i) => i.daysLeft > 31).length,
        inbox: inbox.map((d) => ({ id: d.id, pageCount: Number(d.page_count), status: d.status, createdAt: new Date(d.created_at).toISOString() })),
        plan: await planPayload(c, household),
        members: members.map((m) => memberWire(m, me(c).memberId)),
      });
    });

    /** Open: due date ascending. Done: most recently done first. 30 a page. */
    app.get('/items', requireAuth, requireHousehold, async (c) => {
      const status = c.req.query('status') === 'done' ? 'done' : 'open';
      const category = c.req.query('category');
      const q = (c.req.query('q') ?? '').trim().slice(0, 80);
      const offset = Math.max(0, Number(c.req.query('cursor')) || 0);
      const params: unknown[] = [me(c).householdId, status];
      let where = `household_id = $1::uuid AND status = $2::text AND deleted_at IS NULL`;
      if (category && (CATEGORIES as readonly string[]).includes(category)) {
        params.push(category);
        where += ` AND category = $${params.length}::text`;
      }
      if (q) {
        params.push(`%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
        where += ` AND (title ILIKE $${params.length}::text OR issuer ILIKE $${params.length}::text OR notes ILIKE $${params.length}::text)`;
      }
      const order = status === 'open' ? 'due_date ASC, id ASC' : 'done_at DESC NULLS LAST, id ASC';
      const rows = await rawRows<ItemRow>(c, `SELECT * FROM dx__item WHERE ${where} ORDER BY ${order} LIMIT 31 OFFSET ${offset}`, params);
      const page = rows.slice(0, 30);
      return ok(c, { items: await itemsWire(c, page), nextCursor: rows.length > 30 ? String(offset + 30) : null });
    });

    app.get('/items/:id', requireAuth, requireHousehold, async (c) => {
      const row = await ownItem(c, c.req.param('id'));
      if (!row) return notFound(c, 'That deadline is not here any more.');
      return ok(c, await itemDetail(c, row));
    });

    app.post('/items', requireAuth, requireHousehold, async (c) => {
      const body = await jsonBody(c);
      if (!body) return invalid(c, 'Expected a JSON body.');
      const parsed = parseItemInput(body, null, await defaultOffsets(c));
      if (!parsed.ok) return invalid(c, parsed.message, { [parsed.field]: 'INVALID' });
      await assertOffsetsAllowed(c, body.offsets === undefined ? undefined : parsed.value.offsets);
      await assertAssignee(c, parsed.value.assigneeId);
      await assertRoomFor(c, 1);

      const household = await householdRow(c);
      const itemId = id();
      await transaction(c, [
        insertItemStatement(household.id, itemId, itemId, parsed.value, { source: 'manual', evidence: null, createdBy: me(c).memberId }),
        ...replanStatements(household.id, { id: itemId, due_date: parsed.value.dueDate, offsets: parsed.value.offsets, status: 'open' }, household),
      ]);
      const row = await ownItem(c, itemId);
      return created(c, await itemDetail(c, row as ItemRow));
    });

    app.patch('/items/:id', requireAuth, requireHousehold, async (c) => {
      const row = await ownItem(c, c.req.param('id'));
      if (!row) return notFound(c, 'That deadline is not here any more.');
      const body = await jsonBody(c);
      if (!body) return invalid(c, 'Expected a JSON body.');
      const base = fieldsOfRow(row);
      const parsed = parseItemInput(body, base, base.offsets);
      if (!parsed.ok) return invalid(c, parsed.message, { [parsed.field]: 'INVALID' });
      const f = parsed.value;
      if (body.offsets !== undefined && f.offsets.join() !== base.offsets.join()) await assertOffsetsAllowed(c, f.offsets);
      if (f.assigneeId !== base.assigneeId) await assertAssignee(c, f.assigneeId);

      const household = await householdRow(c);
      const statements: Statement[] = [
        {
          sql: `UPDATE dx__item SET title = $3::text, category = $4::text, action = $5::text, due_date = $6::date, amount_cents = $7::integer,
                  issuer = $8::text, reference_last4 = $9::text, notes = $10::text, repeat = $11::text, repeat_years = $12::smallint,
                  offsets = $13::smallint[], assignee_id = $14::uuid, updated_at = now()
                WHERE id = $1::uuid AND household_id = $2::uuid`,
          params: [row.id, household.id, f.title, f.category, f.action, f.dueDate, f.amountCents, f.issuer, f.referenceLast4, f.notes, f.repeat, f.repeatYears, f.offsets, f.assigneeId],
        },
      ];
      // FR-R7: a new date or new offsets re-plan the unsent reminders.
      if (row.status === 'open' && (f.dueDate !== base.dueDate || f.offsets.join() !== base.offsets.join())) {
        statements.push(...replanStatements(household.id, { id: row.id, due_date: f.dueDate, offsets: f.offsets, status: 'open' }, household));
      }
      await transaction(c, statements);
      return ok(c, await itemDetail(c, (await ownItem(c, row.id)) as ItemRow));
    });

    /**
     * FR-I5/I6 — done. A repeating item makes its next occurrence in the
     * same write. Idempotent: the notification's Done button may retry.
     */
    app.post('/items/:id/done', requireAuth, requireHousehold, async (c) => {
      const replay = await remembered(c);
      if (replay !== undefined) return ok(c, replay);
      const row = await ownItem(c, c.req.param('id'));
      if (!row) return notFound(c, 'That deadline is not here any more.');
      if (row.status === 'done') {
        const [item] = await itemsWire(c, [row]);
        return ok(c, { item, next: null });
      }
      const household = await householdRow(c);
      const statements: Statement[] = [
        {
          sql: `UPDATE dx__item SET status = 'done', done_at = now(), done_by = $3::uuid, updated_at = now() WHERE id = $1::uuid AND household_id = $2::uuid`,
          params: [row.id, household.id, me(c).memberId],
        },
        { sql: `UPDATE dx__reminder SET canceled_at = now() WHERE item_id = $1::uuid AND sent_at IS NULL AND canceled_at IS NULL`, params: [row.id] },
      ];
      const base = fieldsOfRow(row);
      const nextDay = nextDueDate(base.dueDate, base.repeat, base.repeatYears);
      // A repeat already made (Done → Reopen → Done) is not made twice.
      const already = nextDay
        ? await ours(c, 'dx__item').where('series_id', row.series_id).where('due_date', nextDay).whereNull('deleted_at').first<{ id: string }>()
        : null;
      const nextId = nextDay && !already ? id() : null;
      if (nextDay && nextId) {
        const next: ItemFields = { ...base, dueDate: nextDay };
        statements.push(insertItemStatement(household.id, nextId, row.series_id, next, { source: 'repeat', evidence: null, createdBy: me(c).memberId }));
        statements.push(...replanStatements(household.id, { id: nextId, due_date: nextDay, offsets: next.offsets, status: 'open' }, household));
      }
      await transaction(c, statements);
      const done = (await ownItem(c, row.id)) as ItemRow;
      const created = nextId ? await ownItem(c, nextId) : null;
      const wired = await itemsWire(c, created ? [done, created] : [done]);
      const response = { item: wired[0], next: wired[1] ?? null };
      await remember(c, response);
      return ok(c, response);
    });

    app.post('/items/:id/reopen', requireAuth, requireHousehold, async (c) => {
      const row = await ownItem(c, c.req.param('id'));
      if (!row) return notFound(c, 'That deadline is not here any more.');
      if (row.status === 'open') return ok(c, (await itemsWire(c, [row]))[0]);
      await assertRoomFor(c, 1);
      const household = await householdRow(c);
      await transaction(c, [
        { sql: `UPDATE dx__item SET status = 'open', done_at = NULL, done_by = NULL, updated_at = now() WHERE id = $1::uuid AND household_id = $2::uuid`, params: [row.id, household.id] },
        ...replanStatements(household.id, { id: row.id, due_date: dayOf(row.due_date), offsets: intArray(row.offsets), status: 'open' }, household),
      ]);
      return ok(c, (await itemsWire(c, [(await ownItem(c, row.id)) as ItemRow]))[0]);
    });

    /** FR-R6 — one more reminder in 1, 3 or 7 days at the household's hour. Idempotent. */
    app.post('/items/:id/snooze', requireAuth, requireHousehold, async (c) => {
      const replay = await remembered(c);
      if (replay !== undefined) return ok(c, replay);
      const row = await ownItem(c, c.req.param('id'));
      if (!row) return notFound(c, 'That deadline is not here any more.');
      const body = await jsonBody(c);
      const days = body?.days;
      if (days !== 1 && days !== 3 && days !== 7) return invalid(c, 'Snooze for 1, 3 or 7 days.', { days: 'INVALID' });
      if (row.status === 'done') return fail(c, 'CONFLICT', 'That one is already done.', 409);
      const household = await householdRow(c);
      const at = snoozeAt(days, Number(household.remind_hour), household.timezone, new Date());
      await transaction(c, [
        // One snooze at a time: a new one replaces the last.
        { sql: `UPDATE dx__reminder SET canceled_at = now() WHERE item_id = $1::uuid AND kind = 'snooze' AND sent_at IS NULL AND canceled_at IS NULL`, params: [row.id] },
        {
          sql: `INSERT INTO dx__reminder (id, household_id, item_id, kind, offset_days, fire_at) VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'snooze', NULL, $3::timestamptz)`,
          params: [household.id, row.id, at],
        },
      ]);
      const [item] = await itemsWire(c, [row]);
      await remember(c, item);
      return ok(c, item);
    });

    /** Soft-deletes the item; its files and reminders go for good. */
    app.delete('/items/:id', requireAuth, requireHousehold, async (c) => {
      const row = await ownItem(c, c.req.param('id'));
      if (!row) return notFound(c, 'That deadline is not here any more.');
      const householdId = me(c).householdId;
      // Pages only of documents no other item still uses.
      const pages = await rawRows<{ storage_key: string; document_id: string }>(
        c,
        `SELECT p.storage_key, p.document_id FROM dx__page p
         JOIN dx__item_document l ON l.document_id = p.document_id AND l.item_id = $1::uuid
         WHERE p.household_id = $2::uuid
           AND NOT EXISTS (SELECT 1 FROM dx__item_document o JOIN dx__item oi ON oi.id = o.item_id AND oi.deleted_at IS NULL
                           WHERE o.document_id = p.document_id AND o.item_id <> $1::uuid)`,
        [row.id, householdId],
      );
      const docIds = [...new Set(pages.map((p) => p.document_id))];
      await transaction(c, [
        { sql: `UPDATE dx__item SET deleted_at = now(), updated_at = now() WHERE id = $1::uuid AND household_id = $2::uuid`, params: [row.id, householdId] },
        { sql: `DELETE FROM dx__reminder WHERE item_id = $1::uuid AND household_id = $2::uuid`, params: [row.id, householdId] },
        ...(docIds.length
          ? [{ sql: `UPDATE dx__document SET deleted_at = now(), updated_at = now() WHERE household_id = $1::uuid AND id = ANY($2::uuid[])`, params: [householdId, docIds] }]
          : []),
      ]);
      await deleteStored(c, pages.map((p) => p.storage_key));
      return ok(c, { deleted: true });
    });

    /* ── attachments (FR-I8) ────────────────────────────────────────────── */

    app.post('/items/:id/attachments', requireAuth, requireHousehold, async (c) => {
      const row = await ownItem(c, c.req.param('id'));
      if (!row) return notFound(c, 'That deadline is not here any more.');
      const body = await jsonBody(c);
      const pages = parsePages(c, body?.pages);
      if (!pages.ok) return invalid(c, pages.message, { pages: 'INVALID' });
      const householdId = me(c).householdId;
      const documentId = id();
      const keyed = pages.value.map((p, i) => ({ ...p, pageId: id(), idx: i }));
      const statements: Statement[] = [
        {
          sql: `INSERT INTO dx__document (id, household_id, purpose, status, source, page_count, created_by, confirmed_at, created_at, updated_at)
                VALUES ($1::uuid, $2::uuid, 'attachment', 'confirmed', 'attachment', $3::smallint, $4::uuid, now(), now(), now())`,
          params: [documentId, householdId, keyed.length, me(c).memberId],
        },
        { sql: `INSERT INTO dx__item_document (item_id, document_id, household_id) VALUES ($1::uuid, $2::uuid, $3::uuid)`, params: [row.id, documentId, householdId] },
        ...keyed.map((p) => ({
          sql: `INSERT INTO dx__page (id, household_id, document_id, idx, storage_key, mime, bytes) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::smallint, $5::text, $6::text, $7::integer)`,
          params: [p.pageId, householdId, documentId, p.idx, pageKey(householdId, documentId, p.pageId, p.mime), p.mime, p.bytes],
        })),
      ];
      await transaction(c, statements);
      const uploads = [];
      for (const p of keyed) {
        const signed = await uploadUrl(c, pageKey(householdId, documentId, p.pageId, p.mime), p.mime);
        uploads.push({ pageId: p.pageId, uploadUrl: signed.url, headers: signed.headers });
      }
      return created(c, { documentId, uploads });
    });

    app.delete('/items/:id/attachments/:documentId', requireAuth, requireHousehold, async (c) => {
      const row = await ownItem(c, c.req.param('id'));
      if (!row) return notFound(c, 'That deadline is not here any more.');
      const documentId = c.req.param('documentId');
      if (!/^[0-9a-f-]{36}$/i.test(documentId)) return notFound(c);
      const link = await ours(c, 'dx__item_document').where('item_id', row.id).where('document_id', documentId).first();
      if (!link) return notFound(c, 'That attachment is not here any more.');
      const pages = await ours(c, 'dx__page').where('document_id', documentId).rows<{ storage_key: string }>();
      const shared = await ours(c, 'dx__item_document').where('document_id', documentId).count();
      await transaction(c, [
        { sql: `DELETE FROM dx__item_document WHERE item_id = $1::uuid AND document_id = $2::uuid`, params: [row.id, documentId] },
        ...(Number(shared) <= 1
          ? [{ sql: `UPDATE dx__document SET deleted_at = now(), updated_at = now() WHERE id = $1::uuid AND household_id = $2::uuid`, params: [documentId, me(c).householdId] }]
          : []),
      ]);
      if (Number(shared) <= 1) await deleteStored(c, pages.map((p) => p.storage_key));
      return ok(c, { deleted: true });
    });
  },
});

/** Smaller than any real photo or PDF page. */
export const MIN_PAGE_BYTES = 1024;

export function pageKey(householdId: string, documentId: string, pageId: string, mime: string): string {
  return `households/${householdId}/docs/${documentId}/${pageId}.${mime === 'application/pdf' ? 'pdf' : 'jpg'}`;
}

/** ≤ 5 JPEGs (≤ 4 MB each) or exactly 1 PDF (≤ 15 MB). */
export function parsePages(c: Context, raw: unknown): Parsed<{ mime: 'image/jpeg' | 'application/pdf'; bytes: number }[]> {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length === 0 || list.length > 5) return { ok: false, field: 'pages', message: 'Add 1 to 5 photos, or one PDF.' };
  const out: { mime: 'image/jpeg' | 'application/pdf'; bytes: number }[] = [];
  for (const item of list) {
    const r = (item ?? {}) as Record<string, unknown>;
    const mime = r.mime === 'application/pdf' ? 'application/pdf' : r.mime === 'image/jpeg' ? 'image/jpeg' : null;
    const bytes = typeof r.bytes === 'number' && Number.isInteger(r.bytes) ? r.bytes : -1;
    if (!mime) return { ok: false, field: 'pages', message: 'Pages must be JPEG photos or a PDF.' };
    const max = mime === 'application/pdf' ? maxPdfBytes(env(c)) : maxImageBytes(env(c));
    // A real page is never this small: a phone that hands over a stub instead
    // of the photo (seen: 14 bytes) must fail here, not as an AI read later.
    if (bytes > 0 && bytes < MIN_PAGE_BYTES) {
      return { ok: false, field: 'pages', message: 'That page didn’t come through. Take the photo again.' };
    }
    if (bytes < 1 || bytes > max) {
      return { ok: false, field: 'pages', message: mime === 'application/pdf' ? 'That PDF is larger than 15 MB.' : 'A photo is larger than 4 MB.' };
    }
    out.push({ mime, bytes });
  }
  if (out.some((p) => p.mime === 'application/pdf') && out.length > 1) return { ok: false, field: 'pages', message: 'Add one PDF on its own.' };
  return { ok: true, value: out };
}

