import { useCallback, useEffect, useState } from 'react';
import { paywallViewed } from '../src/lib/analytics';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../src/auth/context';
import { messageOf } from '../src/api/client';
import { invalidateItems } from '../src/api/hooks';
import { disconnect, isAvailable, loadPlans, purchase, PurchaseCancelled, restore, type StorePlan } from '../src/billing/store';
import { LIST_PRICE, PRODUCT_IDS, TRIAL_DAYS, YEARLY_SAVING_PERCENT } from '../src/config';
import { font, GUTTER, makeStyles, radius, space, useColors } from '../src/theme/tokens';
import { T } from '../src/ui/Text';
import { Button, IconButton, Press, tap } from '../src/ui/Button';
import { Icon, type IconName } from '../src/ui/Icon';
import { Banner, Skeleton } from '../src/ui/Feedback';
import { useToast } from '../src/ui/Sheet';
import { RemindArt } from '../src/ui/artwork';

/**
 * PAYWALL (SCREENS #11, FR-B4, FR-B5, store-readiness.md) — a HARD paywall,
 * the same rules as the live Meld apps:
 *
 *   - It is the only way past setup, and where a lapsed household lands. No
 *     close button, no swipe away (the root layout keeps everything but
 *     legal, settings and setup behind it). The ways out are subscribe,
 *     restore, sign out, and Settings — where export and account deletion
 *     live (App Review 5.1.1(v)).
 *   - Yearly is preselected and carries the stores' free intro offer
 *     (3 days, card upfront). "Free" is said ONLY when the store returns that
 *     offer for this store account AND the server says this account has never
 *     bought — otherwise the button says Subscribe. The billed price is the
 *     most prominent price on screen (Apple 3.1.2).
 *   - Prices and trial length are the store's own, never ours. Restore,
 *     Terms, Privacy and the auto-renew + trial disclosure are always on
 *     screen. Nothing here grants anything: `/billing/verify` answers.
 */

type StoreState = { kind: 'loading' } | { kind: 'unavailable' } | { kind: 'ready'; plans: StorePlan[] } | { kind: 'error'; message: string };

const BENEFITS: { icon: IconName; title: string; note: string }[] = [
  { icon: 'scan', title: 'Snap a letter, get the date', note: 'Duebox reads it and shows you where the date came from' },
  { icon: 'alarm', title: 'Reminded before — not on the day', note: '30, 7 and 1 days ahead, or your own timing' },
  { icon: 'inbox', title: 'Every deadline in one place', note: 'Renewals, bills, forms, free trials — unlimited' },
  { icon: 'users', title: 'Your whole household', note: 'Up to 5 people, one subscription' },
];

const storeName = Platform.OS === 'android' ? 'Google Play' : 'App Store';
const accountName = Platform.OS === 'android' ? 'Google Play' : 'Apple ID';

function longDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
}

