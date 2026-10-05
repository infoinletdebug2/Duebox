/**
 * Screenshot demo data for one account — a US household with a realistic mix
 * of deadlines: overdue, due this week, this month, later, repeating, done,
 * one with the scanned letter attached, and one scan waiting in the inbox.
 *
 *   npx tsx --env-file=.dev.vars scripts/seed-demo.ts <email>          # (re)seed
 *   npx tsx --env-file=.dev.vars scripts/seed-demo.ts <email> --reset  # remove the demo rows only
 *
 * Seeding switches the household to USD and America/Chicago (US screenshots).
 * Every demo row is tagged — items by a series_id starting `de0d0000-`,
 * documents by model 'demo-seed' — so --reset removes exactly those and
 * nothing the person made. Dates are relative to "today" in the household's
 * zone, so the screenshots always read "1 overdue, 2 due this week".
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { XenitionClient, snakeRows } from '@xenition/sdk';
import { addDays, todayIn } from '../src/logic/dates';
import { planReminders, nextDueDate, type Repeat } from '../src/logic/planner';

const [email, flag] = process.argv.slice(2);
if (!email) throw new Error('usage: seed-demo.ts <email> [--reset]');
const client = new XenitionClient(process.env.XENITION_API_KEY!, { baseUrl: process.env.XENITION_API_URL });
const BUCKET = process.env.DOC_BUCKET ?? 'default';
const TZ = 'America/Chicago'; // the issuers are in Austin, Texas

async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  return snakeRows((await client.query.raw<Record<string, unknown>>(text, params)).data ?? []) as T[];
}

const demoSeries = () => `de0d0000-0000-4000-8000-${randomUUID().replace(/-/g, '').slice(0, 12)}`;

const [member] = await sql<{ id: string; household_id: string; role: string }>(
  `SELECT id, household_id, role FROM dx__member WHERE lower(email) = lower($1::text) AND removed_at IS NULL LIMIT 1`,
  [email],
);
if (!member) throw new Error(`No Duebox account for ${email} — sign up in the app first.`);
const hh = member.household_id;

/* ── remove previous demo rows ───────────────────────────────────────────── */
const oldPages = await sql<{ storage_key: string }>(
  `SELECT p.storage_key FROM dx__page p JOIN dx__document d ON d.id = p.document_id WHERE d.household_id = $1::uuid AND d.model = 'demo-seed'`,
  [hh],
);
await sql(
  `WITH r AS (DELETE FROM dx__reminder WHERE household_id = $1::uuid AND item_id IN (SELECT id FROM dx__item WHERE household_id = $1::uuid AND series_id::text LIKE 'de0d0000-%')),
        l AS (DELETE FROM dx__item_document WHERE household_id = $1::uuid AND (item_id IN (SELECT id FROM dx__item WHERE household_id = $1::uuid AND series_id::text LIKE 'de0d0000-%') OR document_id IN (SELECT id FROM dx__document WHERE household_id = $1::uuid AND model = 'demo-seed')))
   SELECT 1`,
  [hh],
);
await sql(`DELETE FROM dx__page WHERE household_id = $1::uuid AND document_id IN (SELECT id FROM dx__document WHERE household_id = $1::uuid AND model = 'demo-seed')`, [hh]);
await sql(`DELETE FROM dx__document WHERE household_id = $1::uuid AND model = 'demo-seed'`, [hh]);
await sql(`DELETE FROM dx__item WHERE household_id = $1::uuid AND series_id::text LIKE 'de0d0000-%'`, [hh]);
for (const p of oldPages) {
  const path = p.storage_key.split('/').map(encodeURIComponent).join('/');
  await fetch(`${process.env.XENITION_API_URL}/app-platform/storage/${BUCKET}/${path}`, { method: 'DELETE', headers: { 'x-api-key': process.env.XENITION_API_KEY! } }).catch(() => undefined);
}
if (flag === '--reset') {
  console.log(`removed the demo rows for ${email}`);
  process.exit(0);
}

