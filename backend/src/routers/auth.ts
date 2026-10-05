import type { Context } from 'hono';
import { defineRouter } from '@xenition/sdk/hono';
import { XenitionError, type AuthResponse } from '@xenition/sdk';
import {
  sdk,
  scoped,
  userId,
  membership,
  refreshMembership,
  bearer,
  env,
  ok,
  created,
  invalid,
  fail,
  jsonBody,
  nowIso,
  id,
  parseText,
  parseEmail,
  optionalText,
  AppError,
} from '../lib';
import { passwordResetUrl, socialReturnUrl } from '../config';
import { isValidZone } from '../logic/dates';
import { planPayload } from '../billing';
import { deleteStored, rawRows, transaction } from '../services';
import { type HouseholdRow, type ProfileRow, int, textArray } from '../rows';
import { handleError } from '../errors';

/**
 * `auth` — accounts and the caller (SRS FR-A1…A5, CONTRACT §2.1–2.2).
 *
 * Hand-written over the SDK's auth client rather than mounting its router:
 * the SDK answers `{error:{…}}` and CONTRACT §0 is `{success, data}`, and an
 * account here is a platform user AND a `dx__profile` row. The platform owns
 * passwords; this worker never stores or logs one.
 */

function sessionPayload(auth: AuthResponse, profile: ProfileRow | null) {
  return {
    accessToken: auth.token,
    refreshToken: auth.refreshToken,
    // Epoch SECONDS from the gateway; the app normalises.
    expiresAt: auth.expiresAt,
    user: {
      id: auth.user.id,
      email: auth.user.email,
      name: profile?.name ?? null,
      emailVerified: Boolean(profile?.email_verified_at),
    },
  };
}

/** Read a profile, creating it on first sight (social sign-in, invited members). */
export async function ensureProfile(c: Context, uid: string, seed?: { name?: string | null; verified?: boolean }): Promise<ProfileRow> {
  const db = scoped(c);
  const existing = await db.from('dx__profile').where('user_id', uid).limit(1).first<ProfileRow>();
  if (existing) {
    if (seed?.name && !existing.name) {
      await db.from('dx__profile').where('user_id', uid).update({ name: seed.name, updated_at: nowIso() }).run();
      return { ...existing, name: seed.name };
    }
    return existing;
  }
  const now = nowIso();
  await rawRows(
    c,
    `INSERT INTO dx__profile (user_id, name, email_verified_at, created_at, updated_at)
     VALUES ($1::text, $2::text, $3::timestamptz, now(), now()) ON CONFLICT (user_id) DO NOTHING`,
    [uid, seed?.name ?? null, seed?.verified ? now : null],
  );
  const row = await db.from('dx__profile').where('user_id', uid).limit(1).first<ProfileRow>();
  if (!row) throw new AppError('INTERNAL_SERVER_ERROR', 'Could not create the profile.', 500);
  return row;
}

/** ISO region → the currency amounts are shown in. Anything unknown is USD. */
const CURRENCY: Record<string, string> = {
  US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', IN: 'INR', BD: 'BDT', IE: 'EUR', DE: 'EUR', FR: 'EUR',
  ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR', SG: 'SGD', AE: 'AED', ZA: 'ZAR',
};

/**
 * FR-A2: the first `/auth/me` makes the caller a household of their own, from
 * the `x-timezone` and `x-region` headers the app sends. One statement: the
 * member row is unique per user, so a double request fails whole and the
 * loser simply re-reads the winner's household.
 */
