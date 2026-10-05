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
 *   setup done, welcome offer not seen yet → the one-time offer;
 *   otherwise → Home.
 * Email verification is offered right after sign-up and never blocks the app.
 */
export default function Index() {
  const { session, needsSetup, needsOffer } = useAuth();
  const c = useColors();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    void hasOnboarded().then(setOnboarded);
  }, []);

  if (session) {
    if (needsSetup) return <Redirect href="/setup" />;
    if (needsOffer) return <Redirect href="/offer" />;
    return <Redirect href="/(tabs)/home" />;
  }
  if (onboarded === null) return <View style={{ flex: 1, backgroundColor: c.brand }} />;
  if (!onboarded) return <Redirect href="/discover" />;
  return <Redirect href="/(auth)/welcome" />;
}
