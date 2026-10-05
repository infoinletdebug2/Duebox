import { useRef, useState } from 'react';
import { type TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../src/api/client';
import { Field } from '../../src/ui/Controls';
import { Button } from '../../src/ui/Button';
import { T } from '../../src/ui/Text';
import { AuthShell, FormMessage } from '../../src/account/AuthShell';
import { formErrors, looksLikeEmail, MIN_PASSWORD } from '../../src/account/forms';
import { CodeField } from '../../src/account/CodeField';

/**
 * RESET PASSWORD — two ways in, one form:
 *   - the email's link (`duebox://reset-password?token=…&email=…`), code prefilled;
 *   - "I have a code" from Forgot password or Account, email carried over,
 *     the 6-digit code typed here.
 * The platform keys a reset by (email, code), so both always travel together.
 */
export default function ResetPassword() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[]; email?: string | string[] }>();
  const linkToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const linkEmail = Array.isArray(params.email) ? params.email[0] : params.email;
  const [code, setCode] = useState(linkToken ?? '');
  const [email] = useState((linkEmail ?? '').trim().toLowerCase());
  const confirmRef = useRef<TextInput>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<{ password?: string; confirm?: string; code?: string }>({});
  const [done, setDone] = useState(false);

  const server = formErrors(error, ['password', 'code']);

  const submit = async () => {
    const next: typeof local = {};
    if (password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`;
    if (confirm !== password) next.confirm = 'Those two don’t match.';
    if (!code.trim()) next.code = 'Enter the code from your email.';
    setLocal(next);
    if (next.password || next.confirm || next.code) return;

    setPending(true);
    setError(null);
    try {
      await api.anonymous.post<{ reset: boolean }>('/auth/reset-password', { token: code.trim(), email, password });
      setDone(true);
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  };

  if (!looksLikeEmail(email)) {
    return (
      <AuthShell title="Start from your email" lead="We need to know which account this is for. Ask for a fresh code — it only takes a moment." testID="screen-reset-missing">
        <Button label="Send a new link" onPress={() => router.replace('/(auth)/forgot-password')} testID="reset-new-link" />
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password changed" lead="Sign in with your new password." back={false} testID="screen-reset-done">
        <Button label="Sign in" onPress={() => router.replace('/(auth)/sign-in')} testID="reset-sign-in" />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" lead={`We sent a code to ${email}. At least ${MIN_PASSWORD} characters for the new password.`} onBack={() => router.replace('/(auth)/welcome')} testID="screen-reset">
      {!linkToken ? (
        <CodeField value={code} onChange={setCode} error={local.code ?? server.fields.code} testID="reset-code" />
      ) : null}
      <Field
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
      <FormMessage message={server.general} />
      {server.general ? (
        <T variant="caption" tone="brand" accessibilityRole="link" onPress={() => router.replace({ pathname: '/(auth)/forgot-password', params: { email } })}>
          Code expired? Send a new one.
        </T>
      ) : null}
      <Button label="Save new password" onPress={() => void submit()} loading={pending} testID="reset-submit" />
    </AuthShell>
  );
}
