import { useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { font, makeStyles, radius, space, useColors } from '../theme/tokens';
import { Screen, Header } from '../ui/Screen';
import { T } from '../ui/Text';
import { Icon } from '../ui/Icon';
import { FieldTone } from '../ui/Controls';
import { Mark } from '../ui/artwork';
import { HERO, type HeroChip, type HeroName } from '../ui/HeroBanner';

export { Mark };

/**
 * The shape every auth screen shares: back → the title block (an eyebrow, one
 * line of display type, one quieter sentence; on sign-in/up a small tile of
 * the discovery artwork beside it) → the form straight on the page, fields
 * raised in white so they read as "fill me in". Always a keyboard-aware
 * scroll view: on a short phone the keyboard leaves ~300pt and the submit
 * must stay reachable.
 *
 * The artwork is a tile, not a banner, on purpose: a 280pt picture above a
 * form pushed the fields under the fold and made every phone scroll before
 * typing a letter.
 */

/** Mark + wordmark, the top line of every signed-out screen. */
export function Brand() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Mark size={32} />
      <T variant="title">Duebox</T>
    </View>
  );
}

interface AuthShellProps {
  /** The one display line. */
  title: string;
  /** A quieter sentence under it. */
  lead?: string;
  /** Optional drawing between the brand and the title. */
  art?: React.ReactNode;
  /** The discovery artwork as a small tile beside the title, an eyebrow above it, a few facts under it (replaces `art`). */
  hero?: { art: HeroName; eyebrow?: string; chips?: HeroChip[] };
  /** Show a back chevron (everything but welcome). */
  back?: boolean;
  onBack?: () => void;
  /** The form — drawn inside the card. */
  children: React.ReactNode;
  /** Quiet links under the card ("I have an account"). */
  below?: React.ReactNode;
  testID?: string;
}

export function AuthShell({ title, lead, art, hero, back = true, onBack, children, below, testID }: AuthShellProps) {
  const s = useStyles();
  const c = useColors();
  // On a short phone (SE-class, 640pt) the form must fit without scrolling: the title stays, the extras go.
  const compact = useWindowDimensions().height < 700;
  return (
    <Screen form header={back ? <Header onBack={onBack} /> : undefined} contentStyle={compact ? { gap: space.lg } : undefined} testID={testID}>
      {hero ? (
        <View style={s.heroTop}>
          <View style={s.titleRow}>
            <View style={{ flex: 1, gap: space.xs }}>
              {hero.eyebrow ? (
                <T variant="caption" tone="brand" style={{ fontFamily: font.bold }}>
                  {hero.eyebrow}
                </T>
              ) : null}
              <T variant="display" accessibilityRole="header">
                {title}
              </T>
            </View>
            <Image
              source={HERO[hero.art]}
              style={[s.tile, compact && { width: 60, height: 60, borderRadius: radius.tile }]}
              contentFit="cover"
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </View>
          {lead && !compact ? <T tone="muted">{lead}</T> : null}
          {hero.chips && hero.chips.length > 0 && !compact ? (
            <View style={s.chips}>
              {hero.chips.map((chip) => (
                <View key={chip.label} style={s.chip}>
                  <Icon name={chip.icon} size={14} color={c.brandInk} strokeWidth={2.2} />
                  <T variant="caption" style={{ fontFamily: font.semibold }}>
                    {chip.label}
                  </T>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={s.top}>
          <Brand />
          {art ? <View style={s.art}>{art}</View> : null}
          <View style={{ gap: space.sm }}>
            <T variant="display" accessibilityRole="header">
              {title}
            </T>
            {lead ? <T tone="muted">{lead}</T> : null}
          </View>
        </View>
      )}
      <FieldTone.Provider value="raised">
        <View style={[s.form, compact && { gap: space.md }]}>{children}</View>
      </FieldTone.Provider>
      {below ? <View style={s.below}>{below}</View> : null}
    </Screen>
  );
}

/** A line of muted text with one tappable link in it. */
export function AuthLink({ lead, label, onPress, testID }: { lead?: string; label: string; onPress: () => void; testID?: string }) {
  return (
    <T variant="callout" tone="muted" align="center">
      {lead ? `${lead} ` : ''}
      <T
        variant="callout"
        tone="brand"
        onPress={onPress}
        accessibilityRole="link"
        testID={testID}
        style={{ fontFamily: 'Manrope_600SemiBold', textDecorationLine: 'underline' }}
        suppressHighlighting
      >
        {label}
      </T>
    </T>
  );
}

/** "or with email" between the Apple/Google buttons and the form. */
export function OrDivider({ label = 'or with email' }: { label?: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
      <T variant="caption" tone="faint">
        {label}
      </T>
      <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
    </View>
  );
}

/** A server message that names no field — shown once, above the submit. */
export function FormMessage({ message, tone = 'critical' }: { message: string | null | undefined; tone?: 'critical' | 'good' | 'muted' }) {
  if (!message) return null;
  return (
    <T variant="caption" tone={tone} accessibilityLiveRegion="polite" accessibilityRole="alert">
      {message}
    </T>
  );
}

const useStyles = makeStyles((c) => ({
  top: { gap: space.xl, paddingTop: space.lg },
  art: { alignItems: 'center', paddingVertical: space.sm },
  heroTop: { gap: space.md, paddingTop: space.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  tile: { width: 76, height: 76, borderRadius: radius.group, borderCurve: 'continuous', backgroundColor: '#1E1229' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.chip,
    backgroundColor: c.brandSoft,
  },
  form: { gap: space.lg },
  below: { gap: space.md, alignItems: 'center' },
}));
