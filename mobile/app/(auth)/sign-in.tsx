import { useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/auth/context';
import { space } from '../../src/theme/tokens';
import { Field } from '../../src/ui/Controls';
import { Button } from '../../src/ui/Button';
import { T } from '../../src/ui/Text';
import { AuthLink, AuthShell, FormMessage } from '../../src/account/AuthShell';
import { SocialButtons } from '../../src/account/SocialButtons';
import { formErrors, looksLikeEmail } from '../../src/account/forms';
import { routeAfterAuth } from '../../src/account/pendingJoin';

/**
 * SIGN IN (SCREENS #2, FR-A1). Email + password in a card; Apple / Google
 * underneath for the people who came in that way. A wrong password is one
 * sentence above the button — never which half was wrong.
 */
export default function SignIn() {
  const router = useRouter();
  const { signIn } = useAuth();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<{ email?: string; password?: string }>({});

  const server = formErrors(error, ['email', 'password']);

  const submit = async () => {
    const next: typeof local = {};
    if (!looksLikeEmail(email)) next.email = 'Enter the email you signed up with.';
    if (password.length === 0) next.password = 'Enter your password.';
    setLocal(next);
    if (next.email || next.password) return;

    setPending(true);
    setError(null);
    try {
      await signIn(email.trim().toLowerCase(), password);
      await routeAfterAuth(router);
    } catch (failure) {
      setError(failure);
      setPending(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      lead="Your deadlines are where you left them."
      hero={{ art: 'auth', eyebrow: 'Sign in' }}
      testID="screen-sign-in"
      below={<AuthLink lead="New here?" label="Create an account" onPress={() => router.replace('/(auth)/sign-up')} />}
    >
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={local.email ?? server.fields.email}
        testID="sign-in-email"
      />
      <View style={{ gap: space.xs }}>
        <Field
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          error={local.password ?? server.fields.password}
          testID="sign-in-password"
        />
        <T
          variant="caption"
          tone="brand"
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/(auth)/forgot-password', params: email ? { email } : {} })}
          style={{ alignSelf: 'flex-end', paddingVertical: space.sm, fontFamily: 'Manrope_600SemiBold' }}
        >
          Forgot password?
        </T>
      </View>
      <FormMessage message={server.general} />
      <Button label="Sign in" onPress={() => void submit()} loading={pending} testID="sign-in-submit" />
      <SocialButtons onBusy={setPending} />
    </AuthShell>
  );
}
