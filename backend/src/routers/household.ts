import { defineRouter } from '@xenition/sdk/hono';
import {
  scoped,
  sdk,
  userId,
  bearer,
  membership,
  refreshMembership,
  me,
  ours,
  env,
  ok,
  created,
  invalid,
  fail,
  notFound,
  jsonBody,
  id,
  nowIso,
  sha256,
  inviteCode,
  parseText,
  parseTimezone,
  parseInteger,
} from '../lib';
import { appScheme, inviteDays, maxMembers } from '../config';
import { requireHousehold, requireOwner, assertHouseholdSharing } from '../middleware';
import { startTrialOnce } from '../billing';
import { trackServerEvent } from '../meta';
import { CATEGORIES } from '../logic/extract';
import { householdRow, rawRows, replanHousehold, transaction } from '../services';
import { type MemberRow, memberWire } from '../rows';
import { ensureProfile, mePayload, readableName } from './auth';
import { handleError } from '../errors';

interface InviteRow {
  id: string;
  household_id: string;
  code_hash: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
}

const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'NZD', 'INR', 'BDT', 'SGD', 'AED', 'ZAR'] as const;

/**
 * `household` — setup, settings, members and invites (SRS FR-A2…A4, FR-H).
 */
export const householdRouter = defineRouter({
  name: 'household',

  build(app, { requireAuth, rateLimit }) {
    app.onError(handleError);

    /**
     * The owner's setup after sign-up: two taps, no typing (what slips
     * through, when to be reminded). Finishing it starts the 7-day Pro trial
     * — once per account — and the app then shows the one-time offer.
     */
    app.post('/setup', requireAuth, requireOwner, rateLimit(20), async (c) => {
      const body = (await jsonBody(c)) ?? {};
      const focus = Array.isArray(body.focus)
        ? [...new Set(body.focus.filter((f): f is string => typeof f === 'string' && (CATEGORIES as readonly string[]).includes(f)))].slice(0, 10)
        : [];
      const hour = body.remindHour === undefined ? null : parseInteger(body.remindHour, 0, 23);
      if (hour && !hour.ok) return invalid(c, 'Choose a time between 0 and 23.', { remindHour: 'INVALID' });

      const before = await householdRow(c);
      // Raw for the text[] cast: the builder would bind the array as text.
      await rawRows(
        c,
        `UPDATE dx__household SET focus = $2::text[], remind_hour = COALESCE($3::smallint, remind_hour), updated_at = now() WHERE id = $1::uuid`,
        [me(c).householdId, focus, hour?.ok ? hour.value : null],
      );
      await scoped(c).from('dx__profile').where('user_id', userId(c)).update({ setup_done_at: nowIso(), updated_at: nowIso() }).run();
      if (hour?.ok && hour.value !== Number(before.remind_hour)) await replanHousehold(c, await householdRow(c));

      const trialStarted = await startTrialOnce(c, userId(c));
      if (trialStarted) trackServerEvent(c, { userId: userId(c), eventName: 'StartTrial', eventId: `trial-${userId(c)}` });
      const email = (await sdk(c).auth.me(bearer(c))).email;
      return ok(c, { ...(await mePayload(c, userId(c), email)), trialStarted });
    });

    app.patch('/household', requireAuth, requireOwner, async (c) => {
      const body = await jsonBody(c);
      if (!body) return invalid(c, 'Expected a JSON body.');
      const patch: Record<string, unknown> = { updated_at: nowIso() };
      if (body.name !== undefined) {
        const v = parseText(body.name, 60);
        if (!v.ok) return invalid(c, 'Give your household a name.', { name: 'REQUIRED' });
        patch.name = v.value;
      }
      if (body.timezone !== undefined) {
        const v = parseTimezone(body.timezone);
        if (!v.ok) return invalid(c, 'That time zone is not one we know.', { timezone: 'INVALID' });
        patch.timezone = v.value;
      }
      if (body.currency !== undefined) {
        if (!CURRENCIES.includes(body.currency as never)) return invalid(c, 'Choose a currency from the list.', { currency: 'INVALID' });
        patch.currency = body.currency;
      }
      if (body.remindHour !== undefined) {
        const v = parseInteger(body.remindHour, 0, 23);
        if (!v.ok) return invalid(c, 'Choose a time between 0 and 23.', { remindHour: 'INVALID' });
        patch.remind_hour = v.value;
      }
      await scoped(c).from('dx__household').where('id', me(c).householdId).update(patch).run();
      // FR-R7: the hour or zone moved every unsent reminder.
      if (patch.remind_hour !== undefined || patch.timezone !== undefined) {
        await refreshMembership(c);
        await replanHousehold(c, await householdRow(c));
      }
      const email = (await sdk(c).auth.me(bearer(c))).email;
      return ok(c, await mePayload(c, userId(c), email));
    });

    /* ── members ────────────────────────────────────────────────────────── */

    app.get('/household/members', requireAuth, requireHousehold, async (c) => {
      const rows = await ours(c, 'dx__member').whereNull('removed_at').orderBy('created_at').rows<MemberRow>();
      return ok(c, rows.map((m) => memberWire(m, me(c).memberId)));
    });

    app.delete('/household/members/:id', requireAuth, requireOwner, async (c) => {
      const memberId = c.req.param('id');
      if (!/^[0-9a-f-]{36}$/i.test(memberId)) return notFound(c, 'That person is not in your household.');
      if (memberId === me(c).memberId) return invalid(c, 'You cannot remove yourself. Delete your account instead.');
      const found = await ours(c, 'dx__member').where('id', memberId).whereNull('removed_at').first<MemberRow>();
      if (!found) return notFound(c, 'That person is not in your household.');
      await transaction(c, [
        { sql: `UPDATE dx__item SET assignee_id = NULL, updated_at = now() WHERE household_id = $1::uuid AND assignee_id = $2::uuid`, params: [me(c).householdId, memberId] },
        { sql: `UPDATE dx__member SET removed_at = now(), updated_at = now() WHERE household_id = $1::uuid AND id = $2::uuid`, params: [me(c).householdId, memberId] },
      ]);
      return ok(c, { removed: true });
    });

    /** A member leaves; a fresh household of their own is made on their next /auth/me. */
    app.post('/household/leave', requireAuth, requireHousehold, async (c) => {
      if (me(c).role === 'owner') {
        return fail(c, 'CONFLICT', 'You set up this household, so it can’t be left. Remove the others, or delete your account.', 409);
      }
      await transaction(c, [
        { sql: `UPDATE dx__item SET assignee_id = NULL, updated_at = now() WHERE household_id = $1::uuid AND assignee_id = $2::uuid`, params: [me(c).householdId, me(c).memberId] },
        { sql: `UPDATE dx__member SET removed_at = now(), updated_at = now() WHERE id = $1::uuid`, params: [me(c).memberId] },
      ]);
      return ok(c, { left: true });
    });

    /* ── invites (Pro) ──────────────────────────────────────────────────── */

    app.get('/household/invites', requireAuth, requireOwner, async (c) => {
      const rows = await ours(c, 'dx__invite').whereNull('accepted_at').whereNull('revoked_at').gt('expires_at', nowIso()).orderBy('created_at', 'desc').rows<InviteRow>();
      return ok(c, rows.map((r) => ({ id: r.id, expiresAt: r.expires_at, createdAt: r.created_at })));
    });

    /** The code is returned ONCE, here, and stored hashed. */
    app.post('/household/invites', requireAuth, requireOwner, rateLimit(20), async (c) => {
      await assertHouseholdSharing(c);
      const members = await ours(c, 'dx__member').whereNull('removed_at').count();
      const open = await ours(c, 'dx__invite').whereNull('accepted_at').whereNull('revoked_at').gt('expires_at', nowIso()).count();
      const cap = maxMembers(env(c));
      if (Number(members) + Number(open) >= cap) {
        return fail(c, 'LIMIT_REACHED', `A household can have up to ${cap} people, invites included. Revoke an invite first.`, 409);
      }
      const code = inviteCode();
      const expiresAt = new Date(Date.now() + inviteDays(env(c)) * 86_400_000).toISOString();
      const inviteId = id();
      await scoped(c)
        .from('dx__invite')
        .insert({ id: inviteId, household_id: me(c).householdId, code_hash: await sha256(code), expires_at: expiresAt, created_by: me(c).memberId, created_at: nowIso(), updated_at: nowIso() })
        .run();
      return created(c, { id: inviteId, code, link: `${appScheme(env(c))}://join/${code}`, expiresAt, householdName: me(c).householdName });
    });

    app.delete('/household/invites/:id', requireAuth, requireOwner, async (c) => {
      const inviteId = c.req.param('id');
      if (!/^[0-9a-f-]{36}$/i.test(inviteId)) return notFound(c);
      const rows = await ours(c, 'dx__invite').where('id', inviteId).update({ revoked_at: nowIso(), updated_at: nowIso() }).returning('id').rows();
      if (rows.length === 0) return notFound(c);
      return ok(c, { revoked: true });
    });

    async function findInvite(code: string, c: Parameters<typeof scoped>[0]) {
      const normalized = code.trim().toUpperCase();
      if (!/^[A-Z0-9]{6,12}$/.test(normalized)) return null;
      return scoped(c).from('dx__invite').where('code_hash', await sha256(normalized)).limit(1).first<InviteRow>();
    }

    /** The join screen shows whose household it is before accepting. */
    app.get('/household/invites/lookup/:code', requireAuth, rateLimit(20), async (c) => {
      const invite = await findInvite(c.req.param('code'), c);
      if (!invite) return fail(c, 'NOT_FOUND', 'That invite code is not valid.', 404);
      if (invite.accepted_at || invite.revoked_at) return fail(c, 'CONFLICT', 'That invite has already been used.', 409);
      if (Date.parse(invite.expires_at) < Date.now()) return fail(c, 'GONE', 'That invite has expired. Ask for a new one.', 410);
      const household = await scoped(c).from('dx__household').where('id', invite.household_id).whereNull('deleted_at').first<{ name: string }>();
      if (!household) return fail(c, 'NOT_FOUND', 'That household no longer exists.', 404);
      const inviter = await scoped(c).from('dx__member').where('id', invite.created_by).first<MemberRow>();
      return ok(c, { householdName: household.name, invitedBy: inviter?.display_name ?? null, expiresAt: invite.expires_at });
    });

    /**
     * Redeem. The caller already has a household of their own (made on their
     * first /auth/me): if nobody else is in it, its items move with them and
     * it is closed; if others are, they must leave it first (409).
     */
    app.post('/household/join', requireAuth, rateLimit(10), async (c) => {
      const body = await jsonBody(c);
      const code = typeof body?.code === 'string' ? body.code : '';
      const invite = await findInvite(code, c);
      if (!invite) return fail(c, 'NOT_FOUND', 'That invite code is not valid.', 404);
      if (invite.accepted_at || invite.revoked_at) return fail(c, 'CONFLICT', 'That invite has already been used.', 409);
      if (Date.parse(invite.expires_at) < Date.now()) return fail(c, 'GONE', 'That invite has expired. Ask for a new one.', 410);

      const uid = userId(c);
      const current = await membership(c);
      if (current?.householdId === invite.household_id) return fail(c, 'CONFLICT', 'You are already in this household.', 409);
      if (current) {
        const others = await scoped(c).from('dx__member').where('household_id', current.householdId).whereNull('removed_at').count();
        if (Number(others) > 1) {
          return fail(c, 'CONFLICT', `You share “${current.householdName}” with others. Leave it first, then join this one.`, 409);
        }
      }

      const claimed = await scoped(c)
        .from('dx__invite')
        .where('id', invite.id)
        .whereNull('accepted_at')
        .whereNull('revoked_at')
        .update({ accepted_at: nowIso(), accepted_by: uid, updated_at: nowIso() })
        .returning('id')
        .rows();
      if (claimed.length === 0) return fail(c, 'CONFLICT', 'That invite has already been used.', 409);

      const to = invite.household_id;
      if (current) {
        const from = current.householdId;
        // Their deadlines come with them; the solo household closes.
        await transaction(c, [
          { sql: `UPDATE dx__item SET household_id = $2::uuid, assignee_id = NULL, updated_at = now() WHERE household_id = $1::uuid`, params: [from, to] },
          { sql: `UPDATE dx__reminder SET household_id = $2::uuid WHERE household_id = $1::uuid`, params: [from, to] },
          { sql: `UPDATE dx__document SET household_id = $2::uuid, updated_at = now() WHERE household_id = $1::uuid`, params: [from, to] },
          { sql: `UPDATE dx__page SET household_id = $2::uuid WHERE household_id = $1::uuid`, params: [from, to] },
          { sql: `UPDATE dx__item_document SET household_id = $2::uuid WHERE household_id = $1::uuid`, params: [from, to] },
          { sql: `UPDATE dx__member SET removed_at = now(), updated_at = now() WHERE id = $1::uuid`, params: [current.memberId] },
          { sql: `UPDATE dx__household SET deleted_at = now(), updated_at = now() WHERE id = $1::uuid`, params: [from] },
        ]);
      }

      const email = (await sdk(c).auth.me(bearer(c))).email;
      const profile = await ensureProfile(c, uid);
      await scoped(c)
        .from('dx__member')
        .insert({ id: id(), household_id: to, user_id: uid, role: 'member', display_name: profile.name ?? readableName(email), email, created_at: nowIso(), updated_at: nowIso() })
        .run();
      await refreshMembership(c);
      // Their items now remind on the new household's hour and zone.
      await replanHousehold(c, await householdRow(c));
      return ok(c, { joined: true });
    });
  },
});
