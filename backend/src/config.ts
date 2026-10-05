import type { DefineProductInput } from '@xenition/sdk';

/**
 * Everything configurable, from the environment, in one place. Every function
 * takes a reader: the worker reads env off the request context; migrate and
 * the tests are plain Node.
 */
export type EnvReader = (name: string) => string | undefined;
export const fromProcess: EnvReader = (name) => process.env[name];

function str(read: EnvReader, name: string, fallback: string): string {
  const value = read(name)?.trim();
  return value && value.length > 0 ? value : fallback;
}

function num(read: EnvReader, name: string, fallback: number): number {
  const parsed = Number(read(name)?.trim());
  return Number.isFinite(parsed) && parsed >= 0 && read(name)?.trim() !== '' ? parsed : fallback;
}

/* ── the plan (SRS FR-B, CONTRACT §3) ────────────────────────────────────── */

export const proEntitlement = (read: EnvReader) => str(read, 'PRO_ENTITLEMENT', 'pro');
/** The free Pro trial every new household gets after setup. */
export const trialDays = (read: EnvReader) => num(read, 'TRIAL_DAYS', 7);

export function productIds(read: EnvReader) {
  return {
    monthly: str(read, 'PRO_MONTHLY_ID', 'duebox_pro_monthly'),
    yearly: str(read, 'PRO_YEARLY_ID', 'duebox_pro_yearly'),
    // The one-time welcome offer after setup (app/offer.tsx): the same Pro,
    // as separately priced store products. Same entitlement.
    offerMonthly: str(read, 'OFFER_MONTHLY_ID', 'duebox_pro_monthly_offer'),
    offerYearly: str(read, 'OFFER_YEARLY_ID', 'duebox_pro_yearly_offer'),
  };
}

export function productCatalog(read: EnvReader): DefineProductInput[] {
  const entitlement = proEntitlement(read);
  const ids = productIds(read);
  const rows = [
    { productId: ids.monthly, period: 'monthly' },
    { productId: ids.yearly, period: 'yearly' },
    { productId: ids.offerMonthly, period: 'monthly' },
    { productId: ids.offerYearly, period: 'yearly' },
  ];
  return (['apple', 'google'] as const).flatMap((platform) =>
    rows.map((row) => ({ productId: row.productId, platform, entitlement, kind: 'subscription' as const, period: row.period })),
  );
}

export const freeOpenItems = (read: EnvReader) => num(read, 'FREE_OPEN_ITEMS', 5);
export const freeScans = (read: EnvReader) => num(read, 'FREE_SCANS', 3);
export const proScans = (read: EnvReader) => num(read, 'PRO_SCANS', 100);
export const maxMembers = (read: EnvReader) => num(read, 'MAX_MEMBERS', 5);

/* ── documents ───────────────────────────────────────────────────────────── */

export const docBucket = (read: EnvReader) => str(read, 'DOC_BUCKET', 'default');
export const docUrlTtlSeconds = (read: EnvReader) => num(read, 'DOC_URL_TTL', 900);
export const maxImageBytes = (read: EnvReader) => num(read, 'MAX_IMAGE_BYTES', 4 * 1024 * 1024);
export const maxPdfBytes = (read: EnvReader) => num(read, 'MAX_PDF_BYTES', 15 * 1024 * 1024);

/* ── the reader (ARCHITECTURE §3.1): through Xenition's ai.chat ──────────── */

export const readerModel = (read: EnvReader) => str(read, 'READER_MODEL', 'google/gemini-2.5-flash');

/* ── deep links ──────────────────────────────────────────────────────────── */

export const appScheme = (read: EnvReader) => str(read, 'APP_SCHEME', 'duebox');
export const passwordResetUrl = (read: EnvReader) => str(read, 'PASSWORD_RESET_URL', `${appScheme(read)}://reset-password`);
export const socialReturnUrl = (read: EnvReader) => str(read, 'SOCIAL_RETURN_URL', `${appScheme(read)}://auth`);
export const inviteDays = (read: EnvReader) => num(read, 'INVITE_DAYS', 7);
export const bundleId = (read: EnvReader) => str(read, 'APPLE_BUNDLE_ID', 'app.duebox.mobile');
