import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/auth/context';
import { api } from '../../src/api/client';
import { makeStyles, radius, space } from '../../src/theme/tokens';
import { Screen, Header } from '../../src/ui/Screen';
import { T } from '../../src/ui/Text';
import { Button } from '../../src/ui/Button';
import { Field, Segmented } from '../../src/ui/Controls';
import { useToast } from '../../src/ui/Sheet';
import { FormMessage } from '../../src/account/AuthShell';
import { formErrors } from '../../src/account/forms';

/**
 * DELETE ACCOUNT (FR-A5 — mandatory on both stores since 2022, never paywalled).
 *
 * Names exactly what goes (design.md §26): for the owner, the whole
 * household — every deadline, reminder, scanned page and attachment, for
 * everyone in it; for a member, only their own account (the household keeps
 * what they added). Proof before destruction: a password account re-enters
 * its password; an Apple / Google account types DELETE. A wrong password is
 * shown under the field and changes nothing.
 */
type Mode = 'password' | 'social';

export default function DeleteAccount() {
  const router = useRouter();
  const toast = useToast();
  const s = useStyles();
  const { household, isOwner, signOut } = useAuth();
  const [mode, setMode] = useState<Mode>('password');
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const errors = formErrors(error, ['password']);
  const ready = mode === 'password' ? password.length > 0 : typed.trim().toUpperCase() === 'DELETE';

  const submit = async () => {
    if (!ready) return;
    setPending(true);
    setError(null);
    try {
      await api.delete<{ deleted: boolean }>('/auth/me', mode === 'password' ? { password } : { confirmation: 'DELETE' });
      // The account is gone; signOut's logout call may fail and that is fine — it clears locally either way.
      await signOut();
      toast({ message: 'Your account has been deleted.' });
      router.replace('/(auth)/welcome');
    } catch (failure) {
      setError(failure);
      setPending(false);
    }
  };

  return (
    <Screen
      form
      header={<Header title="Delete account" />}
      testID="screen-delete"
      footer={
        <View style={{ gap: space.sm }}>
          <FormMessage message={errors.general} />
          <Button label={isOwner ? 'Delete my account and household' : 'Delete my account'} tone="destructive" onPress={() => void submit()} loading={pending} disabled={!ready} testID="delete-submit" />
        </View>
      }
    >
      <View style={{ gap: space.sm }}>
        <T variant="display" accessibilityRole="header">
          Delete your account
        </T>
        {household && isOwner ? (
          <T tone="muted">
            This deletes {household.name} for everyone in it, including any members you invited: every deadline and reminder, every scanned page, photo and PDF, and
            everything read from them.
          </T>
        ) : null}
        {household && !isOwner ? (
          <T tone="muted">
            You’ll leave {household.name} and your sign-in is deleted. The household and its deadlines stay with the owner.
          </T>
        ) : null}
        {!household ? <T tone="muted">This deletes your Duebox sign-in and profile.</T> : null}
      </View>

      <View style={s.facts}>
        <T variant="callout">It can’t be undone.</T>
        <T variant="caption" tone="muted">
          Your data disappears from the app straight away. Every record and every stored image is permanently erased from our systems, including backups, within 30 days. An active App Store or Google Play subscription isn’t cancelled by deleting — cancel it in your store account settings.
        </T>
        <Button label="Export my data first" tone="secondary" icon="download" small onPress={() => router.push('/settings/export')} testID="delete-export" />
      </View>

      <View style={{ gap: space.md }}>
        <Segmented<Mode>
          options={[
            { value: 'password', label: 'I use a password' },
            { value: 'social', label: 'Apple or Google' },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
        />
        {mode === 'password' ? (
          <Field
            label="Your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            hint="To confirm it’s really you."
            error={errors.fields.password}
            testID="delete-password"
          />
        ) : (
          <Field
            label="Type DELETE to confirm"
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="DELETE"
            returnKeyType="done"
            error={errors.fields.password}
            testID="delete-confirmation"
          />
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((c) => ({
  facts: {
    backgroundColor: c.criticalSoft,
    borderRadius: radius.group,
    padding: space.lg,
    gap: space.sm,
  },
}));
