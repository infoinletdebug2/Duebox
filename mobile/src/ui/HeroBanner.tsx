import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Reanimated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { font, radius, space } from '../theme/tokens';
import { T } from './Text';
import { Icon, type IconName } from './Icon';

/**
 * The hero banner — the discovery pitch's visual language, brought to the
 * quieter screens (account, export, household…): a compact deep-plum card
 * with the screen's title and one sentence beside a tile of the generated 3D
 * artwork, and optional chips for the two or three facts that matter.
 *
 * Compact on purpose: as a 300pt+ picture with the title on its fade, it
 * pushed every settings screen's actual controls (the password fields, the
 * member list, the switches) below the fold.
 *
 * It is a dark card on purpose: it reads the same on the light and the dark
 * theme, so there is one artwork per screen, not two.
 *
 * Artwork: assets/hero/*.jpg (prompts in assets/source/PROMPT.md).
 */

export const HERO = {
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
    <Reanimated.View entering={reduce ? undefined : FadeIn.duration(320)} style={s.card} testID={testID}>
      <View style={s.row}>
        <Reanimated.View entering={reduce ? undefined : FadeInDown.delay(60).duration(320)} style={s.words}>
          {eyebrow ? (
            <T variant="caption" style={{ color: accent, fontFamily: font.bold }}>
              {eyebrow}
            </T>
          ) : null}
          <T variant="display" style={s.title} accessibilityRole="header" numberOfLines={2}>
            {title}
          </T>
          {lead ? (
            // Never truncated: on Subscription this sentence is what happens when the plan ends.
            <T style={s.lead}>
              {lead}
            </T>
          ) : null}
        </Reanimated.View>
        <Image source={HERO[art]} style={s.tile} contentFit="cover" contentPosition="right" accessibilityElementsHidden importantForAccessibility="no" />
      </View>
      {chips && chips.length > 0 ? (
        <Reanimated.View entering={reduce ? undefined : FadeInDown.delay(120).duration(320)} style={s.chips}>
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
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: INK,
    padding: space.lg,
    gap: space.md,
    boxShadow: '0px 8px 24px rgba(46, 26, 71, 0.18)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  words: { flex: 1, gap: 4 },
  title: { color: '#FFFFFF', fontSize: 22, lineHeight: 27 },
  lead: { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 20 },
  tile: { width: 72, height: 72, borderRadius: radius.tile, borderCurve: 'continuous', backgroundColor: '#2E1A47' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.chip,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  chipText: { color: '#FFFFFF', fontFamily: font.semibold },
});