export default function Paywall() {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const c = useColors();
  const s = useStyles();
  const { isOwner, setPlan, plan, me, signOut, refresh } = useAuth();
  const entitled = plan?.entitled === true;
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
    // Re-read the plan on arrival: a renewal or a store-side purchase may
    // already have happened, and then this screen should stand aside.
    void refresh();
    if (!entitled) paywallViewed(plan?.status === 'none' || !plan ? 'onboarding' : `lapsed_${plan.status}`);
    void load();
    return () => {
      void disconnect();
    };
    // Once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enter = () => router.replace('/(tabs)/home');

  const buy = async () => {
    const chosen = store.kind === 'ready' ? store.plans.find((p) => p.productId === selected) : undefined;
    if (!chosen) return;
    setBuying(true);
    setError(null);
    try {
      const next = await purchase(chosen.productId, { accountId: me?.user.id ?? null, offerToken: chosen.offerToken });
      setPlan(next);
      invalidateItems(qc);
      if (next.entitled) {
        tap('success');
        toast({ message: next.isTrial ? 'Your free trial has started. Welcome to Duebox.' : 'Welcome to Duebox. Thank you.' });
        enter();
      } else {
        setError('The store hasn’t confirmed this purchase yet. If you were charged, tap Restore purchases.');
      }
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
        toast({ message: `Restoring needs the ${storeName} version of Duebox.` });
        return;
      }
      const next = await restore();
      if (!next) {
        toast({ message: `No Duebox subscription found on this ${accountName}.` });
        return;
      }
      setPlan(next);
      invalidateItems(qc);
      if (next.entitled) {
        toast({ message: 'Your subscription is restored.' });
        enter();
      } else {
        toast({ message: 'We found a past subscription, but it has ended.' });
      }
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setRestoring(false);
    }
  };

  const manage = () => {
    const url = Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions';
    void Linking.openURL(url).catch(() => toast({ message: `Open Subscriptions in your ${storeName} account to manage Duebox.` }));
  };

  const selectedPlan = store.kind === 'ready' ? store.plans.find((p) => p.productId === selected) : undefined;
  // "Free" needs both: the store offers it to this store account, and this
  // Duebox account has never bought (the server's answer).
  const trialFor = (p: StorePlan | undefined) => (p?.trial && plan?.trialEligible !== false ? p.trial : null);
  const trial = trialFor(selectedPlan);
  const showPlans = !entitled && isOwner && store.kind === 'ready' && store.plans.length > 0;

  const head = entitled
    ? { title: 'You’re on Duebox Pro', lead: plan?.isTrial ? `Your free trial runs until ${longDate(plan.trialEndsAt)}.` : 'Everything is unlocked for everyone in your household.' }
    : !isOwner
      ? { title: 'This household isn’t subscribed', lead: 'Your deadlines are safe. Ask the person who set up Duebox to subscribe — one plan covers everyone.' }
      : plan?.status === 'billing_retry'
        ? { title: 'There’s a problem with your payment', lead: `Update your payment method in your ${storeName} account and Duebox opens again — your deadlines are all still here.` }
        : plan?.status === 'expired'
          ? { title: 'Your subscription has ended', lead: 'Renew to get your reminders back. Every deadline you saved is still here, waiting.' }
          : { title: 'Never miss a deadline again', lead: 'One avoided late fee pays for a year of Duebox.' };

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
            {/* Not a close button: the way to sign-out, export and account deletion. */}
            <IconButton icon="settings" label="Account settings" tone="brand" onPress={() => router.push('/settings/account')} />
          </View>
          <View style={{ alignItems: 'center' }}>
            <RemindArt size={170} />
          </View>
          <T variant="display" style={{ color: c.onBrand }} accessibilityRole="header">
            {head.title}
          </T>
          <T style={{ color: c.onBrandMuted, fontSize: 17, lineHeight: 24 }}>{head.lead}</T>
        </View>

        <View style={s.body}>
          {!entitled ? (
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

          {entitled ? (
            <View style={{ gap: space.sm }}>
              {plan?.renewsAt ? (
                <T tone="muted" align="center">
                  Renews {longDate(plan.renewsAt)}
                </T>
              ) : null}
              <Button label="Open Duebox" onPress={enter} testID="paywall-enter" />
              <Button label="Manage subscription" tone="secondary" onPress={manage} testID="paywall-manage" />
            </View>
          ) : !isOwner ? (
            <Banner icon="users" message="Only the person who set up this household can subscribe. One plan covers everyone in it." />
          ) : plan?.status === 'billing_retry' ? (
            <Button label="Update payment method" onPress={manage} testID="paywall-manage" />
          ) : store.kind === 'loading' ? (
            <View style={{ gap: space.sm }}>
              <Skeleton height={84} style={{ borderRadius: radius.group }} />
              <Skeleton height={76} style={{ borderRadius: radius.group }} />
            </View>
          ) : store.kind === 'unavailable' ? (
            // No store here (Expo Go, web): show the planned plans greyed out so the layout can be seen. A real
            // build never reaches this branch, and there the prices always come from the store, as billed.
            <View style={{ gap: space.sm }} testID="paywall-preview">
              <Banner icon="info" message="Preview only. Subscriptions work in the App Store and Google Play versions of Duebox — not in Expo Go or on the web." />
              <View style={{ gap: space.sm, opacity: 0.55 }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {PREVIEW_PLANS.map((p) => (
                  <PlanOption key={p.productId} plan={p} trialDays={p.trial?.days ?? null} selected={p.period === 'yearly'} onPress={() => undefined} />
                ))}
              </View>
            </View>
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
              {store.plans.map((p) => (
                <PlanOption key={p.productId} plan={p} trialDays={trialFor(p)?.days ?? null} selected={p.productId === selected} onPress={() => setSelected(p.productId)} />
              ))}
            </View>
          )}

          <View style={s.links}>
            <Button label="Restore purchases" tone="quiet" small full={false} loading={restoring} disabled={buying} onPress={() => void doRestore()} testID="paywall-restore" />
            <Button label="Terms" tone="quiet" small full={false} onPress={() => router.push('/legal/terms')} />
            <Button label="Privacy" tone="quiet" small full={false} onPress={() => router.push('/legal/privacy')} />
            <Button label="Sign out" tone="quiet" small full={false} onPress={() => void signOut()} testID="paywall-sign-out" />
          </View>
          <T variant="caption" tone="faint" align="center">
            Duebox Pro is an auto-renewing subscription: {selectedPlan?.price ?? 'the price shown'} per {selectedPlan?.period === 'monthly' ? 'month' : 'year'}.
            {trial
              ? ` Your ${trial.days}-day free trial starts today. When it ends, payment is charged to your ${accountName} account unless you cancel at least 24 hours before the trial ends.`
              : ` Payment is charged to your ${accountName} account when you confirm.`}{' '}
            It renews automatically at the same price each period unless you cancel at least 24 hours before the period ends. Manage or cancel anytime in your {storeName} account
            settings — deleting the app doesn’t cancel it.
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
            label={trial ? `Start ${trial.days}-day free trial` : 'Subscribe'}
            onPress={() => void buy()}
            loading={buying}
            disabled={!selected || restoring}
            testID="paywall-continue"
          />
          <T variant="caption" tone="muted" align="center">
            {trial
              ? `${trial.days} days free, then ${selectedPlan?.price ?? ''} a year. Cancel anytime.`
              : `${selectedPlan?.price ?? ''} a ${selectedPlan?.period === 'monthly' ? 'month' : 'year'}. Cancel anytime.`}
          </T>
        </View>
      ) : null}
    </View>
  );
}

