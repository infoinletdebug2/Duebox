import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/auth/context';
import { hasOnboarded } from '../src/onboarding/discovery';
import { useColors } from '../src/theme/tokens';

/**
 * Which world to open:
 *   a phone that has never seen Duebox → the discovery pitch;
 *   no session → welcome;
 *   signed in, setup not done (owner) → the two-tap setup;
 *   set up but not subscribed → the paywall (hard paywall, no way past it);
 *   otherwise → Home.
 * Email verification is offered right after sign-up and never blocks the app.
 */
export default function Index() {
  const { session, needsSetup, needsSubscription } = useAuth();
  const c = useColors();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    void hasOnboarded().then(setOnboarded);
  }, []);

  if (session) {
    if (needsSetup) return <Redirect href="/setup" />;
    if (needsSubscription) return <Redirect href="/paywall" />;
    return <Redirect href="/(tabs)/home" />;
  }
  if (onboarded === null) return <View style={{ flex: 1, backgroundColor: c.brand }} />;
  if (!onboarded) return <Redirect href="/discover" />;
  return <Redirect href="/(auth)/welcome" />;
}
