import { useEffect, useState } from 'react';
import { AccessibilityInfo, BackHandler, Pressable, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { Easing, FadeIn, Keyframe, ReduceMotion } from 'react-native-reanimated';
import { TRIAL_DAYS } from '../src/config';
import { font, GUTTER, makeStyles, radius, space, useColors } from '../src/theme/tokens';
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
 * Five slides that answer "what is this, why would I want it" in a glance:
 * the top of each is a plum stage holding a small piece of the REAL app (the
 * dated card, the evidence line, the reminder, the household), the bottom is
 * one short headline and one line. The reader is in charge: Next, Back and
 * Skip — no auto-advance, no swipe. Android back steps to the previous slide.
 *
 * It pitches only what the app ships: reading letters, the evidence next to
 * every date, reminders 30/7/1 days before, household sharing. No ratings, no
 * user counts, no statistic we can't source. The mock dates are computed from
 * today, so every countdown on a slide is true.
 *
 * Reduce Motion: the stage cross-fades instead of growing in.
 */

/** The stage is always plum — in dark mode too, where it sits on the deeper ground. */
const PLUM = '#2E1A47';
const ON_PLUM_MUTED = '#CBBFDA';
const INK = '#1E1229';

/** Each mock is drawn in this box, then scaled to the stage. */
const MOCK = 300;

const today = localToday();
const day = (n: number) => addDays(today, n);
const longDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

interface Slide {
  title: string;
  body: string;
  /** What the picture shows, for screen readers. */
  alt: string;
  Mock: () => React.JSX.Element;
}

const SLIDES: Slide[] = [
  {
    title: 'Snap a letter. Never miss it.',
    body: 'Duebox finds the deadline and reminds you first.',
    alt: 'A letter is scanned, becomes a card due in 7 days, and a reminder arrives.',
    Mock: LoopMock,
  },
  {
    title: 'No more late fees.',
    body: 'Bills, fines, renewals and free trials — caught in time.',
    alt: 'Three upcoming deadlines: a free trial ending tomorrow, a parking fine in 3 days, a passport renewal in 21 days.',
    Mock: ListMock,
  },
  {
    title: 'AI reads it. You see why.',
    body: 'Every date shows the line it came from.',
    alt: 'A water bill letter with the sentence giving the due date highlighted, linked to the saved card.',
    Mock: EvidenceMock,
  },
  {
    title: 'Reminded 30, 7 and 1 day before.',
    body: 'Mark it done or snooze it from the notification.',
    alt: 'Three reminders for the car insurance, the front one with Mark done and Snooze buttons.',
    Mock: RemindMock,
  },
  {
    title: 'Share it with your household.',
    body: 'Invite a partner. Assign who handles what.',
    alt: 'A household of two, each deadline showing who handles it.',
    Mock: HouseholdMock,
  },
];

export default function Discover() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const c = useColors();
  const s = useStyles();
  const [step, setStep] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  const current = SLIDES[step]!;
  const last = step === SLIDES.length - 1;
  const compact = height < 700;

  useEffect(() => {
    onboardingStarted();
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => undefined);
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

  const onStage = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setStage({ w, h });
  };
  const scale = stage.w ? Math.min((stage.w - space.xxl) / MOCK, (stage.h - space.xxl) / MOCK, 1.25) : 0;

  const grow = reduceMotion
    ? FadeIn.duration(200).reduceMotion(ReduceMotion.Never)
    : new Keyframe({
        0: { opacity: 0, transform: [{ scale: 0.95 }] },
        100: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.bezier(0.23, 1, 0.32, 1) },
      }).duration(280);
  const words = FadeIn.duration(reduceMotion ? 200 : 240).reduceMotion(ReduceMotion.Never);

  return (
    <View style={[s.screen, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg }]} testID="screen-discover">
      {/* Top: progress, the brand, skip. */}
      <View style={s.bars} accessibilityRole="progressbar" accessibilityLabel={`Step ${step + 1} of ${SLIDES.length}`}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[s.bar, { backgroundColor: i <= step ? c.accent : c.line }]} />
        ))}
      </View>
      <View style={s.brandRow}>
        <View style={s.brand}>
          <Mark size={28} />
          <T variant="headline">Duebox</T>
        </View>
        {!last ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip"
            onPress={() => void leave('/(auth)/welcome')}
            hitSlop={10}
            style={({ pressed }) => [s.skip, pressed && { opacity: 0.6 }]}
            testID="discover-skip"
          >
            <T variant="callout" tone="muted">
              Skip
            </T>
          </Pressable>
        ) : (
          <View style={s.skip} />
        )}
      </View>

      {/* The stage: a small piece of the real app. */}
      <View style={[s.stage, { maxHeight: (width - GUTTER * 2) * 1.1 }]} onLayout={onStage} accessible accessibilityRole="image" accessibilityLabel={current.alt}>
        {scale ? (
          <Reanimated.View key={step} entering={grow} style={{ width: MOCK, height: MOCK, transform: [{ scale }] }} pointerEvents="none">
            <current.Mock />
          </Reanimated.View>
        ) : null}
      </View>

      {/* The words. */}
      <Reanimated.View key={`copy-${step}`} entering={words} style={s.copy}>
        <T variant="display" accessibilityRole="header" style={compact ? s.titleCompact : s.title}>
          {current.title}
        </T>
        <T tone="muted" style={s.body}>
          {current.body}
        </T>
      </Reanimated.View>

      <View style={s.spare} />

      {/* The buttons. */}
      <View style={s.ctaRow}>
        {step > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={back}
            style={({ pressed }) => [s.backButton, pressed && s.pressed]}
            testID="discover-back"
          >
            <Icon name="chevron-left" size={24} color={c.text} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={last ? 'Get started' : 'Next'}
          onPress={next}
          style={({ pressed }) => [s.cta, pressed && s.pressed]}
          testID="discover-next"
        >
          <T variant="headline" style={{ color: c.accentInk }}>
            {last ? 'Get started' : 'Next'}
          </T>
          <Icon name="arrow-right" size={20} color={c.accentInk} />
        </Pressable>
      </View>
      <View style={s.foot}>
        {last ? (
          <>
            <T variant="caption" tone="muted" align="center">
              Free to start · {TRIAL_DAYS} days of Pro · No card
            </T>
            <T
              variant="callout"
              tone="brand"
              align="center"
              accessibilityRole="link"
              onPress={() => void leave('/(auth)/sign-in')}
              suppressHighlighting
              style={s.signIn}
              testID="discover-sign-in"
            >
              I already have an account
            </T>
          </>
        ) : null}
      </View>
    </View>
  );
}

