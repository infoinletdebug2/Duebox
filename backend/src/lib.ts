import type { Context } from 'hono';
import { XenitionClient, snakeCaseQueryClient } from '@xenition/sdk';
import { createClientFromEnv, currentUserId, readEnvVar } from '@xenition/sdk/hono';
import type { EnvReader } from './config';
import type { Role } from './rows';

/**
 * Shared helpers for Duebox's routers. The job is to make the SAFE thing
 * the easy thing.
 *
 * There is no row-level security on this platform: every query runs with the
 * service key's authority, so the `WHERE household_id = …` in our own code IS the
 * privacy boundary (SRS BR-01). `ours()` is the answer:
 *
 *   - the household id comes from the caller's **membership row**, read on this
 *     request — never from a body, path or query string;
 *   - it throws rather than returning an unscoped builder, so a route that
 *     forgets `requireHousehold` fails on its first request.
 */

/** SDK modules used for their clients. Billing only (receipts are not a wheel to reinvent). */
export const MODULES = ['billing'] as const;

export { readEnvVar };

let cached: XenitionClient | undefined;

/** The service-key client, cached per isolate. Never runs DDL. */
export function sdk(c: Context): XenitionClient {
  if (!cached) {
    cached = createClientFromEnv({
      XENITION_API_KEY: readEnvVar(c, 'XENITION_API_KEY'),
      XENITION_API_URL: readEnvVar(c, 'XENITION_API_URL'),
    });
    for (const m of MODULES) cached.modules.use(m);
  }
  return cached;
}

/** A reader over this request's env, for `config.ts`. */
export function env(c: Context): EnvReader {
  return (name) => readEnvVar(c, name);
}

/**
 * A query client whose rows come back snake_cased, whichever runtime answers.
 * The gateway camelCases rows and the engine does not; every router here is
 * written against snake_case because that is what the SQL says.
 */
export function scoped(c: Context) {
  return snakeCaseQueryClient(sdk(c).query);
}

/** The caller's platform user id. Only valid behind `requireAuth`. */
export function userId(c: Context): string {
  const id = currentUserId(c);
  if (!id) throw new Error('userId(): no authenticated user — mount requireAuth first.');
  return id;
}

