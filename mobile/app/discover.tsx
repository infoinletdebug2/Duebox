import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { TRIAL_DAYS } from '../src/config';
import { font, GUTTER, radius, space, useColors } from '../src/theme/tokens';
import { T } from '../src/ui/Text';
import { Icon } from '../src/ui/Icon';
import { tap } from '../src/ui/Button';
import { Mark } from '../src/ui/artwork';
import { DateTile, type Urgency } from '../src/items/parts';
import { Avatar } from '../src/ui/Progress';
import { addDays, localToday } from '../src/lib/dates';
import { skipDiscovery } from '../src/onboarding/discovery';
import { onboardingCompleted, onboardingStarted, requestTracking } from '../src/lib/analytics';

/**
 * DISCOVERY — the first thing a new phone sees, before sign-up.
 *
 * Five slides. Each is the scene from our 3D artwork (assets/discover/*.jpg,
 * prompts in assets/source/PROMPT.md) with a piece of the REAL app acting it
 * out in front: the card rising out of the scanned letter, the deadlines
 * caught in time, the date tied to its line in the letter, the reminders
 * arriving 30 → 7 → 1 days before, the household splitting the work. Under it,
 * a headline of six words or fewer and one line.
 *
 * Always plum, in light and dark alike — it is the brand's front door, like a
 * splash screen; the cards inside follow the phone's theme like the real app.
 *
 * The reader is in charge: Next, Back and Skip. No auto-advance, no swipe.
 * Android back steps to the previous slide. Each slide plays its little scene
 * once on arrival (~1.5 s) and then holds still; Reduce Motion shows the
 * final frame with a cross-fade.
 *
 * It pitches only what the app ships. No ratings, no user counts, no statistic
 * we can't source. Mock dates are computed from today, so every countdown is
 * true.
 */

const INK = '#1E1229';
const MARIGOLD = '#F2B33D';
const ON_INK_MUTED = 'rgba(255,255,255,0.72)';
/** Strong ease-out: the motion law's curve for everything that isn't a finger. */
const EASE = Easing.bezier(0.23, 1, 0.32, 1);
const SETTLE = { damping: 18, stiffness: 180, mass: 1 };

const today = localToday();
const day = (n: number) => addDays(today, n);
const longDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

interface Slide {
  art: number;
  title: string;
  body: string;
  /** What the picture shows, for screen readers. */
  alt: string;
  Scene: () => React.JSX.Element;
}

const SLIDES: Slide[] = [
  {
    art: require('../assets/discover/scan.jpg'),
    title: 'Never miss a due date.',
    body: 'Snap a letter. Duebox finds the date and reminds you.',
    alt: 'A phone scans a letter; it becomes a car insurance card due in 7 days, and a reminder arrives.',
    Scene: LoopScene,
  },
  {
    art: require('../assets/discover/problem.jpg'),
    title: 'No more late fees.',
    body: 'Bills, fines, renewals and free trials — caught in time.',
    alt: 'A pile of mail turns into three deadlines: a free trial ending tomorrow, a parking fine in 3 days, a passport renewal in 21 days.',
    Scene: ListScene,
  },
  {
    art: require('../assets/discover/read.jpg'),
    title: 'AI reads it. You see why.',
    body: 'Every date shows the line it came from.',
    alt: 'A letter with the due-date sentence highlighted, tied to the water bill card it became.',
    Scene: EvidenceScene,
  },
  {
    art: require('../assets/discover/remind.jpg'),
    title: 'Reminded 30, 7 and 1 day before.',
    body: 'Mark it done or snooze it from the notification.',
    alt: 'Three reminders for the car insurance arrive one after another; the last is marked done.',
    Scene: RemindScene,
  },
  {
    art: require('../assets/discover/together.jpg'),
    title: 'Share it with your household.',
    body: 'Invite a partner. Assign who handles what.',
    alt: 'Two people filing cards into one tray; each deadline shows who handles it.',
    Scene: HouseholdScene,
  },
];

