import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Application from 'expo-application';
import { useAuth } from '../../src/auth/context';
import { useHome } from '../../src/api/hooks';
import { SUPPORT_EMAIL } from '../../src/config';
import { makeStyles, radius, space, useColors } from '../../src/theme/tokens';
import { Screen, PageTitle } from '../../src/ui/Screen';
import { T } from '../../src/ui/Text';
import { Press } from '../../src/ui/Button';
import { Icon } from '../../src/ui/Icon';
import { Group, ListRow } from '../../src/ui/Layout';
import { Avatar } from '../../src/ui/Progress';
import { ConfirmSheet } from '../../src/ui/Sheet';
import { useTabBarSpace } from '../../src/ui/tabBar';
import { hourLabel } from '../../src/lib/format';
import { openStoreListing } from '../../src/lib/review';

/**
 * SETTINGS (SCREENS #12, FR-X, store-readiness.md). The household card with
 * the plan, then everything a store-bound app must have: notifications,
 * account, export, delete account, privacy, terms, rate, support, version.
 */
export default function Settings() {
  const router = useRouter();
  const c = useColors();
  const s = useStyles();
  const bottom = useTabBarSpace();
  const { me, household, plan, isPro, prefs, signOut } = useAuth();
  const home = useHome();
  const [confirmOut, setConfirmOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const members = home.data?.members ?? [];
  const version = `${Application.nativeApplicationVersion ?? '1.0.0'} (${Application.nativeBuildVersion ?? 'dev'})`;

  return (
    <Screen bottomPad={bottom} testID="screen-settings">
      <PageTitle title="Settings" />

      <Press onPress={() => router.push(isPro ? '/settings/subscription' : { pathname: '/paywall', params: { reason: 'default' } })} accessibilityRole="button" testID="settings-plan">
        <View style={s.planCard}>
          <View style={{ flex: 1, gap: 4 }}>
            <T variant="micro" style={{ color: c.onBrandMuted }}>
              {household?.name ?? 'Your home'}
            </T>
            <T variant="title" style={{ color: c.onBrand }}>
              {isPro ? 'Duebox Pro' : 'Free plan'}
            </T>
            <T variant="caption" style={{ color: c.onBrandMuted }}>
              {isPro
                ? 'Unlimited deadlines and scans for your household'
                : plan
                  ? `${plan.usage.openItems} of ${plan.limits.openItems ?? '∞'} deadlines · ${plan.usage.scansThisMonth} of ${plan.limits.scansPerMonth} scans this month`
                  : 'Up to 5 deadlines · 3 scans a month'}
            </T>
          </View>
          {isPro ? (
            <Icon name="crown" size={24} color={c.accentOnBrand} />
          ) : (
            <View style={s.upgrade}>
              <T variant="caption" style={{ color: c.accentInk, fontFamily: 'Manrope_700Bold' }}>
                Go Pro
              </T>
            </View>
          )}
        </View>
      </Press>

      <Group title="Reminders">
        <ListRow
          icon="bell"
          title="Notifications"
          subtitle={prefs ? (prefs.reminders ? (prefs.overdue ? 'Deadlines and overdue nudges' : 'Deadlines only') : 'Off') : undefined}
          onPress={() => router.push('/settings/notifications')}
        />
        <ListRow icon="clock" title="Reminder time" value={hourLabel(household?.remindHour ?? 9)} onPress={() => router.push('/settings/reminder-time')} />
      </Group>

      <Group title="Household">
        <ListRow
          icon="users"
          title="Household & members"
          subtitle={members.length > 1 ? `${members.length} people` : 'Just you — invite a partner'}
          right={
            members.length > 1 ? (
              <View style={{ flexDirection: 'row' }}>
                {members.slice(0, 3).map((m, i) => (
                  <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                    <Avatar name={m.displayName} index={i} size={24} />
                  </View>
                ))}
              </View>
            ) : undefined
          }
          onPress={() => router.push('/settings/household')}
          testID="settings-household"
        />
        <ListRow icon="crown" title="Subscription" value={isPro ? 'Pro' : 'Free'} onPress={() => router.push('/settings/subscription')} />
      </Group>

      <Group title="Account">
        <ListRow icon="user" title="Account" subtitle={me?.user.email} onPress={() => router.push('/settings/account')} />
        <ListRow icon="download" title="Export my data" subtitle="CSV or JSON, anytime" onPress={() => router.push('/settings/export')} />
        <ListRow icon="logout" title="Sign out" onPress={() => setConfirmOut(true)} chevron={false} />
        <ListRow icon="trash" title="Delete account" destructive onPress={() => router.push('/settings/delete')} testID="settings-delete" />
      </Group>

      <Group title="About">
        <ListRow icon="star" title="Rate Duebox" onPress={() => void openStoreListing()} />
        <ListRow icon="mail" title="Contact support" subtitle={SUPPORT_EMAIL} onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Duebox%20support`).catch(() => undefined)} />
        <ListRow icon="shield" title="Privacy policy" onPress={() => router.push('/legal/privacy')} />
        <ListRow icon="file" title="Terms of service" onPress={() => router.push('/legal/terms')} />
      </Group>

      <T variant="caption" tone="faint" align="center">
        Duebox {version}
      </T>

      <ConfirmSheet
        visible={confirmOut}
        onClose={() => setConfirmOut(false)}
        title="Sign out?"
        message="Reminders stop on this phone until you sign in again. Your deadlines stay safe in your account."
        confirmLabel="Sign out"
        destructive={false}
        loading={signingOut}
        onConfirm={async () => {
          setSigningOut(true);
          await signOut();
          setSigningOut(false);
          setConfirmOut(false);
        }}
      />
    </Screen>
  );
}

const useStyles = makeStyles((c) => ({
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: c.brand,
    borderRadius: radius.card,
    padding: space.xl,
  },
  upgrade: { backgroundColor: c.accent, borderRadius: radius.chip, paddingHorizontal: space.md, paddingVertical: space.sm },
}));
