import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../src/auth/context';
import { api, ApiError, messageOf } from '../../src/api/client';
import { makeStyles, radius, space } from '../../src/theme/tokens';
import { longDate } from '../../src/lib/dates';
import { Screen, Header } from '../../src/ui/Screen';
import { T } from '../../src/ui/Text';
import { Button } from '../../src/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../../src/ui/Feedback';
import { HouseholdArt } from '../../src/ui/artwork';
import { FormMessage } from '../../src/account/AuthShell';
import { rememberJoin } from '../../src/account/pendingJoin';

/**
 * JOIN A HOUSEHOLD (SCREENS nav, FR-A3) — where `duebox://join/<code>` lands.
 *
 * Shows whose household it is before anything happens; one tap joins as a
 * member. Signed out, the code is parked first (pendingJoin) and the
 * root guard takes them to welcome; finishing sign-in brings them back here.
 *
 * The invite's own failures are told plainly: not valid (404), already used
 * (409), expired (410) — each with what to do next.
 */
interface Lookup {
  householdName: string;
  invitedBy: string | null;
  expiresAt?: string | null;
}

export default function Join() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ code: string }>();
  const code = String(params.code ?? '').trim().toUpperCase();
  const { session, refresh } = useAuth();
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Runs before the root guard's effect (children first): the code survives sign-in.
  useEffect(() => {
    if (!session && code) rememberJoin(code);
  }, [session, code]);

  const lookup = useQuery({
    queryKey: ['invite', code],
    queryFn: () => api.get<Lookup>(`/household/invites/lookup/${encodeURIComponent(code)}`),
    enabled: Boolean(session && code),
    retry: false,
  });

  const accept = async () => {
    setJoining(true);
    setJoinError(null);
    try {
      await api.post<{ joined: boolean }>('/household/join', { code });
      qc.clear();
      await refresh();
      router.replace('/');
    } catch (failure) {
      setJoinError(messageOf(failure));
      setJoining(false);
    }
  };

  const leave = () => router.replace('/');

  let body: React.ReactNode;
  if (!session) {
    body = <Loading />;
  } else if (lookup.isLoading) {
    body = <Loading />;
  } else if (lookup.isError) {
    body = <InviteProblem error={lookup.error} onRetry={() => void lookup.refetch()} onLeave={leave} />;
  } else if (lookup.data) {
    const invite = lookup.data;
    body = (
      <>
        <View style={{ alignItems: 'center' }}>
          <HouseholdArt size={170} />
        </View>
        <View style={{ gap: space.sm }}>
          <T variant="micro" tone="muted">
            Invitation
          </T>
          <T variant="display" accessibilityRole="header">
            Join {invite.householdName}
          </T>
          <T tone="muted">
            {invite.invitedBy ? `${invite.invitedBy} invited you to share deadlines and reminders on Duebox.` : 'You’ve been invited to share this household’s deadlines on Duebox.'}
          </T>
        </View>
        <Facts />
        {invite.expiresAt ? (
          <T variant="caption" tone="faint">
            This invite works once and expires {longDate(invite.expiresAt.slice(0, 10))}.
          </T>
        ) : null}
      </>
    );
  } else {
    body = <Loading />;
  }

  const canAccept = Boolean(session && lookup.data);

  return (
    <Screen
      header={<Header closeIcon onBack={leave} />}
      testID="screen-join"
      footer={
        canAccept ? (
          <View style={{ gap: space.sm }}>
            <FormMessage message={joinError} />
            <Button label="Join household" onPress={() => void accept()} loading={joining} testID="join-accept" />
            <Button label="Not now" tone="quiet" onPress={leave} disabled={joining} />
          </View>
        ) : undefined
      }
    >
      {body}
    </Screen>
  );
}

function Facts() {
  const s = useStyles();
  const lines = [
    'See every deadline in the household, and get reminders for the ones assigned to you.',
    'Scan letters, add items and mark them done.',
    'Anything you already track comes with you.',
    'The household owner manages members and the subscription.',
  ];
  return (
    <View style={s.facts}>
      {lines.map((line) => (
        <View key={line} style={{ flexDirection: 'row', gap: space.sm }}>
          <T tone="brand">•</T>
          <T variant="callout" style={{ flex: 1 }}>
            {line}
          </T>
        </View>
      ))}
    </View>
  );
}

function Loading() {
  return (
    <View style={{ gap: space.lg, paddingTop: space.xl }}>
      <Skeleton height={130} style={{ borderRadius: radius.card }} />
      <Skeleton height={30} width="70%" />
      <Skeleton height={16} width="90%" />
    </View>
  );
}

function InviteProblem({ error, onRetry, onLeave }: { error: unknown; onRetry: () => void; onLeave: () => void }) {
  if (!(error instanceof ApiError) || error.isOffline || error.status >= 500) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }
  const copy =
    error.status === 410
      ? { title: 'This invite has expired', message: 'Invites last 7 days. Ask whoever sent it for a new link.' }
      : error.status === 409
        ? { title: 'You can’t join right now', message: messageOf(error) }
        : error.status === 404
          ? { title: 'That invite isn’t valid', message: 'The link may be incomplete, or the invite was cancelled. Ask for a new one.' }
          : { title: 'That invite didn’t work', message: messageOf(error) };
  return <EmptyState art={<HouseholdArt size={140} />} title={copy.title} message={copy.message} actionLabel="Continue to Duebox" onAction={onLeave} />;
}

const useStyles = makeStyles((c) => ({
  facts: {
    backgroundColor: c.surface,
    borderRadius: radius.group,
    borderWidth: 1,
    borderColor: c.line,
    padding: space.lg,
    gap: space.sm,
  },
}));
