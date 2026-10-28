import { useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/auth/context';
import { font, space } from '../../src/theme/tokens';
import { Field, PasswordField } from '../../src/ui/Controls';
import { Button } from '../../src/ui/Button';
import { T } from '../../src/ui/Text';
import { AuthLink, AuthShell, FormMessage, OrDivider } from '../../src/account/AuthShell';
import { SocialButtons } from '../../src/account/SocialButtons';
import { formErrors, looksLikeEmail } from '../../src/account/forms';
import { routeAfterAuth } from '../../src/account/pendingJoin';
import { signedIn } from '../../src/lib/analytics';

/**
 * SIGN IN (SCREENS #2, FR-A1). The same order as sign-up — Apple / Google,
 * "or with email", the form — so the two read as one pair. A wrong password
 * is one sentence above the button — never which half was wrong.
 */
export default function SignIn() {
  const router = useRouter();
  const { signIn } = useAuth();
  const passwordRef = useRef<TextInput>(null);
  const [hasSocial, setHasSocial] = useState(false);
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
      signedIn('email');
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
      below={<AuthLink lead="New here?" label="Create an account" onPress={() => router.replace('/(auth)/sign-up')} testID="sign-in-to-sign-up" />}
    >
      <SocialButtons onBusy={setPending} onLoaded={(list) => setHasSocial(list.length > 0)} />
      {hasSocial ? <OrDivider /> : null}
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
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={local.email ?? server.fields.email}
        testID="sign-in-email"
      />
      <View>
        <PasswordField
          ref={passwordRef}
          bare
          label="Password"
          value={password}
          onChangeText={setPassword}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          error={local.password ?? server.fields.password}
          testID="sign-in-password"
        />
        <T
          variant="callout"
          tone="brand"
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/(auth)/forgot-password', params: email ? { email } : {} })}
          suppressHighlighting
          style={{ alignSelf: 'flex-end', paddingVertical: space.md, paddingLeft: space.lg, fontFamily: font.semibold }}
          testID="sign-in-forgot"
        >
          Forgot password?
        </T>
      </View>
      <FormMessage message={server.general} />
      <Button label="Sign in" onPress={() => void submit()} loading={pending} testID="sign-in-submit" />
    </AuthShell>
  );
}
