import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { makeStyles, space } from '../../src/theme/tokens';
import { Screen } from '../../src/ui/Screen';
import { T } from '../../src/ui/Text';
import { Button } from '../../src/ui/Button';
import { TrayHero } from '../../src/ui/artwork';
import { Brand, AuthLink } from '../../src/account/AuthShell';
import { SocialButtons } from '../../src/account/SocialButtons';

/**
 * WELCOME (SCREENS #1, FR-A1). Mark, the tray, one sentence, then the ways
 * in. Apple first where it exists; otherwise email is the primary. Scrolls,
 * so a large type size on a small phone still reaches every button — but at
 * the default size every way in, "I have an account" included, fits on a
 * 640pt phone: the tray shrinks there instead of pushing the links off.
 */
export default function Welcome() {
  const router = useRouter();
  const s = useStyles();
  const [hasSocial, setHasSocial] = useState(false);
  const [busy, setBusy] = useState(false);
  const { height } = useWindowDimensions();
  const compact = height < 700;

  return (
    <Screen testID="screen-welcome" contentStyle={[s.content, compact && { gap: space.lg }]}>
      <Brand />
      <View style={s.hero}>
        <TrayHero size={compact ? 140 : 210} />
        <T variant="display" align="center" accessibilityRole="header" style={[s.line, compact && { fontSize: 26, lineHeight: 31 }]}>
          Snap the letter. We’ll remember the date.
        </T>
        <T tone="muted" align="center" style={s.lead}>
          Duebox reads renewals, bills and forms, and reminds you before every deadline — not on the day.
        </T>
      </View>

      <View style={s.ways}>
        <SocialButtons primaryFirst onLoaded={(list) => setHasSocial(list.length > 0)} onBusy={setBusy} />
        <Button
          testID="welcome-email"
          label="Continue with email"
          icon="mail"
          tone={hasSocial ? 'secondary' : 'primary'}
          disabled={busy}
          onPress={() => router.push('/(auth)/sign-up')}
        />
      </View>

      <AuthLink lead="Already using Duebox?" label="I have an account" onPress={() => router.push('/(auth)/sign-in')} testID="welcome-sign-in" />
      <AuthLink lead="Not sure yet?" label="See how it works" onPress={() => router.push('/discover')} testID="welcome-discover" />

      <T variant="caption" tone="faint" align="center">
        By continuing you agree to the{' '}
        <T variant="caption" tone="brand" accessibilityRole="link" onPress={() => router.push('/legal/terms')} style={s.link}>
          Terms
        </T>{' '}
        and{' '}
        <T variant="caption" tone="brand" accessibilityRole="link" onPress={() => router.push('/legal/privacy')} style={s.link}>
          Privacy Policy
        </T>
        .
      </T>
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  // No paddingTop here: Screen owns the safe-area inset and a later style would replace it.
  content: { gap: space.xl },
  hero: { alignItems: 'center', gap: space.md, paddingTop: space.sm },
  line: { maxWidth: 340 },
  lead: { maxWidth: 340 },
  // The buttons straight on the page, like sign-in and sign-up — no card around them.
  ways: { gap: space.sm },
  link: { textDecorationLine: 'underline' },
}));
