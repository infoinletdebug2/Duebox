import type { Context } from 'hono';
import { AppleStore, GoogleStore } from '@xenition/sdk';
import type { EntitlementCheck } from '@xenition/sdk';
import { sdk, readEnvVar, env, scoped } from './lib';
import { freeOpenItems, freeScans, maxMembers, proEntitlement, productIds, proScans, trialDays } from './config';
import { todayIn } from './logic/dates';

/**
 * Duebox Pro — the one paid plan (SRS FR-B1…B5, CONTRACT §3).
 *
 * The household is the subscribed thing: limits read the **owner's**
 * entitlement, so a partner's phone gets exactly what the owner pays for.
 *
 * Every new household gets a 7-day Pro trial when setup finishes (the
 * billing module's own trial — no store involved). When it ends the household
 * drops to Free, never to locked: Free keeps 5 open items and 3 scans a month
 * forever (BR-07), and everything already saved stays readable and exportable.
 */

export const PRO = (c: Context) => proEntitlement(env(c));
export const TRIAL_DAYS = (c: Context) => trialDays(env(c));
export const PRODUCT_IDS = (c: Context) => productIds(env(c));

/** Apple's server API client, or null on a deployment without credentials. */
export function appleStore(c: Context): AppleStore | null {
  const keyId = readEnvVar(c, 'APPLE_KEY_ID');
  const issuerId = readEnvVar(c, 'APPLE_ISSUER_ID');
  const privateKey = readEnvVar(c, 'APPLE_PRIVATE_KEY');
  const bundleId = readEnvVar(c, 'APPLE_BUNDLE_ID');
  if (!keyId || !issuerId || !privateKey || !bundleId) return null;
  return new AppleStore({
    keyId,
    issuerId,
    // Wrangler secrets cannot hold newlines; the PEM is stored with `\n` escaped.
    privateKey: privateKey.replace(/\\n/g, '\n'),
    bundleId,
    // `auto`: TestFlight purchases exist only in sandbox.
    environment: 'auto',
  });
}

export function googleStore(c: Context): GoogleStore | null {
  const packageName = readEnvVar(c, 'GOOGLE_PACKAGE_NAME');
  const clientEmail = readEnvVar(c, 'GOOGLE_CLIENT_EMAIL');
  const privateKey = readEnvVar(c, 'GOOGLE_PRIVATE_KEY');
  if (!packageName || !clientEmail || !privateKey) return null;
  return new GoogleStore({ packageName, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') });
}

export function billing(c: Context) {
  return sdk(c).modules.billing;
}

/**
 * The owner's entitlement, or null when billing cannot answer. Cached on the
 * request: Home, the gates and the plan payload all ask.
 */
const CHECK = 'duebox:entitlement';
export async function entitlementOf(c: Context, ownerUserId: string): Promise<EntitlementCheck | null> {
  const key = `${CHECK}:${ownerUserId}`;
  const hit = c.get(key as never) as EntitlementCheck | null | undefined;
  if (hit !== undefined) return hit;
  let value: EntitlementCheck | null;
  try {
    value = await billing(c).check(ownerUserId, PRO(c));
  } catch (failure) {
    console.error('billing check failed:', failure instanceof Error ? failure.message : failure);
    value = null;
  }
  c.set(key as never, value as never);
  return value;
}

export function forgetEntitlement(c: Context, ownerUserId: string): void {
  c.set(`${CHECK}:${ownerUserId}` as never, undefined as never);
}

export interface Plan {
  tier: 'free' | 'pro';
  source: 'store' | 'trial' | 'none';
  isTrial: boolean;
  trialDays: number;
  /** Set while a trial runs. */
  trialEndsAt: string | null;
  /** True once this account has had its trial (running or over). */
  trialUsed: boolean;
  renewsAt: string | null;
  expiresAt: string | null;
  limits: { openItems: number | null; scansPerMonth: number; members: number };
  usage: { openItems: number; scansThisMonth: number; month: string };
}

/**
 * Billing down → Pro limits for this request, logged (BR-12 in spirit: a
 * secondary system must never make the core path unusable). The tier still
 * reads `free` so no screen claims a subscription that may not exist.
 */
export function limitsFor(c: Context, check: EntitlementCheck | null) {
  const read = env(c);
  const pro = check === null || check.allowed;
  return {
    openItems: pro ? null : freeOpenItems(read),
    scansPerMonth: pro ? proScans(read) : freeScans(read),
    members: pro ? maxMembers(read) : 1,
  };
}

export function isPro(check: EntitlementCheck | null): boolean {
  return check === null || check.allowed;
}

/** The household's plan with live usage — `GET /billing/plan`, `Me.plan`, `Home.plan`. */
export async function planPayload(c: Context, household: { id: string; owner_user_id: string; timezone: string }): Promise<Plan> {
  const check = await entitlementOf(c, household.owner_user_id);
  const month = todayIn(household.timezone).slice(0, 7);
  const db = scoped(c);
  const open = await db
    .from('dx__item')
    .where('household_id', household.id)
    .where('status', 'open')
    .whereNull('deleted_at')
    .count();
  const usage = await db
    .from('dx__usage')
    .where('household_id', household.id)
    .where('month', month)
    .first<{ scans: number | string }>();
  const allowed = Boolean(check?.allowed);
  const isTrial = allowed && Boolean(check?.isTrial);
  return {
    tier: allowed ? 'pro' : 'free',
    source: !allowed ? 'none' : isTrial ? 'trial' : 'store',
    isTrial,
    trialDays: TRIAL_DAYS(c),
    trialEndsAt: isTrial ? check?.expiresAt ?? null : null,
    trialUsed: Boolean(check && check.status !== 'none'),
    renewsAt: allowed && !isTrial ? check?.expiresAt ?? null : null,
    expiresAt: check?.expiresAt ?? null,
    limits: limitsFor(c, check),
    usage: { openItems: Number(open), scansThisMonth: Number(usage?.scans ?? 0), month },
  };
}

/** Start the household's free Pro trial — once per account; swallowed on failure. */
export async function startTrialOnce(c: Context, ownerUserId: string): Promise<boolean> {
  const current = await entitlementOf(c, ownerUserId);
  if (current && current.status !== 'none') return false;
  try {
    await billing(c).startTrial({ userId: ownerUserId, entitlement: PRO(c), days: TRIAL_DAYS(c) });
    forgetEntitlement(c, ownerUserId);
    return true;
  } catch (error) {
    console.error('trial start failed:', error instanceof Error ? error.message : error);
    return false;
  }
}