export default function Discover() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(0);
  const [area, setArea] = useState(0);
  const [sceneH, setSceneH] = useState(0);

  const current = SLIDES[step]!;
  const last = step === SLIDES.length - 1;
  const compact = height < 700;
  const artH = Math.round(height * 0.66);

  useEffect(() => {
    onboardingStarted();
  }, []);

  // Android back steps through the slides; on the first it leaves the app as usual.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 0) return false;
      setStep(step - 1);
      return true;
    });
    return () => sub.remove();
  }, [step]);

  const leave = async (to: '/(auth)/welcome' | '/(auth)/sign-in') => {
    tap('success');
    await skipDiscovery();
    onboardingCompleted(step + 1);
    // The tracking question comes after the person has seen what the app does,
    // never on a cold first frame (App Review 5.1.1). A no-op until Meta is configured.
    await requestTracking();
    // Reopened from Welcome ("See how it works"): finishing goes back to it
    // instead of stacking a second Welcome on top.
    if (to === '/(auth)/welcome' && router.canGoBack()) router.back();
    else router.replace(to);
  };

  const next = () => {
    if (last) return void leave('/(auth)/welcome');
    tap();
    setStep(step + 1);
  };

  const back = () => {
    tap();
    setStep(Math.max(0, step - 1));
  };

  // A scene taller than the room it has (small phones) shrinks from its bottom edge.
  const fit = area && sceneH > area ? area / sceneH : 1;
  const sceneW = Math.min(width - GUTTER * 2, 360);

  return (
    <View style={styles.screen} testID="screen-discover">
      <StatusBar style="light" />

      {/* The artwork: all five stacked, the current one faded in — no blank frame between. */}
      <View style={[styles.art, { height: artH }]} pointerEvents="none" accessible accessibilityRole="image" accessibilityLabel={current.alt}>
        {SLIDES.map((slide, i) => (
          <Art key={i} image={slide.art} shown={i === step} reduceMotion={reduceMotion} />
        ))}
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Defs>
            <LinearGradient id="dx-discover-fade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={INK} stopOpacity={0.6} />
              <Stop offset="0.16" stopColor={INK} stopOpacity={0} />
              <Stop offset="0.55" stopColor={INK} stopOpacity={0} />
              <Stop offset="0.86" stopColor={INK} stopOpacity={0.9} />
              <Stop offset="1" stopColor={INK} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#dx-discover-fade)" />
        </Svg>
      </View>

      <View style={[styles.column, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg }]}>
        {/* Top: progress, the brand, skip. */}
        <View style={styles.bars} accessibilityRole="progressbar" accessibilityLabel={`Step ${step + 1} of ${SLIDES.length}`}>
          {SLIDES.map((_, i) => (
            <Segment key={i} filled={i <= step} reduceMotion={reduceMotion} />
          ))}
        </View>
        <View style={styles.brandRow}>
          <View style={styles.brand}>
            <Mark size={28} />
            <T variant="headline" style={styles.onInk}>
              Duebox
            </T>
          </View>
          {!last ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip"
              onPress={() => void leave('/(auth)/welcome')}
              hitSlop={10}
              style={({ pressed }) => [styles.skip, pressed && { opacity: 0.6 }]}
              testID="discover-skip"
            >
              <T variant="callout" style={styles.onInk}>
                Skip
              </T>
            </Pressable>
          ) : null}
        </View>

        {/* The scene, standing at the foot of the artwork. */}
        <View style={styles.sceneArea} onLayout={(e: LayoutChangeEvent) => setArea(e.nativeEvent.layout.height)} pointerEvents="none">
          <View
            key={step}
            onLayout={(e: LayoutChangeEvent) => setSceneH(e.nativeEvent.layout.height)}
            style={{ width: sceneW, transform: [{ scale: fit }], transformOrigin: 'bottom' }}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            <current.Scene />
          </View>
        </View>

        {/* The words. */}
        <Rise key={`copy-${step}`} dy={10} delay={60} style={styles.copy}>
          <T variant="display" accessibilityRole="header" style={[styles.onInk, compact ? styles.titleCompact : styles.title]}>
            {current.title}
          </T>
          <T style={styles.body}>{current.body}</T>
        </Rise>

        {/* The buttons. */}
        <View style={styles.ctaRow}>
          {step > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={back}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
              testID="discover-back"
            >
              <Icon name="chevron-left" size={24} color="#FFFFFF" />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={last ? 'Get started' : 'Next'}
            onPress={next}
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
            testID="discover-next"
          >
            <T variant="headline" style={{ color: INK }}>
              {last ? 'Get started' : 'Next'}
            </T>
            <Icon name="arrow-right" size={20} color={INK} />
          </Pressable>
        </View>
        <View style={styles.foot}>
          {last ? (
            <>
              <T variant="caption" align="center" style={{ color: ON_INK_MUTED }}>
                Free to start · {TRIAL_DAYS} days of Pro · No card
              </T>
              <T
                variant="callout"
                align="center"
                accessibilityRole="link"
                onPress={() => void leave('/(auth)/sign-in')}
                suppressHighlighting
                style={styles.signIn}
                testID="discover-sign-in"
              >
                I already have an account
              </T>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/* ── motion primitives ──────────────────────────────────────────────────── */

/** One artwork layer: fades in (and settles from a slight zoom) when it becomes current. */
function Art({ image, shown, reduceMotion }: { image: number; shown: boolean; reduceMotion: boolean }) {
  const on = useSharedValue(shown ? 1 : 0);
  useEffect(() => {
    on.set(withTiming(shown ? 1 : 0, { duration: reduceMotion ? 200 : shown ? 520 : 360, easing: EASE }));
  }, [shown, reduceMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: on.get(),
    transform: [{ scale: reduceMotion ? 1 : interpolate(on.get(), [0, 1], [1.05, 1]) }],
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" transition={0} />
    </Animated.View>
  );
}

function Segment({ filled, reduceMotion }: { filled: boolean; reduceMotion: boolean }) {
  const fill = useSharedValue(filled ? 1 : 0);
  useEffect(() => {
    fill.set(reduceMotion ? (filled ? 1 : 0) : withTiming(filled ? 1 : 0, { duration: 300, easing: EASE }));
  }, [filled, reduceMotion]);
  const style = useAnimatedStyle(() => ({ width: `${fill.get() * 100}%` }));
  return (
    <View style={styles.bar}>
      <Animated.View style={[styles.barFill, style]} />
    </View>
  );
}

/** A 0 → 1 clock that starts after `delay` ms; Reduce Motion starts it at 1. */
function useCue(delay: number, duration = 460) {
  const reduceMotion = useReducedMotion();
  const p = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (!reduceMotion) p.set(withDelay(delay, withTiming(1, { duration, easing: EASE })));
  }, []);
  return p;
}

/** Enters from below (or above, with a negative dy) and a touch smaller — never from nothing. */
function Rise({ delay = 0, dy = 18, from = 0.96, children, style }: { delay?: number; dy?: number; from?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = useCue(delay);
  const a = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0, 0.6], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: (1 - p.get()) * dy }, { scale: from + (1 - from) * p.get() }],
  }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** Springs in from small — for things that "arrive" (avatars, chips). */
