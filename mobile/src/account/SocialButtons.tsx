import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../auth/context';
import { availableProviders, SocialCancelled, type SocialProvider } from '../auth/social';
import { messageOf } from '../api/client';
import { radius, space } from '../theme/tokens';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Feedback';
import { FormMessage } from './AuthShell';
import { routeAfterAuth } from './pendingJoin';

/**
 * Apple and Google (FR-A1). Which buttons exist is asked, not assumed:
 * Apple only where Apple allows it, Google only where the platform can
 * broker it. A closed sheet is not an error and says nothing.
 *
 * Apple first — App Review §4.8 wants it at least as prominent as Google.
 */
const LABEL: Record<SocialProvider, string> = {
  apple: 'Continue with Apple',
  google: 'Continue with Google',
};

export function SocialButtons({
  onBusy,
  onLoaded,
  primaryFirst,
}: {
  onBusy?: (busy: boolean) => void;
  /** Tells the screen which buttons exist, so it can decide where the one mint button goes. */
  onLoaded?: (providers: SocialProvider[]) => void;
  /** Draw the first provider as the screen's primary (welcome). */
  primaryFirst?: boolean;
}) {
  const router = useRouter();
  const { signInWithProvider } = useAuth();
  const [providers, setProviders] = useState<SocialProvider[] | null>(null);
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void availableProviders().then((list) => {
      if (!alive) return;
      setProviders(list);
      onLoaded?.(list);
    });
    return () => {
      alive = false;
    };
    // Asked once per mount; `onLoaded` is a callback, not an input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = async (provider: SocialProvider) => {
    setError(null);
    setBusy(provider);
    onBusy?.(true);
    try {
      await signInWithProvider(provider);
      await routeAfterAuth(router);
    } catch (failure) {
      if (!(failure instanceof SocialCancelled)) setError(messageOf(failure));
    } finally {
      setBusy(null);
      onBusy?.(false);
    }
  };

  if (providers === null) {
    return (
      <View style={{ gap: space.sm }}>
        <Skeleton height={52} style={{ borderRadius: radius.button }} />
      </View>
    );
  }
  if (providers.length === 0) return null;

  return (
    <View style={{ gap: space.sm }}>
      {providers.map((p, i) => (
        <Button
          key={p}
          testID={`social-${p}`}
          label={LABEL[p]}
          // Apple's button follows Apple's HIG (black/white), never the mint accent.
          tone={p === 'apple' ? 'ink' : primaryFirst && i === 0 ? 'primary' : 'secondary'}
          loading={busy === p}
          disabled={busy !== null && busy !== p}
          onPress={() => void go(p)}
        />
      ))}
      <FormMessage message={error} />
    </View>
  );
}
