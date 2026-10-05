/**
 * Wire shapes, exactly as the worker sends them (docs/CONTRACT.md §1).
 * Money is integer cents; due dates are `YYYY-MM-DD` strings in the household
 * timezone — never `new Date('YYYY-MM-DD')` (lib/dates).
 */

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: { code: string; message: string; fields?: Record<string, string>; reason?: GateReason };
}

export type Role = 'owner' | 'member';

/* ── session ──────────────────────────────────────────────────────────── */

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: SessionUser;
}

export interface AuthResult extends Session {
  needsSetup?: boolean;
  needsVerification?: boolean;
}

/* ── household + plan ─────────────────────────────────────────────────── */

export interface Household {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  remindHour: number;
  /** What slips through, from setup — the empty Home suggests these first. */
  focus: Category[];
}

export type GateReason = 'item_limit' | 'scan_limit' | 'household' | 'custom_reminders';

export interface Plan {
  tier: 'free' | 'pro';
  /** `trial`: the 7-day Pro trial every household gets after setup. */
  source: 'store' | 'trial' | 'none';
  isTrial: boolean;
  trialDays: number;
  trialEndsAt: string | null;
  /** This account has had its trial (running or over). */
  trialUsed: boolean;
  renewsAt: string | null;
  expiresAt: string | null;
  /** `openItems: null` = unlimited. */
  limits: { openItems: number | null; scansPerMonth: number; members: number };
  usage: { openItems: number; scansThisMonth: number; month: string };
}

export interface Prefs {
  reminders: boolean;
  overdue: boolean;
}

export interface Me {
  user: SessionUser;
  household: Household;
  role: Role;
  memberId: string;
  prefs: Prefs;
  plan: Plan;
  /** The owner has not done the two-tap setup yet (a joining member never does). */
  needsSetup: boolean;
  /** The one-time welcome offer has been shown (always true for a member). */
  offerSeen: boolean;
}

export interface Member {
  id: string;
  displayName: string;
  initial: string;
  role: Role;
  isMe: boolean;
  email?: string | null;
}

export interface Invite {
  id: string;
  code: string;
  link: string;
  expiresAt: string;
}

/* ── items ────────────────────────────────────────────────────────────── */

export type Category =
  | 'id_travel'
  | 'vehicle'
  | 'home'
  | 'insurance'
  | 'bills'
  | 'health'
  | 'kids_school'
  | 'subscriptions'
  | 'work'
  | 'other';

export type Action = 'renew' | 'pay' | 'submit' | 'cancel' | 'book' | 'attend' | 'other';
export type Repeat = 'none' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'years';
export type ItemStatus = 'open' | 'done';
export type Offset = 60 | 30 | 14 | 7 | 3 | 1;

export interface Item {
  id: string;
  title: string;
  category: Category;
  action: Action;
  status: ItemStatus;
  dueDate: string;
  /** Server-computed in the household timezone; negative = late. */
  daysLeft: number;
  amountCents: number | null;
  issuer: string | null;
  referenceLast4: string | null;
  notes: string | null;
  repeat: Repeat;
  repeatYears: number | null;
  offsets: Offset[];
  assigneeId: string | null;
  attachmentCount: number;
  nextReminderAt: string | null;
  doneAt: string | null;
  doneById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Page {
  id: string;
  index: number;
  mime: string;
  url: string | null;
}

export interface ItemDetail extends Item {
  attachments: { documentId: string; pages: Page[] }[];
  evidence: string | null;
  seriesCount: number;
}

export interface ItemInput {
  title: string;
  dueDate: string;
  category?: Category;
  action?: Action;
  amountCents?: number | null;
  issuer?: string | null;
  referenceLast4?: string | null;
  notes?: string | null;
  repeat?: Repeat;
  repeatYears?: number | null;
  offsets?: Offset[];
  assigneeId?: string | null;
}

export interface Home {
  nextUp: Item | null;
  overdue: Item[];
  thisWeek: Item[];
  thisMonth: Item[];
  laterCount: number;
  inbox: { id: string; pageCount: number; status: ScanStatus; createdAt: string }[];
  plan: Plan;
  members: Member[];
}

/* ── scans ────────────────────────────────────────────────────────────── */

export type ScanStatus = 'uploading' | 'reading' | 'review' | 'confirmed' | 'failed';
export type Confidence = 'high' | 'medium' | 'low';

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

export interface Scan {
  id: string;
  status: ScanStatus;
  pageCount: number;
  pages: Page[];
  candidates: Candidate[];
  readError: 'no_date' | 'unreadable' | 'not_document' | 'timeout' | null;
  createdAt: string;
}

export interface CreatedUpload {
  scan?: Scan;
  documentId?: string;
  /** PUT each page to `uploadUrl` with exactly `headers` — the URL is signed over them. */
  uploads: { pageId: string; uploadUrl: string; headers?: Record<string, string> }[];
}

/* ── billing ──────────────────────────────────────────────────────────── */

export interface ProductLabel {
  productId: string;
  label: string;
  period: 'month' | 'year';
  highlight: boolean;
}
