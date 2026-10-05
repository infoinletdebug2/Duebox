import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { type, useColors } from '../theme/tokens';

type Variant = keyof typeof type;
type Tone = 'text' | 'muted' | 'faint' | 'brand' | 'onBrand' | 'onBrandMuted' | 'good' | 'warn' | 'critical' | 'accentInk';

interface Props extends TextProps {
  variant?: Variant;
  tone?: Tone;
  align?: TextStyle['textAlign'];
  /** Tabular figures — on by default for every role (DESIGN-SYSTEM §4). */
  tabular?: boolean;
}

/** The only Text in the app. Roles, not sizes. */
export function T({ variant = 'body', tone = 'text', align, tabular = true, style, ...rest }: Props) {
  const c = useColors();
  const color = {
    text: c.text,
    muted: c.textMuted,
    faint: c.textFaint,
    brand: c.brandInk,
    onBrand: c.onBrand,
    onBrandMuted: c.onBrandMuted,
    good: c.good,
    warn: c.warn,
    critical: c.critical,
    accentInk: c.accentInk,
  }[tone];
  return (
    <RNText
      maxFontSizeMultiplier={2}
      {...rest}
      style={[type[variant], { color, textAlign: align }, tabular ? { fontVariant: ['tabular-nums'] } : null, style]}
    />
  );
}
