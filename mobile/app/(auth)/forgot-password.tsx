import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../src/api/client';
import { Field } from '../../src/ui/Controls';
import { Button } from '../../src/ui/Button';
import { T } from '../../src/ui/Text';
import { AuthLink, AuthShell, FormMessage } from '../../src/account/AuthShell';
import { formErrors, looksLikeEmail } from '../../src/account/forms';

/**
 * FORGOT PASSWORD (SCREENS #2). One field. The server answers the same way
 * whether or not the address has an account (no existence oracle), so this
 * screen does too. The email carries a code (and a link that opens
 * reset-password with it); "Enter the code" goes there with the email.
 */
export default function ForgotPassword() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<string | undefined>();
  const [sent, setSent] = useState<string | null>(null);

  const server = formErrors(error, ['email']);

  const submit = async () => {
    if (!looksLikeEmail(email)) {
      setLocal('Enter the email you signed up with.');
      return;
    }
    setLocal(undefined);
    setPending(true);
    setError(null);
    try {
      const result = await api.anonymous.post<{ sent: boolean; message: string }>('/auth/forgot-password', { email: email.trim().toLowerCase() });
      setSent(result.message || 'If that address has an account, a reset link is on its way.');
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        lead={sent}
        testID="screen-forgot-sent"
        below={<AuthLink label="Use a different email" onPress={() => setSent(null)} />}
      >
        <T tone="muted">Open the link on this phone, or type the code here. Codes work once, so use the newest one.</T>
        <Button label="Enter the code" onPress={() => router.push({ pathname: '/(auth)/reset-password', params: { email: email.trim().toLowerCase() } })} testID="forgot-enter-code" />
        <Button label="Back to sign in" tone="quiet" onPress={() => router.replace('/(auth)/sign-in')} testID="forgot-back" />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" lead="Enter your email and we’ll send a code to choose a new one." testID="screen-forgot">
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={() => void submit()}
        error={local ?? server.fields.email}
        testID="forgot-email"
      />
      <FormMessage message={server.general} />
      <Button label="Send reset code" onPress={() => void submit()} loading={pending} testID="forgot-submit" />
      <T variant="caption" tone="faint">
        Signed up with Apple or Google? You don’t have a Duebox password — use that button on the sign-in screen instead.
      </T>
    </AuthShell>
  );
}
