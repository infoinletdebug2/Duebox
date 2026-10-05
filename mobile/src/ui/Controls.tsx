import { forwardRef, useState } from 'react';
import { ScrollView, TextInput, View, type TextInputProps, type StyleProp, type ViewStyle } from 'react-native';
import { font, makeStyles, radius, space, useColors } from '../theme/tokens';
import { T } from './Text';
import { Press } from './Button';
import { Icon, type IconName } from './Icon';

/* ── text field ─────────────────────────────────────────────────────────── */

interface FieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

/** Label above, sunk input, error under (DESIGN-SYSTEM §6). */
export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, error, hint, containerStyle, style, ...rest }, ref) {
  const c = useColors();
  const s = useStyles();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: space.xs }, containerStyle]}>
      <T variant="caption" tone="muted">
        {label}
      </T>
      <TextInput
        ref={ref}
        placeholderTextColor={c.textFaint}
        selectionColor={c.brandInk}
        accessibilityLabel={label}
        maxFontSizeMultiplier={1.6}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[s.input, rest.multiline && s.multiline, focused && s.focused, error ? s.errored : null, style]}
      />
      {error ? (
        <T variant="caption" tone="critical">
          {error}
        </T>
      ) : hint ? (
        <T variant="caption" tone="faint">
          {hint}
        </T>
      ) : null}
    </View>
  );
});

/* ── chips ──────────────────────────────────────────────────────────────── */

export function Chip({ label, selected, onPress, icon, color }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; color?: string }) {
  const c = useColors();
  const s = useStyles();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={label}
      style={[s.chip, selected && { backgroundColor: c.brandInk, borderColor: c.brandInk }]}
    >
      {color ? <View style={[s.dot, { backgroundColor: color }]} /> : null}
      {icon ? <Icon name={icon} size={15} color={selected ? c.ground : c.textMuted} /> : null}
      <T variant="caption" style={{ color: selected ? c.ground : c.text }}>
        {label}
      </T>
    </Press>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingRight: space.lg }}>
      {children}
    </ScrollView>
  );
}

/* ── segmented ──────────────────────────────────────────────────────────── */

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const c = useColors();
  const s = useStyles();
  return (
    <View style={s.segTrack} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Press
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[s.segItem, active && s.segActive]}
          >
            <T variant="caption" style={{ color: active ? c.text : c.textMuted, fontFamily: active ? font.semibold : font.medium }}>
              {o.label}
            </T>
          </Press>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  input: {
    minHeight: 50,
    borderRadius: radius.input,
    backgroundColor: c.surfaceSunk,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    color: c.text,
    fontFamily: font.body,
    fontSize: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
    minWidth: 0,
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  focused: { borderColor: c.accent },
  errored: { borderColor: c.critical },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    height: 34,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.surface,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  segTrack: { flexDirection: 'row', backgroundColor: c.surfaceSunk, borderRadius: radius.input, padding: 3 },
  segItem: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.input - 3 },
  segActive: {
    backgroundColor: c.surface,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
}));
