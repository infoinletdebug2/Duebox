import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { useAuth } from '../../src/auth/context';
import { useConfirmScan, useDiscardScan, useHome, useReadScan, useScan } from '../../src/api/hooks';
import { usePlanGate } from '../../src/billing/gate';
import { ApiError, messageOf } from '../../src/api/client';
import { makeStyles, radius, space, useColors } from '../../src/theme/tokens';
import { Header, Screen } from '../../src/ui/Screen';
import { T } from '../../src/ui/Text';
import { Button, IconButton } from '../../src/ui/Button';
import { ErrorState, Skeleton } from '../../src/ui/Feedback';
import { ReadFailed } from '../../src/ui/artwork';
import { useToast } from '../../src/ui/Sheet';
import { PageThumb } from '../../src/documents/PageThumb';
import { formFrom, ItemForm, toInput, validate, type FormState } from '../../src/items/ItemForm';
import { routeAfterFirstSave } from '../../src/items/afterSave';
import type { Candidate, Scan } from '../../src/types';

/**
 * READING → CONFIRM (SCREENS #5, FR-S3…S6, BR-02, BR-03).
 *
 * Reading: the thumbnails and an honest, slow line — never a fake percentage,
 * and "you can leave" (the scan waits in the Inbox). Confirm: one card per
 * deadline the AI found; the date first with the words it came from under
 * it. Nothing becomes an item until Save.
 */
export default function ScanResult() {
  const params = useLocalSearchParams<{ id: string; read?: string }>();
  const id = String(params.id);
  const router = useRouter();
  const scan = useScan(id, true);
  const read = useReadScan();
  const started = useRef(false);
  const [readError, setReadError] = useState<unknown>(null);
  const { handlePlanError } = usePlanGate();

  // Kick off the read once, if we came straight from the upload.
  useEffect(() => {
    if (started.current || params.read !== '1') return;
    started.current = true;
    read.mutate(id, {
      onError: (e) => {
        if (handlePlanError(e)) return;
        setReadError(e);
        void scan.refetch();
      },
    });
  }, [id, params.read, read, scan, handlePlanError]);

  const data = read.data ?? scan.data;
  const reading = read.isPending || data?.status === 'reading' || data?.status === 'uploading';

  if (reading || (!data && scan.isLoading)) return <Reading scan={data} />;
  if (scan.isError && !data) {
    return (
      <Screen header={<Header title="Scan" closeIcon />}>
        <ErrorState error={scan.error} onRetry={() => void scan.refetch()} />
      </Screen>
    );
  }
  if (!data) return <Reading scan={undefined} />;

  const failed = data.status === 'failed' || (readError instanceof ApiError && readError.code === 'READ_FAILED') || (data.status === 'review' && data.candidates.length === 0);
  if (failed) return <Failed scan={data} />;
  if (data.status === 'confirmed') {
    return (
      <Screen header={<Header title="Scan" closeIcon />}>
        <ErrorState error={new Error('This scan is already saved.')} onRetry={() => router.replace('/')} />
      </Screen>
    );
  }
  if (readError && !failed && data.status !== 'review') {
    return (
      <Screen header={<Header title="Scan" closeIcon />}>
        <ErrorState error={readError} onRetry={() => read.mutate(id, { onSuccess: () => setReadError(null) })} />
      </Screen>
    );
  }
  return <Confirm scan={data} />;
}

/* ── reading ────────────────────────────────────────────────────────────── */

function Reading({ scan }: { scan: Scan | undefined }) {
  const router = useRouter();
  const c = useColors();
  const s = useStyles();
  const reduce = useReducedMotion();
  const x = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    x.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.cubic) }), -1, true);
  }, [reduce, x]);

  const bar = useAnimatedStyle(() => ({ left: `${x.value * 60}%` }));

  return (
    <Screen header={<Header title="Reading" closeIcon onBack={() => router.replace('/')} />} testID="screen-reading">
      <View style={{ gap: space.sm }}>
        <T variant="display" accessibilityRole="header" accessibilityLiveRegion="polite">
          Reading your letter…
        </T>
        <T tone="muted">About 10 seconds. You can leave — it’ll wait in your inbox on Home.</T>
      </View>
      <View style={s.track} accessibilityRole="progressbar" accessibilityLabel="Reading">
        <Animated.View style={[s.bar, { backgroundColor: c.brandInk }, reduce ? { left: '30%' } : bar]} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
        {scan
          ? scan.pages.map((p, i) => <PageThumb key={p.id} uri={p.url} mime={p.mime} index={i} width={96} />)
          : [0, 1].map((i) => <Skeleton key={i} width={96} height={125} style={{ borderRadius: radius.input }} />)}
      </ScrollView>
      <View style={{ gap: space.sm }}>
        {['Finding the deadline', 'Picking out the amount and who it’s from', 'Hiding reference numbers except the last 4'].map((line) => (
          <T key={line} variant="callout" tone="muted">
            · {line}
          </T>
        ))}
      </View>
    </Screen>
  );
}

/* ── failed ─────────────────────────────────────────────────────────────── */