/** The planned list prices (config), for the no-store preview only — never shown where a store can answer. */
const PREVIEW_PLANS: StorePlan[] = [
  { productId: PRODUCT_IDS.yearly, period: 'yearly', price: `$${LIST_PRICE.yearly.toFixed(2)}`, title: 'Yearly', amount: LIST_PRICE.yearly, currency: 'USD', trial: TRIAL_DAYS > 0 ? { days: TRIAL_DAYS } : null, offerToken: null },
  { productId: PRODUCT_IDS.monthly, period: 'monthly', price: `$${LIST_PRICE.monthly.toFixed(2)}`, title: 'Monthly', amount: LIST_PRICE.monthly, currency: 'USD', trial: null, offerToken: null },
];

function PlanOption({ plan, trialDays, selected, onPress }: { plan: StorePlan; trialDays: number | null; selected: boolean; onPress: () => void }) {
  const c = useColors();
  const s = useStyles();
  const yearly = plan.period === 'yearly';
  const badge = yearly ? (trialDays ? `${trialDays} days free` : YEARLY_SAVING_PERCENT > 0 ? `Save ${YEARLY_SAVING_PERCENT}%` : null) : null;
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
          {yearly ? (trialDays ? `${trialDays} days free, then ${plan.price}/year` : 'Billed once a year') : 'Billed every month'}
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