/* ── the mocks ──────────────────────────────────────────────────────────────
 * Drawn at MOCK×MOCK on the plum stage with the app's own pieces (DateTile,
 * Avatar, the card surface), so they follow light and dark like the real thing.
 */

/** 1 — the whole loop: the letter, the card it became, the reminder. */
function LoopMock() {
  const s = useStyles();
  return (
    <View style={[s.mock, { justifyContent: 'center', gap: 2 }]}>
      <View style={{ alignSelf: 'center', marginBottom: 6 }}>
        <Letter width={124} lines={4} highlight={2} />
        <ScanCorners />
      </View>
      <Arrow />
      <MockCard title="Car insurance" sub="Renew with State Farm" amount="$412" due={day(7)} urgency="soon" />
      <Arrow />
      <Banner title="Car insurance renews in 7 days" small />
    </View>
  );
}

/** 2 — what it saves you from. */
function ListMock() {
  const s = useStyles();
  return (
    <View style={[s.mock, { justifyContent: 'center', gap: space.sm }]}>
      <T variant="caption" allowFontScaling={false} style={{ color: ON_PLUM_MUTED, fontFamily: font.bold, marginLeft: 4 }}>
        Coming up
      </T>
      <MockCard title="Free trial ends" sub="Cancel Streamly" amount="$15.99" due={day(1)} urgency="soon" when="Tomorrow" />
      <MockCard title="Parking fine" sub="Pay City of Austin" amount="$65" due={day(3)} urgency="soon" when="In 3 days" />
      <MockCard title="Passport renewal" sub="Submit to State Dept." due={day(21)} urgency="later" when="In 21 days" />
    </View>
  );
}

/** 3 — the evidence: the sentence in the letter, tied to the date on the card. */
function EvidenceMock() {
  const c = useColors();
  const s = useStyles();
  const due = day(14);
  return (
    <View style={[s.mock, { justifyContent: 'center' }]}>
      <View style={[s.paper, { padding: space.lg, gap: 7 }]}>
        <T allowFontScaling={false} style={{ fontFamily: font.bold, fontSize: 12, lineHeight: 16, color: c.text }}>
          City Water · Account 4471-208
        </T>
        <Lines count={2} />
        <View style={s.quote}>
          <T allowFontScaling={false} style={{ fontFamily: font.semibold, fontSize: 12.5, lineHeight: 18, color: INK }}>
            Payment must be received by {longDate(due)}.
          </T>
        </View>
        <Lines count={1} />
      </View>
      <View style={s.tether} />
      <View style={{ gap: 6 }}>
        <MockCard title="Water bill" sub="Pay City Water" amount="$86.20" due={due} urgency="later" when="In 14 days" />
        <View style={[s.fromLetter, { backgroundColor: c.accentSoft }]}>
          <Icon name="file" size={13} color={ON_PLUM_MUTED} />
          <T variant="caption" allowFontScaling={false} style={{ color: ON_PLUM_MUTED, fontSize: 12 }}>
            Date from the letter, line 4
          </T>
        </View>
      </View>
    </View>
  );
}

