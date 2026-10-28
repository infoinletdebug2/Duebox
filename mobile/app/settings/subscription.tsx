import { Linking, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/auth/context';
import { ProgressBar } from '../../src/ui/Progress';
import { space, useColors } from '../../src/theme/tokens';
import { Screen, Header } from '../../src/ui/Screen';
import { HeroBanner } from '../../src/ui/HeroBanner';
import { T } from '../../src/ui/Text';
import { Button } from '../../src/ui/Button';
import { Banner } from '../../src/ui/Feedback';
import { Card } from '../../src/ui/Layout';
import { useToast } from '../../src/ui/Sheet';

/**
 * SUBSCRIPTION (SCREENS #17). The household's plan: trial end and first
 * charge, renewal, a payment problem, or a cancellation still running out;
 * Manage in the store; this month's AI reads. Hard paywall: there is no free
 * plan to describe — not subscribed means the paywall (app/_layout.tsx).
 */
export default function SubscriptionStatus() {
  const router = useRouter();
  const toast = useToast();
  const c = useColors();
  const { plan, isOwner } = useAuth();
  const storeName = plan?.platform === 'google' || (!plan?.platform && Platform.OS === 'android') ? 'Google Play' : 'App Store';

  const manage = () => {
    const url = plan?.platform === 'google' || (!plan?.platform && Platform.OS === 'android') ? 'https://play.google.com/store/account/subscriptions' : 'https://apps.apple.com/account/subscriptions';
    void Linking.openURL(url).catch(() => toast({ message: `Open Subscriptions in your ${storeName} account to manage Duebox.` }));
  };

  const long = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '');
  const scans = plan?.usage.scansThisMonth ?? 0;
  const scanLimit = plan?.limits.scansPerMonth ?? 100;
  const period = plan?.period === 'monthly' ? 'Monthly' : plan?.period === 'yearly' ? 'Yearly' : null;

  const lead = !plan
    ? ''
    : plan.isTrial
      ? plan.willRenew
        ? `Your free trial ends ${long(plan.trialEndsAt)}. Your first charge is that day, unless you cancel at least 24 hours before.`
        : `Your free trial ends ${long(plan.trialEndsAt)} and won’t renew — you’ve cancelled. Duebox locks after that, and your deadlines stay saved.`
      : plan.status === 'grace'
        ? `Your last payment didn’t go through. Update your payment method in your ${storeName} account to keep Duebox open.`
        : !plan.willRenew && plan.expiresAt
          ? `Cancelled — Duebox stays open until ${long(plan.expiresAt)}. Renew anytime to keep your reminders.`
          : plan.renewsAt
            ? `Renews ${long(plan.renewsAt)}. Thank you.`
            : 'Everything unlocked for everyone in your household.';

  return (
    <Screen header={<Header />} testID="screen-subscription">
      <HeroBanner
        art="subscription"
        eyebrow="Your plan"
        title={plan?.isTrial ? 'Duebox Pro · free trial' : period ? `Duebox Pro · ${period}` : 'Duebox Pro'}
        lead={lead}
        chips={[
          { icon: 'check', label: 'Unlimited deadlines' },
          { icon: 'scan', label: `${scanLimit} reads a month` },
          { icon: 'users', label: 'Household sharing' },
        ]}
      />

      {plan?.status === 'grace' ? <Banner icon="alert" message="Payment problem — your reminders keep coming while the store retries, but only for a few days." /> : null}

      <Card style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row' }}>
          <T variant="headline" style={{ flex: 1 }}>
            Letters read this month
          </T>
          <T tone="muted">
            {scans} of {scanLimit}
          </T>
        </View>
        <ProgressBar value={scans / Math.max(1, scanLimit)} color={scans >= scanLimit ? c.critical : c.brandInk} />
      </Card>

      {isOwner ? (
        <Button label={plan?.status === 'grace' ? 'Update payment method' : 'Manage in the store'} tone={plan?.status === 'grace' ? 'primary' : 'secondary'} onPress={manage} testID="subscription-manage" />
      ) : (
        <Banner icon="users" message="The person who set up this household manages the subscription. One plan covers everyone." />
      )}
      <Button label="Restore purchases" tone="quiet" onPress={() => router.push('/paywall')} />
      <T variant="caption" tone="faint" align="center">
        If your subscription ends, Duebox locks and reminders stop — nothing is deleted, and you can export or delete your data anytime from Account.
      </T>
    </Screen>
  );
}
