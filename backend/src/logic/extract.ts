import { addDays, toDay } from './dates';
import { REPEATS, type Repeat } from './planner';

/**
 * What the reader is asked for, and the pure, tested step that turns its
 * answer into candidates (ARCHITECTURE §3.1). The model's output is never
 * trusted: every field is re-validated here, and anything doubtful becomes
 * null for the person to fill in rather than a guess (BR-02).
 */

export const CATEGORIES = [
  'id_travel', 'vehicle', 'home', 'insurance', 'bills', 'health', 'kids_school', 'subscriptions', 'work', 'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const ACTIONS = ['renew', 'pay', 'submit', 'cancel', 'book', 'attend', 'other'] as const;
export type Action = (typeof ACTIONS)[number];

export type Confidence = 'high' | 'medium' | 'low';
const CONFIDENCE = ['high', 'medium', 'low'] as const;

export interface Candidate {
  key: string;
  title: string | null;
  category: Category;
  action: Action;
  dueDate: string | null;
  evidence: string | null;
  amountCents: number | null;
  currency: string | null;
  issuer: string | null;
  referenceLast4: string | null;
  repeat: Repeat;
  notes: string | null;
  confidence: { title: Confidence; dueDate: Confidence; amount: Confidence };
}

const nullableString = { type: ['string', 'null'] };
const confidence = { type: 'string', enum: CONFIDENCE };

export const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['documentType', 'candidates'],
  properties: {
    documentType: { type: 'string', enum: ['renewal_notice', 'bill', 'form', 'letter', 'receipt', 'screenshot', 'other'] },
    candidates: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'category', 'action', 'dueDate', 'evidence', 'amount', 'currency', 'issuer', 'reference', 'repeat', 'notes', 'confidence'],
        properties: {
          title: nullableString,
          category: { type: 'string', enum: CATEGORIES },
          action: { type: 'string', enum: ACTIONS },
          dueDate: nullableString,
          evidence: nullableString,
          amount: nullableString,
          currency: nullableString,
          issuer: nullableString,
          reference: nullableString,
          repeat: { type: 'string', enum: REPEATS },
          notes: nullableString,
          confidence: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'dueDate', 'amount'],
            properties: { title: confidence, dueDate: confidence, amount: confidence },
          },
        },
      },
    },
  },
} as const;

export function extractionInstructions(today: string): string {
  return [
    'You read a photo or PDF of a household document: a letter, bill, renewal notice, form, receipt or screenshot.',
    `Today is ${today}. Find every action the reader must take by a deadline — at most 3, most important first.`,
    'For each one:',
    '- title: a short task in plain words, max 60 characters, e.g. "Car insurance renewal" or "Pay water bill". No account numbers.',
    '- dueDate: the deadline as YYYY-MM-DD, ONLY if the document prints a date for it ("Due date", "Pay by", "Renew before", "Expires", "Return by", "Last day", "Payment due"). Never invent one: no printed date means null.',
    '  If the printed date has no year (e.g. "Due Oct 28" or "28/10"), use the next date on or after the statement/letter date (or today if there is none) — that is reading the date, not guessing.',
    '  Numeric dates: decide day/month order from the document (country, currency, other dates on it); if it is still ambiguous, pick the reading that is in the future and set dueDate confidence to "low".',
    '  A bill that says "due on receipt" or "due immediately" has no date: use null.',
    '- evidence: the exact words from the document the date came from (max 140 characters), or null.',
    '- amount: the amount due exactly as printed (e.g. "$412.50"), or null. currency: ISO 4217 code, or null.',
    '- issuer: who sent it ("State Farm", "DMV"), or null.',
    '- reference: a policy/account/reference number if printed — ONLY its last 4 characters, or null.',
    '- repeat: how often this recurs if the document says so (a monthly bill → monthly, an annual policy → yearly), else none.',
    '- notes: one short helpful line (what to bring, where to pay), or null.',
    '- category and action: choose from the allowed lists.',
    '- confidence: high when printed clearly, medium when inferred from layout, low when partly unreadable.',
    'If the image is not a document, return documentType "other" and an empty candidates list.',
  ].join('\n');
}

/** First `{…}` block of a model reply, parsed — models sometimes wrap JSON in fences. */
export function parseModelJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/** BR-08: a reference is kept as its last 4 letters/digits, nothing more. */
export function maskReference(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const alnum = value.replace(/[^A-Za-z0-9]/g, '');
  return alnum.length === 0 ? null : alnum.slice(-4).toUpperCase();
}

/** "$1,412.50" / "412.5" / "USD 80" → cents. Anything ambiguous → null. */
export function parseAmountCents(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^0-9.,-]/g, '');
  if (!cleaned || cleaned.includes('-')) return null;
  // "1.234,56" (European) → 1234.56; "1,234.56" → 1234.56
  let normal = cleaned;
  if (/,\d{2}$/.test(cleaned) && cleaned.includes('.')) normal = cleaned.replace(/\./g, '').replace(',', '.');
  else if (/,\d{2}$/.test(cleaned)) normal = cleaned.replace(',', '.');
  else normal = cleaned.replace(/,/g, '');
  const n = Number(normal);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return null;
  return Math.round(n * 100);
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.replace(/\s+/g, ' ').trim();
  return t.length === 0 ? null : t.slice(0, max);
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * The model's JSON → at most 3 usable candidates.
 *
 * - a date that does not exist, or is more than 10 years out or 2 years back, becomes null;
 * - a candidate with neither a title nor a date is dropped;
 * - references are re-masked even though the model was told to mask (BR-08).
 */
export function coerceExtraction(raw: unknown, today: string): Candidate[] {
  const list = (raw as { candidates?: unknown })?.candidates;
  if (!Array.isArray(list)) return [];
  const latest = addDays(today, 3653);
  const earliest = addDays(today, -730);
  const out: Candidate[] = [];
  for (const item of list) {
    if (out.length >= 3) break;
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    let dueDate = toDay(r.dueDate);
    if (dueDate && (dueDate > latest || dueDate < earliest)) dueDate = null;
    const title = text(r.title, 80);
    if (!title && !dueDate) continue;
    const conf = (r.confidence ?? {}) as Record<string, unknown>;
    const currency = text(r.currency, 3);
    out.push({
      key: `c${out.length + 1}`,
      title,
      category: pick(r.category, CATEGORIES, 'other'),
      action: pick(r.action, ACTIONS, 'other'),
      dueDate,
      evidence: dueDate ? text(r.evidence, 200) : null,
      amountCents: parseAmountCents(r.amount),
      currency: currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null,
      issuer: text(r.issuer, 80),
      referenceLast4: maskReference(r.reference),
      repeat: pick(r.repeat, REPEATS, 'none'),
      notes: text(r.notes, 300),
      confidence: {
        title: pick(conf.title, CONFIDENCE, 'medium'),
        dueDate: dueDate ? pick(conf.dueDate, CONFIDENCE, 'medium') : 'low',
        amount: pick(conf.amount, CONFIDENCE, 'medium'),
      },
    });
  }
  return out;
}
