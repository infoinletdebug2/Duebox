import type { Context } from 'hono';
import { snakeRows } from '@xenition/sdk';
import { sdk, ours, me, env, scoped, userId } from './lib';
import { docBucket, docUrlTtlSeconds } from './config';
import { todayIn } from './logic/dates';
import { planReminders } from './logic/planner';
import { type ItemRow, type HouseholdRow, dayOf, intArray, itemWire, instant, int } from './rows';

/* ══ raw SQL, snake_cased ═════════════════════════════════════════════════
 * `snakeCaseQueryClient` wraps the builder only; raw() comes back camelCased
 * from the gateway, so it is normalised here. */

export async function rawRows<T>(c: Context, sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await sdk(c).query.raw<Record<string, unknown>>(sql, params);
  return snakeRows(result.data ?? []) as T[];
}

export type Statement = { sql: string; params: unknown[] };

/**
 * Apply several writes all-or-nothing — as ONE SQL statement.
 *
 * The gateway has no transaction route; each `/raw` call is one statement in
 * its own database transaction. So the writes are folded into one statement
 * of data-modifying CTEs (`WITH s0 AS (…), s1 AS (…) SELECT 1`), which
 * Postgres commits whole or not at all.
 *
 * The rule this imposes: the parts share ONE snapshot and cannot see each
 * other's effects. Never make one part depend on another's result.
 */
export async function transaction(c: Context, statements: Statement[]): Promise<void> {
  if (statements.length === 0) return;
  if (statements.length === 1) {
    const only = statements[0]!;
    await sdk(c).query.raw(only.sql, only.params);
    return;
  }
  const parts: string[] = [];
  const params: unknown[] = [];
  statements.forEach((s, i) => {
    const offset = params.length;
    const sql = s.sql.trim().replace(/;\s*$/, '').replace(/\$(\d+)/g, (_, n: string) => `$${Number(n) + offset}`);
    parts.push(`s${i} AS (${sql})`);
    params.push(...s.params);
  });
  await sdk(c).query.raw(`WITH ${parts.join(',\n')}\nSELECT 1 AS applied`, params);
}

/* ══ the household ═══════════════════════════════════════════════════════ */

export function today(c: Context): string {
  return todayIn(me(c).timezone);
}

export async function householdRow(c: Context): Promise<HouseholdRow> {
  const row = await scoped(c).from('dx__household').where('id', me(c).householdId).limit(1).first<HouseholdRow>();
  if (!row) throw new Error('household vanished mid-request');
  return row;
}

/* ══ storage (signed URLs live 15 minutes) ═══════════════════════════════ */

export function bucket(c: Context): string {
  return docBucket(env(c));
}

