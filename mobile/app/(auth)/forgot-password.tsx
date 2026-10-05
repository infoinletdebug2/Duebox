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
 * screen does too. The platform emails a 6-digit CODE (not a link), so the
 * next step is the code screen, with the address carried along.
 */
export default function ForgotPassword() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<string | undefined>();

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
      const address = email.trim().toLowerCase();
      await api.anonymous.post<{ sent: boolean; message: string }>('/auth/forgot-password', { email: address });
      router.push({ pathname: '/(auth)/reset-password', params: { email: address } });
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell title="Reset your password" lead="Enter your email and we’ll send a 6-digit code to choose a new one." testID="screen-forgot" below={<AuthLink label="I already have a code" onPress={() => router.push({ pathname: '/(auth)/reset-password', params: email ? { email: email.trim().toLowerCase() } : {} })} />}>
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
      <Button label="Send code" onPress={() => void submit()} loading={pending} testID="forgot-submit" />
      <T variant="caption" tone="faint">
        Used Apple or Google? Sign in with that button instead.
      </T>
    </AuthShell>
  );
}