async function ensureHousehold(c: Context, uid: string, email: string, profile: ProfileRow): Promise<void> {
  if (await membership(c)) return;
  const zone = c.req.header('x-timezone') ?? '';
  const timezone = isValidZone(zone) && zone.length < 64 ? zone : 'America/New_York';
  const region = (c.req.header('x-region') ?? '').toUpperCase().slice(0, 2);
  const currency = CURRENCY[region] ?? 'USD';
  const displayName = profile.name ?? readableName(email);
  const first = displayName.split(' ')[0] ?? displayName;
  const householdId = id();
  try {
    await transaction(c, [
      {
        sql: `INSERT INTO dx__household (id, owner_user_id, name, timezone, currency, created_at, updated_at)
              VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::text, now(), now())`,
        params: [householdId, uid, `${first}’s home`, timezone, currency],
      },
      {
        sql: `INSERT INTO dx__member (id, household_id, user_id, role, display_name, email, created_at, updated_at)
              VALUES ($1::uuid, $2::uuid, $3::text, 'owner', $4::text, $5::text, now(), now())`,
        params: [id(), householdId, uid, displayName, email],
      },
    ]);
  } catch (error) {
    // Lost the race to a parallel request: theirs stands.
    if (!(await refreshMembership(c))) throw error;
    return;
  }
  await refreshMembership(c);
}

/** "dana.reyes42@…" → "Dana". Never the raw local part on a screen. */
export function readableName(email: string): string {
  const local = (email.split('@')[0] ?? '').replace(/[0-9_+-]+/g, ' ').replace(/\./g, ' ').trim();
  const word = local.split(/\s+/)[0] ?? '';
  return word.length >= 2 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : 'You';
}

/** `Me` (CONTRACT §1) + what the app needs to route: setup and the one-time offer. */
export async function mePayload(c: Context, uid: string, email: string) {
  const profile = await ensureProfile(c, uid);
  await ensureHousehold(c, uid, email, profile);
  const mine = await membership(c);
  if (!mine) throw new AppError('INTERNAL_SERVER_ERROR', 'Could not set up your household.', 500);
  const household = await scoped(c).from('dx__household').where('id', mine.householdId).limit(1).first<HouseholdRow>();
  if (!household) throw new AppError('INTERNAL_SERVER_ERROR', 'Could not read your household.', 500);
  const isOwner = mine.role === 'owner';
  return {
    user: { id: uid, email, name: profile.name, emailVerified: Boolean(profile.email_verified_at) },
    household: {
      id: household.id,
      name: household.name,
      timezone: household.timezone,
      currency: household.currency,
      remindHour: int(household.remind_hour),
      focus: textArray(household.focus),
    },
    role: mine.role,
    memberId: mine.memberId,
    prefs: { reminders: profile.prefs_reminders !== false, overdue: profile.prefs_overdue !== false },
    plan: await planPayload(c, household),
    // Setup is the owner's two taps after sign-up; a joining member skips it.
    needsSetup: isOwner && !profile.setup_done_at,
    offerSeen: !isOwner || Boolean(profile.offer_seen_at),
  };
}

/** Apple is required by App Review §4.8 wherever Google is offered. */
const SOCIAL_PROVIDERS = ['apple', 'google'] as const;
type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

function socialProvider(raw: string | undefined): SocialProvider | null {
  return SOCIAL_PROVIDERS.find((p) => p === raw) ?? null;
}

/** Apple returns the name on the FIRST authorization only; use it now or lose it. */
function socialName(auth: AuthResponse): string | null {
  const meta = (auth.user as { userMetadata?: Record<string, unknown> }).userMetadata;
  const name = meta?.name;
  return typeof name === 'string' && name.trim() !== '' ? name.trim().slice(0, 80) : null;
}

/**
 * Does this password open this account? A sign-in carries no bearer, so ANY
 * AUTH_* answer is a wrong password (the gateway words it either way).
 */
async function passwordMatches(c: Context, email: string, password: string): Promise<boolean> {
  try {
    await sdk(c).auth.login({ email, password });
    return true;
  } catch (error) {
    if (String((error as { code?: string })?.code ?? '').startsWith('AUTH_')) return false;
    throw error;
  }
}