function Failed({ scan }: { scan: Scan }) {
  const router = useRouter();
  const discard = useDiscardScan();
  const copy =
    scan.readError === 'unreadable'
      ? 'The photo was too blurry or dark to read. Try again in better light.'
      : scan.readError === 'not_document'
        ? 'This doesn’t look like a letter or document. Try a photo of the page.'
        : scan.readError === 'timeout'
          ? 'Reading took too long. Try again, or type it in.'
          : 'We couldn’t find a date in this one. Type it in — the photo stays attached.';
  return (
    <Screen header={<Header title="Scan" closeIcon onBack={() => router.replace('/')} />} testID="screen-read-failed">
      <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.xl }}>
        <ReadFailed size={180} />
        <T variant="display" align="center">
          No date found
        </T>
        <T tone="muted" align="center" style={{ maxWidth: 320 }}>
          {copy}
        </T>
      </View>
      <View style={{ gap: space.sm }}>
        <Button label="Type it in" icon="pencil" onPress={() => router.replace('/item/new')} />
        <Button
          label="Retake"
          tone="secondary"
          icon="camera"
          onPress={() => discard.mutate(scan.id, { onSettled: () => router.replace('/scan') })}
        />
      </View>
    </Screen>
  );
}

/* ── confirm ────────────────────────────────────────────────────────────── */

type Card = { key: string; candidate: Candidate; form: FormState; errors: Record<string, string> };

function Confirm({ scan }: { scan: Scan }) {
  const router = useRouter();
  const toast = useToast();
  const c = useColors();
  const s = useStyles();
  const { isPro } = useAuth();
  const { atItemLimit, openPaywall, handlePlanError } = usePlanGate();
  const home = useHome();
  const confirm = useConfirmScan(scan.id);
  const discard = useDiscardScan();
  const [cards, setCards] = useState<Card[]>(() =>
    scan.candidates.map((cand) => ({
      key: cand.key,
      candidate: cand,
      errors: {},
      form: formFrom(
        {
          title: cand.title,
          dueDate: cand.dueDate,
          category: cand.category,
          action: cand.action,
          amountCents: cand.amountCents,
          issuer: cand.issuer,
          referenceLast4: cand.referenceLast4,
          notes: cand.notes,
          repeat: cand.repeat,
        },
        isPro,
      ),
    })),
  );
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const checked = cards.map((card) => ({ ...card, errors: validate(card.form) }));
    setCards(checked);
    if (checked.some((card) => Object.keys(card.errors).length > 0)) return;
    if (atItemLimit) return openPaywall('item_limit');
    setError(null);
    confirm.mutate(
      checked.map((card) => ({ ...toInput(card.form), candidateKey: card.key })),
      {
        onSuccess: ({ items }) => {
          const first = items[0];
          toast({ message: items.length === 1 ? `Saved. We’ll remind you before ${first?.title} is due.` : `Saved ${items.length} deadlines.` });
          void routeAfterFirstSave(router, first?.title ?? 'this', () =>
            items.length === 1 && first ? router.replace({ pathname: '/item/[id]', params: { id: first.id } }) : router.replace('/(tabs)/home'),
          );
        },
        onError: (e) => {
          if (!handlePlanError(e)) setError(messageOf(e));
        },
      },
    );
  };

  const n = cards.length;
  const lowDate = (cand: Candidate) => cand.confidence.dueDate !== 'high';

  return (
    <Screen
      form
      header={<Header title="Check it" closeIcon onBack={() => router.replace('/')} />}
      testID="screen-confirm"
      footer={
        <View style={{ gap: space.sm }}>
          {error ? (
            <T variant="caption" tone="critical" accessibilityRole="alert">
              {error}
            </T>
          ) : null}
          <Button label={n === 1 ? 'Save item' : `Save ${n} items`} onPress={save} loading={confirm.isPending} disabled={n === 0} testID="confirm-save" />
        </View>
      }
    >
      <View style={{ gap: space.xs }}>
        <T variant="display" accessibilityRole="header">
          {n === 1 ? 'We found 1 deadline' : `We found ${n} deadlines`}
        </T>
        <T tone="muted">Check the dates. You’re the final say.</T>
      </View>

      {scan.pages.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {scan.pages.map((p, i) => (
            <PageThumb key={p.id} uri={p.url} mime={p.mime} index={i} width={56} />
          ))}
        </ScrollView>
      ) : null}

      {cards.map((card, i) => (
        <View key={card.key} style={s.card} testID={`candidate-${card.key}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <T variant="micro" tone="muted" style={{ flex: 1 }}>
              {n > 1 ? `Deadline ${i + 1} of ${n}` : 'Deadline'}
            </T>
            {lowDate(card.candidate) ? (
              <View style={[s.check, { backgroundColor: c.accentSoft }]}>
                <T variant="caption" style={{ fontFamily: 'Manrope_700Bold' }}>
                  Check this
                </T>
              </View>
            ) : null}
            {n > 1 ? (
              <IconButton icon="x" label={`Remove deadline ${i + 1}`} size={32} onPress={() => setCards((list) => list.filter((x) => x.key !== card.key))} />
            ) : null}
          </View>
          <ItemForm
            value={card.form}
            onChange={(next) => setCards((list) => list.map((x) => (x.key === card.key ? { ...x, form: next } : x)))}
            errors={card.errors}
            members={home.data?.members}
            evidence={card.candidate.evidence}
            aiRead={{ title: Boolean(card.candidate.title), dueDate: Boolean(card.candidate.dueDate), amount: card.candidate.amountCents !== null }}
            compact
          />
        </View>
      ))}

      <Button label="Discard this scan" tone="quiet" small onPress={() => discard.mutate(scan.id, { onSettled: () => router.replace('/') })} />
    </Screen>
  );
}

const useStyles = makeStyles((c) => ({
  track: { height: 4, borderRadius: 2, backgroundColor: c.line, overflow: 'hidden' },
  bar: { position: 'absolute', top: 0, bottom: 0, width: '40%', borderRadius: 2 },
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: c.line,
    padding: space.lg,
    gap: space.md,
  },
  check: { borderRadius: radius.chip, paddingHorizontal: space.sm, paddingVertical: 3 },
}));
