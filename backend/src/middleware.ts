import type { Context, MiddlewareHandler } from 'hono';
import { AppError, env, fail, membership, me, ours, scoped } from './lib';
import { proScans } from './config';
import { accessOf } from './billing';
import { todayIn } from './logic/dates';

/**
 * 409 HOUSEHOLD_REQUIRED before the first `GET /auth/me` has made one.
 * The app always calls /auth/me first, so this is a guard, not a flow.
 */
export const requireHousehold: MiddlewareHandler = async (c, next) => {
  const mine = await membership(c);
  if (!mine) return fail(c, 'HOUSEHOLD_REQUIRED', 'Open the app again to finish setting up.', 409);
  await next();
};

/** 403 unless the caller owns the household. A hidden button is not authorization. */
export const requireOwner: MiddlewareHandler = async (c, next) => {
  const mine = await membership(c);
  if (!mine) return fail(c, 'HOUSEHOLD_REQUIRED', 'Open the app again to finish setting up.', 409);
  if (mine.role !== 'owner') return fail(c, 'FORBIDDEN', 'Only the person who set up this household can do that.', 403);
  await next();
};

/** The owner's user id — whose plan governs the household. */
export async function ownerUserIdOf(c: Context): Promise<string> {
  const row = await scoped(c).from('dx__household').where('id', me(c).householdId).limit(1).first<{ owner_user_id: string }>();
  return row?.owner_user_id ?? me(c).userId;
}

/**
 * The hard paywall, server side (CONTRACT §3): every household data route
 * answers 402 SUBSCRIPTION_REQUIRED unless the owner's subscription (or its
 * store free trial) is live. The app treats that 402 as "re-read the plan
 * and show the paywall". Never gated: sign-in, setup, billing, devices,
 * export, leaving a household and deleting the account — someone who
 * stopped paying can still take their data and go (App Review 5.1.1(v)).
 */
export const requireSubscription: MiddlewareHandler = async (c, next) => {
  const mine = await membership(c);
  if (!mine) return fail(c, 'HOUSEHOLD_REQUIRED', 'Open the app again to finish setting up.', 409);
  const access = await accessOf(c, await ownerUserIdOf(c));
  if (!access.entitled) {
    throw new AppError(
      'SUBSCRIPTION_REQUIRED',
      mine.role === 'owner'
        ? 'Start your Duebox subscription to keep going.'
        : 'This household’s Duebox subscription has ended. Ask the person who set it up to renew it.',
      402,
      undefined,
      'subscription_required',
    );
  }
  await next();
};

/** A fair-use ceiling on AI reads, per household per month (household timezone). */
export async function assertScanAllowance(c: Context): Promise<string> {
  const ceiling = proScans(env(c));
  const month = todayIn(me(c).timezone).slice(0, 7);
  const row = await ours(c, 'dx__usage').where('month', month).first<{ scans: number | string }>();
  if (Number(row?.scans ?? 0) >= ceiling) {
    throw new AppError('SCAN_LIMIT', `You’ve read ${ceiling} letters this month. Type this one in, or scan again next month.`, 429, undefined, 'scan_limit');
  }
  return month;
}
