import { useRef, useState } from 'react';
import { registrationCompleted } from '../../src/lib/analytics';
import { type TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/auth/context';
import { Field } from '../../src/ui/Controls';
import { Button } from '../../src/ui/Button';
import { AuthLink, AuthShell, FormMessage } from '../../src/account/AuthShell';
import { formErrors, looksLikeEmail, MIN_PASSWORD } from '../../src/account/forms';

/**
 * SIGN UP (SCREENS #2, FR-A1). Email and password — nothing else. No name is
 * asked: the server derives a readable one from the address, and it can be
 * changed later in Settings. The verification code is already on its way
 * when this returns; the next screen asks for it but never blocks the app.
 */
export default function SignUp() {
  const router = useRouter();
  const { register } = useAuth();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<{ email?: string; password?: string }>({});

  const server = formErrors(error, ['email', 'password']);

  const submit = async () => {
    const next: typeof local = {};
    if (!looksLikeEmail(email)) next.email = 'Enter an email address you can open now.';
    if (password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`;
    setLocal(next);
    if (next.email || next.password) return;

    setPending(true);
    setError(null);
    try {
      await register({ email: email.trim().toLowerCase(), password });
      registrationCompleted('email');
      router.replace('/(auth)/verify');
    } catch (failure) {
      setError(failure);
      setPending(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      lead="Free for your first 5 deadlines. No card needed."
      testID="screen-sign-up"
      below={<AuthLink lead="Already have an account?" label="Sign in" onPress={() => router.replace('/(auth)/sign-in')} />}
    >
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        autoFocus
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={local.email ?? server.fields.email}
        testID="sign-up-email"
      />
      <Field
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        hint={`At least ${MIN_PASSWORD} characters.`}
        error={local.password ?? server.fields.password}
        testID="sign-up-password"
      />
      <FormMessage message={server.general} />
      <Button label="Create account" onPress={() => void submit()} loading={pending} testID="sign-up-submit" />
    </AuthShell>
  );
}
