import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../src/auth/context';
import { messageOf } from '../src/api/client';
import { Screen } from '../src/ui/Screen';
import { EmptyState } from '../src/ui/Feedback';
import { Skeleton } from '../src/ui/Feedback';
import { T } from '../src/ui/Text';
import { space } from '../src/theme/tokens';

/**
 * Where a brokered sign-in lands when the OS delivers `duebox://auth?code=…`
 * as an ordinary deep link (Android, or a cold start). The code is single-use
 * and lives two minutes; the ref guard stops React's development double-run
 * from spending it twice.
 */
export default function AuthReturn() {
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const { completeSocialSignIn, session } = useAuth();
  const router = useRouter();
  const spent = useRef(false);
  const [error, setError] = useState<string | null>(params.error ?? null);

  useEffect(() => {
    if (spent.current) return;
    if (!params.code) {
      // The in-app browser already handed the code to the screen that opened it.
      if (session) router.replace('/');
      return;
    }
    spent.current = true;
    completeSocialSignIn(params.code)
      .then(() => router.replace('/'))
      .catch((e) => setError(messageOf(e)));
  }, [params.code, completeSocialSignIn, router, session]);

  if (error) {
    return (
      <Screen>
        <EmptyState title="That sign-in didn’t finish" message={error} actionLabel="Back to sign in" onAction={() => router.replace('/(auth)/welcome')} />
      </Screen>
    );
  }
  return (
    <Screen>
      <View style={{ gap: space.md, paddingTop: space.giant }}>
        <T variant="title" align="center">
          Signing you in…
        </T>
        <Skeleton height={12} width="50%" style={{ alignSelf: 'center' }} />
      </View>
    </Screen>
  );
}
