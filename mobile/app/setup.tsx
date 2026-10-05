import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { FadeInDown, FadeInRight, useReducedMotion } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useAuth } from '../src/auth/context';
import { api, messageOf } from '../src/api/client';
import { setupCompleted, trialStarted } from '../src/lib/analytics';
import { CATEGORY, hourLabel } from '../src/lib/format';
import { TRIAL_DAYS } from '../src/config';
import { font, GUTTER, radius, space } from '../src/theme/tokens';
import { T } from '../src/ui/Text';
import { tap } from '../src/ui/Button';
import { Icon } from '../src/ui/Icon';
import type { Category, Me } from '../src/types';

/**
 * SETUP — right after sign-up, owner only. Two questions that change the
 * product, answered by tapping (design.md: ask only what changes the
 * experience; never ask for something the account already has):
 *
 *   1. what usually slips through → the empty Home suggests those first;
 *   2. when reminders should arrive → the household's reminder hour.
 *
 * Finishing calls POST /setup, which also starts the 7-day Pro trial, then
 * the one-time welcome offer opens. Both questions can be skipped; Continue
 * works with nothing picked. Artwork: assets/discover/setup.jpg.
 */

const INK = '#1E1229';
const MARIGOLD = '#F2B33D';
const LILAC = '#C9B6F2';
const ART = require('../assets/discover/setup.jpg');

/** Tile labels, shortened where the full one would break mid-word in a third of the width. */
const SHORT: Partial<Record<Category, string>> = { subscriptions: 'Trials & subs' };

const PICKS: Category[] = ['insurance', 'vehicle', 'bills', 'id_travel', 'subscriptions', 'kids_school', 'home', 'health', 'work'];

const HOURS = [
  { hour: 8, label: 'Early', note: 'Before the day starts', icon: 'alarm' as const },
  { hour: 9, label: 'Morning', note: 'With your coffee', icon: 'clock' as const },
  { hour: 12, label: 'Lunchtime', note: 'A quiet moment', icon: 'calendar' as const },
  { hour: 18, label: 'Evening', note: 'After work', icon: 'bell' as const },
];

