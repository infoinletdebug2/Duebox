import { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../../src/auth/context';
import { useCreateInvite, useInvites, useMembers, useRemoveMember, useRevokeInvite, useUpdateHousehold } from '../../src/api/hooks';
import { api, fieldErrors, messageOf } from '../../src/api/client';
import { usePlanGate } from '../../src/billing/gate';
import { font, makeStyles, radius, space, useColors } from '../../src/theme/tokens';
import type { Invite, Member } from '../../src/types';
import { Screen, Header } from '../../src/ui/Screen';
import { HeroBanner } from '../../src/ui/HeroBanner';
import { T } from '../../src/ui/Text';
import { Button, IconButton, tap } from '../../src/ui/Button';
import { Group, ListRow } from '../../src/ui/Layout';
import { Avatar } from '../../src/ui/Progress';
import { Field } from '../../src/ui/Controls';
import { ErrorState, ListSkeleton } from '../../src/ui/Feedback';
import { ConfirmSheet, Sheet, useToast } from '../../src/ui/Sheet';

/**
 * HOUSEHOLD & MEMBERS (SCREENS #19, SRS FR-A3, FR-A4).
 *
 * Who shares this household's deadlines (Pro, up to 5 people). The owner
 * names the household, invites with a single-use code (7 days, shared through
 * the system share sheet) and can remove a member — their assigned items
 * become "anyone". A member can leave. Free households see the invite button
 * open the paywall (FR-B4).
 */

const NAME_MAX = 60;
const ROLE_LABEL = { owner: 'Owner', member: 'Member' } as const;

/** Invites carry real timestamps (not business dates), so the device's own clock reads them. */
function expiryDay(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));
}