function Pop({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const p = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (!reduceMotion) p.set(withDelay(delay, withSpring(1, SETTLE)));
  }, []);
  const a = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0, 0.4], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: 0.6 + 0.4 * p.get() }],
  }));
  return <Animated.View style={a}>{children}</Animated.View>;
}

/** One soft pulse after `delay` — draws the eye to the thing that matters. */
function Pulse({ delay, children }: { delay: number; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const s = useSharedValue(1);
  useEffect(() => {
    if (!reduceMotion) s.set(withDelay(delay, withSequence(withTiming(1.1, { duration: 160, easing: EASE }), withSpring(1, SETTLE))));
  }, []);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  return <Animated.View style={a}>{children}</Animated.View>;
}

/* ── the scenes ─────────────────────────────────────────────────────────── */

/** 1 — the loop: the card lifts out of the scan, then the reminder drops in. */
function LoopScene() {
  return (
    <View style={{ gap: space.sm }}>
      <Rise delay={1000} dy={-22}>
        <Banner title="Car insurance renews in 7 days" body="$412 · Renew with State Farm" />
      </Rise>
      <Rise delay={250} dy={28} from={0.92}>
        <Card title="Car insurance" sub="Renew with State Farm" amount="$412" due={day(7)} urgency="soon" when="In 7 days" />
      </Rise>
    </View>
  );
}

/** 2 — the pile becomes a list; the closest one asks for attention. */
function ListScene() {
  return (
    <View style={{ gap: space.sm }}>
      <Rise delay={150}>
        <Card title="Trial ends" sub="Cancel Streamly" amount="$15.99" due={day(1)} urgency="soon" when="Tomorrow" pulse={1100} />
      </Rise>
      <Rise delay={300}>
        <Card title="Parking fine" sub="Pay City of Austin" amount="$65" due={day(3)} urgency="soon" when="In 3 days" />
      </Rise>
      <Rise delay={450}>
        <Card title="Passport renewal" sub="Submit to State Dept." due={day(21)} urgency="later" when="In 21 days" />
      </Rise>
    </View>
  );
}

/** 3 — the thread from the letter's line down to the card, then the line itself under the date. */
function EvidenceScene() {
  const c = useColors();
  const due = day(14);
  const thread = useCue(150, 520);
  const threadStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: thread.get() }] }));
  return (
    <View>
      <Animated.View style={[styles.thread, threadStyle]} />
      <Rise delay={420} dy={20}>
        <View style={[styles.card, { flexDirection: 'column', alignItems: 'stretch', gap: space.md, backgroundColor: c.paper }]}>
          <CardRow title="Water bill" sub="Pay City Water" amount="$86.20" due={due} urgency="later" when="In 14 days" />
          <Rise delay={900} dy={8} from={0.98}>
            <View style={[styles.evidence, { backgroundColor: c.accentSoft, borderColor: MARIGOLD }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="file" size={13} color={c.textMuted} />
                <T variant="caption" allowFontScaling={false} style={{ color: c.textMuted, fontFamily: font.bold, fontSize: 12 }}>
                  From the letter · line 4
                </T>
              </View>
              <T allowFontScaling={false} style={{ fontFamily: font.semibold, fontSize: 13.5, lineHeight: 19, color: c.text }}>
                “Payment must be received by {longDate(due)}.”
              </T>
            </View>
          </Rise>
        </View>
      </Rise>
    </View>
  );
}

/**
 * 4 — the reminders arrive like real notifications: 30 days, then 7, then
 * tomorrow, each pushing the last back into the stack. Then "Mark done" is
 * pressed and the front one turns to Done.
 */
function RemindScene() {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(reduceMotion ? 3 : 0);
  const done = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    const arrive = (to: number) => withTiming(to, { duration: 420, easing: EASE });
    t.set(withDelay(200, withSequence(arrive(1), withDelay(380, arrive(2)), withDelay(380, arrive(3)))));
    done.set(withDelay(2300, withTiming(1, { duration: 260, easing: EASE })));
  }, []);
  return (
    <View style={{ height: 150 }}>
      <StackedBanner t={t} index={0} title="Car insurance renews in 30 days" />
      <StackedBanner t={t} index={1} title="Car insurance renews in 7 days" />
      <StackedBanner t={t} index={2} title="Car insurance renews tomorrow" done={done} />
    </View>
  );
}