export const authRouter = defineRouter({
  name: 'auth',

  build(app, { requireAuth, rateLimit }) {
    // Ours, not the SDK's generic one (see src/errors.ts).
    app.onError(handleError);
    const strict = rateLimit(10);

    app.post('/auth/register', strict, async (c) => {
      const body = await jsonBody(c);
      if (!body) return invalid(c, 'Expected a JSON body.');
      const email = parseEmail(body.email);
      const password = typeof body.password === 'string' ? body.password : '';
      if (!email.ok) return invalid(c, 'Enter your email address.', { email: 'INVALID_EMAIL' });
      if (password.length < 8) return invalid(c, 'Use at least 8 characters for your password.', { password: 'PASSWORD_TOO_SHORT' });
      // The name is optional at sign-up (setup never asks for it); the email gives a readable one.
      const name = parseText(body.name, 80);
      const display = name.ok ? name.value : readableName(email.value);

      const auth = await sdk(c).auth.register({ email: email.value, password, name: display });
      const profile = await ensureProfile(c, auth.user.id, { name: name.ok ? name.value : null });

      // FR-A1: confirm the address with a 6-digit code. Never blocks sign-up.
      await sdk(c)
        .auth.sendOtp({ email: email.value, purpose: 'verify_email' })
        .catch((error) => console.error('otp send failed:', error instanceof Error ? error.message : error));

      return created(c, { ...sessionPayload(auth, profile), needsSetup: true, needsVerification: true });
    });

    app.post('/auth/login', strict, async (c) => {
      const body = await jsonBody(c);
      if (!body) return invalid(c, 'Expected a JSON body.');
      const email = parseText(body.email, 254);
      const password = typeof body.password === 'string' ? body.password : '';
      if (!email.ok || password.length === 0) return fail(c, 'AUTH_INVALID_CREDENTIALS', 'That email and password do not match.', 401);
      let auth: AuthResponse;
      try {
        auth = await sdk(c).auth.login({ email: email.value.toLowerCase(), password });
      } catch (failure) {
        // The gateway words a wrong password as AUTH_INVALID_TOKEN as well as
        // AUTH_INVALID_CREDENTIALS. On sign-in, every auth rejection means one thing.
        if (failure instanceof XenitionError && failure.code.startsWith('AUTH_')) {
          return fail(c, 'AUTH_INVALID_CREDENTIALS', 'That email and password do not match.', 401);
        }
        throw failure;
      }
      const profile = await ensureProfile(c, auth.user.id);
      return ok(c, sessionPayload(auth, profile));
    });

    /* ── email verification (FR-A1) ─────────────────────────────────────── */

    app.post('/auth/send-code', requireAuth, strict, async (c) => {
      const email = (await sdk(c).auth.me(bearer(c))).email;
      const result = await sdk(c).auth.sendOtp({ email, purpose: 'verify_email' }).catch(() => null);
      return ok(c, { sent: true, retryAfterSeconds: result?.retryAfterSeconds ?? 60 });
    });

    app.post('/auth/verify-code', requireAuth, strict, async (c) => {
      const body = await jsonBody(c);
      const code = typeof body?.code === 'string' ? body.code.trim() : '';
      if (!/^[0-9]{4,8}$/.test(code)) return invalid(c, 'Enter the code from your email.', { code: 'REQUIRED' });
      const email = (await sdk(c).auth.me(bearer(c))).email;
      try {
        await sdk(c).auth.verifyOtp({ email, code, purpose: 'verify_email' });
      } catch {
        return fail(c, 'AUTH_INVALID_CODE', 'That code is not right, or it has expired. Ask for a new one.', 400, { code: 'INVALID' });
      }
      const uid = userId(c);
      await ensureProfile(c, uid);
      await scoped(c).from('dx__profile').where('user_id', uid).update({ email_verified_at: nowIso(), updated_at: nowIso() }).run();
      return ok(c, { verified: true });
    });

    /* ── social sign-in (Apple + Google) ────────────────────────────────── */

    app.get('/auth/social/providers', async (c) => {
      const providers = await sdk(c).auth.listSocialProviders();
      return ok(
        c,
        providers
          .filter((p) => p.isAvailable && socialProvider(p.provider) !== null)
          // `native`: this app registered its OWN client ids, so a token from the
          // phone's own sheet can be verified. Until then only the brokered
          // browser lane works and the app must not open a native sheet.
          .map((p) => ({ provider: p.provider, usingSSO: p.usingSSO, native: p.configured === true && p.enabled === true })),
      );
    });

    /**
     * Brokered browser lane: the consent URL. `returnTo` defaults to
     * `duebox://auth`; Expo Go lives behind `exp://<lan-ip>/--/auth`, so a
     * caller may name one — on this app's scheme or Expo's only.
     */
    app.get('/auth/social/:provider/start', strict, async (c) => {
      const provider = socialProvider(c.req.param('provider'));
      if (!provider) return invalid(c, 'That sign-in provider is not supported here.');
      const asked = c.req.query('returnTo') ?? '';
      const scheme = socialReturnUrl(env(c)).split('://')[0];
      const returnTo = asked && new RegExp(`^(${scheme}|exp|exps)://`).test(asked) && asked.length < 300 ? asked : socialReturnUrl(env(c));
      const started = await sdk(c).auth.startSignIn(provider, returnTo);
      return ok(c, { url: started.url, usingSSO: started.usingSSO ?? false });
    });

    /** Redeem the one-time code the `duebox://auth` deep link carried. */
    app.post('/auth/social/complete', strict, async (c) => {
      const body = await jsonBody(c);
      const code = typeof body?.code === 'string' ? body.code.trim() : '';
      if (!code) return invalid(c, 'Expected a sign-in code.');
      const auth = await sdk(c).auth.completeSignIn(code);
      return finishSocial(c, auth, socialName(auth));
    });

    /**
     * Native lane: the device holds an id token (Sign in with Apple, Google).
     * Until this app's own client ids are registered on the platform the
     * gateway refuses it (412 here) and the app continues in the browser lane.
     */
    app.post('/auth/social/id-token', strict, async (c) => {
      const body = await jsonBody(c);
      const provider = socialProvider(typeof body?.provider === 'string' ? body.provider : undefined);
      const idToken = typeof body?.idToken === 'string' ? body.idToken.trim() : '';
      if (!provider || !idToken) return invalid(c, 'Expected a provider and an id token.');
      const nonce = typeof body?.nonce === 'string' && body.nonce.length > 0 ? body.nonce : undefined;
      const name = typeof body?.name === 'string' && body.name.trim().length > 0 ? body.name.trim().slice(0, 80) : undefined;
      const auth = await sdk(c).auth.signInWithIdToken({ provider, idToken, nonce, name });
      return finishSocial(c, auth, name ?? socialName(auth));
    });

    async function finishSocial(c: Context, auth: AuthResponse, name: string | null) {
      // Provider-verified email: no code needed.
      const profile = await ensureProfile(c, auth.user.id, { name, verified: true });
      return ok(c, { ...sessionPayload(auth, profile), needsSetup: !profile.setup_done_at });
    }

    /** Refresh tokens ROTATE: the app must store what comes back. */
    app.post('/auth/refresh', async (c) => {
      const body = await jsonBody(c);
      const token = typeof body?.refreshToken === 'string' ? body.refreshToken : '';
      if (!token) return fail(c, 'AUTH_TOKEN_EXPIRED', 'Sign in again to continue.', 401);
      const auth = await sdk(c).auth.refresh(token);
      const profile = await ensureProfile(c, auth.user.id);
      return ok(c, sessionPayload(auth, profile));
    });

    app.post('/auth/logout', requireAuth, async (c) => {
      await sdk(c).auth.logout(bearer(c)).catch(() => undefined);
      return ok(c, { signedOut: true });
    });

    /* ── passwords ──────────────────────────────────────────────────────── */

    app.post('/auth/forgot-password', strict, async (c) => {
      const body = await jsonBody(c);
      const email = parseText(body?.email, 254);
      if (email.ok) {
        // Same answer either way: no account-existence oracle.
        await sdk(c).auth.requestPasswordReset(email.value.toLowerCase(), passwordResetUrl(env(c))).catch(() => undefined);
      }
      return ok(c, { sent: true, message: 'If that address has an account, a reset link is on its way.' });
    });

    app.post('/auth/reset-password', strict, async (c) => {
      const body = await jsonBody(c);
      const token = typeof body?.token === 'string' ? body.token : '';
      const password = typeof body?.password === 'string' ? body.password : '';
      if (!token) return invalid(c, 'That reset link is not valid.');
      if (password.length < 8) return invalid(c, 'Use at least 8 characters for your password.', { password: 'PASSWORD_TOO_SHORT' });
      await sdk(c).auth.resetPassword({ token, newPassword: password });
      return ok(c, { reset: true });
    });

    app.post('/auth/change-password', requireAuth, strict, async (c) => {
      const body = await jsonBody(c);
      const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
      const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
      if (!currentPassword) return invalid(c, 'Enter your current password.');
      if (newPassword.length < 8) return invalid(c, 'Use at least 8 characters for your new password.', { newPassword: 'PASSWORD_TOO_SHORT' });
      // Checked first by signing in: a wrong current password would otherwise
      // come back as an AUTH_* token code and sign the person out mid-form.
      const email = (await sdk(c).auth.me(bearer(c))).email;
      if (!(await passwordMatches(c, email, currentPassword))) {
        return fail(c, 'INVALID_PASSWORD', 'Your current password is not right.', 400, { currentPassword: 'INVALID' });
      }
      await sdk(c).auth.changePassword({ currentPassword, newPassword }, bearer(c));
      return ok(c, { changed: true });
    });

    /* ── the caller ─────────────────────────────────────────────────────── */

    app.get('/auth/me', requireAuth, async (c) => {
      const email = (await sdk(c).auth.me(bearer(c))).email;
      return ok(c, await mePayload(c, userId(c), email));
    });

    app.patch('/auth/me', requireAuth, async (c) => {
      const body = await jsonBody(c);
      if (!body) return invalid(c, 'Expected a JSON body.');
      const uid = userId(c);
      await ensureProfile(c, uid);
      const patch: Record<string, unknown> = { updated_at: nowIso() };
      if (body.name !== undefined) {
        const name = parseText(body.name, 80);
        if (!name.ok) return invalid(c, 'Enter your name.', { name: 'REQUIRED' });
        patch.name = name.value;
        // The member row carries its own copy for "done by" lines; keep it in step.
        await scoped(c).from('dx__member').where('user_id', uid).whereNull('removed_at').update({ display_name: name.value, updated_at: nowIso() }).run();
      }
      const prefs = body.prefs as Record<string, unknown> | undefined;
      if (prefs && typeof prefs === 'object') {
        if (typeof prefs.reminders === 'boolean') patch.prefs_reminders = prefs.reminders;
        if (typeof prefs.overdue === 'boolean') patch.prefs_overdue = prefs.overdue;
      }
      // The one-time welcome offer was shown (app/offer.tsx) — never again, on any device.
      if (body.offerSeen === true) patch.offer_seen_at = nowIso();
      await scoped(c).from('dx__profile').where('user_id', uid).update(patch).run();
      const email = (await sdk(c).auth.me(bearer(c))).email;
      return ok(c, await mePayload(c, uid, email));
    });

    /**
     * Meta ads attribution hand-off (`src/meta.ts`). The app sends the Meta
     * SDK's anonymous install id and device context, only when measurement is
     * configured. Whitelisted, length-capped, all optional, never a person.
     */
    app.patch('/auth/me/attribution', requireAuth, async (c) => {
      const body = await jsonBody(c);
      if (!body) return invalid(c, 'Expected a JSON body.');
      const text = (value: unknown, max: number): string | null => {
        const parsed = optionalText(value, max);
        return parsed.ok ? parsed.value : null;
      };
      const att = text(body.attStatus, 20);
      const platform = text(body.installPlatform, 10);
      const uid = userId(c);
      await ensureProfile(c, uid);
      await scoped(c)
        .from('dx__profile')
        .where('user_id', uid)
        .update({
          fb_anon_id: text(body.fbAnonId, 120),
          att_status: att && ['authorized', 'denied', 'restricted', 'undetermined', 'unavailable'].includes(att) ? att : null,
          install_platform: platform && ['ios', 'android'].includes(platform) ? platform : null,
          app_version: text(body.appVersion, 20),
          os_version: text(body.osVersion, 20),
          device_model: text(body.deviceModel, 60),
          locale: text(body.locale, 20),
          attribution_updated_at: nowIso(),
          updated_at: nowIso(),
        })
        .run();
      return ok(c, { saved: true });
    });

    /**
     * FR-A5 — delete this account (mandatory on the App Store).
     *
     * Proof first, destruction second: a password account re-enters its
     * password (checked BEFORE any row changes); a social account types
     * DELETE. A wrong password is 400, not 401 — a 401 would sign them out.
     *
     * An owner takes the household with them: every row and every stored
     * page. A member only leaves; their assigned items become unassigned.
     */
    app.delete('/auth/me', requireAuth, strict, async (c) => {
      const body = await jsonBody(c);
      const password = typeof body?.password === 'string' ? body.password : '';
      const confirmation = typeof body?.confirmation === 'string' ? body.confirmation.trim().toUpperCase() : '';
      if (!password && confirmation !== 'DELETE') {
        return invalid(c, 'Enter your password to confirm — or type DELETE if you sign in with Apple or Google.', { password: 'REQUIRED' });
      }
      const uid = userId(c);
      if (password) {
        const email = (await sdk(c).auth.me(bearer(c))).email;
        if (!(await passwordMatches(c, email, password))) {
          return fail(c, 'INVALID_PASSWORD', 'That password is not right.', 400, { password: 'INVALID' });
        }
      }

      const mine = await membership(c);
      if (mine?.role === 'owner') {
        const householdId = mine.householdId;
        const pages = await scoped(c).from('dx__page').where('household_id', householdId).rows<{ storage_key: string }>();
        // Every child table cascades from dx__household; listing them keeps the intent obvious.
        await transaction(
          c,
          [
            'DELETE FROM dx__reminder WHERE household_id = $1::uuid',
            'DELETE FROM dx__item_document WHERE household_id = $1::uuid',
            'DELETE FROM dx__page WHERE household_id = $1::uuid',
            'DELETE FROM dx__document WHERE household_id = $1::uuid',
            'DELETE FROM dx__item WHERE household_id = $1::uuid',
            'DELETE FROM dx__usage WHERE household_id = $1::uuid',
            'DELETE FROM dx__invite WHERE household_id = $1::uuid',
            'DELETE FROM dx__member WHERE household_id = $1::uuid',
            'DELETE FROM dx__household WHERE id = $1::uuid',
          ].map((sql) => ({ sql, params: [householdId] })),
        );
        await deleteStored(c, pages.map((p) => p.storage_key));
      } else if (mine) {
        await transaction(c, [
          { sql: `UPDATE dx__item SET assignee_id = NULL, updated_at = now() WHERE assignee_id = $1::uuid`, params: [mine.memberId] },
          { sql: `UPDATE dx__member SET removed_at = now(), updated_at = now() WHERE id = $1::uuid`, params: [mine.memberId] },
        ]);
      }
      await transaction(c, [
        { sql: `DELETE FROM dx__device WHERE user_id = $1::text`, params: [uid] },
        { sql: `DELETE FROM dx__idempotency WHERE user_id = $1::text`, params: [uid] },
        { sql: `DELETE FROM dx__profile WHERE user_id = $1::text`, params: [uid] },
      ]);
      await sdk(c).auth.deleteAccount(bearer(c), password ? { password } : undefined);
      return ok(c, { deleted: true });
    });
  },
});