/** 4 — the reminders, 30 → 7 → 1, the front one with its actions. */
function RemindMock() {
  const s = useStyles();
  return (
    <View style={[s.mock, { justifyContent: 'center', gap: space.sm }]}>
      <View style={{ opacity: 0.6 }}>
        <Banner title="Car insurance renews in 30 days" small />
      </View>
      <View style={{ opacity: 0.8 }}>
        <Banner title="Car insurance renews in 7 days" small />
      </View>
      <Banner title="Car insurance renews tomorrow" actions />
    </View>
  );
}

/** 5 — the household: two people, each deadline with who handles it. */
function HouseholdMock() {
  const c = useColors();
  const s = useStyles();
  return (
    <View style={[s.mock, { justifyContent: 'center', gap: space.sm }]}>
      <View style={s.houseHead}>
        <View style={{ flexDirection: 'row' }}>
          <View style={s.ring}>
            <Avatar name="Alex" index={0} size={28} />
          </View>
          <View style={[s.ring, { marginLeft: -8 }]}>
            <Avatar name="Sam" index={1} size={28} />
          </View>
        </View>
        <T variant="caption" allowFontScaling={false} style={{ flex: 1, color: ON_PLUM_MUTED, fontFamily: font.bold }}>
          The Riveras · 2 people
        </T>
        <View style={[s.invite, { backgroundColor: c.accent }]}>
          <Icon name="user-plus" size={13} color={c.accentInk} />
          <T variant="caption" allowFontScaling={false} style={{ color: c.accentInk, fontFamily: font.bold, fontSize: 12 }}>
            Invite
          </T>
        </View>
      </View>
      <MockCard title="Water bill" sub="Alex handles this" amount="$86.20" due={day(5)} urgency="soon" who={{ name: 'Alex', index: 0 }} />
      <MockCard title="Car registration" sub="Sam handles this" amount="$168" due={day(12)} urgency="later" who={{ name: 'Sam', index: 1 }} />
    </View>
  );
}

/* ── mock parts ─────────────────────────────────────────────────────────── */

function MockCard({
  title,
  sub,
  amount,
  due,
  urgency,
  when,
  who,
}: {
  title: string;
  sub: string;
  amount?: string;
  due: string;
  urgency: Urgency;
  when?: string;
  who?: { name: string; index: number };
}) {
  const c = useColors();
  const s = useStyles();
  return (
    <View style={s.card}>
      <DateTile day={due} urgency={urgency} size={40} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <T variant="headline" numberOfLines={1} allowFontScaling={false} style={{ fontSize: 15, lineHeight: 20 }}>
          {title}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {who ? <Avatar name={who.name} index={who.index} size={15} /> : null}
          <T variant="caption" numberOfLines={1} allowFontScaling={false} style={{ flex: 1, color: c.textMuted, fontSize: 12 }}>
            {when ? <T variant="caption" allowFontScaling={false} style={{ color: c.brandInk, fontFamily: font.bold, fontSize: 12 }}>{`${when} · `}</T> : null}
            {sub}
          </T>
        </View>
      </View>
      {amount ? (
        <T variant="callout" allowFontScaling={false} style={{ fontSize: 14 }}>
          {amount}
        </T>
      ) : null}
    </View>
  );
}