/** The bearer token this request arrived with, for per-user SDK calls. */
export function bearer(c: Context): string | undefined {
  const header = c.req.header('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) return undefined;
  return header.slice(7).trim() || undefined;
}

/* ══ the envelope (CONTRACT §1) ══════════════════════════════════════════ */

export function ok<T>(c: Context, data: T, status = 200) {
  return c.json({ success: true, data }, status as 200);
}

export function created<T>(c: Context, data: T) {
  return ok(c, data, 201);
}

export function fail(
  c: Context,
  code: string,
  message: string,
  status = 400,
  fields?: Record<string, string>,
) {
  const error: Record<string, unknown> = { code, message };
  if (fields) error.fields = fields;
  return c.json({ success: false, error }, status as 400);
}

export function invalid(c: Context, message: string, fields?: Record<string, string>) {
  return fail(c, 'VALIDATION_ERROR', message, 400, fields);
}

export function notFound(c: Context, message = 'That is not here any more.') {
  return fail(c, 'NOT_FOUND', message, 404);
}

/** An error a handler can throw from several frames deep; `index.ts` maps it. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly fields?: Record<string, string>,
    /** 402 only: which gate (CONTRACT §0) — the paywall picks its headline from it. */
    readonly reason?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/* ══ the household boundary (BR-01) ═════════════════════════════════════════ */

export interface Membership {
  householdId: string;
  memberId: string;
  userId: string;
  role: Role;
  displayName: string;
  timezone: string;
  householdName: string;
  remindHour: number;
  currency: string;
}

const MEMBERSHIP = 'duebox:membership';

/**
 * The caller's membership, or null before onboarding. Cached on the context:
 * one request touches `ours()` many times and each would be a gateway trip.
 */
export async function membership(c: Context): Promise<Membership | null> {
  const hit = c.get(MEMBERSHIP) as Membership | null | undefined;
  if (hit !== undefined) return hit;

  const db = scoped(c);
  const uid = userId(c);

  const member = await db
    .from('dx__member')
    .where('user_id', uid)
    .whereNull('removed_at')
    .limit(1)
    .first<{ id: string; household_id: string; role: Role; display_name: string }>();

  if (!member) {
    c.set(MEMBERSHIP, null);
    return null;
  }

  const household = await db
    .from('dx__household')
    .where('id', member.household_id)
    .whereNull('deleted_at')
    .limit(1)
    .first<{ id: string; name: string; timezone: string; remind_hour: number | string; currency: string }>();

  if (!household) {
    c.set(MEMBERSHIP, null);
    return null;
  }

  const value: Membership = {
    householdId: household.id,
    memberId: member.id,
    userId: uid,
    role: member.role,
    displayName: member.display_name,
    timezone: household.timezone,
    householdName: household.name,
    remindHour: Number(household.remind_hour),
    currency: household.currency,
  };
  c.set(MEMBERSHIP, value);
  return value;
}

/** Re-read after a write that changes membership (creating or joining a household). */
export async function refreshMembership(c: Context): Promise<Membership | null> {
  c.set(MEMBERSHIP, undefined);
  return membership(c);
}

/**
 * A builder already scoped to the caller's household.
 *
 * Synchronous on purpose: `QueryBuilder` is thenable, so an async version
 * would be awaited on the way out and run an unfiltered SELECT (traps.md).
 * `requireHousehold` resolves the membership before any handler runs.
 */
export function ours(c: Context, table: string) {
  const value = c.get(MEMBERSHIP) as Membership | null | undefined;
  if (!value) {
    throw new AppError('HOUSEHOLD_REQUIRED', `ours("${table}"): no household on this request.`, 409);
  }
  return scoped(c).from(table).where('household_id', value.householdId);
}

/**
 * The tables with `deleted_at`. Derived from the migration SQL by hand and
 * kept short: `deleted_at IS NULL` on a table without the column is not a
 * slower query, it is a broken endpoint (traps.md).
 */
const SOFT_DELETED: ReadonlySet<string> = new Set(['dx__item', 'dx__document', 'dx__household']);

export function oursLive(c: Context, table: string) {
  const query = ours(c, table);
  return SOFT_DELETED.has(table) ? query.whereNull('deleted_at') : query;
}

export function me(c: Context): Membership {
  const value = c.get(MEMBERSHIP) as Membership | null | undefined;
  if (!value) throw new AppError('HOUSEHOLD_REQUIRED', 'Finish setting up your household first.', 409);
  return value;
}

/* ══ small shared shapes ═════════════════════════════════════════════════ */

export async function jsonBody(c: Context): Promise<Record<string, unknown> | undefined> {
  const body = await c.req.json().catch(() => undefined);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
  return body as Record<string, unknown>;
}

export function id(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** SHA-256 hex, for invite codes at rest. */
export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** An 8-character invite code from an alphabet with no look-alikes (0/O, 1/I/L). */
export function inviteCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/* ══ dates (BR-11) ════════════════════════════════════════════════════════ */

/** Today in an IANA zone, as YYYY-MM-DD. An unknown zone degrades to UTC. */
export function todayIn(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/* ══ field parsers ════════════════════════════════════════════════════════ */

export type Parsed<T> = { ok: true; value: T } | { ok: false };

export function parseText(value: unknown, max = 120): Parsed<string> {
  if (typeof value !== 'string') return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return { ok: false };
  return { ok: true, value: trimmed };
}

export function optionalText(value: unknown, max = 500): Parsed<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length > max) return { ok: false };
  return { ok: true, value: trimmed.length === 0 ? null : trimmed };
}

export function parseEnum<T extends string>(value: unknown, allowed: readonly T[]): Parsed<T> {
  if (typeof value !== 'string' || !allowed.includes(value as T)) return { ok: false };
  return { ok: true, value: value as T };
}

export function parseEmail(value: unknown): Parsed<string> {
  const text = parseText(value, 254);
  if (!text.ok || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text.value)) return { ok: false };
  return { ok: true, value: text.value.toLowerCase() };
}

export function parseInteger(value: unknown, min: number, max: number): Parsed<number> {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return { ok: false };
  }
  return { ok: true, value };
}

export function parseTimezone(value: unknown): Parsed<string> {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return { ok: false };
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value });
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

export function parseUuid(value: unknown): Parsed<string> {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ) {
    return { ok: false };
  }
  return { ok: true, value: value.toLowerCase() };
}
