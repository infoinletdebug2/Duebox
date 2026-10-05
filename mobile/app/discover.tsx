import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { TRIAL_DAYS } from '../src/config';
import { font, GUTTER, radius, space } from '../src/theme/tokens';
import { T } from '../src/ui/Text';
import { Icon } from '../src/ui/Icon';
import { tap } from '../src/ui/Button';
import { Mark } from '../src/ui/artwork';
import { skipDiscovery } from '../src/onboarding/discovery';
import { onboardingCompleted, onboardingStarted, requestTracking } from '../src/lib/analytics';

/**
 * DISCOVERY — the first thing a new phone sees, before sign-up.
 *
 * Five screens that answer "why would I want this?" before anything is asked:
 * the picture IS the page (full-bleed artwork, the words on a long fade
 * below it); a story bar fills for each slide and moves on by itself; the
 * moment the reader taps, swipes or presses a button it stops and they are in
 * charge; each slide has its own accent and crossfades into the next.
 *
 * It pitches only what the app ships: reading letters, the evidence next to
 * every date, reminders before the day, household sharing. No ratings, no
 * user counts, no statistic we can't source.
 *
 * Reduce Motion: no auto-advance, no fades.
 * Artwork: assets/discover/*.jpg (generated; prompts in assets/source/PROMPT.md).
 */

const AUTO_MS = 6500;
const INK = '#1E1229';

interface Slide {
  image: number;
  accent: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    image: require('../assets/discover/problem.jpg'),
    accent: '#F2B33D',
    title: 'Deadlines hide in paper.',
    body: 'Renewals, bills, school forms, free trials. The date is in there somewhere — and it’s easy to find it a day too late.',
  },
  {
    image: require('../assets/discover/scan.jpg'),
    accent: '#C9B6F2',
    title: 'Snap the letter.',
    body: 'Camera, photos or a PDF. Duebox reads it in seconds and turns it into one tidy card for you to check and save.',
  },
  {
    image: require('../assets/discover/read.jpg'),
    accent: '#F5C98A',
    title: 'See exactly where the date came from.',
    body: 'The words from the letter sit right next to the date, so checking takes a glance. No clear date? We never guess.',
  },
  {
    image: require('../assets/discover/remind.jpg'),
    accent: '#F2A08A',
    title: 'Reminded before — not on the day.',
    body: 'A nudge 30, 7 and 1 days ahead, at the hour you choose. Mark it done or snooze it right from the notification.',
  },
  {
    image: require('../assets/discover/together.jpg'),
    accent: '#F2B33D',
    title: 'Share the load at home.',
    body: 'Invite a partner, assign who handles what, and repeating things roll over to next time on their own.',
  },
];