export async function signedUrl(c: Context, key: string, ttl?: number): Promise<string | null> {
  try {
    const signed = await sdk(c).storage.createSignedUrl(key, ttl ?? docUrlTtlSeconds(env(c)), { bucket: bucket(c) });
    return signed.url;
  } catch (error) {
    console.error('signed url failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/** A presigned PUT. The phone must send `headers` exactly — the URL is signed over them. */
export async function uploadUrl(c: Context, key: string, mime: string): Promise<{ url: string; headers: Record<string, string> }> {
  const signed = await sdk(c).storage.createUploadUrl(key, { bucket: bucket(c), contentType: mime, expiresInSeconds: 900 });
  return { url: signed.url, headers: signed.headers ?? { 'content-type': mime } };
}

/** Files after rows: an orphaned file is invisible; a row pointing at nothing is a broken screen. */
export async function deleteStored(c: Context, keys: string[]): Promise<void> {
  await Promise.all(
    keys.filter(Boolean).map((key) =>
      sdk(c).storage.delete(key, { bucket: bucket(c) }).catch((error: unknown) => console.error('storage delete failed:', error instanceof Error ? error.message : error)),
    ),
  );
}

/* ══ reminders (ARCHITECTURE §4) ═════════════════════════════════════════ */

/**
 * The statements that replace an item's unsent plan: cancel what was
 * planned (snoozes survive edits), insert the new plan. Returned, not run,
 * so a caller can fold them into the same all-or-nothing write.
 */
export function replanStatements(
  householdId: string,
  item: { id: string; due_date: string; offsets: number[]; status: 'open' | 'done' },
  household: { remind_hour: number | string; timezone: string },
  opts: { cancelSnoozes?: boolean } = {},
): Statement[] {
  const statements: Statement[] = [
    {
      sql: `UPDATE dx__reminder SET canceled_at = now()
            WHERE item_id = $1::uuid AND household_id = $2::uuid AND sent_at IS NULL AND canceled_at IS NULL
            ${opts.cancelSnoozes ? '' : "AND kind <> 'snooze'"}`,
      params: [item.id, householdId],
    },
  ];
  const plan = planReminders({
    dueDate: dayOf(item.due_date),
    offsets: item.offsets,
    remindHour: int(household.remind_hour),
    timezone: household.timezone,
    status: item.status,
    now: new Date(),
  });
  if (plan.length > 0) {
    const values: string[] = [];
    const params: unknown[] = [householdId, item.id];
    plan.forEach((p, i) => {
      const b = 3 + i * 3;
      values.push(`(gen_random_uuid(), $1::uuid, $2::uuid, $${b}::text, $${b + 1}::smallint, $${b + 2}::timestamptz)`);
      params.push(p.kind, p.offsetDays, p.fireAt);
    });
    statements.push({
      sql: `INSERT INTO dx__reminder (id, household_id, item_id, kind, offset_days, fire_at) VALUES ${values.join(', ')}`,
      params,
    });
  }
  return statements;
}

/**
 * Re-plan every open item of a household (the reminder hour or timezone
 * changed). One item per statement pair, folded in batches.
 */
export async function replanHousehold(c: Context, household: HouseholdRow): Promise<void> {
  const items = await scoped(c)
    .from('dx__item')
    .where('household_id', household.id)
    .where('status', 'open')
    .whereNull('deleted_at')
    .rows<ItemRow>();
  for (let i = 0; i < items.length; i += 20) {
    const batch = items.slice(i, i + 20);
    // Each item's cancel + insert touch only that item's rows: independent parts.
    await transaction(
      c,
      batch.flatMap((it) =>
        replanStatements(household.id, { id: it.id, due_date: dayOf(it.due_date), offsets: intArray(it.offsets), status: 'open' }, household),
      ),
    );
  }
}

/* ══ item payloads ═══════════════════════════════════════════════════════ */

/** Wire items with attachment counts and next reminder, batched (two queries for any number). */
export async function itemsWire(c: Context, rows: ItemRow[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const counts = await rawRows<{ item_id: string; n: number | string }>(
    c,
    `SELECT d.item_id, count(*)::int AS n FROM dx__item_document d
     JOIN dx__document doc ON doc.id = d.document_id AND doc.deleted_at IS NULL
     WHERE d.household_id = $1::uuid AND d.item_id = ANY($2::uuid[]) GROUP BY d.item_id`,
    [me(c).householdId, ids],
  );
  const next = await rawRows<{ item_id: string; fire_at: string }>(
    c,
    `SELECT item_id, min(fire_at) AS fire_at FROM dx__reminder
     WHERE household_id = $1::uuid AND item_id = ANY($2::uuid[]) AND sent_at IS NULL AND canceled_at IS NULL
     GROUP BY item_id`,
    [me(c).householdId, ids],
  );
  const t = today(c);
  return rows.map((r) =>
    itemWire(r, t, {
      attachmentCount: int(counts.find((x) => x.item_id === r.id)?.n),
      nextReminderAt: instant(next.find((x) => x.item_id === r.id)?.fire_at),
    }),
  );
}

export async function ownItem(c: Context, itemId: string): Promise<ItemRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return null;
  return ours(c, 'dx__item').where('id', itemId).whereNull('deleted_at').first<ItemRow>();
}

export async function itemDetail(c: Context, row: ItemRow) {
  const [base] = await itemsWire(c, [row]);
  const links = await ours(c, 'dx__item_document').where('item_id', row.id).rows<{ document_id: string }>();
  const docIds = links.map((l) => l.document_id);
  const docs = docIds.length
    ? await ours(c, 'dx__document').whereIn('id', docIds).whereNull('deleted_at').orderBy('created_at').rows<{ id: string }>()
    : [];
  const pages = docs.length
    ? await ours(c, 'dx__page').whereIn('document_id', docs.map((d) => d.id)).orderBy('idx').rows<{ id: string; document_id: string; idx: number; mime: string; storage_key: string }>()
    : [];
  const signed = await Promise.all(pages.map(async (p) => ({ ...p, url: await signedUrl(c, p.storage_key) })));
  const series = await ours(c, 'dx__item').where('series_id', row.series_id).whereNull('deleted_at').count();
  return {
    ...base!,
    attachments: docs.map((d) => ({
      documentId: d.id,
      pages: signed.filter((p) => p.document_id === d.id).map((p) => ({ id: p.id, index: int(p.idx), mime: p.mime, url: p.url })),
    })),
    evidence: row.evidence,
    seriesCount: Number(series),
  };
}

/* ══ idempotency (Done / Snooze from a notification may retry) ═══════════ */

export async function remembered(c: Context): Promise<unknown | undefined> {
  const key = c.req.header('idempotency-key');
  if (!key || key.length > 100) return undefined;
  const row = await scoped(c).from('dx__idempotency').where('key', `${userId(c)}:${key}`).first<{ response: unknown }>();
  if (!row) return undefined;
  return typeof row.response === 'string' ? JSON.parse(row.response) : row.response;
}

export async function remember(c: Context, response: unknown): Promise<void> {
  const key = c.req.header('idempotency-key');
  if (!key || key.length > 100) return;
  await rawRows(
    c,
    `INSERT INTO dx__idempotency (key, user_id, response) VALUES ($1::text, $2::text, $3::jsonb) ON CONFLICT (key) DO NOTHING`,
    [`${userId(c)}:${key}`, userId(c), JSON.stringify(response)],
  ).catch((error: unknown) => console.error('idempotency save failed:', error instanceof Error ? error.message : error));
}
