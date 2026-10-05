import { useRef, useState } from 'react';
import { type TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../src/api/client';
import { Field } from '../../src/ui/Controls';
import { Button } from '../../src/ui/Button';
import { T } from '../../src/ui/Text';
import { AuthShell, FormMessage } from '../../src/account/AuthShell';
import { formErrors, MIN_PASSWORD } from '../../src/account/forms';

/**
 * RESET PASSWORD — where `duebox://reset-password?token=…` lands. The
 * token is single-use; a link opened twice, or one that lost its token on
 * the way, gets a way to ask for a new one instead of a dead form.
 */
export default function ResetPassword() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const confirmRef = useRef<TextInput>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<{ password?: string; confirm?: string }>({});
  const [done, setDone] = useState(false);

  const server = formErrors(error, ['password']);

  const submit = async () => {
    const next: typeof local = {};
    if (password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`;
    if (confirm !== password) next.confirm = 'Those two don’t match.';
    setLocal(next);
    if (next.password || next.confirm || !token) return;

    setPending(true);
    setError(null);
    try {
      await api.anonymous.post<{ reset: boolean }>('/auth/reset-password', { token, password });
      setDone(true);
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="That link is incomplete" lead="The reset link didn’t carry its code. Ask for a fresh one — it only takes a moment." testID="screen-reset-missing">
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
    <AuthShell title="Choose a new password" lead={`At least ${MIN_PASSWORD} characters. You’ll sign in with it next.`} onBack={() => router.replace('/(auth)/welcome')} testID="screen-reset">
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
        <T variant="caption" tone="brand" accessibilityRole="link" onPress={() => router.replace('/(auth)/forgot-password')}>
          Link expired? Send a new one.
        </T>
      ) : null}
      <Button label="Save new password" onPress={() => void submit()} loading={pending} testID="reset-submit" />
    </AuthShell>
  );
}
