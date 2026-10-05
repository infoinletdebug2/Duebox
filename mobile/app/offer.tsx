import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Reanimated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useAuth } from '../src/auth/context';
import { messageOf } from '../src/api/client';
import { disconnect, isAvailable, loadPlans, purchase, PurchaseCancelled, restore, type StorePlan } from '../src/billing/store';
import { api } from '../src/api/client';
import { offerViewed } from '../src/lib/analytics';
import { OFFER_PERCENT, TRIAL_DAYS } from '../src/config';
import { font, GUTTER, radius, space } from '../src/theme/tokens';
import { T } from '../src/ui/Text';
import { tap } from '../src/ui/Button';
import { Icon, type IconName } from '../src/ui/Icon';
import { Sheet, useToast } from '../src/ui/Sheet';

/**
 * WELCOME OFFER — opens by itself right after setup, once, owner only (the live
 * apps' one-time offer). ONE screen, nothing to scroll: the 7-day Pro trial
 * that setup just started, three one-line benefits, both plans side by side
 * with the store's prices, Claim. Skippable; leaving asks once ("keep my
 * 20%?") only when there is a discount to lose.
 *
 * Honesty rules (store-readiness.md): prices are the store's own strings; the
 * "% off" wording appears only when the store returns the discounted products
 * AND the regular ones to compare; otherwise this is a plain "keep Pro after
 * your trial" screen. Nothing is granted here — only /billing/verify's answer.
 * Restore, Terms, Privacy and the renewal terms are always on screen.
 */

const INK = '#1E1229';
const LILAC = '#C9B6F2';
const GOLD = '#F2B33D';
const PEACH = '#F2A08A';
const ART = require('../assets/discover/gift.jpg');

type Store = { kind: 'loading' } | { kind: 'unavailable' } | { kind: 'ready'; offer: StorePlan[]; regular: StorePlan[] } | { kind: 'error'; message: string };

function money(amount: number, currency: string): string | null {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return null;
  }
}

