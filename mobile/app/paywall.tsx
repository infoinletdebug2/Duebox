import { useCallback, useEffect, useState } from 'react';
import { paywallViewed } from '../src/lib/analytics';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../src/auth/context';
import { messageOf } from '../src/api/client';
import { invalidateItems } from '../src/api/hooks';
import { disconnect, isAvailable, loadPlans, purchase, PurchaseCancelled, restore, type StorePlan } from '../src/billing/store';
import { FREE_OPEN_ITEMS, FREE_SCANS, TRIAL_DAYS, YEARLY_SAVING_PERCENT } from '../src/config';
import { font, GUTTER, makeStyles, radius, space, useColors } from '../src/theme/tokens';
import { T } from '../src/ui/Text';
import { Button, IconButton, Press, tap } from '../src/ui/Button';
import { Icon, type IconName } from '../src/ui/Icon';
import { Banner, Skeleton } from '../src/ui/Feedback';
import { useToast } from '../src/ui/Sheet';
import { RemindArt } from '../src/ui/artwork';
import type { GateReason } from '../src/types';

/**
 * PAYWALL (SCREENS #11, FR-B4, FR-B5, store-readiness.md).
 *
 * Opens only at a real limit, and leads with the OUTCOME that limit blocked
 * (design.md §27). Prices are the store's own strings, never ours. Restore,
 * Terms, Privacy and the auto-renew + trial disclosure are always on screen.
 * Nothing here grants anything: `/billing/verify` answers, and only that
 * answer goes into auth.
 */

type StoreState = { kind: 'loading' } | { kind: 'unavailable' } | { kind: 'ready'; plans: StorePlan[] } | { kind: 'error'; message: string };

const HEADLINE: Record<GateReason | 'default', { title: string; lead: string }> = {
  item_limit: { title: 'Track everything with a deadline', lead: `You’ve used your ${FREE_OPEN_ITEMS} free deadlines. Pro keeps every renewal, bill and form in one place.` },
  scan_limit: { title: 'Let Duebox read every letter', lead: `You’ve used this month’s ${FREE_SCANS} free scans. Pro reads up to 100 a month for you.` },
  household: { title: 'Share it with your household', lead: 'Invite up to 4 people. Assign who handles what, and everyone gets their own reminders.' },
  custom_reminders: { title: 'Get reminded your way', lead: 'Choose 60, 30, 14, 7, 3 or 1 days ahead — per item.' },
  default: { title: 'Never miss a deadline again', lead: 'One avoided late fee pays for a year of Duebox Pro.' },
};

const BENEFITS: { icon: IconName; title: string; note: string }[] = [
  { icon: 'inbox', title: 'Unlimited deadlines', note: `Free keeps ${FREE_OPEN_ITEMS} open at a time` },
  { icon: 'scan', title: '100 scans a month', note: 'Snap it, we read the date' },
  { icon: 'alarm', title: 'Reminders your way', note: '30, 7 and 1 days ahead — or pick your own' },
  { icon: 'users', title: 'Your whole household', note: 'Up to 5 people, one subscription' },
];

