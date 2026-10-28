import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../src/api/client';
import { space, useColors } from '../../src/theme/tokens';
import { Field } from '../../src/ui/Controls';
import { Button } from '../../src/ui/Button';
import { T } from '../../src/ui/Text';
import { Icon } from '../../src/ui/Icon';
import { AuthLink, AuthShell, FormMessage } from '../../src/account/AuthShell';
import { formErrors, looksLikeEmail } from '../../src/account/forms';

/**
 * FORGOT PASSWORD — step 1 of 2. One field. The server answers the same way
 * whether or not the address has an account (no existence oracle), so this
 * screen does too. The platform emails a 6-digit CODE (not a link), so the
 * next step is the code screen, with the address carried along.
 */
export default function ForgotPassword() {
  const router = useRouter();
  const c = useColors();
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
    <AuthShell
      title="Forgot your password?"
      lead="Enter your email. We’ll send a 6-digit code to set a new one."
      hero={{ art: 'account', eyebrow: 'Step 1 of 2' }}
      testID="screen-forgot"
      below={
        <AuthLink
          lead="Got a code already?"
          label="Enter it"
          onPress={() => router.push({ pathname: '/(auth)/reset-password', params: email ? { email: email.trim().toLowerCase() } : {} })}
          testID="forgot-have-code"
        />
      }
    >
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
        returnKeyType="send"
        onSubmitEditing={() => void submit()}
        error={local ?? server.fields.email}
        testID="forgot-email"
      />
      <FormMessage message={server.general} />
      <Button label="Send code" onPress={() => void submit()} loading={pending} testID="forgot-submit" />
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
        <Icon name="info" size={16} color={c.textFaint} />
        <T variant="caption" tone="muted" style={{ flex: 1 }}>
          Signed up with Apple or Google? You don’t have a Duebox password — sign in with that button instead.
        </T>
      </View>
    </AuthShell>
  );
}