export default function Offer() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { me, setPlan, setMeData } = useAuth();
  const [store, setStore] = useState<Store>({ kind: 'loading' });
  const [period, setPeriod] = useState<'yearly' | 'monthly'>('yearly');
  const [buying, setBuying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const load = useCallback(async () => {
    setStore({ kind: 'loading' });
    try {
      if (!(await isAvailable())) return setStore({ kind: 'unavailable' });
      const [offer, regular] = await Promise.all([loadPlans('offer'), loadPlans('regular')]);
      setStore({ kind: 'ready', offer, regular });
    } catch (failure) {
      setStore({ kind: 'error', message: messageOf(failure) });
    }
  }, []);

  useEffect(() => {
    offerViewed(OFFER_PERCENT > 0);
    // Seen the moment it opens — leaving, skipping or buying all count — and
    // recorded on the server, so a reinstall or a second phone never shows it again.
    void api.patch<NonNullable<typeof me>>('/auth/me', { offerSeen: true }).then(setMeData).catch(() => undefined);
    if (me?.plan.source === 'store') router.replace('/(tabs)/home');
    void load();
    return () => {
      void disconnect();
    };
  }, []);

  const goHome = () => router.replace('/(tabs)/home');

  const offer = store.kind === 'ready' ? store.offer : [];
  const regular = store.kind === 'ready' ? store.regular : [];
  const hasDiscount = OFFER_PERCENT > 0 && offer.length > 0 && regular.length > 0;
  const plans = hasDiscount ? offer : regular;
  const plan = plans.find((p) => p.period === period) ?? plans[0];
  const accent = GOLD;
  const canBuy = store.kind === 'ready' && Boolean(plan);

  const leave = () => {
    if (hasDiscount) setConfirmLeave(true);
    else goHome();
  };

  const buy = async () => {
    if (!plan) return goHome();
    setBuying(true);
    setError(null);
    try {
      const next = await purchase(plan.productId);
      setPlan(next);
      tap('success');
      toast({ message: hasDiscount ? `Welcome to Duebox Pro — ${OFFER_PERCENT}% off is yours.` : 'Welcome to Duebox Pro. Thank you.' });
      goHome();
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
      const next = await restore();
      if (!next) toast({ message: 'No Duebox subscription found on this store account.' });
      else {
        setPlan(next);
        toast({ message: next.source === 'store' ? 'Your subscription is restored.' : 'We found a past purchase, but it has ended.' });
        if (next.source === 'store') goHome();
      }
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setRestoring(false);
    }
  };

  const enter = (delay: number) => (reduce ? undefined : FadeInDown.delay(delay).duration(380));
  const cta = buying ? 'Opening the store…' : !canBuy ? 'Continue to Duebox' : hasDiscount ? `Claim ${OFFER_PERCENT}% off` : 'Subscribe';

  return (
    <View style={styles.screen} testID="screen-offer">
      <Reanimated.View entering={reduce ? undefined : FadeIn.duration(600)} style={styles.art} pointerEvents="none">
        <Image source={ART} style={styles.fill} contentFit="cover" contentPosition="top" accessibilityElementsHidden importantForAccessibility="no" />
        <Svg style={styles.fill} width="100%" height="100%">
          <Defs>
            <LinearGradient id="dx-offer-fade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={INK} stopOpacity={0.4} />
              <Stop offset="0.25" stopColor={INK} stopOpacity={0} />
              <Stop offset="0.68" stopColor={INK} stopOpacity={0.75} />
              <Stop offset="1" stopColor={INK} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#dx-offer-fade)" />
        </Svg>
      </Reanimated.View>

      <View style={[styles.topRow, { top: insets.top + space.sm }]}>
        {hasDiscount ? (
          <View style={[styles.badge, { backgroundColor: GOLD }]}>
            <Icon name="sparkles" size={14} color={INK} />
            <T variant="caption" style={{ color: INK, fontFamily: font.bold }}>
              Welcome gift · {OFFER_PERCENT}% off
            </T>
          </View>
        ) : (
          <View />
        )}
        <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="Close" style={styles.round} hitSlop={8} testID="offer-close">
          <Icon name="x" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Everything on one screen, anchored to the bottom over the art's fade. */}
      <View style={[styles.body, { paddingBottom: insets.bottom + space.sm }]}>
        <Reanimated.View entering={enter(0)} style={{ gap: 6 }}>
          <T variant="display" style={[styles.white, styles.headline]} accessibilityRole="header">
            Your {TRIAL_DAYS} days of Pro have started
          </T>
          <T style={styles.lead}>
            {hasDiscount ? `Because you just joined: ${OFFER_PERCENT}% off Duebox Pro — only on this screen.` : 'Everything is unlocked. Keep it after your trial with Pro.'}
          </T>
        </Reanimated.View>

        <Reanimated.View entering={enter(80)} style={{ gap: 6 }}>
          <Perk icon="scan" tint={GOLD} text="Unlimited deadlines · 100 scans a month" />
          <Perk icon="bell" tint={LILAC} text="Reminders 30, 7 and 1 days ahead" />
          <Perk icon="users" tint={PEACH} text="Share with your household · cancel anytime" />
        </Reanimated.View>

        <Reanimated.View entering={enter(140)} style={styles.plans} accessibilityRole="radiogroup">
          {store.kind === 'ready' && plans.length > 0 ? (
            [...plans]
              .sort((a) => (a.period === 'yearly' ? -1 : 1))
              .map((p) => {
                const on = p.period === (plan?.period ?? 'yearly');
                const before = regular.find((r) => r.period === p.period);
                const perMonth = p.period === 'yearly' && p.amount && p.currency ? money(p.amount / 12, p.currency) : null;
                return (
                  <Pressable
                    key={p.productId}
                    onPress={() => { tap(); setPeriod(p.period); }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${p.period === 'yearly' ? 'Yearly' : 'Monthly'}, ${p.price}`}
                    style={[styles.plan, on && { borderColor: accent, backgroundColor: 'rgba(255,255,255,0.10)' }]}
                    testID={`offer-plan-${p.period}`}
                  >
                    {p.period === 'yearly' ? (
                      <View style={[styles.best, { backgroundColor: accent }]}>
                        <T variant="caption" style={{ color: INK, fontFamily: font.bold, fontSize: 11, lineHeight: 14 }}>
                          Best value
                        </T>
                      </View>
                    ) : null}
                    <T variant="callout" style={styles.muted}>
                      {p.period === 'yearly' ? 'Yearly' : 'Monthly'}
                    </T>
                    {hasDiscount && before ? (
                      <T variant="caption" style={[styles.muted, { textDecorationLine: 'line-through' }]}>
                        {before.price}
                      </T>
                    ) : null}
                    <T variant="title" style={[styles.white, { fontFamily: font.display }]}>
                      {p.price}
                    </T>
                    <T variant="caption" style={styles.muted}>
                      {perMonth ? `${perMonth}/mo` : p.period === 'yearly' ? 'per year' : 'per month'}
                    </T>
                  </Pressable>
                );
              })
          ) : (
            <View style={styles.note}>
              <Icon name="info" size={16} color="#FFFFFF" />
              <T variant="caption" style={[styles.white, { flex: 1 }]}>
                {store.kind === 'loading'
                  ? 'Asking the store for prices…'
                  : store.kind === 'unavailable'
                    ? 'Subscriptions are available in the App Store and Google Play versions of Duebox. Your Pro trial is already running.'
                    : store.kind === 'error'
                      ? store.message
                      : 'The store didn’t return plans just now. Your Pro trial is already running — subscribe later in Settings → Subscription.'}
              </T>
            </View>
          )}
        </Reanimated.View>

        {error ? (
          <T variant="caption" style={{ color: '#FFB4AC' }} accessibilityRole="alert">
            {error}
          </T>
        ) : null}

        <Pressable
          onPress={() => (canBuy ? void buy() : goHome())}
          disabled={buying}
          accessibilityRole="button"
          accessibilityLabel={cta}
          style={({ pressed }) => [styles.cta, { backgroundColor: accent }, pressed && { opacity: 0.9 }, buying && { opacity: 0.6 }]}
          testID="offer-cta"
        >
          <T variant="headline" style={{ color: INK }}>
            {cta}
          </T>
          <View style={styles.ctaArrow}>
            <Icon name={canBuy ? 'check' : 'arrow-right'} size={18} color="#FFFFFF" />
          </View>
        </Pressable>
        <Pressable onPress={leave} accessibilityRole="button" style={styles.skip} testID="offer-skip">
          <T variant="callout" style={styles.muted}>
            No thanks, continue with my free trial
          </T>
        </Pressable>

        <View style={styles.links}>
          <T variant="caption" style={styles.link} onPress={() => void doRestore()} accessibilityRole="button" testID="offer-restore">
            {restoring ? 'Restoring…' : 'Restore purchases'}
          </T>
          <T variant="caption" style={styles.link} onPress={() => router.push('/legal/terms')} accessibilityRole="link">
            Terms
          </T>
          <T variant="caption" style={styles.link} onPress={() => router.push('/legal/privacy')} accessibilityRole="link">
            Privacy
          </T>
        </View>
        <T variant="caption" align="center" style={styles.fine}>
          Auto-renewing subscription, charged to your {Platform.OS === 'android' ? 'Google Play' : 'Apple ID'} account when you confirm. Renews at the same price each period unless cancelled at least 24 hours before it ends — manage in your {Platform.OS === 'android' ? 'Google Play' : 'App Store'} settings.
        </T>
      </View>

      <Sheet visible={confirmLeave} onClose={() => setConfirmLeave(false)} title="This is a one-time offer">
        <T tone="muted" style={{ marginBottom: space.lg }}>
          Your {OFFER_PERCENT}% welcome discount disappears when you leave — and it won’t come back. Your free trial keeps running either way.
        </T>
        <View style={{ gap: space.sm }}>
          <Pressable onPress={() => setConfirmLeave(false)} accessibilityRole="button" style={[styles.cta, { backgroundColor: GOLD }]} testID="offer-keep">
            <T variant="headline" style={{ color: INK }}>
              Keep my {OFFER_PERCENT}% off
            </T>
            <View style={styles.ctaArrow}>
              <Icon name="arrow-right" size={18} color="#FFFFFF" />
            </View>
          </Pressable>
          <Pressable onPress={() => { setConfirmLeave(false); goHome(); }} accessibilityRole="button" style={styles.skip} testID="offer-leave">
            <T variant="callout" tone="muted">
              Skip the offer
            </T>
          </Pressable>
        </View>
      </Sheet>
    </View>
  );
}

function Perk({ icon, tint, text }: { icon: IconName; tint: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <View style={[styles.perkIcon, { backgroundColor: tint }]}>
        <Icon name={icon} size={14} color={INK} />
      </View>
      <T variant="callout" style={[styles.white, { flex: 1 }]} numberOfLines={1}>
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: INK },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  art: { position: 'absolute', top: 0, left: 0, right: 0, height: 420 },
  white: { color: '#FFFFFF' },
  muted: { color: 'rgba(255,255,255,0.66)' },
  lead: { color: 'rgba(255,255,255,0.8)', fontSize: 16, lineHeight: 22 },
  fine: { color: 'rgba(255,255,255,0.45)', fontSize: 10.5, lineHeight: 14 },
  headline: { fontSize: 28, lineHeight: 33 },
  topRow: { position: 'absolute', left: GUTTER, right: GUTTER, zIndex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.chip },
  body: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: GUTTER, gap: space.md },
  perkIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  plans: { flexDirection: 'row', gap: space.sm },
  plan: {
    flex: 1,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    gap: 1,
  },
  best: { position: 'absolute', top: -10, right: 10, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.chip },
  note: { flex: 1, flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.10)' },
  cta: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: space.xl,
    paddingRight: 7,
    borderRadius: radius.chip,
  },
  ctaArrow: { width: 42, height: 42, borderRadius: 21, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  skip: { alignItems: 'center', justifyContent: 'center', minHeight: 36 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: space.xl },
  link: { color: 'rgba(255,255,255,0.8)', textDecorationLine: 'underline' },
});
