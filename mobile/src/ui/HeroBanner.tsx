import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Reanimated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { font, radius, space } from '../theme/tokens';
import { T } from './Text';
import { Icon, type IconName } from './Icon';

/**
 * The hero banner — the discovery pitch's visual language, brought to the
 * quieter screens (account, export, household…). Generated 3D artwork in a
 * deep-plum card, the screen's title and one sentence on a long fade over
 * its lower left, and optional chips for the two or three facts that matter.
 *
 * It is a dark card on purpose: it reads the same on the light and the dark
 * theme, so there is one artwork per screen, not two.
 *
 * Artwork: assets/hero/*.jpg (prompts in assets/source/PROMPT.md).
 */

const HERO = {
  auth: require('../../assets/hero/auth.jpg'),
  account: require('../../assets/hero/account.jpg'),
  export: require('../../assets/hero/export.jpg'),
  delete: require('../../assets/hero/delete.jpg'),
  notify: require('../../assets/hero/notify.jpg'),
  household: require('../../assets/hero/household.jpg'),
  subscription: require('../../assets/hero/subscription.jpg'),
} as const;

export type HeroName = keyof typeof HERO;

const INK = '#1E1229';
const MARIGOLD = '#F2B33D';

export interface HeroChip {
  icon: IconName;
  label: string;
}

export function HeroBanner({
  art,
  eyebrow,
  title,
  lead,
  chips,
  tone = 'marigold',
  children,
  testID,
}: {
  art: HeroName;
  eyebrow?: string;
  title: string;
  lead?: string;
  chips?: HeroChip[];
  /** `danger` swaps the eyebrow to a soft brick for destructive screens. */
  tone?: 'marigold' | 'danger';
  /** Extra content at the bottom of the card (a plan meter, a stat row). */
  children?: React.ReactNode;
  testID?: string;
}) {
  const reduce = useReducedMotion();
  const accent = tone === 'danger' ? '#F2A08A' : MARIGOLD;
  return (
    <Reanimated.View entering={reduce ? undefined : FadeIn.duration(420)} style={s.card} testID={testID}>
      <Image source={HERO[art]} style={s.fill} contentFit="cover" contentPosition="right" accessibilityElementsHidden importantForAccessibility="no" />
      <Svg style={s.fill} width="100%" height="100%" pointerEvents="none">
        <Defs>
          <LinearGradient id={`dx-hero-${art}-v`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={INK} stopOpacity={0} />
            <Stop offset="0.3" stopColor={INK} stopOpacity={0.05} />
            <Stop offset="0.62" stopColor={INK} stopOpacity={0.8} />
            <Stop offset="1" stopColor={INK} stopOpacity={0.97} />
          </LinearGradient>
          <LinearGradient id={`dx-hero-${art}-h`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={INK} stopOpacity={0.55} />
            <Stop offset="0.6" stopColor={INK} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#dx-hero-${art}-h)`} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#dx-hero-${art}-v)`} />
      </Svg>

      <View style={s.body}>
        <Reanimated.View entering={reduce ? undefined : FadeInDown.delay(80).duration(380)} style={{ gap: 6 }}>
          {eyebrow ? (
            <T variant="caption" style={{ color: accent, fontFamily: font.bold }}>
              {eyebrow}
            </T>
          ) : null}
          <T variant="display" style={s.title} accessibilityRole="header">
            {title}
          </T>
          {lead ? <T style={s.lead}>{lead}</T> : null}
        </Reanimated.View>
        {chips && chips.length > 0 ? (
          <Reanimated.View entering={reduce ? undefined : FadeInDown.delay(160).duration(380)} style={s.chips}>
            {chips.map((chip) => (
              <View key={chip.label} style={s.chip}>
                <Icon name={chip.icon} size={13} color={accent} strokeWidth={2.4} />
                <T variant="caption" style={s.chipText}>
                  {chip.label}
                </T>
              </View>
            ))}
          </Reanimated.View>
        ) : null}
        {children}
      </View>
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  card: {
    minHeight: 280,
    borderRadius: radius.hero,
    overflow: 'hidden',
    backgroundColor: INK,
    justifyContent: 'flex-end',
    shadowColor: '#2E1A47',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  body: { padding: space.xl, paddingTop: 150, gap: space.md },
  title: { color: '#FFFFFF', fontSize: 30, lineHeight: 35 },
  lead: { color: 'rgba(255,255,255,0.78)', fontSize: 15, lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.chip,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  chipText: { color: '#FFFFFF', fontFamily: font.semibold },
});
