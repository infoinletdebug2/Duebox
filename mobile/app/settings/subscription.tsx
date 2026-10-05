import { Linking, Platform, View } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { api, messageOf } from '../../src/api/client';
import { trialStarted } from '../../src/lib/analytics';
import type { Plan } from '../../src/types';
import { useAuth } from '../../src/auth/context';
import { ProgressBar } from '../../src/ui/Progress';
import { space, useColors } from '../../src/theme/tokens';
import { Screen, Header } from '../../src/ui/Screen';
import { HeroBanner } from '../../src/ui/HeroBanner';
import { T } from '../../src/ui/Text';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Layout';
import { useToast } from '../../src/ui/Sheet';

/**
 * SUBSCRIPTION (SCREENS #17). Current plan and this month's usage; Manage in
 * the store; Restore lives on the paywall. Lapsing never hides anything (BR-07).
 */
export default function SubscriptionStatus() {
  const router = useRouter();
  const toast = useToast();
  const c = useColors();
  const { plan, isPro, isOwner, setPlan, me } = useAuth();
  const [starting, setStarting] = useState(false);
  // The trial is started at setup; if that start failed (it is swallowed so
  // setup never breaks) the account has never had one — offer it here.
  const trialAvailable = isOwner && plan?.tier === 'free' && !plan.trialUsed;
  const startTrial = async () => {
    setStarting(true);
    try {
      const next = await api.post<Plan>('/billing/trial');
      setPlan(next);
      trialStarted(next.trialDays, me?.user.id);
      toast({ message: `Your ${next.trialDays} days of Pro have started.` });
    } catch (failure) {
      toast({ message: messageOf(failure) });
    } finally {
      setStarting(false);
    }
  };

  const manage = () => {
    const url = Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions';
    void Linking.openURL(url).catch(() => toast({ message: 'Open your store account’s Subscriptions page to manage Duebox.' }));
  };

  const items = plan?.usage.openItems ?? 0;
  const itemLimit = plan?.limits.openItems ?? null;
  const scans = plan?.usage.scansThisMonth ?? 0;
  const scanLimit = plan?.limits.scansPerMonth ?? 3;

  return (
    <Screen header={<Header />} testID="screen-subscription">
      <HeroBanner
        art="subscription"
        eyebrow="Your plan"
        title={plan?.isTrial ? 'Duebox Pro · trial' : isPro ? 'Duebox Pro' : 'Free'}
        lead={
          plan?.isTrial && plan.trialEndsAt
            ? `Everything unlocked until ${new Date(plan.trialEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. Then Free, unless you subscribe.`
            : isPro && plan?.renewsAt
              ? `Renews ${new Date(plan.renewsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Thank you.`
              : 'Five deadlines and three scans a month, free forever. Pro removes the limits.'
        }
        chips={
          isPro
            ? [
                { icon: 'check', label: 'Unlimited deadlines' },
                { icon: 'scan', label: `${scanLimit} scans a month` },
                { icon: 'users', label: 'Household sharing' },
              ]
            : [
                { icon: 'check', label: `${itemLimit ?? 5} deadlines` },
                { icon: 'scan', label: `${scanLimit} scans a month` },
              ]
        }
      />

      <Card style={{ gap: space.lg }}>
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row' }}>
            <T variant="headline" style={{ flex: 1 }}>
              Open deadlines
            </T>
            <T tone="muted">{itemLimit === null ? `${items}, no limit` : `${items} of ${itemLimit}`}</T>
          </View>
          {itemLimit !== null ? <ProgressBar value={items / Math.max(1, itemLimit)} color={items >= itemLimit ? c.critical : c.brandInk} /> : null}
        </View>
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row' }}>
            <T variant="headline" style={{ flex: 1 }}>
              Scans this month
            </T>
            <T tone="muted">
              {scans} of {scanLimit}
            </T>
          </View>
          <ProgressBar value={scans / Math.max(1, scanLimit)} color={scans >= scanLimit ? c.critical : c.brandInk} />
        </View>
      </Card>

      {trialAvailable ? (
        <Button label={`Start my ${plan?.trialDays ?? 7}-day free trial`} icon="sparkles" onPress={() => void startTrial()} loading={starting} testID="subscription-start-trial" />
      ) : null}
      {isPro && plan?.source === 'store' ? (
        <Button label="Manage in the store" tone="secondary" onPress={manage} />
      ) : trialAvailable ? null : (
        <Button label={!isOwner ? 'Ask the owner about Pro' : plan?.isTrial ? 'Keep Pro after the trial' : 'See Duebox Pro'} onPress={() => router.push({ pathname: '/paywall', params: { reason: 'default' } })} testID="subscription-upgrade" />
      )}
      <Button label="Restore purchases" tone="quiet" onPress={() => router.push({ pathname: '/paywall', params: { reason: 'default' } })} />
      <T variant="caption" tone="faint" align="center">
        Done items never count toward the free limit. If Pro ends, nothing is hidden or deleted.
      </T>
    </Screen>
  );
}
