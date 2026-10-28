import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/auth/context';
import { api } from '../../src/api/client';
import { font, makeStyles, radius, space, useColors } from '../../src/theme/tokens';
import { Screen, Header } from '../../src/ui/Screen';
import { T } from '../../src/ui/Text';
import { Button, Press } from '../../src/ui/Button';
import { Icon, type IconName } from '../../src/ui/Icon';
import { Field, FieldTone, Segmented, PasswordField } from '../../src/ui/Controls';
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
 *
 * Fits a small phone without scrolling: the warning, what goes as three
 * lines, the fine print, export, and the proof — the button pinned below.
 */
type Mode = 'password' | 'social';

export default function DeleteAccount() {
  const router = useRouter();
  const toast = useToast();
  const s = useStyles();
  const c = useColors();
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

  // What goes, in three short lines instead of a paragraph.
  const goes: { icon: IconName; text: string }[] = !household
    ? [{ icon: 'user', text: 'Your Duebox sign-in and profile' }]
    : isOwner
      ? [
          { icon: 'calendar-clock', text: 'Every deadline and reminder' },
          { icon: 'file', text: 'Every scanned page, photo and PDF' },
          { icon: 'users', text: `${household.name}, for everyone in it` },
        ]
      : [
          { icon: 'user', text: 'Your sign-in — you leave the household' },
          { icon: 'home', text: `${household.name} and its deadlines stay with the owner` },
        ];

  return (
    <Screen
      form
      header={<Header title="Delete account" />}
      contentStyle={{ gap: space.lg }}
      testID="screen-delete"
      footer={
        <View style={{ gap: space.sm }}>
          <FormMessage message={errors.general} />
          <Button label={isOwner ? 'Delete my account and household' : 'Delete my account'} tone="destructive" onPress={() => void submit()} loading={pending} disabled={!ready} testID="delete-submit" />
        </View>
      }
    >
      <View style={s.warn}>
        <View style={[s.warnIcon, { backgroundColor: c.criticalSoft }]}>
          <Icon name="warning" size={22} color={c.critical} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="title" accessibilityRole="header">
            This can’t be undone
          </T>
          <T variant="caption" tone="muted">
            Deleting removes, for good:
          </T>
        </View>
      </View>

      <View style={s.list}>
        {goes.map((g) => (
          <View key={g.text} style={s.row}>
            <Icon name={g.icon} size={18} color={c.critical} />
            <T variant="callout" style={{ flex: 1 }}>
              {g.text}
            </T>
          </View>
        ))}
        <T variant="caption" tone="faint" style={{ marginTop: space.xs }}>
          Erased from our systems, backups included, within 30 days. A store subscription isn’t cancelled by this — cancel it in your App Store or Google Play settings.
        </T>
      </View>

      <Press onPress={() => router.push('/settings/export')} accessibilityRole="link" style={s.export} testID="delete-export">
        <Icon name="download" size={18} color={c.brandInk} />
        <T variant="callout" tone="brand" style={{ flex: 1, fontFamily: font.semibold }}>
          Export my data first
        </T>
        <Icon name="chevron-right" size={18} color={c.textFaint} />
      </Press>

      <View style={{ gap: space.sm }}>
        <T variant="caption" tone="muted">
          Confirm it’s you
        </T>
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
        <FieldTone.Provider value="raised">
        {mode === 'password' ? (
          <PasswordField
            bare
            label="Your password"
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            error={errors.fields.password}
            testID="delete-password"
          />
        ) : (
          <Field
            bare
            label="Type DELETE to confirm"
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            error={errors.fields.password}
            testID="delete-confirmation"
          />
        )}
        </FieldTone.Provider>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((c) => ({
  warn: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.xs },
  warnIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  list: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.group,
    borderCurve: 'continuous',
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  export: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.group,
    borderCurve: 'continuous',
    backgroundColor: c.brandSoft,
  },
}));