export default function Paywall() {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const c = useColors();
  const s = useStyles();
  const params = useLocalSearchParams<{ reason?: string }>();
  const reason = (params.reason ?? 'default') as GateReason | 'default';
  const { isOwner, setPlan, plan } = useAuth();
  // Subscribed = a store subscription. A household on its free Pro trial still
  // sees the plans, so it can keep Pro when the trial ends.
  const isPro = plan?.source === 'store' && plan.tier === 'pro';
  const [store, setStore] = useState<StoreState>({ kind: 'loading' });
  const [selected, setSelected] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStore({ kind: 'loading' });
    try {
      if (!(await isAvailable())) {
        setStore({ kind: 'unavailable' });
        return;
      }
      const plans = await loadPlans();
      setStore({ kind: 'ready', plans });
      const yearly = plans.find((p) => p.period === 'yearly') ?? plans[0];
      setSelected((current) => current ?? yearly?.productId ?? null);
    } catch (failure) {
      setStore({ kind: 'error', message: messageOf(failure) });
    }
  }, []);

  useEffect(() => {
    if (!isPro) paywallViewed(reason);
    void load();
    return () => {
      void disconnect();
    };
  }, [load]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const buy = async () => {
    if (!selected) return;
    setBuying(true);
    setError(null);
    try {
      const next = await purchase(selected);
      setPlan(next);
      invalidateItems(qc);
      tap('success');
      toast({ message: 'Welcome to Duebox Pro. Thank you.' });
      close();
    } catch (failure) {
      if (!(failure instanceof PurchaseCancelled)) setError(messageOf(failure));
    } finally {
      setBuying(false);
    }
  };

  const doRestore = async () => {
    setRestoring(true);
    setError(null);
    try {
      if (store.kind === 'unavailable') {
        toast({ message: 'Restoring needs the App Store or Google Play version of Duebox.' });
        return;
      }
      const next = await restore();
      if (!next) {
        toast({ message: 'No Duebox subscription found on this store account.' });
        return;
      }
      setPlan(next);
      invalidateItems(qc);
      if (next.tier === 'pro') {
        toast({ message: 'Your subscription is restored.' });
        close();
      } else {
        toast({ message: 'We found a past purchase, but it has ended.' });
      }
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setRestoring(false);
    }
  };

  const manage = () => {
    const url = Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions';
    void Linking.openURL(url).catch(() => toast({ message: 'Open your store account’s Subscriptions page to manage Duebox.' }));
  };

  const head = isPro
    ? { title: 'You’re on Duebox Pro', lead: 'Thank you. Everything is unlocked for everyone in your household.' }
    : plan?.isTrial && reason === 'default'
      ? { title: 'Keep Pro after your trial', lead: 'Everything stays unlocked: unlimited deadlines, 100 scans a month, your household together.' }
      : HEADLINE[reason] ?? HEADLINE.default;
  const selectedPlan = store.kind === 'ready' ? store.plans.find((p) => p.productId === selected) : undefined;
  const isYearly = selectedPlan?.period === 'yearly';
  const showPlans = !isPro && isOwner && store.kind === 'ready' && store.plans.length > 0;

  return (
    <View style={s.root} testID="screen-paywall">
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
        <View style={[s.hero, { paddingTop: insets.top + space.sm }]}>
          <View style={s.heroTop}>
            <View style={s.proTag}>
              <Icon name="crown" size={14} color={c.accentInk} />
              <T variant="micro" style={{ color: c.accentInk }}>
                Duebox Pro
              </T>
            </View>
            <IconButton icon="x" label="Close" tone="brand" onPress={close} />
          </View>
          <View style={{ alignItems: 'center' }}>
            <RemindArt size={190} />
          </View>
          <T variant="display" style={{ color: c.onBrand }} accessibilityRole="header">
            {head.title}
          </T>
          <T style={{ color: c.onBrandMuted, fontSize: 17, lineHeight: 24 }}>{head.lead}</T>
        </View>

        <View style={s.body}>
          {!isPro ? (
            <View style={s.benefits}>
              {BENEFITS.map((b) => (
                <View key={b.title} style={s.benefit}>
                  <View style={s.benefitIcon}>
                    <Icon name={b.icon} size={20} color={c.brandInk} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T variant="headline">{b.title}</T>
                    <T variant="caption" tone="muted">
                      {b.note}
                    </T>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {isPro ? (
            <View style={{ gap: space.sm }}>
              {plan?.renewsAt ? (
                <T tone="muted" align="center">
                  Renews {new Date(plan.renewsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </T>
              ) : null}
              <Button label="Manage subscription" tone="secondary" onPress={manage} testID="paywall-manage" />
            </View>
          ) : !isOwner ? (
            <Banner icon="users" message="Only the household owner can subscribe. One plan covers everyone in your household." />
          ) : store.kind === 'loading' ? (
            <View style={{ gap: space.sm }}>
              <Skeleton height={84} style={{ borderRadius: radius.group }} />
              <Skeleton height={76} style={{ borderRadius: radius.group }} />
            </View>
          ) : store.kind === 'unavailable' ? (
            <Banner icon="info" message="Subscriptions are available in the App Store and Google Play versions of Duebox — not in Expo Go or on the web." />
          ) : store.kind === 'error' ? (
            <View style={{ gap: space.sm }}>
              <Banner icon="alert" message={store.message} />
              <Button label="Try again" tone="secondary" onPress={() => void load()} />
            </View>
          ) : store.plans.length === 0 ? (
            <View style={{ gap: space.sm }}>
              <Banner icon="alert" message="The store didn’t return any plans just now. Check your connection and try again." />
              <Button label="Try again" tone="secondary" onPress={() => void load()} />
            </View>
          ) : (
            <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
              {[...store.plans]
                .sort((a, b) => (a.period === 'yearly' ? -1 : b.period === 'yearly' ? 1 : 0))
                .map((p) => (
                  <PlanOption key={p.productId} plan={p} selected={p.productId === selected} onPress={() => setSelected(p.productId)} />
                ))}
            </View>
          )}

          <View style={s.links}>
            <Button label="Restore purchases" tone="quiet" small full={false} loading={restoring} disabled={buying} onPress={() => void doRestore()} testID="paywall-restore" />
            <Button label="Terms" tone="quiet" small full={false} onPress={() => router.push('/legal/terms')} />
            <Button label="Privacy" tone="quiet" small full={false} onPress={() => router.push('/legal/privacy')} />
          </View>
          <T variant="callout" tone="muted" align="center">
            Your deadlines stay yours — view, export and delete them anytime, subscribed or not.
          </T>
          <T variant="caption" tone="faint" align="center">
            Duebox Pro is an auto-renewing subscription. Payment is charged to your {Platform.OS === 'android' ? 'Google Play' : 'Apple ID'} account when you confirm. It renews
            automatically at the same price each period unless you cancel at least 24 hours before the period ends. Manage or cancel anytime in your{' '}
            {Platform.OS === 'android' ? 'Google Play' : 'App Store'} account settings — deleting the app doesn’t cancel it. If the yearly plan offers a {TRIAL_DAYS}-day free trial,
            you won’t be charged until it ends, and you can cancel before then at no cost.
          </T>
        </View>
      </ScrollView>

      {showPlans ? (
        <View style={[s.footer, { paddingBottom: insets.bottom + space.md }]}>
          {error ? (
            <T variant="caption" tone="critical" accessibilityRole="alert">
              {error}
            </T>
          ) : null}
          <Button
            label={isYearly ? `Start ${TRIAL_DAYS}-day free trial` : 'Subscribe'}
            onPress={() => void buy()}
            loading={buying}
            disabled={!selected || restoring}
            testID="paywall-continue"
          />
          <T variant="caption" tone="muted" align="center">
            {isYearly ? `Then ${selectedPlan?.price ?? ''} a year. Cancel anytime.` : `${selectedPlan?.price ?? ''} a month. Cancel anytime.`}
          </T>
        </View>
      ) : null}
    </View>
  );
}

function PlanOption({ plan, selected, onPress }: { plan: StorePlan; selected: boolean; onPress: () => void }) {
  const c = useColors();
  const s = useStyles();
  const yearly = plan.period === 'yearly';
  const badge = yearly && YEARLY_SAVING_PERCENT > 0 ? `Save ${YEARLY_SAVING_PERCENT}%` : null;
  return (
    <Press
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${yearly ? 'Yearly' : 'Monthly'}, ${plan.price} per ${yearly ? 'year' : 'month'}${badge ? `, ${badge}` : ''}`}
      testID={`plan-${plan.period}`}
      style={[s.plan, selected && { borderColor: c.brandInk, backgroundColor: c.brandSoft }]}
    >
      <View style={[s.radio, selected && { borderColor: c.brandInk }]}>{selected ? <View style={s.radioDot} /> : null}</View>
      <View style={{ flex: 1, gap: space.xxs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <T variant="headline">{yearly ? 'Yearly' : 'Monthly'}</T>
          {badge ? (
            <View style={s.badge}>
              <T variant="micro" style={{ color: c.onBrand }}>
                {badge}
              </T>
            </View>
          ) : null}
        </View>
        <T variant="caption" tone="muted">
          {yearly ? `${TRIAL_DAYS} days free, then billed yearly` : 'Billed every month'}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T variant="headline" style={{ fontFamily: font.bold }}>
          {plan.price}
        </T>
        <T variant="caption" tone="muted">
          {yearly ? 'per year' : 'per month'}
        </T>
      </View>
    </Press>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.ground },
  hero: {
    backgroundColor: c.brand,
    paddingHorizontal: GUTTER,
    paddingBottom: space.xxl,
    gap: space.md,
    borderBottomLeftRadius: radius.hero,
    borderBottomRightRadius: radius.hero,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  proTag: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.accent, borderRadius: radius.chip, paddingHorizontal: space.md, paddingVertical: 6 },
  body: { paddingHorizontal: GUTTER, paddingTop: space.xl, gap: space.xl },
  benefits: { gap: space.md },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  benefitIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 76,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.group,
    borderWidth: 1.5,
    borderColor: c.line,
    backgroundColor: c.surface,
  },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.textFaint, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.brandInk },
  badge: { backgroundColor: c.brand, borderRadius: radius.chip, paddingHorizontal: space.sm, paddingVertical: 2 },
  links: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' },
  footer: { paddingHorizontal: GUTTER, paddingTop: space.md, gap: space.sm, backgroundColor: c.ground, borderTopWidth: 1, borderTopColor: c.line },
}));
