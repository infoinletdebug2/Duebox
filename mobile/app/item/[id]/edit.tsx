import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../src/auth/context';
import { useHome, useItem, useUpdateItem } from '../../../src/api/hooks';
import { usePlanGate } from '../../../src/billing/gate';
import { messageOf } from '../../../src/api/client';
import { space } from '../../../src/theme/tokens';
import { Header, Screen } from '../../../src/ui/Screen';
import { T } from '../../../src/ui/Text';
import { Button } from '../../../src/ui/Button';
import { ErrorState, Skeleton } from '../../../src/ui/Feedback';
import { useToast } from '../../../src/ui/Sheet';
import { formFrom, ItemForm, toInput, validate, type FormState } from '../../../src/items/ItemForm';

/** EDIT (SCREENS #8). The same form, filled. Saving re-plans the reminders on the server (FR-R7). */
export default function EditItem() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isPro } = useAuth();
  const { handlePlanError } = usePlanGate();
  const item = useItem(String(id));
  const home = useHome();
  const update = useUpdateItem(String(id));
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item.data && !form) setForm(formFrom(item.data, isPro));
  }, [item.data, form, isPro]);

  if (item.isError) {
    return (
      <Screen header={<Header title="Edit" closeIcon />}>
        <ErrorState error={item.error} onRetry={() => void item.refetch()} />
      </Screen>
    );
  }
  if (!form) {
    return (
      <Screen header={<Header title="Edit" closeIcon />}>
        <Skeleton height={50} />
        <Skeleton height={50} />
        <Skeleton height={50} />
      </Screen>
    );
  }

  const save = () => {
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setError(null);
    update.mutate(toInput(form), {
      onSuccess: () => {
        toast({ message: 'Changes saved.' });
        router.back();
      },
      onError: (e) => {
        if (!handlePlanError(e)) setError(messageOf(e));
      },
    });
  };

  return (
    <Screen
      form
      header={<Header title="Edit" closeIcon />}
      testID="screen-item-edit"
      footer={
        <View style={{ gap: space.sm }}>
          {error ? (
            <T variant="caption" tone="critical" accessibilityRole="alert">
              {error}
            </T>
          ) : null}
          <Button label="Save changes" onPress={save} loading={update.isPending} testID="item-update" />
        </View>
      }
    >
      <ItemForm value={form} onChange={setForm} errors={errors} members={home.data?.members} evidence={item.data?.evidence} startOpen />
    </Screen>
  );
}
