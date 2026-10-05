import type { Context } from 'hono';
import { defineRouter } from '@xenition/sdk/hono';
import { me, ours, ok, created, invalid, fail, notFound, jsonBody, id } from '../lib';
import { requireHousehold, assertRoomFor, assertScanAllowance, assertOffsetsAllowed } from '../middleware';
import { ReadFailed, readDocument, readerConfigured } from '../reader';
import type { Candidate } from '../logic/extract';
import {
  type Statement,
  deleteStored,
  householdRow,
  itemDetail,
  ownItem,
  rawRows,
  replanStatements,
  signedUrl,
  today,
  transaction,
  uploadUrl,
} from '../services';
import { type DocumentRow, type ItemRow, type PageRow, int, instant, jsonOf } from '../rows';
import { assertAssignee, defaultOffsets, insertItemStatement, pageKey, parseItemInput, parsePages, type ItemFields } from './items';
import { handleError } from '../errors';

/**
 * `scans` — snap a letter, the AI reads it, you confirm (SRS FR-S1…S6,
 * ARCHITECTURE §3). AI output is a draft until confirmed (BR-02).
 */

async function ownScan(c: Context, scanId: string): Promise<DocumentRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(scanId)) return null;
  return ours(c, 'dx__document').where('id', scanId).where('purpose', 'scan').whereNull('deleted_at').first<DocumentRow>();
}

async function scanWire(c: Context, d: DocumentRow) {
  const pages = await ours(c, 'dx__page').where('document_id', d.id).orderBy('idx').rows<PageRow>();
  const draft = jsonOf<{ candidates?: Candidate[] } | null>(d.draft, null);
  const readError = d.read_error;
  return {
    id: d.id,
    status: d.status,
    pageCount: int(d.page_count),
    pages: await Promise.all(pages.map(async (p) => ({ id: p.id, index: int(p.idx), mime: p.mime, url: d.status === 'uploading' ? null : await signedUrl(c, p.storage_key) }))),
    candidates: d.status === 'review' ? draft?.candidates ?? [] : [],
    readError: readError === 'no_date' || readError === 'unreadable' || readError === 'not_document' || readError === 'timeout' ? readError : readError ? 'unreadable' : null,
    createdAt: instant(d.created_at) ?? '',
  };
}