export default function HouseholdScreen() {
  const toast = useToast();
  const { household, isOwner, refresh } = useAuth();
  const { handlePlanError, guard } = usePlanGate();
  const members = useMembers();
  const invites = useInvites(isOwner);
  const remove = useRemoveMember();
  const revoke = useRevokeInvite();

  const [removing, setRemoving] = useState<Member | null>(null);
  const [inviting, setInviting] = useState(false);

  const confirmRemove = () => {
    if (!removing) return;
    const name = removing.displayName;
    remove.mutate(removing.id, {
      onSuccess: () => {
        setRemoving(null);
        toast({ message: `${name} removed` });
      },
      onError: (error) => {
        setRemoving(null);
        if (!handlePlanError(error)) toast({ message: messageOf(error) });
      },
    });
  };

  const revokeInvite = (invite: Invite) =>
    revoke.mutate(invite.id, {
      onSuccess: () => toast({ message: 'Invite revoked — that code no longer works' }),
      onError: (error) => toast({ message: messageOf(error) }),
    });

  return (
    <Screen
      form
      header={<Header />}
      footer={isOwner ? <Button label="Invite someone" icon="user-plus" onPress={() => guard('household', () => setInviting(true))} testID="invite-open" /> : <LeaveButton />}
      testID="screen-household"
    >
      <HeroBanner
        art="household"
        eyebrow="Household"
        title={household?.name ?? 'Your household'}
        lead={
          members.data
            ? members.data.length > 1
              ? `${members.data.length} people share these deadlines. Assign who handles what.`
              : 'Just you for now. Invite a partner to share the load.'
            : 'Share deadlines and decide who handles what.'
        }
        chips={[
          { icon: 'users', label: members.data ? `${members.data.length} of 5 people` : 'Up to 5 people' },
          { icon: 'shield', label: 'Private to your household' },
        ]}
      />
      {isOwner ? (
        <HouseholdName current={household?.name ?? ''} onSaved={refresh} />
      ) : household ? (
        <View style={{ gap: space.xxs }}>
          <T variant="micro" tone="muted">
            Household
          </T>
          <T variant="title">{household.name}</T>
        </View>
      ) : null}

      {/* People: always shown, to everyone. */}
      {members.isLoading ? (
        <ListSkeleton rows={2} />
      ) : members.isError ? (
        <ErrorState error={members.error} onRetry={() => void members.refetch()} />
      ) : (
        <View style={{ gap: space.sm }}>
          <Group title="Members">
            {(members.data ?? []).map((m, i) => (
              <ListRow
                key={m.id}
                testID={`member-row-${m.id}`}
                left={<Avatar name={m.displayName} index={i} size={36} />}
                title={m.displayName}
                subtitle={m.email ? `${ROLE_LABEL[m.role]}, ${m.email}` : ROLE_LABEL[m.role]}
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                    {m.isMe ? <Tag label="You" /> : null}
                    {isOwner && m.role === 'member' && !m.isMe ? (
                      <IconButton icon="trash" label={`Remove ${m.displayName}`} onPress={() => setRemoving(m)} size={36} />
                    ) : null}
                  </View>
                }
              />
            ))}
          </Group>
          {!isOwner ? (
            <T variant="caption" tone="faint" style={{ paddingHorizontal: space.xs }}>
              Only the household owner can invite or remove members.
            </T>
          ) : (members.data ?? []).length <= 1 ? (
            <T variant="caption" tone="faint" style={{ paddingHorizontal: space.xs }}>
              Share deadlines with a partner or housemate. Assign who handles what — each person gets reminders for their own items.
            </T>
          ) : null}
        </View>
      )}

      {/* Pending invites: the owner's business only (the worker refuses anyone else). */}
      {isOwner ? (
        invites.isLoading ? (
          <ListSkeleton rows={1} />
        ) : invites.isError ? (
          <ErrorState error={invites.error} onRetry={() => void invites.refetch()} />
        ) : (invites.data ?? []).length > 0 ? (
          <Group title="Waiting to join">
            {(invites.data ?? []).map((inv) => (
              <ListRow
                key={inv.id}
                testID={`invite-row-${inv.id}`}
                icon="mail"
                title={`Code ${inv.code}`}
                subtitle={`Expires ${expiryDay(inv.expiresAt)}`}
                right={
                  <Button
                    label="Revoke"
                    tone="quiet"
                    small
                    full={false}
                    onPress={() => revokeInvite(inv)}
                    disabled={revoke.isPending && revoke.variables === inv.id}
                    testID={`invite-revoke-${inv.id}`}
                  />
                }
              />
            ))}
          </Group>
        ) : null
      ) : null}

      {removing ? (
        <ConfirmSheet
          visible
          onClose={() => setRemoving(null)}
          title={`Remove ${removing.displayName}?`}
          message={`${removing.displayName} will lose access to your household’s deadlines straight away. Items assigned to them become “anyone”.`}
          confirmLabel={`Remove ${removing.displayName}`}
          onConfirm={confirmRemove}
          loading={remove.isPending}
        />
      ) : null}

      <InviteSheet visible={inviting} householdName={household?.name ?? 'our household'} onClose={() => setInviting(false)} />
    </Screen>
  );
}

/* ── the household's name (owner) ──────────────────────────────────────────── */

function HouseholdName({ current, onSaved }: { current: string; onSaved: () => Promise<unknown> }) {
  const toast = useToast();
  const update = useUpdateHousehold();
  const [name, setName] = useState(current);
  const [error, setError] = useState<string | undefined>();

  // /me arrives after the first render; follow it until the owner types.
  useEffect(() => setName(current), [current]);

  const dirty = name.trim() !== current && name.trim().length > 0;

  const save = () => {
    if (!name.trim()) return setError('Give your household a name.');
    update.mutate(
      { name: name.trim() },
      {
        onSuccess: async () => {
          await onSaved();
          toast({ message: 'Household name saved' });
        },
        onError: (e) => {
          const fields = fieldErrors(e);
          if (fields.name) setError(fields.name);
          else toast({ message: messageOf(e) });
        },
      },
    );
  };

  return (
    <View style={{ gap: space.sm }}>
      <Field
        label="Household name"
        value={name}
        onChangeText={(t) => {
          setName(t);
          setError(undefined);
        }}
        maxLength={NAME_MAX}
        autoCapitalize="words"
        placeholder="The Rivera household"
        returnKeyType="done"
        onSubmitEditing={dirty ? save : undefined}
        error={error}
        hint="Shown on invites. Only your household sees it."
        testID="household-name"
      />
      {dirty ? <Button label="Save name" tone="secondary" small full={false} onPress={save} loading={update.isPending} testID="household-name-save" /> : null}
    </View>
  );
}

/* ── a member leaves ─────────────────────────────────────────────────────── */

