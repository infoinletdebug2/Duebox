import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInRight, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GUTTER, makeStyles, radius, space, useColors } from '../src/theme/tokens';
import { T } from '../src/ui/Text';
import { Button, Press, tap } from '../src/ui/Button';
import { Icon } from '../src/ui/Icon';
import { Ambient } from '../src/ui/Ambient';
import { HouseholdArt, RemindArt, SnapArt } from '../src/ui/artwork';
import { Brand } from '../src/account/AuthShell';
import { CATEGORY, hourLabel } from '../src/lib/format';
import { saveDiscovery, skipDiscovery } from '../src/onboarding/discovery';
import type { Category } from '../src/types';

/**
 * DISCOVERY ONBOARDING (first launch, before sign-up).
 *
 * Three short value screens, then two questions that actually change the
 * product (design.md §4: "ask only questions that materially change the
 * experience"), then a one-line summary. Skippable from the first screen.
 * No paywall here — it comes only at a real limit (FR-B4).
 */

type Step = 0 | 1 | 2 | 3 | 4 | 5;

const SLIDES = [
  {
    art: 'snap',
    eyebrow: 'Snap',
    title: 'Snap the letter.\nWe’ll find the date.',
    body: 'Renewal notices, bills, school forms, free trials. Duebox reads the deadline and shows you exactly where it found it.',
  },
  {
    art: 'remind',
    eyebrow: 'Remind',
    title: 'Reminded before,\nnot on the day.',
    body: 'A nudge 30, 7 and 1 days ahead, at the time you choose. Mark it done from the notification.',
  },
  {
    art: 'household',
    eyebrow: 'Share',
    title: 'Run the house\ntogether.',
    body: 'Share deadlines with a partner, assign who handles what, and never both forget the same thing.',
  },
] as const;

/** The categories offered on the "what slips through" question — the common ones first. */
const PICKS: Category[] = ['insurance', 'vehicle', 'bills', 'id_travel', 'subscriptions', 'kids_school', 'home', 'health', 'work'];

