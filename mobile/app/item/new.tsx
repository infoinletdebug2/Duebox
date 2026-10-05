import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/auth/context';
import { useCreateItem, useHome } from '../../src/api/hooks';
import { usePlanGate } from '../../src/billing/gate';
import { messageOf } from '../../src/api/client';
import { font, makeStyles, radius, space, useColors } from '../../src/theme/tokens';
import { Header, Screen } from '../../src/ui/Screen';
import { T } from '../../src/ui/Text';
import { Button, tap } from '../../src/ui/Button';
import { ChoiceGrid } from '../../src/ui/Controls';
import { Icon } from '../../src/ui/Icon';
import { Banner } from '../../src/ui/Feedback';
import { useToast } from '../../src/ui/Sheet';
import { emptyForm, ItemForm, toInput, validate, type FormState } from '../../src/items/ItemForm';
import { routeAfterFirstSave } from '../../src/items/afterSave';
import { DateTile, taskPhrase, urgencyOf } from '../../src/items/parts';
import { TEMPLATES, type Template } from '../../src/items/templates';
import { CATEGORY, countdown, money, parseMoney, REPEAT } from '../../src/lib/format';
import { daysBetween, localToday } from '../../src/lib/dates';
import type { Category } from '../../src/types';

/**
 * ADD AN ITEM BY HAND (SCREENS #6, FR-I1). One tap on a common deadline fills
 * everything but the date; the card at the top shows the item exactly as it
 * will look in the list, as you type. At the free limit, the paywall opens
 * instead of a form that would be refused.
 */
export default function NewItem() {
  const router = useRouter();
  const toast = useToast();
  const c = useColors();
  const s = useStyles();
  const params = useLocalSearchParams<{ category?: string }>();
  const { isPro } = useAuth();
  const { atItemLimit, openPaywall, handlePlanError } = usePlanGate();
  const home = useHome();
  const create = useCreateItem();
  const [form, setForm] = useState<FormState>(() => emptyForm(isPro, (params.category as Category | undefined) ?? 'other'));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const applyTemplate = (t: Template) => {
    tap();
    setForm((f) => ({ ...f, title: t.title, category: t.category, action: t.action, repeat: t.repeat, repeatYears: t.repeatYears ?? f.repeatYears }));
    setErrors({});
  };

  const save = () => {
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (atItemLimit) return openPaywall('item_limit');
    setError(null);
    create.mutate(toInput(form), {
      onSuccess: (item) => {
        toast({ message: `Saved. We’ll remind you before ${item.title} is due.` });
        void routeAfterFirstSave(router, item.title, () => router.replace({ pathname: '/item/[id]', params: { id: item.id } }));
      },
      onError: (e) => {
        if (!handlePlanError(e)) setError(messageOf(e));
      },
    });
  };

  const templates = params.category ? TEMPLATES.filter((t) => t.category === params.category).concat(TEMPLATES.filter((t) => t.category !== params.category)) : TEMPLATES;
  const daysLeft = form.dueDate ? daysBetween(localToday(), form.dueDate) : null;
  const amount = parseMoney(form.amount);

  return (
    <Screen
      form
      header={<Header title="New item" closeIcon />}
      testID="screen-item-new"
      footer={
        <View style={{ gap: space.sm }}>
          {error ? (
            <T variant="caption" tone="critical" accessibilityRole="alert">
              {error}
            </T>
          ) : null}
          <Button label="Add item" onPress={save} loading={create.isPending} testID="item-save" />
        </View>
      }
    >
      {atItemLimit ? (
        <Banner icon="lock" message="You’re at your free limit of open deadlines. Mark one done, or go Pro for unlimited." actionLabel="See Pro" onPress={() => openPaywall('item_limit')} />
      ) : null}

      {/* The preview: exactly how it will sit in the list. */}
      <View style={s.preview} testID="item-preview">
        {form.dueDate && daysLeft !== null ? (
          <DateTile day={form.dueDate} urgency={urgencyOf({ daysLeft, status: 'open' })} size={52} />
        ) : (
          <View style={s.blankTile}>
            <Icon name="calendar" size={20} color={c.textFaint} />
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <T variant="headline" numberOfLines={2} style={{ flex: 1, color: form.title ? c.text : c.textFaint }}>
              {form.title || 'Your next deadline'}
            </T>
            {amount !== null ? <T variant="callout">{money(amount)}</T> : null}
          </View>
          <T variant="caption" tone="muted" numberOfLines={1}>
            {daysLeft !== null ? (
              <T variant="caption" style={{ fontFamily: font.bold, color: daysLeft < 0 ? c.critical : c.text }}>
                {countdown(daysLeft).replace(/^in /, 'In ')}
              </T>
            ) : (
              'Pick a date'
            )}
            {`, ${taskPhrase({ action: form.action, issuer: form.issuer.trim() || null })}`}
            {form.repeat !== 'none' ? `, ${REPEAT[form.repeat].toLowerCase()}` : ''}
          </T>
        </View>
      </View>

      {!form.title ? (
        <View style={{ gap: space.sm }}>
          <T variant="headline">Start from a common one</T>
          <ChoiceGrid
            columns={2}
            align="left"
            options={templates.slice(0, 6).map((t) => ({ key: t.title, label: t.title, icon: CATEGORY[t.category].icon }))}
            isOn={() => false}
            onPress={(k) => {
              const t = templates.find((x) => x.title === k);
              if (t) applyTemplate(t);
            }}
            role="radio"
            testIDPrefix="template-"
          />
        </View>
      ) : null}

      <ItemForm value={form} onChange={setForm} errors={errors} members={home.data?.members} startOpen={Boolean(params.category)} />
    </Screen>
  );
}

const useStyles = makeStyles((c) => ({
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: c.surface,
    borderRadius: radius.group,
    borderWidth: 1,
    borderColor: c.line,
    padding: space.md,
  },
  blankTile: {
    width: 52,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: c.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
