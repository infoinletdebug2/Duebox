import { useRef, useState } from 'react';
import { type TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { registrationCompleted } from '../../src/lib/analytics';
import { SocialButtons } from '../../src/account/SocialButtons';
import { useAuth } from '../../src/auth/context';
import { Field, PasswordField } from '../../src/ui/Controls';
import { Button } from '../../src/ui/Button';
import { AuthLink, AuthShell, FormMessage, OrDivider } from '../../src/account/AuthShell';
import { formErrors, looksLikeEmail, MIN_PASSWORD } from '../../src/account/forms';
import { TRIAL_DAYS } from '../../src/config';

/**
 * SIGN UP (SCREENS #2, FR-A1). Name, email, password. The name is what the
 * household sees beside the things you handle; it can be changed later in
 * Settings. The verification code is already on its way when this returns;
 * the next screen asks for it but never blocks the app.
 *
 * Nothing is focused on arrival: the keyboard would cover Apple/Google and
 * the title before the person has chosen how to sign up.
 */
export default function SignUp() {
  const router = useRouter();
  const { register } = useAuth();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [hasSocial, setHasSocial] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<{ name?: string; email?: string; password?: string }>({});

  const server = formErrors(error, ['name', 'email', 'password']);

  const submit = async () => {
    const next: typeof local = {};
    if (name.trim().length === 0) next.name = 'Enter your name.';
    if (!looksLikeEmail(email)) next.email = 'Enter an email address you can open now.';
    if (password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`;
    setLocal(next);
    if (next.name || next.email || next.password) return;

    setPending(true);
    setError(null);
    try {
      await register({ name: name.trim().slice(0, 80), email: email.trim().toLowerCase(), password });
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
      lead="Snap a letter, and Duebox remembers the date for you."
      hero={{
        art: 'auth',
        eyebrow: 'Free to start · no card',
        chips: [
          { icon: 'scan', label: 'AI reads the date' },
          { icon: 'bell', label: 'Reminded before' },
          { icon: 'sparkles', label: `${TRIAL_DAYS} days of Pro` },
        ],
      }}
      testID="screen-sign-up"
      below={<AuthLink lead="Already have an account?" label="Sign in" onPress={() => router.replace('/(auth)/sign-in')} testID="sign-up-to-sign-in" />}
    >
      <SocialButtons onBusy={setPending} onLoaded={(list) => setHasSocial(list.length > 0)} />
      {hasSocial ? <OrDivider /> : null}
      <Field
        label="Your name"
        value={name}
        onChangeText={setName}
        placeholder="Alex Rivera"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => emailRef.current?.focus()}
        error={local.name ?? server.fields.name}
        testID="sign-up-name"
      />
      <Field
        ref={emailRef}
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={local.email ?? server.fields.email}
        testID="sign-up-email"
      />
      <PasswordField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
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
