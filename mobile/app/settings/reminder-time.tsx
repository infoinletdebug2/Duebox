import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/auth/context';
import { useUpdateHousehold } from '../../src/api/hooks';
import { messageOf } from '../../src/api/client';
import { makeStyles, radius, space, useColors } from '../../src/theme/tokens';
import { Screen, Header } from '../../src/ui/Screen';
import { T } from '../../src/ui/Text';
import { Button, Press, tap } from '../../src/ui/Button';
import { Banner } from '../../src/ui/Feedback';
import { useToast } from '../../src/ui/Sheet';
import { hourLabel } from '../../src/lib/format';

/**
 * REMINDER TIME (SCREENS #14, FR-R3). The household's hour, in its timezone.
 * Changing it re-plans every unsent reminder on the server (FR-R7).
 */
const HOURS = [7, 8, 9, 10, 12, 14, 17, 18, 19, 20];

export default function ReminderTime() {
  const router = useRouter();
  const toast = useToast();
  const c = useColors();
  const s = useStyles();
  const { household, isOwner, refresh } = useAuth();
  const update = useUpdateHousehold();
  const [hour, setHour] = useState(household?.remindHour ?? 9);
  const deviceZone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return null;
    }
  })();
  const zoneDiffers = Boolean(household && deviceZone && household.timezone !== deviceZone);

  const save = (extra?: { timezone?: string }) =>
    update.mutate(
      { remindHour: hour, ...extra },
      {
        onSuccess: async () => {
          await refresh();
          toast({ message: `Reminders at ${hourLabel(hour)}.` });
          router.back();
        },
        onError: (e) => toast({ message: messageOf(e) }),
      },
    );

  return (
    <Screen
      header={<Header title="Reminder time" />}
      testID="screen-reminder-time"
      footer={isOwner ? <Button label="Save time" onPress={() => save()} loading={update.isPending} disabled={hour === household?.remindHour} /> : undefined}
    >
      <View style={{ gap: space.sm }}>
        <T variant="display" accessibilityRole="header">
          When should we remind you?
        </T>
        <T tone="muted">
          On reminder days, one notification at this time{household ? ` (${household.timezone.replace(/_/g, ' ')})` : ''}.
        </T>
      </View>

      {!isOwner ? <Banner icon="users" message="The household owner sets the reminder time for everyone." /> : null}

      <View style={s.grid}>
        {HOURS.map((h) => {
          const on = h === hour;
          return (
            <Press
              key={h}
              disabled={!isOwner}
              onPress={() => {
                tap();
                setHour(h);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={hourLabel(h)}
              style={[s.cell, on && { backgroundColor: c.brand, borderColor: c.brand }]}
            >
              <T variant="headline" style={{ color: on ? c.onBrand : c.text }}>
                {hourLabel(h)}
              </T>
            </Press>
          );
        })}
      </View>

      {zoneDiffers && isOwner && deviceZone ? (
        <View style={{ gap: space.sm }}>
          <Banner icon="info" message={`Your phone is in ${deviceZone.replace(/_/g, ' ')}, but reminders use ${household?.timezone.replace(/_/g, ' ')}.`} />
          <Button label="Use my phone’s time zone" tone="secondary" onPress={() => save({ timezone: deviceZone })} />
        </View>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((c) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: {
    width: '48%',
    minHeight: 56,
    borderRadius: radius.tile,
    borderWidth: 1.5,
    borderColor: c.line,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