/* ── a US household ──────────────────────────────────────────────────────── */
await sql(`UPDATE dx__household SET currency = 'USD', timezone = $2::text, focus = '{insurance,vehicle,bills}', updated_at = now() WHERE id = $1::uuid`, [hh, TZ]);
const [{ remind_hour }] = await sql<{ remind_hour: number }>(`SELECT remind_hour FROM dx__household WHERE id = $1::uuid`, [hh]);
const today = todayIn(TZ);

interface Demo {
  title: string; days: number; category: string; action: string; cents?: number; issuer?: string; ref?: string;
  repeat?: Repeat; years?: number; notes?: string; evidence?: string; done?: number; attach?: boolean;
}

const DEMO: Demo[] = [
  // overdue
  { title: 'Property tax — 2nd installment', days: -3, category: 'home', action: 'pay', cents: 186_450, issuer: 'Travis County Tax Office', ref: '7730', repeat: 'half_yearly' },
  // this week
  { title: 'School field trip form', days: 0, category: 'kids_school', action: 'submit', cents: 2_500, issuer: 'Lincoln Elementary', notes: 'Signed form + $25 in an envelope.' },
  { title: 'Water & sewer bill', days: 2, category: 'bills', action: 'pay', cents: 8_640, issuer: 'Austin Water', repeat: 'monthly' },
  { title: 'Car insurance', days: 6, category: 'insurance', action: 'renew', cents: 41_250, issuer: 'State Farm', ref: '4821', repeat: 'yearly',
    evidence: 'Your renewal premium of $412.50 must be received no later than the renewal date to keep your coverage.', attach: true,
    notes: 'Policy covers both cars. Ask about the low-mileage discount.' },
  // this month
  { title: 'Streaming free trial ends', days: 12, category: 'subscriptions', action: 'cancel', cents: 1_599, issuer: 'StreamFlix' },
  { title: 'Dentist check-up', days: 19, category: 'health', action: 'book', issuer: 'Bright Smile Dental' },
  { title: 'Car registration', days: 27, category: 'vehicle', action: 'renew', cents: 16_800, issuer: 'Texas DMV', repeat: 'yearly' },
  // later
  { title: 'Passport renewal', days: 46, category: 'id_travel', action: 'renew', cents: 13_000, issuer: 'U.S. Department of State', repeat: 'years', years: 10 },
  { title: 'Home insurance', days: 63, category: 'insurance', action: 'renew', cents: 124_000, issuer: 'Allstate', repeat: 'yearly' },
  { title: 'Nursing license renewal', days: 95, category: 'work', action: 'renew', cents: 10_000, issuer: 'Texas Board of Nursing', repeat: 'years', years: 2 },
  // done
  { title: 'Electric bill', days: -6, category: 'bills', action: 'pay', cents: 11_235, issuer: 'Austin Energy', done: 7 },
  { title: 'Gym membership', days: -12, category: 'subscriptions', action: 'cancel', cents: 4_999, issuer: 'FitLife', done: 13 },
  { title: 'Flu shots for the kids', days: -20, category: 'health', action: 'book', issuer: 'CVS MinuteClinic', done: 21 },
];

const writes: { sql: string; params: unknown[] }[] = [];
let attachTo: string | null = null;

for (const d of DEMO) {
  const id = randomUUID();
  const due = addDays(today, d.days);
  const offsets = [30, 7, 1];
  const status = d.done !== undefined ? 'done' : 'open';
  writes.push({
    sql: `INSERT INTO dx__item (id, household_id, series_id, title, category, action, status, due_date, amount_cents, issuer, reference_last4, notes,
            repeat, repeat_years, offsets, source, evidence, done_at, done_by, created_by, created_at, updated_at)
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::text, $7::text, $8::date, $9::integer, $10::text, $11::text, $12::text,
            $13::text, $14::smallint, $15::smallint[], $16::text, $17::text, $18::timestamptz, $19::uuid, $19::uuid, now() - interval '9 days', now())`,
    params: [id, hh, demoSeries(), d.title, d.category, d.action, status, due, d.cents ?? null, d.issuer ?? null, d.ref ?? null, d.notes ?? null,
      d.repeat ?? 'none', d.repeat === 'years' ? d.years ?? 2 : null, offsets, d.evidence ? 'scan' : 'manual', d.evidence ?? null,
      d.done !== undefined ? `${addDays(today, -d.done)}T15:00:00Z` : null, member.id],
  });
  if (status === 'open') {
    for (const r of planReminders({ dueDate: due, offsets, remindHour: Number(remind_hour), timezone: TZ, status: 'open', now: new Date() })) {
      writes.push({
        sql: `INSERT INTO dx__reminder (id, household_id, item_id, kind, offset_days, fire_at) VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::text, $4::smallint, $5::timestamptz)`,
        params: [hh, id, r.kind, r.offsetDays, r.fireAt],
      });
    }
  }
  if (d.attach) attachTo = id;
  void nextDueDate;
}
for (const w of writes) await sql(w.sql, w.params);

