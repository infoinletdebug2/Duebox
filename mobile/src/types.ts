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
  /** Register only: whether the first verification code actually went out. */
  codeSent?: boolean;
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

/** 402 reasons (CONTRACT §0). Hard paywall: one gate, plus the AI-read ceiling (429). */
export type GateReason = 'subscription_required' | 'scan_limit';

export type PlanStatus = 'trial' | 'active' | 'grace' | 'billing_retry' | 'expired' | 'none';

/**
 * The household's subscription (the owner's). Hard paywall: `entitled` is the
 * one field a screen branches on — false means the paywall, nothing else.
 */
export interface Plan {
  entitled: boolean;
  status: PlanStatus;
  /** In the stores' free intro period (yearly, card upfront). */
  isTrial: boolean;
  /** When the trial ends and the first charge lands. */
  trialEndsAt: string | null;
  renewsAt: string | null;
  expiresAt: string | null;
  willRenew: boolean;
  productId: string | null;
  period: 'monthly' | 'yearly' | null;
  platform: 'apple' | 'google' | null;
  /** Never bought anything: the store's free trial may be offered. */
  trialEligible: boolean;
  trialDays: number;
  limits: { scansPerMonth: number; members: number };
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
