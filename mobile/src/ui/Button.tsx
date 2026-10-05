import { ActivityIndicator, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { makeStyles, radius, space, TOUCH, useColors } from '../theme/tokens';
import { T } from './Text';
import { Icon, type IconName } from './Icon';

/** A pressable with a pressed-state dim and a 44pt minimum target. */
export function Press({ style, children, ...rest }: PressableProps & { style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      hitSlop={6}
      {...rest}
      style={({ pressed }) => [style, pressed && !rest.disabled ? { opacity: 0.72 } : null, rest.disabled ? { opacity: 0.45 } : null]}
    >
      {children as React.ReactNode}
    </Pressable>
  );
}

export function tap(kind: 'light' | 'success' = 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'success') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

/** `ink` is Apple's sign-in style: black on light, white on dark (HIG). */
type Tone = 'primary' | 'secondary' | 'quiet' | 'destructive' | 'ink';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  tone?: Tone;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  small?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * One primary (accent) button per screen. Text on accent is ink, never white
 * (DESIGN-SYSTEM §3: contrast 10:1).
 */
export function Button({ label, onPress, tone = 'primary', icon, loading, disabled, full = true, small, testID, style }: ButtonProps) {
  const c = useColors();
  const s = useStyles();
  const fg =
    tone === 'primary' ? c.accentInk : tone === 'ink' ? (c.scheme === 'dark' ? '#000000' : '#FFFFFF') : tone === 'destructive' ? c.critical : c.brandInk;
  return (
    <Press
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || loading}
      style={[s.base, small && s.small, full && s.full, s[tone], style]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={s.row}>
          {icon ? <Icon name={icon} size={small ? 16 : 19} color={fg} /> : null}
          <T variant="callout" style={[{ color: fg, fontFamily: 'Manrope_600SemiBold' }]}>
            {label}
          </T>
        </View>
      )}
    </Press>
  );
}

/** A round icon-only button. */
export function IconButton({ icon, onPress, label, tone = 'quiet', size = 40 }: { icon: IconName; onPress?: () => void; label: string; tone?: 'quiet' | 'soft' | 'brand'; size?: number }) {
  const c = useColors();
  const bg = tone === 'soft' ? c.brandSoft : tone === 'brand' ? 'rgba(255,255,255,0.14)' : 'transparent';
  const fg = tone === 'brand' ? c.onBrand : c.text;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: Math.max(size, TOUCH), height: Math.max(size, TOUCH), alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={Math.round(size * 0.5)} color={fg} />
      </View>
    </Press>
  );
}

const useStyles = makeStyles((c) => ({
  base: {
    minHeight: 52,
    borderRadius: radius.button,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: { minHeight: 40, paddingHorizontal: space.lg, borderRadius: radius.input },
  full: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  primary: { backgroundColor: c.accent },
  secondary: { backgroundColor: c.brandSoft },
  quiet: { backgroundColor: 'transparent' },
  destructive: { backgroundColor: 'transparent', borderWidth: 1.25, borderColor: c.critical },
  ink: { backgroundColor: c.scheme === 'dark' ? '#FFFFFF' : '#000000' },
}));
