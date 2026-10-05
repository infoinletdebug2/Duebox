import { daysBetween } from './logic/dates';
import type { Action, Category } from './logic/extract';
import type { Repeat } from './logic/planner';

/**
 * Database rows and their wire shapes (CONTRACT §1). Rows come back
 * snake_cased (lib.scoped / services.rawRows); numbers may arrive as strings
 * from the gateway, dates as `YYYY-MM-DD` or full timestamps — normalised here.
 */

export type Role = 'owner' | 'member';

export interface HouseholdRow {
  id: string;
  owner_user_id: string;
  name: string;
  timezone: string;
  currency: string;
  remind_hour: number | string;
  focus: string[] | string | null;
  created_at: string;
}

export interface MemberRow {
  id: string;
  household_id: string;
  user_id: string;
  role: Role;
  display_name: string;
  email: string | null;
  created_at: string;
}

export interface ProfileRow {
  user_id: string;
  name: string | null;
  email_verified_at: string | null;
  prefs_reminders: boolean;
  prefs_overdue: boolean;
  setup_done_at: string | null;
  offer_seen_at: string | null;
  created_at: string;
}

export interface ItemRow {
  id: string;
  household_id: string;
  series_id: string;
  title: string;
  category: Category;
  action: Action;
  status: 'open' | 'done';
  due_date: string;
  amount_cents: number | string | null;
  issuer: string | null;
  reference_last4: string | null;
  notes: string | null;
  repeat: Repeat;
  repeat_years: number | string | null;
  offsets: number[] | string;
  assignee_id: string | null;
  source: 'scan' | 'manual' | 'repeat';
  evidence: string | null;
  done_at: string | null;
  done_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRow {
  id: string;
  household_id: string;
  purpose: 'scan' | 'attachment';
  status: string;
  source: string | null;
  page_count: number | string;
  draft: unknown;
  model: string | null;
  read_error: string | null;
  created_at: string;
}

export interface PageRow {
  id: string;
  document_id: string;
  idx: number | string;
  storage_key: string;
  mime: string;
  bytes: number | string | null;
}

export function int(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function intOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** A `date` column as `YYYY-MM-DD`, whichever form the driver returned. */
export function dayOf(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '').slice(0, 10);
}

export function instant(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Postgres arrays may arrive as JS arrays or as `{30,7,1}` text. */
export function intArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value === 'string') {
    return value
      .replace(/[{}]/g, '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && String(n) !== '');
  }
  return [];
}

export function textArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.length > 2) {
    return value
      .replace(/[{}]/g, '')
      .split(',')
      .map((s) => s.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
  }
  return [];
}

export function jsonOf<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function itemWire(
  row: ItemRow,
  today: string,
  extra: { attachmentCount?: number; nextReminderAt?: string | null } = {},
) {
  const due = dayOf(row.due_date);
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    action: row.action,
    status: row.status,
    dueDate: due,
    daysLeft: daysBetween(today, due),
    amountCents: intOrNull(row.amount_cents),
    issuer: row.issuer,
    referenceLast4: row.reference_last4,
    notes: row.notes,
    repeat: row.repeat,
    repeatYears: intOrNull(row.repeat_years),
    offsets: intArray(row.offsets).sort((a, b) => b - a),
    assigneeId: row.assignee_id,
    attachmentCount: extra.attachmentCount ?? 0,
    nextReminderAt: extra.nextReminderAt ?? null,
    doneAt: instant(row.done_at),
    doneById: row.done_by,
    createdAt: instant(row.created_at) ?? '',
    updatedAt: instant(row.updated_at) ?? '',
  };
}

export type ItemWire = ReturnType<typeof itemWire>;

export function memberWire(m: MemberRow, myMemberId: string) {
  const name = m.display_name || 'Member';
  return {
    id: m.id,
    displayName: name,
    initial: name.trim().charAt(0).toUpperCase() || '?',
    role: m.role,
    isMe: m.id === myMemberId,
    email: m.email,
  };
}
