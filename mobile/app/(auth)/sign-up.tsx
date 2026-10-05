import { useRef, useState } from 'react';
import { type TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/auth/context';
import { Field } from '../../src/ui/Controls';
import { Button } from '../../src/ui/Button';
import { AuthLink, AuthShell, FormMessage } from '../../src/account/AuthShell';
import { formErrors, looksLikeEmail, MIN_PASSWORD } from '../../src/account/forms';

/**
 * SIGN UP (SCREENS #2, FR-A1). Name, email, password — three fields, nothing
 * else. The verification code is already on its way when this returns; the
 * next screen asks for it but never blocks the app.
 */
export default function SignUp() {
  const router = useRouter();
  const { register } = useAuth();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<{ name?: string; email?: string; password?: string }>({});

  const server = formErrors(error, ['name', 'email', 'password']);

  const submit = async () => {
    const next: typeof local = {};
    if (name.trim().length === 0) next.name = 'Enter your name — your household sees it on items you handle.';
    if (!looksLikeEmail(email)) next.email = 'Enter an email address you can open now.';
    if (password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`;
    setLocal(next);
    if (next.name || next.email || next.password) return;

    setPending(true);
    setError(null);
    try {
      await register({ name: name.trim(), email: email.trim().toLowerCase(), password });
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
        label="Your name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
        error={local.name ?? server.fields.name}
        testID="sign-up-name"
      />
      <Field
        ref={emailRef}
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
