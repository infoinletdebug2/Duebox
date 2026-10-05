import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../src/auth/context';
import { space } from '../src/theme/tokens';
import { Screen } from '../src/ui/Screen';
import { T } from '../src/ui/Text';
import { Button } from '../src/ui/Button';
import { Banner } from '../src/ui/Feedback';
import { BellArt } from '../src/ui/artwork';
import { hourLabel } from '../src/lib/format';
import { markAskedForPush, pushSupported, requestPermission } from '../src/notifications/push';

/**
 * EXPLAIN-FIRST PERMISSION (SCREENS #10, FR-R8, design.md §17).
 *
 * Shown once, right after the first item is saved — so the sentence can name
 * that item and the benefit is concrete. "Not now" is a real answer; Home
 * shows a quiet banner later.
 */
export default function NotificationsPermission() {
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string }>();
  const { household } = useAuth();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const title = params.title?.trim() || 'your first deadline';

  useEffect(() => {
    void pushSupported().then(setSupported);
  }, []);

  const leave = () => router.replace('/(tabs)/home');

  const allow = async () => {
    setBusy(true);
    await requestPermission();
    setBusy(false);
    leave();
  };

  const notNow = async () => {
    await markAskedForPush();
    leave();
  };

  return (
    <Screen
      testID="screen-permission"
      footer={
        <View style={{ gap: space.sm }}>
          <Button label="Turn on reminders" icon="bell" onPress={() => void allow()} loading={busy} disabled={supported === false} testID="permission-allow" />
          <Button label="Not now" tone="quiet" onPress={() => void notNow()} disabled={busy} testID="permission-later" />
        </View>
      }
    >
      <View style={{ alignItems: 'center', gap: space.lg, paddingTop: space.giant }}>
        <BellArt size={200} />
        <T variant="display" align="center" accessibilityRole="header">
          Turn on reminders
        </T>
        <T tone="muted" align="center" style={{ maxWidth: 330, fontSize: 17, lineHeight: 25 }}>
          So we can tell you 7 days before {title} is due — at {hourLabel(household?.remindHour ?? 9)}, and never more than you need.
        </T>
      </View>
      {supported === false ? (
        <Banner icon="info" message="Reminders need the installed app from the App Store or Google Play — they can’t be turned on in Expo Go or on the web." />
      ) : null}
    </Screen>
  );
}
