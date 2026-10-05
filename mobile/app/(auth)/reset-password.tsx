import { useRef, useState } from 'react';
import { type TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../src/api/client';
import { Field } from '../../src/ui/Controls';
import { Button } from '../../src/ui/Button';
import { T } from '../../src/ui/Text';
import { AuthShell, FormMessage } from '../../src/account/AuthShell';
import { CodeField } from '../../src/account/CodeField';
import { formErrors, looksLikeEmail, MIN_PASSWORD } from '../../src/account/forms';

/**
 * RESET PASSWORD — with the 6-digit CODE from the email. The platform's reset
 * is code-based (a code keyed by email + purpose), not a link, so the address
 * travels with the code; it arrives prefilled from Forgot password.
 */
export default function ResetPassword() {
  const router = useRouter();
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
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<{ email?: string; code?: string; password?: string; confirm?: string }>({});
  const [done, setDone] = useState(false);

  const server = formErrors(error, ['email', 'code', 'password']);

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
    } catch (failure) {
      setError(failure);
    } finally {
      setResending(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Password changed" lead="Sign in with your new password." back={false} testID="screen-reset-done">
        <Button label="Sign in" onPress={() => router.replace('/(auth)/sign-in')} testID="reset-sign-in" />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Enter your code"
      lead={initialEmail ? `We emailed a 6-digit code to ${initialEmail}.` : 'Enter the 6-digit code from your email and a new password.'}
      onBack={() => router.replace('/(auth)/sign-in')}
      testID="screen-reset"
    >
      {initialEmail ? null : (
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          error={local.email ?? server.fields.email}
          testID="reset-email"
        />
      )}
      <CodeField
        value={code}
        onChange={(v) => {
          setCode(v);
          if (v.length === 6) passwordRef.current?.focus();
        }}
        error={local.code ?? server.fields.code}
        testID="reset-code"
      />
      <Field
        ref={passwordRef}
        label="New password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
        error={local.password ?? server.fields.password}
        testID="reset-password"
      />
      <Field
        ref={confirmRef}
        label="Type it again"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        error={local.confirm}
        testID="reset-confirm"
      />
      <FormMessage message={server.general ?? (resent ? 'A new code is on its way. Use the newest one.' : undefined)} />
      <Button label="Save new password" onPress={() => void submit()} loading={pending} testID="reset-submit" />
      <T variant="caption" tone="brand" accessibilityRole="button" onPress={() => void resend()} testID="reset-resend">
        {resending ? 'Sending…' : 'No code? Send a new one'}
      </T>
    </AuthShell>
  );
}
