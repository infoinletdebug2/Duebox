import { useEffect, useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/auth/context';
import { api } from '../../src/api/client';
import { space } from '../../src/theme/tokens';
import { Screen, Header } from '../../src/ui/Screen';
import { T } from '../../src/ui/Text';
import { Button } from '../../src/ui/Button';
import { Field } from '../../src/ui/Controls';
import { Group, ListRow } from '../../src/ui/Layout';
import { ErrorState } from '../../src/ui/Feedback';
import { ConfirmSheet, useToast } from '../../src/ui/Sheet';
import { FormMessage } from '../../src/account/AuthShell';
import { formErrors, MIN_PASSWORD } from '../../src/account/forms';

/**
 * ACCOUNT (SCREENS #12). Your name (your household sees it on items you
 * handle), your email (read-only — it is how you sign in), a
 * password change, and sign out.
 *
 * There is no "which kind of account am I" on the wire, so the password form
 * is always offered with a sentence for Apple / Google accounts, who have
 * no Duebox password to change.
 */
export default function Account() {
  const router = useRouter();
  const toast = useToast();
  const { me, refresh, signOut } = useAuth();

  const [name, setName] = useState(me?.user.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<unknown>(null);

  const newRef = useRef<TextInput>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [changing, setChanging] = useState(false);
  const [pwError, setPwError] = useState<unknown>(null);
  const [pwLocal, setPwLocal] = useState<{ current?: string; next?: string }>({});

  const [confirmOut, setConfirmOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // `me` can arrive after mount (a refresh on open): fill the field once it does.
  const seeded = useRef(Boolean(me));
  useEffect(() => {
    if (!seeded.current && me) {
      seeded.current = true;
      setName(me.user.name ?? '');
    }
  }, [me]);

  if (!me) {
    return (
      <Screen header={<Header title="Account" />}>
        <ErrorState error={new Error('Your account details didn’t load. Check your connection.')} onRetry={() => void refresh()} />
      </Screen>
    );
  }

  const nameErrors = formErrors(nameError, ['name']);
  const nameChanged = name.trim() !== (me.user.name ?? '') && name.trim().length > 0;

  const saveName = async () => {
    if (name.trim().length === 0) return;
    setSavingName(true);
    setNameError(null);
    try {
      await api.patch<{ name: string }>('/auth/me', { name: name.trim() });
      await refresh();
      toast({ message: 'Name saved.' });
    } catch (failure) {
      setNameError(failure);
    } finally {
      setSavingName(false);
    }
  };

  const pwErrors = formErrors(pwError, ['currentPassword', 'newPassword']);

  const changePassword = async () => {
    const local: typeof pwLocal = {};
    if (!current) local.current = 'Enter your current password.';
    if (next.length < MIN_PASSWORD) local.next = `Use at least ${MIN_PASSWORD} characters.`;
    setPwLocal(local);
    if (local.current || local.next) return;

    setChanging(true);
    setPwError(null);
    try {
      await api.post<{ changed: boolean }>('/auth/change-password', { currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      toast({ message: 'Password changed.' });
    } catch (failure) {
      setPwError(failure);
    } finally {
      setChanging(false);
    }
  };

  return (
    <Screen form header={<Header title="Account" />} testID="screen-account">
      <View style={{ gap: space.md }}>
        <Field
          label="Your name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
          maxLength={80}
          returnKeyType="done"
          onSubmitEditing={() => nameChanged && void saveName()}
          hint="Shown to the other members of your household."
          error={nameErrors.fields.name}
          testID="account-name"
        />
        <FormMessage message={nameErrors.general} />
        {nameChanged ? <Button label="Save name" onPress={() => void saveName()} loading={savingName} testID="account-save-name" /> : null}
      </View>

      <Group title="Sign-in">
        <ListRow icon="mail" title={me.user.email} subtitle={me.user.emailVerified ? 'Confirmed' : 'Not confirmed yet'} />
        {!me.user.emailVerified ? <ListRow icon="check" title="Confirm your email" onPress={() => router.push('/(auth)/verify')} testID="account-verify" /> : null}
      </Group>

      <View style={{ gap: space.md }}>
        <T variant="micro" tone="muted">
          Change password
        </T>
        <T variant="caption" tone="muted">
          If you sign in with Apple or Google, you don’t have a Duebox password — there’s nothing to change here.
        </T>
        <Field
          label="Current password"
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="next"
          onSubmitEditing={() => newRef.current?.focus()}
          error={pwLocal.current ?? pwErrors.fields.currentPassword}
          testID="account-current-password"
        />
        <Field
          ref={newRef}
          label="New password"
          value={next}
          onChangeText={setNext}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={() => void changePassword()}
          hint={`At least ${MIN_PASSWORD} characters.`}
          error={pwLocal.next ?? pwErrors.fields.newPassword}
          testID="account-new-password"
        />
        <FormMessage message={pwErrors.general} />
        <Button label="Change password" tone="secondary" onPress={() => void changePassword()} loading={changing} disabled={!current && !next} testID="account-change-password" />
      </View>

      <Group>
        <ListRow icon="logout" title="Sign out" chevron={false} onPress={() => setConfirmOut(true)} testID="account-sign-out" />
      </Group>

      <ConfirmSheet
        visible={confirmOut}
        onClose={() => setConfirmOut(false)}
        title="Sign out?"
        message={`Your documents stay safe. Sign back in with ${me.user.email} to see them again.`}
        confirmLabel="Sign out"
        onConfirm={() => {
          setSigningOut(true);
          void signOut();
        }}
        loading={signingOut}
      />
    </Screen>
  );
}