function StackedBanner({ t, index, title, done }: { t: SharedValue<number>; index: number; title: string; done?: SharedValue<number> }) {
  const card = useAnimatedStyle(() => {
    const arrived = interpolate(t.get(), [index, index + 1], [0, 1], Extrapolation.CLAMP);
    const depth = interpolate(t.get(), [index + 1, index + 3], [0, 2], Extrapolation.CLAMP);
    return {
      opacity: arrived * (1 - depth * 0.28),
      transform: [{ translateY: (1 - arrived) * -36 - depth * 12 }, { scale: (0.96 + 0.04 * arrived) * (1 - depth * 0.05) }],
      transformOrigin: 'top',
    };
  });
  // Once a newer one lands, this one's words fade: the stack shows edges, never two lines on top of each other.
  const words = useAnimatedStyle(() => ({ opacity: 1 - interpolate(t.get(), [index + 1, index + 1.6], [0, 1], Extrapolation.CLAMP) }));
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 26, zIndex: index }, card]}>
      <Banner title={title} body="$412 · Renew with State Farm" words={words} done={done} />
    </Animated.View>
  );
}

/** 5 — two people arrive, then the work splits between them. */
function HouseholdScene() {
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.houseHead}>
        <Pop delay={150}>
          <View style={styles.ring}>
            <Avatar name="Alex" index={0} size={30} />
          </View>
        </Pop>
        <View style={{ marginLeft: -10 }}>
          <Pop delay={300}>
            <View style={styles.ring}>
              <Avatar name="Sam" index={1} size={30} />
            </View>
          </Pop>
        </View>
        <Rise delay={300} dy={0} style={{ flex: 1 }}>
          <T variant="callout" allowFontScaling={false} style={{ color: '#FFFFFF', marginLeft: space.sm }}>
            The Riveras
          </T>
        </Rise>
        <Pop delay={1300}>
          <View style={styles.invite}>
            <Icon name="user-plus" size={14} color={INK} />
            <T variant="caption" allowFontScaling={false} style={{ color: INK, fontFamily: font.bold }}>
              Invite
            </T>
          </View>
        </Pop>
      </View>
      <Rise delay={550}>
        <Card title="Water bill" sub="Alex handles this" amount="$86.20" due={day(5)} urgency="soon" who={{ name: 'Alex', index: 0 }} />
      </Rise>
      <Rise delay={750}>
        <Card title="Car registration" sub="Sam handles this" amount="$168" due={day(12)} urgency="later" who={{ name: 'Sam', index: 1 }} />
      </Rise>
    </View>
  );
}

