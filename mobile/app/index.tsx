import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/auth/context';
import { hasOnboarded } from '../src/onboarding/discovery';
import { useColors } from '../src/theme/tokens';

/**
 * Which world to open: first launch → the discovery onboarding; no session →
 * welcome; signed in → Home. The household is created by the server on the
 * first /auth/me, so there is no setup step after sign-up (FR-A2).
 */
export default function Index() {
  const { session } = useAuth();
  const c = useColors();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    void hasOnboarded().then(setOnboarded);
  }, []);

  if (session) return <Redirect href="/(tabs)/home" />;
  if (onboarded === null) return <View style={{ flex: 1, backgroundColor: c.ground }} />;
  if (!onboarded) return <Redirect href="/onboarding" />;
  return <Redirect href="/(auth)/welcome" />;
}
