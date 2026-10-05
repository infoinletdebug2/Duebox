import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { font, makeStyles, radius, space } from '../theme/tokens';
import { T } from '../ui/Text';

/**
 * A six-box code field.
 *
 * The boxes are drawings; the real input is ONE TextInput laid over them,
 * full size, opacity 0 (traps.md: an input parked off-screen is not
 * hit-testable on Android, so tapping the boxes would open no keyboard).
 * `color: transparent` as well, because some Android keyboards refuse to
 * attach to an input they consider invisible. One input also means paste and
 * the iOS "From Messages" suggestion fill all six boxes at once.
 */
interface CodeFieldProps {
  value: string;
  onChange: (code: string) => void;
  length?: number;
  error?: string;
  disabled?: boolean;
  testID?: string;
}

export const CodeField = forwardRef<TextInput, CodeFieldProps>(function CodeField({ value, onChange, length = 6, error, disabled, testID }, ref) {
  const s = useStyles();
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, length - 1);

  return (
    <View style={{ gap: space.sm }}>
      <View style={s.row}>
        {Array.from({ length }, (_, i) => {
          const char = value[i] ?? '';
          const isActive = focused && i === active;
          return (
            <View key={i} style={[s.box, char ? s.filled : null, isActive && s.active, error ? s.errored : null]}>
              <T variant="title" style={{ fontFamily: font.display }}>
                {char}
              </T>
            </View>
          );
        })}
        <TextInput
          ref={ref}
          testID={testID}
          value={value}
          onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, length))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          inputMode="numeric"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={length}
          editable={!disabled}
          caretHidden
          selectionColor="transparent"
          accessibilityLabel={`Verification code, ${length} digits`}
          accessibilityHint="Type the code from your email"
          style={[StyleSheet.absoluteFill, s.overlay]}
        />
      </View>
      {error ? (
        <T variant="caption" tone="critical" align="center">
          {error}
        </T>
      ) : null}
    </View>
  );
});

const useStyles = makeStyles((c) => ({
  row: { flexDirection: 'row', gap: space.sm, justifyContent: 'center' },
  box: {
    flex: 1,
    maxWidth: 52,
    aspectRatio: 0.84,
    borderRadius: radius.input,
    backgroundColor: c.surfaceSunk,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filled: { backgroundColor: c.surface, borderColor: c.line },
  active: { borderColor: c.accent },
  errored: { borderColor: c.critical },
  overlay: { opacity: 0, color: 'transparent' },
}));
