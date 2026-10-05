import { View } from 'react-native';
import { makeStyles, radius, space } from '../theme/tokens';
import { Screen, Header } from '../ui/Screen';
import { T } from '../ui/Text';
import { Mark } from '../ui/artwork';
import { HeroBanner, type HeroChip, type HeroName } from '../ui/HeroBanner';

export { Mark };

/**
 * The shape every auth screen shares (visual-system.md, "Auth screens need a
 * shape"): mark → one drawing or none → one line of display type carrying the
 * sentence that matters → the form in a card, so what you fill in is
 * separated from what you read. Always a keyboard-aware scroll view: on a
 * short phone the keyboard leaves ~300pt and the submit must stay reachable.
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
  /** The discovery-style banner: generated art with the title on it (replaces `art`). */
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
  return (
    <Screen form header={back ? <Header onBack={onBack} /> : undefined} testID={testID}>
      {hero ? (
        <View style={s.top}>
          <Brand />
          <HeroBanner art={hero.art} eyebrow={hero.eyebrow} title={title} lead={lead} chips={hero.chips} />
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
      <View style={s.card}>{children}</View>
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
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: c.line,
    padding: space.xl,
    gap: space.lg,
  },
  below: { gap: space.md, alignItems: 'center' },
}));