export default function Discover() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [inCharge, setInCharge] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const fill = useRef(new Animated.Value(0)).current;

  const current = SLIDES[step]!;
  const last = step === SLIDES.length - 1;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => undefined);
  }, []);

  // The new picture fades in over the old one.
  useEffect(() => {
    if (reduceMotion || previous === null) {
      fade.setValue(1);
      return;
    }
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 600, useNativeDriver: true }).start(() => setPrevious(null));
  }, [step]);

  const goTo = (next: number) => {
    if (next < 0 || next >= SLIDES.length || next === step) return;
    setPrevious(step);
    setStep(next);
  };

  // Each slide's bar fills over AUTO_MS, then the next comes — until the reader takes over.
  const auto = !reduceMotion && !inCharge && !last;
  useEffect(() => {
    fill.stopAnimation();
    if (!auto) {
      fill.setValue(1);
      return;
    }
    fill.setValue(0);
    const run = Animated.timing(fill, { toValue: 1, duration: AUTO_MS, useNativeDriver: false });
    run.start(({ finished }) => {
      if (finished) goTo(step + 1);
    });
    return () => run.stop();
  }, [step, auto]);

  useEffect(() => {
    onboardingStarted();
  }, []);

  const finish = async () => {
    tap('success');
    await skipDiscovery();
    onboardingCompleted(step + 1);
    // The tracking question comes after the person has seen what the app does,
    // never on a cold first frame (App Review 5.1.1). A no-op until Meta is configured.
    await requestTracking();
    router.replace('/(auth)/welcome');
  };

  const next = () => {
    setInCharge(true);
    if (last) return void finish();
    tap();
    goTo(step + 1);
  };

  const back = () => {
    setInCharge(true);
    tap();
    goTo(step - 1);
  };

  // A sideways swipe anywhere moves between slides.
  const swipeTo = useRef((_direction: number) => undefined as void);
  swipeTo.current = (direction: number) => {
    setInCharge(true);
    if (direction > 0 && !last) goTo(step + 1);
    if (direction < 0) goTo(step - 1);
  };
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -60) swipeTo.current(1);
        else if (g.dx > 60) swipeTo.current(-1);
      },
    }),
  ).current;

  const segment = (width - GUTTER * 2 - (SLIDES.length - 1) * 4) / SLIDES.length;
  const enter = (delay: number) => (reduceMotion ? undefined : FadeInDown.delay(delay).duration(420));

  return (
    <View style={styles.screen} {...swipe.panHandlers} testID="screen-discover">
      {/* The pictures: the one leaving underneath, the one arriving fading in over it. */}
      {previous !== null ? <Backdrop image={SLIDES[previous]!.image} /> : null}
      <Animated.View style={[styles.fill, { opacity: fade }]} pointerEvents="none">
        <Backdrop key={step} image={current.image} />
      </Animated.View>

      {/* A long fade, so the picture becomes the page instead of stopping at a line. */}
      <Svg style={styles.fill} width="100%" height="100%" pointerEvents="none">
        <Defs>
          <LinearGradient id="dx-discover-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={INK} stopOpacity={0.55} />
            <Stop offset="0.14" stopColor={INK} stopOpacity={0} />
            <Stop offset="0.46" stopColor={INK} stopOpacity={0} />
            <Stop offset="0.66" stopColor={INK} stopOpacity={0.85} />
            <Stop offset="0.84" stopColor={INK} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#dx-discover-fade)" />
      </Svg>

      {/* Top: the story bar, the brand, and skip. */}
      <View style={[styles.top, { top: insets.top + space.sm }]}>
        <View style={styles.bars} accessibilityRole="progressbar" accessibilityLabel={`${step + 1} of ${SLIDES.length}`}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.bar, { width: segment }]}>
              {i < step ? (
                <View style={[styles.barFill, { width: '100%', backgroundColor: '#FFFFFF' }]} />
              ) : i === step ? (
                <Animated.View style={[styles.barFill, { backgroundColor: current.accent, width: fill.interpolate({ inputRange: [0, 1], outputRange: [0, segment] }) }]} />
              ) : null}
            </View>
          ))}
        </View>
        <View style={styles.brandRow}>
          <View style={styles.brand}>
            <Mark size={32} />
            <T variant="headline" style={styles.onInk}>
              Duebox
            </T>
          </View>
          {!last ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Skip" onPress={() => void finish()} hitSlop={8} style={styles.skip} testID="discover-skip">
              <T variant="callout" style={styles.onInk}>
                Skip
              </T>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Bottom: the words, then the buttons. */}
      <View style={[styles.copy, { paddingBottom: insets.bottom + space.lg }]}>
        <Reanimated.View key={`tag-${step}`} entering={enter(0)} style={{ flexDirection: 'row' }}>
          <View style={[styles.tag, { backgroundColor: current.accent }]}>
            <T variant="caption" style={{ color: INK, fontFamily: font.bold }}>
              {step + 1} / {SLIDES.length}
            </T>
          </View>
        </Reanimated.View>
        <Reanimated.View key={`title-${step}`} entering={enter(80)}>
          <T variant="display" style={[styles.onInk, styles.headline]} accessibilityRole="header">
            {current.title}
          </T>
        </Reanimated.View>
        <Reanimated.View key={`body-${step}`} entering={enter(160)}>
          <T style={styles.body}>{current.body}</T>
        </Reanimated.View>

        <View style={styles.ctaRow}>
          {step > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={styles.backButton} testID="discover-back">
              <Icon name="chevron-left" size={22} color="#FFFFFF" />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={last ? 'Get started' : 'Next'}
            onPress={next}
            style={({ pressed }) => [styles.cta, { backgroundColor: current.accent }, pressed && styles.ctaPressed]}
            testID="discover-next"
          >
            <T variant="headline" style={{ color: INK }}>
              {last ? 'Get started' : 'Next'}
            </T>
            <View style={styles.ctaArrow}>
              <Icon name="arrow-right" size={18} color="#FFFFFF" />
            </View>
          </Pressable>
        </View>
        <T variant="caption" align="center" style={styles.muted}>
          Free to start · {TRIAL_DAYS} days of Pro after setup · No card
        </T>
      </View>
    </View>
  );
}

function Backdrop({ image }: { image: number }) {
  return <Image source={image} style={styles.fill} contentFit="cover" contentPosition="top" accessibilityElementsHidden importantForAccessibility="no" />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: INK },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  onInk: { color: '#FFFFFF' },
  muted: { color: 'rgba(255,255,255,0.62)' },
  top: { position: 'absolute', left: GUTTER, right: GUTTER, zIndex: 2, gap: space.md },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.26)', overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  skip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  copy: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, gap: space.sm },
  tag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.chip },
  headline: { fontSize: 32, lineHeight: 38, marginTop: 2 },
  body: { color: 'rgba(255,255,255,0.78)', fontSize: 17, lineHeight: 25 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg },
  backButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  cta: {
    flex: 1,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: space.xl,
    paddingRight: 7,
    borderRadius: radius.chip,
  },
  ctaPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  ctaArrow: { width: 42, height: 42, borderRadius: 21, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
});