/* ── the scanned letter: attached to Car insurance, and a scan in the inbox ── */
async function storePage(documentId: string): Promise<{ key: string; bytes: number }> {
  const bytes = readFileSync(new URL('./sample-letter.jpg', import.meta.url));
  const key = `households/${hh}/docs/${documentId}/${randomUUID()}.jpg`;
  const up = await client.storage.createUploadUrl(key, { bucket: BUCKET, contentType: 'image/jpeg', expiresInSeconds: 600 });
  const res = await fetch(up.url, { method: 'PUT', headers: up.headers, body: bytes });
  if (!res.ok) throw new Error(`page upload failed: ${res.status}`);
  return { key, bytes: bytes.length };
}

if (attachTo) {
  const doc = randomUUID();
  const page = await storePage(doc);
  await sql(`INSERT INTO dx__document (id, household_id, purpose, status, source, page_count, model, created_by, confirmed_at, created_at, updated_at)
             VALUES ($1::uuid, $2::uuid, 'scan', 'confirmed', 'camera', 1, 'demo-seed', $3::uuid, now(), now(), now())`, [doc, hh, member.id]);
  await sql(`INSERT INTO dx__page (id, household_id, document_id, idx, storage_key, mime, bytes) VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 0, $3::text, 'image/jpeg', $4::integer)`, [hh, doc, page.key, page.bytes]);
  await sql(`INSERT INTO dx__item_document (item_id, document_id, household_id) VALUES ($1::uuid, $2::uuid, $3::uuid)`, [attachTo, doc, hh]);
}

{
  const doc = randomUUID();
  const page = await storePage(doc);
  const draft = {
    candidates: [
      { key: 'c1', title: 'School enrollment form', category: 'kids_school', action: 'submit', dueDate: addDays(today, 10), evidence: `Please return the completed enrollment form by ${addDays(today, 10)}.`,
        amountCents: null, currency: null, issuer: 'Lincoln Elementary', referenceLast4: null, repeat: 'none', notes: null, confidence: { title: 'high', dueDate: 'high', amount: 'low' } },
      { key: 'c2', title: 'Spring term fees', category: 'kids_school', action: 'pay', dueDate: addDays(today, 24), evidence: 'Term fees of $180.00 are due by the end of the month.',
        amountCents: 18_000, currency: 'USD', issuer: 'Lincoln Elementary', referenceLast4: '0937', repeat: 'none', notes: null, confidence: { title: 'medium', dueDate: 'medium', amount: 'high' } },
    ],
  };
  await sql(`INSERT INTO dx__document (id, household_id, purpose, status, source, page_count, draft, model, read_ms, created_by, created_at, updated_at)
             VALUES ($1::uuid, $2::uuid, 'scan', 'review', 'camera', 1, $3::jsonb, 'demo-seed', 4200, $4::uuid, now() - interval '1 hour', now())`, [doc, hh, JSON.stringify(draft), member.id]);
  await sql(`INSERT INTO dx__page (id, household_id, document_id, idx, storage_key, mime, bytes) VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 0, $3::text, 'image/jpeg', $4::integer)`, [hh, doc, page.key, page.bytes]);
}

const open = DEMO.filter((d) => d.done === undefined).length;
console.log(`seeded ${email}: ${open} open deadlines (1 overdue, 3 this week), ${DEMO.length - open} done, 1 scan in the inbox · USD · ${TZ}`);