function LeaveButton() {
  const toast = useToast();
  const { household, refresh } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button label="Leave household" tone="destructive" onPress={() => setConfirm(true)} testID="household-leave" />
      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title={`Leave ${household?.name ?? 'this household'}?`}
        message="You’ll stop seeing its deadlines and reminders. You’ll start with an empty household of your own."
        confirmLabel="Leave household"
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api.post('/household/leave');
            await refresh();
            toast({ message: 'You left the household.' });
          } catch (e) {
            toast({ message: messageOf(e) });
          } finally {
            setBusy(false);
            setConfirm(false);
          }
        }}
      />
    </>
  );
}

/* ── a small label ("You") ─────────────────────────────────────────────── */

function Tag({ label }: { label: string }) {
  const s = useStyles();
  const c = useColors();
  return (
    <View style={s.tag}>
      <T variant="micro" style={{ color: c.brandInk }}>
        {label}
      </T>
    </View>
  );
}

/* ── invite: optional email → a code to share ───────────────────────────── */

function InviteSheet({ visible, householdName, onClose }: { visible: boolean; householdName: string; onClose: () => void }) {
  const s = useStyles();
  const create = useCreateInvite();
  const { handlePlanError } = usePlanGate();
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [copied, setCopied] = useState(false);

  // Each opening starts fresh; the code is shown once and never fetched again.
  useEffect(() => {
    if (!visible) return;
    setError(null);
    setInvite(null);
    setCopied(false);
  }, [visible]);

  const submit = () => {
    setError(null);
    create.mutate(undefined, {
      onSuccess: (created) => {
        tap('success');
        setInvite(created);
      },
      onError: (e) => {
        if (handlePlanError(e)) return onClose();
        // The toast would sit under this sheet, so errors are said in it.
        setError(messageOf(e));
      },
    });
  };

  const share = async (inv: Invite) => {
    try {
      await Share.share({ message: `Join ${householdName} on Duebox so we can share deadlines and reminders: ${inv.link} — or enter code ${inv.code} in the app.` });
    } catch (e) {
      setError(messageOf(e));
    }
  };

  const copy = async (inv: Invite) => {
    await Clipboard.setStringAsync(inv.code);
    tap();
    setCopied(true);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={invite ? 'Share this code' : 'Invite a member'}>
      {invite ? (
        <View style={{ gap: space.lg }}>
          <View style={s.codeCard} accessible accessibilityLabel={`Invite code ${invite.code.split('').join(' ')}`}>
            <T variant="display" selectable style={s.code} testID="invite-code">
              {invite.code}
            </T>
            <T variant="caption" tone="muted" selectable numberOfLines={1}>
              {invite.link}
            </T>
          </View>
          <T variant="caption" tone="muted" align="center">
            Works once, until {expiryDay(invite.expiresAt)}. They’ll join {householdName} as a member.
          </T>
          {error ? (
            <T variant="caption" tone="critical" align="center">
              {error}
            </T>
          ) : null}
          <View style={{ gap: space.sm }}>
            <Button label="Share invite" icon="share" onPress={() => void share(invite)} testID="invite-share" />
            <Button label={copied ? 'Code copied' : 'Copy code'} icon={copied ? 'check' : 'copy'} tone="secondary" onPress={() => void copy(invite)} testID="invite-copy" />
            <Button label="Done" tone="quiet" onPress={onClose} testID="invite-done" />
          </View>
        </View>
      ) : (
        <View style={{ gap: space.lg }}>
          <T tone="muted">They’ll see every deadline in the household, can scan and add items, and get reminders for anything assigned to them. You’ll get a code to send however you like.</T>
          {error ? (
            <T variant="caption" tone="critical">
              {error}
            </T>
          ) : null}
          <Button label="Create invite" onPress={submit} loading={create.isPending} testID="invite-create" />
          <Button label="Cancel" tone="quiet" onPress={onClose} />
        </View>
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  codeCard: { alignItems: 'center', gap: space.xs, backgroundColor: c.surfaceSunk, borderRadius: radius.card, paddingVertical: space.xl, paddingHorizontal: space.lg },
  code: { letterSpacing: 6, fontFamily: font.display, color: c.brandInk },
  tag: { borderRadius: radius.chip, paddingHorizontal: space.sm, paddingVertical: 2, backgroundColor: c.brandSoft },
}));