export default function Setup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { me, setMeData } = useAuth();
  const [step, setStep] = useState<0 | 1>(0);
  const [picked, setPicked] = useState<Category[]>([]);
  const [hour, setHour] = useState(me?.household.remindHour ?? 9);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await api.post<Me & { trialStarted: boolean }>('/setup', { focus: picked, remindHour: hour });
      setupCompleted(picked.length, hour);
      if (next.trialStarted) trialStarted(next.plan.trialDays, next.user.id);
      tap('success');
      setMeData(next);
      router.replace(next.offerSeen ? '/(tabs)/home' : '/offer');
    } catch (failure) {
      setError(messageOf(failure));
      setSaving(false);
    }
  };

  const next = () => {
    tap();
    if (step === 0) setStep(1);
    else void finish();
  };

  const enter = (delay: number) => (reduce ? undefined : FadeInDown.delay(delay).duration(380));

  return (
    <View style={styles.screen} testID="screen-setup">
      <View style={styles.art} pointerEvents="none">
        <Image source={ART} style={styles.fill} contentFit="cover" contentPosition="top" accessibilityElementsHidden importantForAccessibility="no" />
        <Svg style={styles.fill} width="100%" height="100%">
          <Defs>
            <LinearGradient id="dx-setup-fade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={INK} stopOpacity={0.35} />
              <Stop offset="0.3" stopColor={INK} stopOpacity={0} />
              <Stop offset="0.8" stopColor={INK} stopOpacity={0.9} />
              <Stop offset="1" stopColor={INK} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#dx-setup-fade)" />
        </Svg>
      </View>

      <View style={[styles.top, { top: insets.top + space.sm }]}>
        {step === 1 ? (
          <Pressable onPress={() => setStep(0)} accessibilityRole="button" accessibilityLabel="Back" style={styles.round} hitSlop={8} testID="setup-back">
            <Icon name="chevron-left" size={22} color="#FFFFFF" />
          </Pressable>
        ) : (
          <View style={styles.pill}>
            <Icon name="sparkles" size={14} color={INK} />
            <T variant="caption" style={{ color: INK, fontFamily: font.bold }}>
              Two taps, then {TRIAL_DAYS} days of Pro
            </T>
          </View>
        )}
        <View style={styles.steps} accessibilityLabel={`Question ${step + 1} of 2`}>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.step, { width: i === step ? 22 : 8, backgroundColor: i <= step ? MARIGOLD : 'rgba(255,255,255,0.3)' }]} />
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 236, paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <Reanimated.View key={step} entering={reduce ? undefined : FadeInRight.duration(260)} style={{ gap: space.md }}>
          <Reanimated.View entering={enter(0)} style={{ gap: 6 }}>
            <T variant="caption" style={styles.eyebrow}>
              {step === 0 ? 'Question 1 of 2' : 'Question 2 of 2'}
            </T>
            <T variant="display" style={styles.white} accessibilityRole="header">
              {step === 0 ? 'What usually slips through?' : 'When should reminders arrive?'}
            </T>
            <T style={styles.lead}>
              {step === 0
                ? 'Pick any. Your empty home will suggest these first — you can track anything later.'
                : 'One quiet nudge at this time on reminder days. Change it any time in Settings.'}
            </T>
          </Reanimated.View>

          {step === 0 ? (
            <View style={styles.grid}>
              {PICKS.map((cat, i) => {
                const on = picked.includes(cat);
                return (
                  <Reanimated.View key={cat} entering={enter(60 + i * 30)} style={styles.tileWrap}>
                    <Pressable
                      testID={`setup-pick-${cat}`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={CATEGORY[cat].label}
                      onPress={() => {
                        tap();
                        setPicked((list) => (on ? list.filter((x) => x !== cat) : [...list, cat]));
                      }}
                      style={({ pressed }) => [styles.tile, on && styles.tileOn, pressed && { opacity: 0.85 }]}
                    >
                      <View style={[styles.tileIcon, on && { backgroundColor: INK }]}>
                        <Icon name={CATEGORY[cat].icon} size={20} color={on ? MARIGOLD : '#FFFFFF'} />
                      </View>
                      <T variant="caption" numberOfLines={2} style={{ color: on ? INK : '#FFFFFF', fontFamily: font.semibold }}>
                        {SHORT[cat] ?? CATEGORY[cat].label}
                      </T>
                      {on ? (
                        <View style={styles.tick}>
                          <Icon name="check" size={12} color={MARIGOLD} strokeWidth={3} />
                        </View>
                      ) : null}
                    </Pressable>
                  </Reanimated.View>
                );
              })}
            </View>
          ) : (
            <View style={{ gap: space.sm }}>
              {HOURS.map((h, i) => {
                const on = h.hour === hour;
                return (
                  <Reanimated.View key={h.hour} entering={enter(60 + i * 40)}>
                    <Pressable
                      testID={`setup-hour-${h.hour}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${h.label}, ${hourLabel(h.hour)}`}
                      onPress={() => {
                        tap();
                        setHour(h.hour);
                      }}
                      style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && { opacity: 0.85 }]}
                    >
                      <View style={[styles.optionIcon, on && { backgroundColor: INK }]}>
                        <Icon name={h.icon} size={18} color={on ? MARIGOLD : LILAC} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <T variant="headline" style={{ color: on ? INK : '#FFFFFF' }}>
                          {h.label}
                        </T>
                        <T variant="caption" style={{ color: on ? 'rgba(30,18,41,0.7)' : 'rgba(255,255,255,0.62)' }}>
                          {h.note}
                        </T>
                      </View>
                      <T variant="title" style={{ color: on ? INK : '#FFFFFF', fontFamily: font.display }}>
                        {hourLabel(h.hour)}
                      </T>
                    </Pressable>
                  </Reanimated.View>
                );
              })}
            </View>
          )}
        </Reanimated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        {error ? (
          <T variant="caption" style={{ color: '#FFB4AC' }} accessibilityRole="alert">
            {error}
          </T>
        ) : null}
        <Pressable
          onPress={next}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={step === 0 ? 'Continue' : `Start my ${TRIAL_DAYS} days of Pro`}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }, saving && { opacity: 0.6 }]}
          testID="setup-next"
        >
          <T variant="headline" style={{ color: INK }}>
            {saving ? 'Setting up…' : step === 0 ? (picked.length > 0 ? `Continue · ${picked.length} picked` : 'Continue') : `Start my ${TRIAL_DAYS} days of Pro`}
          </T>
          <View style={styles.ctaArrow}>
            <Icon name="arrow-right" size={18} color="#FFFFFF" />
          </View>
        </Pressable>
        {step === 0 && picked.length === 0 ? (
          <T variant="caption" align="center" style={styles.hint}>
            Not sure? Continue works without a pick.
          </T>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: INK },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  art: { position: 'absolute', top: 0, left: 0, right: 0, height: 380 },
  top: { position: 'absolute', left: GUTTER, right: GUTTER, zIndex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.chip, backgroundColor: MARIGOLD },
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
  steps: { flexDirection: 'row', gap: 6 },
  step: { height: 8, borderRadius: 4 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: GUTTER },
  white: { color: '#FFFFFF' },
  eyebrow: { color: MARIGOLD, fontFamily: font.bold },
  lead: { color: 'rgba(255,255,255,0.78)', fontSize: 16, lineHeight: 23 },
  hint: { color: 'rgba(255,255,255,0.55)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginTop: space.xs },
  tileWrap: { width: '33.333%', padding: 4 },
  tile: {
    minHeight: 96,
    borderRadius: 18,
    padding: space.md,
    gap: space.sm,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  tileOn: { backgroundColor: MARIGOLD, borderColor: MARIGOLD },
  tileIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  tick: { position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 68,
    borderRadius: 18,
    paddingHorizontal: space.lg,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  optionOn: { backgroundColor: MARIGOLD, borderColor: MARIGOLD },
  optionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, paddingTop: space.md, gap: space.sm, backgroundColor: INK },
  cta: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: space.xl,
    paddingRight: 7,
    borderRadius: radius.chip,
    backgroundColor: MARIGOLD,
  },
  ctaArrow: { width: 42, height: 42, borderRadius: 21, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
});
