import { useEffect, useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../src/api/client';
import { font, makeStyles, radius, space, useColors } from '../../src/theme/tokens';
import { Field, PasswordField } from '../../src/ui/Controls';
import { Button } from '../../src/ui/Button';
import { T } from '../../src/ui/Text';
import { Icon } from '../../src/ui/Icon';
import { AuthShell, FormMessage } from '../../src/account/AuthShell';
import { CodeField } from '../../src/account/CodeField';
import { formErrors, looksLikeEmail, MIN_PASSWORD } from '../../src/account/forms';

/**
 * RESET PASSWORD — step 2 of 2, with the 6-digit CODE from the email. The
 * platform's reset is code-based (a code keyed by email + purpose), not a
 * link, so the address travels with the code; it arrives prefilled from
 * Forgot password and shows as a line you can change, not a field to retype.
 *
 * Resend waits out a 60 s cooldown so a second tap doesn't burn the first code.
 */
const COOLDOWN = 60;

export default function ResetPassword() {
  const router = useRouter();
  const c = useColors();
  const s = useStyles();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const initialEmail = (Array.isArray(params.email) ? params.email[0] : params.email) ?? '';
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(initialEmail ? COOLDOWN : 0);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<{ email?: string; code?: string; password?: string; confirm?: string }>({});
  const [done, setDone] = useState(false);

  const server = formErrors(error, ['email', 'code', 'password']);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async () => {
    const next: typeof local = {};
    if (!looksLikeEmail(email)) next.email = 'Enter the email the code was sent to.';
    if (!/^[0-9]{6}$/.test(code)) next.code = 'Enter the 6-digit code from your email.';
    if (password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`;
    if (confirm !== password) next.confirm = 'Those two don’t match.';
    setLocal(next);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    setError(null);
    try {
      await api.anonymous.post<{ reset: boolean }>('/auth/reset-password', { email: email.trim().toLowerCase(), code, password });
      setDone(true);
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  };

  const resend = async () => {
    if (!looksLikeEmail(email)) {
      setLocal({ email: 'Enter the email the code was sent to.' });
      return;
    }
    setResending(true);
    setError(null);
    try {
      await api.anonymous.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
      setCode('');
      setResent(true);
      setCooldown(COOLDOWN);
    } catch (failure) {
      setError(failure);
    } finally {
      setResending(false);
    }
  };

  if (done) {
    return (
      <AuthShell
        title="Password changed"
        lead="You’re all set. Sign in with your new password."
        hero={{ art: 'account', eyebrow: 'Done' }}
        back={false}
        testID="screen-reset-done"
      >
        <View style={s.doneRow}>
          <View style={[s.doneIcon, { backgroundColor: c.goodSoft }]}>
            <Icon name="check" size={22} color={c.good} strokeWidth={2.6} />
          </View>
          <T tone="muted" style={{ flex: 1 }}>
            Your old password no longer works on any device.
          </T>
        </View>
        <Button label="Sign in" onPress={() => router.replace('/(auth)/sign-in')} testID="reset-sign-in" />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Check your email"
      lead="Enter the code we sent, then choose a new password."
      hero={{ art: 'account', eyebrow: 'Step 2 of 2' }}
      onBack={() => router.replace('/(auth)/sign-in')}
      testID="screen-reset"
    >
      {initialEmail ? (
        <View style={s.sentTo}>
          <Icon name="mail" size={16} color={c.brandInk} />
          <T variant="callout" numberOfLines={1} style={{ flex: 1 }}>
            {initialEmail}
          </T>
          <T
            variant="callout"
            tone="brand"
            accessibilityRole="link"
            onPress={() => router.replace({ pathname: '/(auth)/forgot-password', params: { email: initialEmail } })}
            suppressHighlighting
            style={{ fontFamily: font.semibold, paddingVertical: space.xs, paddingLeft: space.md }}
            testID="reset-change-email"
          >
            Change
          </T>
        </View>
      ) : (
        <Field
          bare
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          error={local.email ?? server.fields.email}
          testID="reset-email"
        />
      )}
      <View style={{ gap: space.sm }}>
        <CodeField
          value={code}
          onChange={(v) => {
            setCode(v);
            if (v.length === 6) passwordRef.current?.focus();
          }}
          error={local.code ?? server.fields.code}
          testID="reset-code"
        />
        <T
          variant="caption"
          tone={cooldown > 0 ? 'faint' : 'brand'}
          align="center"
          accessibilityRole="button"
          accessibilityState={{ disabled: cooldown > 0 || resending }}
          onPress={cooldown > 0 || resending ? undefined : () => void resend()}
          suppressHighlighting
          style={{ paddingVertical: space.sm, fontFamily: font.semibold }}
          testID="reset-resend"
        >
          {resending ? 'Sending…' : cooldown > 0 ? `Didn’t get it? Send a new code in ${cooldown} s` : 'Didn’t get it? Send a new code'}
        </T>
      </View>
      <PasswordField
        ref={passwordRef}
        bare
        label="New password"
        placeholder={`New password (${MIN_PASSWORD}+ characters)`}
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => confirmRef.current?.focus()}
        error={local.password ?? server.fields.password}
        testID="reset-password"
      />
      <PasswordField
        ref={confirmRef}
        bare
        label="Repeat new password"
        value={confirm}
        onChangeText={setConfirm}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        error={local.confirm}
        testID="reset-confirm"
      />
      <FormMessage message={server.general ?? (resent ? 'A new code is on its way. Use the newest one.' : undefined)} tone={server.general ? 'critical' : 'good'} />
      <Button label="Save new password" onPress={() => void submit()} loading={pending} testID="reset-submit" />
    </AuthShell>
  );
}

const useStyles = makeStyles((c) => ({
  sentTo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.md,
    paddingRight: space.xs,
    minHeight: 44,
    borderRadius: radius.input,
    backgroundColor: c.brandSoft,
  },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  doneIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
}));