/* ── scene parts: the app's own card and notification ───────────────────── */

interface CardProps {
  title: string;
  sub: string;
  amount?: string;
  due: string;
  urgency: Urgency;
  when?: string;
  who?: { name: string; index: number };
  pulse?: number;
}

function Card(props: CardProps) {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.paper }]}>
      <CardRow {...props} />
    </View>
  );
}

function CardRow({ title, sub, amount, due, urgency, when, who, pulse }: CardProps) {
  const c = useColors();
  const tag = when ? (
    <View style={[styles.when, { backgroundColor: urgency === 'soon' ? c.accentSoft : c.brandSoft }]}>
      <T allowFontScaling={false} style={{ fontFamily: font.bold, fontSize: 11.5, lineHeight: 15, color: c.brandInk }}>
        {when}
      </T>
    </View>
  ) : null;
  return (
    <View style={{ flexGrow: 1, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <DateTile day={due} urgency={urgency} size={40} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <T variant="headline" numberOfLines={1} allowFontScaling={false} style={{ flexShrink: 1, fontSize: 15.5, lineHeight: 20 }}>
            {title}
          </T>
          {tag && pulse ? <Pulse delay={pulse}>{tag}</Pulse> : tag}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {who ? <Avatar name={who.name} index={who.index} size={16} /> : null}
          <T variant="caption" numberOfLines={1} allowFontScaling={false} style={{ flex: 1, color: c.textMuted, fontSize: 12.5 }}>
            {sub}
          </T>
        </View>
      </View>
      {amount ? (
        <T variant="callout" allowFontScaling={false} style={{ fontSize: 15 }}>
          {amount}
        </T>
      ) : null}
    </View>
  );
}

/** A phone notification, the way Duebox's reminders arrive — with the actions when `done` is wired. */
function Banner({ title, body, words, done }: { title: string; body: string; words?: React.ComponentProps<typeof Animated.View>['style']; done?: SharedValue<number> }) {
  const c = useColors();
  return (
    <View style={[styles.banner, { backgroundColor: c.paper }]}>
      <Animated.View style={words}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Mark size={32} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T allowFontScaling={false} style={{ fontFamily: font.bold, fontSize: 11, lineHeight: 14, color: c.textMuted, letterSpacing: 0.4 }}>
                DUEBOX
              </T>
              <T allowFontScaling={false} style={{ fontFamily: font.medium, fontSize: 11, lineHeight: 14, color: c.textFaint }}>
                9:00 AM
              </T>
            </View>
            <T numberOfLines={1} allowFontScaling={false} style={{ fontFamily: font.semibold, fontSize: 14, lineHeight: 19, color: c.text }}>
              {title}
            </T>
            <T numberOfLines={1} allowFontScaling={false} style={{ fontFamily: font.body, fontSize: 12.5, lineHeight: 17, color: c.textMuted }}>
              {body}
            </T>
          </View>
        </View>
        {done ? <Actions done={done} /> : null}
      </Animated.View>
    </View>
  );
}

/** Mark done · Snooze; then the press lands and Mark done turns into Done. */
function Actions({ done }: { done: SharedValue<number> }) {
  const c = useColors();
  const press = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(done.get(), [0, 0.35, 1], [1, 0.94, 1]) }],
  }));
  const before = useAnimatedStyle(() => ({ opacity: 1 - done.get() }));
  const after = useAnimatedStyle(() => ({ opacity: done.get() }));
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
      <Animated.View style={[styles.action, { backgroundColor: MARIGOLD }, press]}>
        <Animated.View style={[styles.actionLabel, before]}>
          <Icon name="check" size={14} color={INK} strokeWidth={2.6} />
          <T allowFontScaling={false} style={[styles.actionText, { color: INK }]}>
            Mark done
          </T>
        </Animated.View>
        <Animated.View style={[styles.actionLabel, StyleSheet.absoluteFill, { backgroundColor: c.good, borderRadius: radius.chip }, after]}>
          <Icon name="check-circle" size={14} color={c.scheme === 'dark' ? INK : '#FFFFFF'} strokeWidth={2.4} />
          <T allowFontScaling={false} style={[styles.actionText, { color: c.scheme === 'dark' ? INK : '#FFFFFF' }]}>
            Done
          </T>
        </Animated.View>
      </Animated.View>
      <View style={[styles.action, { backgroundColor: c.surfaceSunk }]}>
        <View style={styles.actionLabel}>
          <Icon name="clock" size={14} color={c.text} />
          <T allowFontScaling={false} style={[styles.actionText, { color: c.text }]}>
            Snooze
          </T>
        </View>
      </View>
    </View>
  );
}