export const scansRouter = defineRouter({
  name: 'scans',

  build(app, { requireAuth, rateLimit }) {
    app.onError(handleError);

    /** The scan row and one presigned PUT per page. The worker never carries the bytes. */
    app.post('/scans', requireAuth, requireHousehold, rateLimit(30), async (c) => {
      const body = await jsonBody(c);
      if (!body) return invalid(c, 'Expected a JSON body.');
      const source = ['camera', 'library', 'pdf'].includes(body.source as string) ? (body.source as string) : null;
      if (!source) return invalid(c, 'Choose camera, photos or PDF.', { source: 'INVALID' });
      const pages = parsePages(c, body.pages);
      if (!pages.ok) return invalid(c, pages.message, { pages: 'INVALID' });
      // Say so before the upload, not after it.
      await assertScanAllowance(c);

      const householdId = me(c).householdId;
      const scanId = id();
      const keyed = pages.value.map((p, i) => ({ ...p, pageId: id(), idx: i }));
      await transaction(c, [
        {
          sql: `INSERT INTO dx__document (id, household_id, purpose, status, source, page_count, created_by, created_at, updated_at)
                VALUES ($1::uuid, $2::uuid, 'scan', 'uploading', $3::text, $4::smallint, $5::uuid, now(), now())`,
          params: [scanId, householdId, source, keyed.length, me(c).memberId],
        },
        ...keyed.map((p) => ({
          sql: `INSERT INTO dx__page (id, household_id, document_id, idx, storage_key, mime, bytes) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::smallint, $5::text, $6::text, $7::integer)`,
          params: [p.pageId, householdId, scanId, p.idx, pageKey(householdId, scanId, p.pageId, p.mime), p.mime, p.bytes],
        })),
      ]);
      const uploads = [];
      for (const p of keyed) {
        const signed = await uploadUrl(c, pageKey(householdId, scanId, p.pageId, p.mime), p.mime);
        uploads.push({ pageId: p.pageId, uploadUrl: signed.url, headers: signed.headers });
      }
      return created(c, { scan: await scanWire(c, (await ownScan(c, scanId)) as DocumentRow), uploads });
    });

    /** Read the uploaded pages. A scan that finds something counts against the month. */
    app.post('/scans/:id/read', requireAuth, requireHousehold, rateLimit(20), async (c) => {
      const d = await ownScan(c, c.req.param('id'));
      if (!d) return notFound(c, 'That scan is not here any more.');
      if (d.status === 'confirmed') return fail(c, 'CONFLICT', 'This scan is already saved.', 409);
      if (d.status === 'review') return ok(c, await scanWire(c, d));
      const month = await assertScanAllowance(c);
      if (!readerConfigured(c)) return fail(c, 'READER_UNAVAILABLE', 'Reading letters is not set up on this server yet. You can type it in instead.', 503);

      const pages = await ours(c, 'dx__page').where('document_id', d.id).orderBy('idx').rows<PageRow>();
      if (pages.length === 0) return fail(c, 'CONFLICT', 'This scan has no pages.', 409);
      const signed = await Promise.all(pages.map(async (p) => ({ url: await signedUrl(c, p.storage_key, 600), mime: p.mime as 'image/jpeg' | 'application/pdf' })));
      if (signed.some((p) => !p.url)) return fail(c, 'CONFLICT', 'The upload has not finished. Try again in a moment.', 409);

      const householdId = me(c).householdId;
      await rawRows(c, `UPDATE dx__document SET status = 'reading', read_error = NULL, updated_at = now() WHERE id = $1::uuid AND household_id = $2::uuid`, [d.id, householdId]);
      try {
        const read = await readDocument(c, signed.map((p) => ({ url: p.url as string, mime: p.mime })), today(c));
        await transaction(c, [
          {
            sql: `UPDATE dx__document SET status = 'review', draft = $3::jsonb, model = $4::text, read_ms = $5::integer, updated_at = now()
                  WHERE id = $1::uuid AND household_id = $2::uuid`,
            params: [d.id, householdId, JSON.stringify({ candidates: read.candidates }), read.model, read.ms],
          },
          {
            sql: `INSERT INTO dx__usage (household_id, month, scans) VALUES ($1::uuid, $2::text, 1)
                  ON CONFLICT (household_id, month) DO UPDATE SET scans = dx__usage.scans + 1`,
            params: [householdId, month],
          },
        ]);
      } catch (error) {
        const reason = error instanceof ReadFailed ? error.reason : 'unreadable';
        await rawRows(c, `UPDATE dx__document SET status = 'failed', read_error = $3::text, updated_at = now() WHERE id = $1::uuid AND household_id = $2::uuid`, [d.id, householdId, reason]);
        if (!(error instanceof ReadFailed)) throw error;
        const message =
          reason === 'no_date'
            ? 'We couldn’t find a date on this one. Type it in — it takes ten seconds.'
            : reason === 'not_document'
              ? 'That doesn’t look like a letter or a bill. Try another photo, or type it in.'
              : reason === 'timeout'
                ? 'Reading took too long. Try again, or type it in.'
                : 'We couldn’t read this one clearly. Retake it in good light, or type it in.';
        return c.json({ success: false, error: { code: 'READ_FAILED', message, reason } }, 422);
      }
      return ok(c, await scanWire(c, (await ownScan(c, d.id)) as DocumentRow));
    });

    app.get('/scans/:id', requireAuth, requireHousehold, async (c) => {
      const d = await ownScan(c, c.req.param('id'));
      if (!d) return notFound(c, 'That scan is not here any more.');
      return ok(c, await scanWire(c, d));
    });

    /** BR-02: only this turns a draft into deadlines. 1–3 items; every page attaches to each. */
    app.post('/scans/:id/confirm', requireAuth, requireHousehold, async (c) => {
      const d = await ownScan(c, c.req.param('id'));
      if (!d) return notFound(c, 'That scan is not here any more.');
      if (d.status === 'confirmed') return fail(c, 'CONFLICT', 'This scan is already saved.', 409);
      if (d.status === 'uploading' || d.status === 'reading') return fail(c, 'CONFLICT', 'This scan is still being read.', 409);
      const body = await jsonBody(c);
      const list = Array.isArray(body?.items) ? (body.items as unknown[]) : [];
      if (list.length < 1 || list.length > 3) return invalid(c, 'Choose one to three deadlines to save.', { items: 'INVALID' });

      const draft = jsonOf<{ candidates?: Candidate[] } | null>(d.draft, null);
      const offsetsDefault = await defaultOffsets(c);
      const parsed: { fields: ItemFields; evidence: string | null; customOffsets: boolean }[] = [];
      for (const [i, raw] of list.entries()) {
        const r = (raw ?? {}) as Record<string, unknown>;
        const p = parseItemInput(r, null, offsetsDefault);
        if (!p.ok) return invalid(c, p.message, { [`items.${i}.${p.field}`]: 'INVALID' });
        await assertAssignee(c, p.value.assigneeId);
        const candidate = draft?.candidates?.find((x) => x.key === r.candidateKey);
        // The evidence stays only if the person kept the date the AI found.
        const evidence = candidate && candidate.dueDate === p.value.dueDate ? candidate.evidence : null;
        parsed.push({ fields: p.value, evidence, customOffsets: r.offsets !== undefined });
      }
      for (const p of parsed) if (p.customOffsets) await assertOffsetsAllowed(c, p.fields.offsets);
      await assertRoomFor(c, parsed.length);

      const household = await householdRow(c);
      const ids = parsed.map(() => id());
      const statements: Statement[] = [
        { sql: `UPDATE dx__document SET status = 'confirmed', confirmed_at = now(), updated_at = now() WHERE id = $1::uuid AND household_id = $2::uuid`, params: [d.id, household.id] },
      ];
      parsed.forEach((p, i) => {
        const itemId = ids[i]!;
        statements.push(insertItemStatement(household.id, itemId, itemId, p.fields, { source: 'scan', evidence: p.evidence, createdBy: me(c).memberId }));
        statements.push({ sql: `INSERT INTO dx__item_document (item_id, document_id, household_id) VALUES ($1::uuid, $2::uuid, $3::uuid)`, params: [itemId, d.id, household.id] });
        statements.push(...replanStatements(household.id, { id: itemId, due_date: p.fields.dueDate, offsets: p.fields.offsets, status: 'open' }, household));
      });
      await transaction(c, statements);
      const items = [];
      for (const itemId of ids) items.push(await itemDetail(c, (await ownItem(c, itemId)) as ItemRow));
      return ok(c, { items });
    });

    /** Discard an unsaved scan and its files. */
    app.delete('/scans/:id', requireAuth, requireHousehold, async (c) => {
      const d = await ownScan(c, c.req.param('id'));
      if (!d) return notFound(c, 'That scan is not here any more.');
      if (d.status === 'confirmed') return fail(c, 'CONFLICT', 'This scan is saved to deadlines — delete those instead.', 409);
      const pages = await ours(c, 'dx__page').where('document_id', d.id).rows<PageRow>();
      await rawRows(c, `UPDATE dx__document SET deleted_at = now(), updated_at = now() WHERE id = $1::uuid AND household_id = $2::uuid`, [d.id, me(c).householdId]);
      await deleteStored(c, pages.map((p) => p.storage_key));
      return ok(c, { deleted: true });
    });
  },
});
