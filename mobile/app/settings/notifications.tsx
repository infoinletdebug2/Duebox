import { useCallback, useState } from 'react';
import { Linking, Switch, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/auth/context';
import { useUpdateMe } from '../../src/api/hooks';
import { messageOf } from '../../src/api/client';
import { space, useColors } from '../../src/theme/tokens';
import { Screen, Header } from '../../src/ui/Screen';
import { HeroBanner } from '../../src/ui/HeroBanner';
import { hourLabel } from '../../src/lib/format';
import { T } from '../../src/ui/Text';
import { Button } from '../../src/ui/Button';
import { Group, ListRow } from '../../src/ui/Layout';
import { Banner } from '../../src/ui/Feedback';
import { useToast } from '../../src/ui/Sheet';
import { permissionStatus, requestPermission, type PushPermission } from '../../src/notifications/push';
import type { Prefs } from '../../src/types';

/** RN Web ignores thumbColor for the ON state and paints its own teal. */
const WEB_THUMB = { activeThumbColor: '#FFFFFF' } as object;

/**
 * NOTIFICATIONS (SCREENS #13, FR-R9, store-readiness.md: per category, not
 * one master switch). The phone's own permission is shown alongside, with a
 * way to fix it — a preference that's on while the OS blocks it is a lie.
 */
export default function Notifications() {
  const c = useColors();
  const toast = useToast();
  const { prefs, setPrefs, household } = useAuth();
  const update = useUpdateMe();
  const [status, setStatus] = useState<PushPermission | null>(null);

  useFocusEffect(
    useCallback(() => {
      void permissionStatus().then(setStatus);
    }, []),
  );

  const toggle = (key: keyof Prefs, value: boolean) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    update.mutate(
      { prefs: { [key]: value } },
      {
        onError: (e) => {
          setPrefs(prefs);
          toast({ message: messageOf(e) });
        },
      },
    );
  };

  const fix = async () => {
    if (status === 'undetermined') setStatus(await requestPermission());
    else void Linking.openSettings();
  };

  return (
    <Screen header={<Header />} testID="screen-notifications">
      <HeroBanner
        art="notify"
        eyebrow="Notifications"
        title="Reminded before, not on the day"
        lead={`Quiet nudges at ${hourLabel(household?.remindHour ?? 9)}, ${household?.timezone ?? 'your time'}. Done or Snooze right from the notification.`}
        chips={[
          { icon: 'calendar-clock', label: '30, 7 and 1 days ahead' },
          { icon: 'bell', label: 'On the day' },
          { icon: 'alarm', label: 'One overdue nudge' },
        ]}
      />
      {status === 'denied' || status === 'undetermined' ? (
        <View style={{ gap: space.sm }}>
          <Banner icon="bell-off" message="Notifications are off for Duebox on this phone, so reminders can’t reach you." />
          <Button label={status === 'undetermined' ? 'Turn on notifications' : 'Open phone settings'} tone="secondary" onPress={() => void fix()} />
        </View>
      ) : status === 'unsupported' ? (
        <Banner icon="info" message="Push reminders need the installed app from the App Store or Google Play. Your choices below are saved for when you use it." />
      ) : null}

      <Group title="Send me">
        <ListRow
          title="Deadline reminders"
          subtitle="Before each deadline and on the day"
          chevron={false}
          right={<Switch value={prefs?.reminders ?? true} onValueChange={(v) => toggle('reminders', v)} trackColor={{ true: c.brand, false: c.line }} thumbColor="#FFFFFF" {...WEB_THUMB} accessibilityLabel="Deadline reminders" />}
        />
        <ListRow
          title="Overdue nudges"
          subtitle="Once, the day after something was due"
          chevron={false}
          right={<Switch value={prefs?.overdue ?? true} onValueChange={(v) => toggle('overdue', v)} trackColor={{ true: c.brand, false: c.line }} thumbColor="#FFFFFF" {...WEB_THUMB} accessibilityLabel="Overdue nudges" />}
        />
      </Group>
      <T variant="caption" tone="faint">
        Reminders go to whoever an item is assigned to, or to everyone in the household if it’s for anyone. We never send marketing notifications.
      </T>
    </Screen>
  );
}