/* ── styles ─────────────────────────────────────────────────────────────── */

const LIFT = '0px 14px 34px rgba(10, 4, 18, 0.45)';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: INK },
  art: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  column: { flex: 1, paddingHorizontal: GUTTER, gap: space.md },
  onInk: { color: '#FFFFFF' },

  bars: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.24)', overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2, backgroundColor: MARIGOLD },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  skip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.chip,
    backgroundColor: 'rgba(30,18,41,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },

  sceneArea: { flex: 1, minHeight: 160, alignItems: 'center', justifyContent: 'flex-end' },

  copy: { gap: space.sm, paddingTop: space.md, minHeight: 116 },
  title: { fontSize: 31, lineHeight: 37 },
  titleCompact: { fontSize: 26, lineHeight: 31 },
  body: { color: ON_INK_MUTED, fontSize: 17, lineHeight: 24 },

  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xs },
  backButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  cta: {
    flex: 1,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.chip,
    backgroundColor: MARIGOLD,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
  foot: { minHeight: 50, gap: space.xs, justifyContent: 'center' },
  signIn: { color: '#FFFFFF', paddingVertical: space.xs, textDecorationLine: 'underline' },

  // Scene parts
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.tile + 2,
    borderCurve: 'continuous',
    boxShadow: LIFT,
  },
  when: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.chip },
  banner: { padding: space.md, borderRadius: radius.card, borderCurve: 'continuous', boxShadow: LIFT },
  action: { flex: 1, height: 34, borderRadius: radius.chip, overflow: 'hidden' },
  actionLabel: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  actionText: { fontFamily: font.bold, fontSize: 13, lineHeight: 17 },
  thread: { alignSelf: 'center', width: 3, height: 34, borderRadius: 2, backgroundColor: MARIGOLD, transformOrigin: 'top', marginBottom: -2 },
  evidence: { gap: 4, padding: space.md, borderRadius: radius.input, borderCurve: 'continuous', borderLeftWidth: 3 },
  houseHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    padding: 6,
    paddingRight: 6,
    borderRadius: radius.chip,
    backgroundColor: 'rgba(30,18,41,0.72)',
  },
  ring: { borderRadius: 99, borderWidth: 2, borderColor: INK },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.chip, backgroundColor: MARIGOLD },
});
