import type { Context, MiddlewareHandler } from 'hono';
import { AppError, env, fail, membership, me, ours, scoped } from './lib';
import { proScans } from './config';
import { entitlementOf, isPro, limitsFor } from './billing';
import { FREE_OFFSETS } from './logic/planner';
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

async function check(c: Context) {
  return entitlementOf(c, await ownerUserIdOf(c));
}

function gate(reason: string, message: string): AppError {
  return new AppError('SUBSCRIPTION_REQUIRED', message, 402, undefined, reason);
}

/* ── the gates (CONTRACT §3). Each fails OPEN when billing cannot answer. ── */

/** +limit: open items after this write must stay within the plan. */
export async function assertRoomFor(c: Context, adding: number): Promise<void> {
  const limits = limitsFor(c, await check(c));
  if (limits.openItems === null) return;
  const open = await ours(c, 'dx__item').where('status', 'open').whereNull('deleted_at').count();
  if (Number(open) + adding > limits.openItems) {
    throw gate(
      'item_limit',
      `Free keeps ${limits.openItems} deadlines at a time. Mark one done, or go Pro to track everything.`,
    );
  }
}

/** +scan allowance: reads this month (household timezone) below the plan's. */
export async function assertScanAllowance(c: Context): Promise<string> {
  const limits = limitsFor(c, await check(c));
  const month = todayIn(me(c).timezone).slice(0, 7);
  const row = await ours(c, 'dx__usage').where('month', month).first<{ scans: number | string }>();
  if (Number(row?.scans ?? 0) >= limits.scansPerMonth) {
    throw gate(
      'scan_limit',
      `You’ve used this month’s ${limits.scansPerMonth} scans. Type it in for now, or go Pro for ${proScans(env(c))} a month.`,
    );
  }
  return month;
}

/** Custom reminder offsets are Pro (FR-R2). Free may send the default or nothing. */
export async function assertOffsetsAllowed(c: Context, offsets: number[] | undefined): Promise<void> {
  if (offsets === undefined) return;
  const same = offsets.length === FREE_OFFSETS.length && offsets.every((o, i) => o === FREE_OFFSETS[i]);
  if (same) return;
  if (isPro(await check(c))) return;
  throw gate('custom_reminders', 'Choosing when you’re reminded is part of Pro.');
}

/** Household sharing is Pro. */
export async function assertHouseholdSharing(c: Context): Promise<void> {
  if (isPro(await check(c))) return;
  throw gate('household', 'Sharing with your household is part of Pro.');
}

export async function proNow(c: Context): Promise<boolean> {
  return isPro(await check(c));
}