const HOURS = [
  { hour: 8, label: 'Early', note: 'Before the day starts' },
  { hour: 9, label: 'Morning', note: 'With your coffee' },
  { hour: 12, label: 'Lunchtime', note: 'A quiet moment' },
  { hour: 18, label: 'Evening', note: 'After work' },
];

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const c = useColors();
  const s = useStyles();
  const [step, setStep] = useState<Step>(0);
  const [picked, setPicked] = useState<Category[]>([]);
  const [hour, setHour] = useState(9);

  const next = () => setStep((v) => Math.min(5, v + 1) as Step);
  const back = () => setStep((v) => Math.max(0, v - 1) as Step);

  const finish = async () => {
    await saveDiscovery({ categories: picked, remindHour: hour });
    router.replace('/(auth)/welcome');
  };

  const skip = async () => {
    await skipDiscovery();
    router.replace('/(auth)/welcome');
  };

  const enter = reduce ? undefined : FadeInRight.duration(240);

  return (
    <View style={[s.root, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg }]} testID="screen-onboarding">
      <Ambient />
      <View style={s.top}>
        {step > 0 ? (
          <Press onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={s.topBtn}>
            <Icon name="chevron-left" size={22} color={c.text} />
          </Press>
        ) : (
          <Brand />
        )}
        <Dots step={step} />
        {step < 3 ? (
          <Press onPress={() => void skip()} accessibilityRole="button" accessibilityLabel="Skip" style={s.topBtn} testID="onboarding-skip">
            <T variant="callout" tone="muted">
              Skip
            </T>
          </Press>
        ) : (
          <View style={s.topBtn} />
        )}
      </View>

      <Animated.View key={step} entering={enter} style={s.body}>
        {step < 3 ? <Slide index={step as 0 | 1 | 2} /> : null}

        {step === 3 ? (
          <View style={s.question}>
            <T variant="micro" tone="muted">
              Question 1 of 2
            </T>
            <T variant="display" accessibilityRole="header">
              What usually slips through?
            </T>
            <T tone="muted">Pick any. We’ll suggest these first — you can track anything later.</T>
            <View style={s.grid}>
              {PICKS.map((cat) => {
                const on = picked.includes(cat);
                return (
                  <Press
                    key={cat}
                    testID={`pick-${cat}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={CATEGORY[cat].label}
                    onPress={() => {
                      tap();
                      setPicked((list) => (on ? list.filter((x) => x !== cat) : [...list, cat]));
                    }}
                    style={[s.tile, on && s.tileOn]}
                  >
                    <Icon name={CATEGORY[cat].icon} size={22} color={on ? c.onBrand : c.brandInk} />
                    <T variant="caption" numberOfLines={2} style={{ color: on ? c.onBrand : c.text, fontFamily: 'Manrope_600SemiBold' }}>
                      {CATEGORY[cat].label}
                    </T>
                    {on ? (
                      <View style={s.tick}>
                        <Icon name="check" size={12} color={c.accentInk} strokeWidth={3} />
                      </View>
                    ) : null}
                  </Press>
                );
              })}
            </View>
          </View>
        ) : null}

        {step === 4 ? (
          <View style={s.question}>
            <T variant="micro" tone="muted">
              Question 2 of 2
            </T>
            <T variant="display" accessibilityRole="header">
              When should reminders arrive?
            </T>
            <T tone="muted">One quiet nudge at this time on reminder days. Change it any time in Settings.</T>
            <View style={{ gap: space.sm, marginTop: space.sm }}>
              {HOURS.map((h) => {
                const on = h.hour === hour;
                return (
                  <Press
                    key={h.hour}
                    testID={`hour-${h.hour}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${h.label}, ${hourLabel(h.hour)}`}
                    onPress={() => {
                      tap();
                      setHour(h.hour);
                    }}
                    style={[s.option, on && s.optionOn]}
                  >
                    <View style={{ flex: 1 }}>
                      <T variant="headline">{h.label}</T>
                      <T variant="caption" tone="muted">
                        {h.note}
                      </T>
                    </View>
                    <T variant="callout" tone={on ? 'brand' : 'muted'}>
                      {hourLabel(h.hour)}
                    </T>
                    <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>
                  </Press>
                );
              })}
            </View>
          </View>
        ) : null}

        {step === 5 ? (
          <Animated.View entering={reduce ? undefined : FadeIn.duration(300)} style={s.summary}>
            <RemindArt size={200} />
            <T variant="display" align="center" accessibilityRole="header">
              You’re all set
            </T>
            <View style={s.summaryCard}>
              <SummaryRow icon="bell" text={`Reminders at ${hourLabel(hour)}, 7 days before each deadline`} />
              <SummaryRow
                icon="sparkles"
                text={picked.length > 0 ? `We’ll start with ${picked.slice(0, 2).map((p) => CATEGORY[p].label.toLowerCase()).join(' and ')}` : 'Snap your first letter to get going'}
              />
              <SummaryRow icon="shield-check" text="Free for your first 5 deadlines — no card needed" />
            </View>
          </Animated.View>
        ) : null}
      </Animated.View>

      <View style={s.footer}>
        {step < 5 ? (
          <Button
            testID="onboarding-next"
            label={step < 3 ? (step === 2 ? 'Get started' : 'Continue') : 'Continue'}
            icon={step < 3 ? 'arrow-right' : undefined}
            onPress={next}
          />
        ) : (
          <Button testID="onboarding-finish" label="Create my free account" onPress={() => void finish()} />
        )}
        {step === 3 && picked.length === 0 ? (
          <T variant="caption" tone="faint" align="center">
            Not sure? Skip it — Continue works without a pick.
          </T>
        ) : null}
      </View>
    </View>
  );
}

function Slide({ index }: { index: 0 | 1 | 2 }) {
  const s = useStyles();
  const slide = SLIDES[index];
  const art = slide.art === 'snap' ? <SnapArt size={240} /> : slide.art === 'remind' ? <RemindArt size={240} /> : <HouseholdArt size={240} />;
  return (
    <View style={s.slide}>
      <View style={s.art}>{art}</View>
      <View style={{ gap: space.md }}>
        <T variant="display" accessibilityRole="header" style={{ fontSize: 34, lineHeight: 40 }}>
          {slide.title}
        </T>
        <T tone="muted" style={{ fontSize: 17, lineHeight: 25 }}>
          {slide.body}
        </T>
      </View>
    </View>
  );
}

function Dots({ step }: { step: number }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Step ${step + 1} of 6`}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={{ width: i === step ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i <= step ? c.brandInk : c.line }} />
      ))}
    </View>
  );
}

function SummaryRow({ icon, text }: { icon: 'bell' | 'sparkles' | 'shield-check'; text: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm }}>
      <Icon name={icon} size={20} color={c.brandInk} />
      <T style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.ground, paddingHorizontal: GUTTER },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  topBtn: { minWidth: 56, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  body: { flex: 1, justifyContent: 'center' },
  slide: { gap: space.xxl },
  art: { alignItems: 'center', justifyContent: 'center', backgroundColor: c.brandSoft, borderRadius: radius.hero, paddingVertical: space.xxl, minHeight: 280 },
  question: { gap: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  tile: {
    width: '31.5%',
    minHeight: 92,
    borderRadius: radius.tile,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    padding: space.md,
    gap: space.sm,
    justifyContent: 'space-between',
  },
  tileOn: { backgroundColor: c.brand, borderColor: c.brand },
  tick: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    borderRadius: radius.tile,
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.line,
    paddingHorizontal: space.lg,
  },
  optionOn: { borderColor: c.brandInk, backgroundColor: c.brandSoft },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.textFaint, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: c.brandInk },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.brandInk },
  summary: { alignItems: 'center', gap: space.xl },
  summaryCard: {
    alignSelf: 'stretch',
    backgroundColor: c.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: c.line,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  footer: { gap: space.sm, paddingTop: space.lg },
}));