/** A phone notification, the way Duebox's reminders arrive. */
function Banner({ title, small, actions }: { title: string; small?: boolean; actions?: boolean }) {
  const c = useColors();
  const s = useStyles();
  return (
    <View style={[s.banner, small && { paddingVertical: 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Mark size={small ? 26 : 30} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T allowFontScaling={false} style={{ fontFamily: font.bold, fontSize: 11, lineHeight: 14, color: c.textMuted, letterSpacing: 0.4 }}>
              DUEBOX
            </T>
            <T allowFontScaling={false} style={{ fontFamily: font.medium, fontSize: 11, lineHeight: 14, color: c.textFaint }}>
              9:00 AM
            </T>
          </View>
          <T numberOfLines={1} allowFontScaling={false} style={{ fontFamily: font.semibold, fontSize: 13.5, lineHeight: 18, color: c.text }}>
            {title}
          </T>
          {!small ? (
            <T numberOfLines={1} allowFontScaling={false} style={{ fontFamily: font.body, fontSize: 12.5, lineHeight: 17, color: c.textMuted }}>
              $412 · Renew with State Farm
            </T>
          ) : null}
        </View>
      </View>
      {actions ? (
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
          <View style={[s.action, { backgroundColor: c.accent }]}>
            <Icon name="check" size={14} color={c.accentInk} strokeWidth={2.6} />
            <T allowFontScaling={false} style={{ fontFamily: font.bold, fontSize: 12.5, lineHeight: 16, color: c.accentInk }}>
              Mark done
            </T>
          </View>
          <View style={[s.action, { backgroundColor: c.surfaceSunk }]}>
            <Icon name="clock" size={14} color={c.text} />
            <T allowFontScaling={false} style={{ fontFamily: font.bold, fontSize: 12.5, lineHeight: 16, color: c.text }}>
              Snooze
            </T>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** A sheet of paper with grey text lines; one line marigold where the date is. */
function Letter({ width, lines, highlight }: { width: number; lines: number; highlight: number }) {
  const s = useStyles();
  return (
    <View style={[s.paper, { width, padding: 12, gap: 6, transform: [{ rotate: '-3deg' }] }]}>
      {Array.from({ length: lines }, (_, i) => (
        <View
          key={i}
          style={[s.line, { width: i === 0 ? '45%' : i === lines - 1 ? '60%' : '100%' }, i === highlight && { backgroundColor: '#F2B33D', height: 7 }]}
        />
      ))}
    </View>
  );
}

function Lines({ count }: { count: number }) {
  const s = useStyles();
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[s.line, { width: i === count - 1 ? '70%' : '100%' }]} />
      ))}
    </>
  );
}

/** The camera's frame around the letter. */
function ScanCorners() {
  const s = useStyles();
  return (
    <View style={s.corners} pointerEvents="none">
      <View style={[s.corner, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 }]} />
      <View style={[s.corner, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 }]} />
      <View style={[s.corner, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 }]} />
      <View style={[s.corner, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 }]} />
    </View>
  );
}

function Arrow() {
  return (
    <View style={{ alignItems: 'center' }}>
      <Icon name="chevron-down" size={16} color={ON_PLUM_MUTED} strokeWidth={2.4} />
    </View>
  );
}

/* ── styles ─────────────────────────────────────────────────────────────── */

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.ground, paddingHorizontal: GUTTER, gap: space.md },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  skip: { minWidth: 56, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },

  // Grows first (1000 : 1 against the spare room) until capped, then the spare room takes the rest.
  stage: {
    flexGrow: 1000,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 220,
    backgroundColor: PLUM,
    borderRadius: radius.hero,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  spare: { flexGrow: 1 },
  copy: { gap: space.sm, paddingTop: space.sm, minHeight: 112 },
  title: { fontSize: 30, lineHeight: 36 },
  titleCompact: { fontSize: 26, lineHeight: 31 },
  body: { fontSize: 17, lineHeight: 24 },

  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  backButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surfaceSunk,
  },
  cta: {
    flex: 1,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.chip,
    backgroundColor: c.accent,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  foot: { minHeight: 52, gap: space.xs, justifyContent: 'center' },
  signIn: { paddingVertical: space.xs },

  // Mocks
  mock: { width: MOCK, height: MOCK },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.tile,
    borderCurve: 'continuous',
    backgroundColor: c.paper,
  },
  banner: {
    padding: space.md,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: c.paper,
  },
  action: {
    flex: 1,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: radius.chip,
  },
  paper: { backgroundColor: c.paper, borderRadius: radius.input, borderCurve: 'continuous' },
  line: { height: 6, borderRadius: 3, backgroundColor: c.line },
  quote: { backgroundColor: '#F2B33D', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, marginHorizontal: -6 },
  tether: { width: 3, height: 18, borderRadius: 2, backgroundColor: '#F2B33D', alignSelf: 'center' },
  fromLetter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.chip,
  },
  corners: { position: 'absolute', top: -10, left: -12, right: -12, bottom: -10 },
  corner: { position: 'absolute', width: 18, height: 18, borderColor: '#F2B33D' },
  houseHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: 4, marginBottom: 2 },
  ring: { borderRadius: 99, borderWidth: 2, borderColor: PLUM },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.chip },
}));
