import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/auth/context';
import { useDeleteAttachment, useDeleteItem, useHome, useItem, useSnooze } from '../../src/api/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { keys } from '../../src/api/hooks';
import { messageOf } from '../../src/api/client';
import { makeStyles, radius, space, useColors } from '../../src/theme/tokens';
import { Header, Screen } from '../../src/ui/Screen';
import { T } from '../../src/ui/Text';
import { Button, IconButton, Press } from '../../src/ui/Button';
import { Icon } from '../../src/ui/Icon';
import { Group, ListRow } from '../../src/ui/Layout';
import { ErrorState, Skeleton } from '../../src/ui/Feedback';
import { ConfirmSheet, Sheet, SheetAction, useToast } from '../../src/ui/Sheet';
import { CountdownPill, DateTile, urgencyOf } from '../../src/items/parts';
import { useDone } from '../../src/items/useDone';
import { PageThumb } from '../../src/documents/PageThumb';
import { PageViewer } from '../../src/documents/PageViewer';
import { pickPdf, pickPhotos, uploadAttachment, PermissionDenied } from '../../src/lib/scan';
import { CATEGORY, dueLine, hourLabel, maskedRef, money, plural, repeatLabel } from '../../src/lib/format';
import { addDays, localToday, mediumDate } from '../../src/lib/dates';
import type { ItemDetail, Page } from '../../src/types';

/**
 * ITEM DETAIL (SCREENS #7, FR-I5…I9). The due line is the headline; facts
 * below in one group; attachments; notes. Bottom: Mark done (the one
 * marigold), Snooze, and Edit/Delete in the overflow.
 */
export default function ItemDetailScreen() {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const c = useColors();
  const s = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { household } = useAuth();
  const item = useItem(String(id));
  const home = useHome();
  const { markDone, pending } = useDone();
  const snooze = useSnooze();
  const del = useDeleteItem();
  const delAttachment = useDeleteAttachment(String(id));
  const [menu, setMenu] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewer, setViewer] = useState<{ pages: Page[]; index: number } | null>(null);
  const [uploading, setUploading] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (item.isLoading) {
    return (
      <Screen header={<Header />}>
        <Skeleton height={28} width="40%" />
        <Skeleton height={40} width="80%" />
        <Skeleton height={220} style={{ borderRadius: radius.group }} />
      </Screen>
    );
  }
  if (item.isError || !item.data) {
    return (
      <Screen header={<Header />}>
        <ErrorState error={item.error} onRetry={() => void item.refetch()} />
      </Screen>
    );
  }

  const d = item.data;
  const done = d.status === 'done';
  const members = home.data?.members ?? [];
  const assignee = members.find((m) => m.id === d.assigneeId);
  const pagesCount = d.attachments.reduce((n, a) => n + a.pages.length, 0);

  const attach = async (kind: 'photos' | 'pdf') => {
    try {
      const pages = kind === 'pdf' ? [await pickPdf()].filter((p): p is NonNullable<typeof p> => Boolean(p)) : await pickPhotos();
      if (pages.length === 0) return;
      setUploading(true);
      await uploadAttachment(d.id, pages);
      await qc.invalidateQueries({ queryKey: keys.item(d.id) });
      toast({ message: pages.length === 1 ? 'Page attached.' : `${pages.length} pages attached.` });
    } catch (e) {
      toast({ message: e instanceof PermissionDenied ? e.message : messageOf(e) });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Screen
      header={<Header right={<IconButton icon="more" label="More actions" onPress={() => setMenu(true)} />} />}
      testID="screen-item"
      footer={
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {done ? (
            <Button label="Reopen" tone="secondary" icon="undo" onPress={() => markDone(d)} style={{ flex: 1 }} />
          ) : (
            <>
              <Button label="Snooze" tone="secondary" icon="clock" full={false} onPress={() => setSnoozing(true)} style={{ paddingHorizontal: space.lg }} testID="item-snooze" />
              <Button label="Mark done" icon="check" onPress={() => markDone(d)} loading={pending === d.id} style={{ flex: 1 }} testID="item-done" />
            </>
          )}
        </View>
      }
    >
      <View style={s.header}>
        <DateTile day={d.dueDate} urgency={urgencyOf(d)} size={84} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name={CATEGORY[d.category].icon} size={15} color={c.brandInk} />
            <T variant="caption" tone="brand" style={{ fontFamily: 'Manrope_700Bold' }}>
              {CATEGORY[d.category].label}
            </T>
          </View>
          <T variant="display" accessibilityRole="header" style={{ fontSize: 28, lineHeight: 33 }}>
            {d.title}
          </T>
          <CountdownPill daysLeft={d.daysLeft} done={done} />
        </View>
      </View>

      <View style={s.taskCard}>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="caption" tone="muted">
            What to do
          </T>
          <T variant="headline">{dueLine(d.action, d.dueDate, true)}</T>
          {d.issuer ? (
            <T variant="caption" tone="muted">
              From {d.issuer}
            </T>
          ) : null}
        </View>
        {d.amountCents !== null ? (
          <T variant="title" style={{ fontSize: 24 }}>
            {money(d.amountCents)}
          </T>
        ) : null}
      </View>

      {d.evidence ? (
        <View style={s.evidence}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="sparkles" size={14} color={c.brandInk} />
            <T variant="caption" tone="brand" style={{ fontFamily: 'Manrope_700Bold' }}>
              Found in the letter
            </T>
          </View>
          <T variant="callout" style={{ fontStyle: 'italic' }}>
            “{d.evidence}”
          </T>
        </View>
      ) : null}

      {!done ? <ReminderTimeline item={d} hour={household?.remindHour ?? 9} onEdit={() => router.push({ pathname: '/item/[id]/edit', params: { id: d.id } })} /> : null}

      <Group title="Details">
        {d.issuer ? <ListRow title="From" value={d.issuer} /> : null}
        {d.referenceLast4 ? <ListRow title="Reference" value={maskedRef(d.referenceLast4)} /> : null}
        <ListRow title="Repeats" value={repeatLabel(d.repeat, d.repeatYears)} />
        {members.length > 1 ? <ListRow title="Handled by" value={assignee ? (assignee.isMe ? 'Me' : assignee.displayName) : 'Anyone'} /> : null}
        {d.seriesCount > 1 ? <ListRow title="History" value={`${plural(d.seriesCount, 'time')} so far`} /> : null}
      </Group>

      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs }}>
          <T variant="headline" style={{ flex: 1 }}>
            {pagesCount > 0 ? `Attached pages (${pagesCount})` : 'Attached pages'}
          </T>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingRight: space.lg }}>
          {d.attachments.flatMap((a) =>
            a.pages.map((p, i) => (
              <PageThumb key={p.id} uri={p.url} mime={p.mime} index={i} onPress={() => setViewer({ pages: a.pages, index: i })} />
            )),
          )}
          <Press onPress={() => void attach('photos')} accessibilityRole="button" accessibilityLabel="Attach photos" style={s.addPage} disabled={uploading}>
            <Icon name="attach" size={20} color={c.brandInk} />
            <T variant="caption" tone="brand">
              {uploading ? 'Adding…' : 'Photos'}
            </T>
          </Press>
          <Press onPress={() => void attach('pdf')} accessibilityRole="button" accessibilityLabel="Attach a PDF" style={s.addPage} disabled={uploading}>
            <Icon name="file" size={20} color={c.brandInk} />
            <T variant="caption" tone="brand">
              PDF
            </T>
          </Press>
        </ScrollView>
      </View>

      {d.notes ? (
        <View style={{ gap: space.xs }}>
          <T variant="micro" tone="muted" style={{ paddingHorizontal: space.xs }}>
            Notes
          </T>
          <T>{d.notes}</T>
        </View>
      ) : null}

      <Sheet visible={snoozing} onClose={() => setSnoozing(false)} title="Remind me again">
        <T tone="muted" style={{ marginBottom: space.md }}>
          The due date stays {dueLine(d.action, d.dueDate).toLowerCase().replace(/^(\w+) by /, '')}. We’ll just nudge you again.
        </T>
        {([1, 3, 7] as const).map((days) => (
          <SheetAction
            key={days}
            label={days === 1 ? 'Tomorrow' : days === 3 ? 'In 3 days' : 'In a week'}
            icon={<Icon name="clock" size={20} color={c.brandInk} />}
            onPress={() => {
              setSnoozing(false);
              snooze.mutate(
                { id: d.id, days },
                {
                  onSuccess: () => toast({ message: days === 1 ? 'Snoozed until tomorrow.' : `Snoozed for ${days} days.` }),
                  onError: (e) => toast({ message: messageOf(e) }),
                },
              );
            }}
          />
        ))}
      </Sheet>

      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <SheetAction
          label="Edit"
          testID="item-menu-edit"
          icon={<Icon name="pencil" size={20} color={c.brandInk} />}
          onPress={() => {
            setMenu(false);
            router.push({ pathname: '/item/[id]/edit', params: { id: d.id } });
          }}
        />
        {d.attachments.length > 0 ? (
          <SheetAction
            label="Remove attachments"
            icon={<Icon name="x" size={20} color={c.brandInk} />}
            onPress={() => {
              setMenu(false);
              d.attachments.forEach((a) => delAttachment.mutate(a.documentId));
            }}
          />
        ) : null}
        <SheetAction
          label="Delete item"
          destructive
          testID="item-menu-delete"
          icon={<Icon name="trash" size={20} color={c.critical} />}
          onPress={() => {
            setMenu(false);
            // iOS drops a modal presented while another is still dismissing.
            setTimeout(() => setConfirmDelete(true), 350);
          }}
        />
      </Sheet>

      <ConfirmSheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete “${d.title}”?`}
        message={`Its reminders${pagesCount > 0 ? ` and ${plural(pagesCount, 'attached page')}` : ''} are deleted too. This can’t be undone.`}
        confirmLabel="Delete item"
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(d.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              toast({ message: 'Deleted.' });
              back();
            },
            onError: (e) => toast({ message: messageOf(e) }),
          })
        }
      />

      <PageViewer pages={viewer?.pages ?? []} index={viewer ? viewer.index : null} onClose={() => setViewer(null)} />
    </Screen>
  );
}

/**
 * The reminder plan, drawn: each nudge on its real date, past ones marked
 * sent. Computed from the item's offsets — the server's plan is the same rule
 * (ARCHITECTURE §4), so this is a picture of it, not a second source of truth.
 */
function ReminderTimeline({ item, hour, onEdit }: { item: ItemDetail; hour: number; onEdit: () => void }) {
  const c = useColors();
  const s = useStyles();
  const today = localToday();
  const steps = [
    ...[...item.offsets].sort((a, b) => b - a).map((o) => ({ day: addDays(item.dueDate, -o), label: `${o} ${o === 1 ? 'day' : 'days'} before` })),
    { day: item.dueDate, label: 'On the day' },
    { day: addDays(item.dueDate, 1), label: 'The day after, if it’s not done' },
  ];
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs }}>
        <T variant="headline" style={{ flex: 1 }}>
          Reminders at {hourLabel(hour)}
        </T>
        <T variant="callout" tone="brand" onPress={onEdit} accessibilityRole="button">
          Change
        </T>
      </View>
      <View style={s.timeline}>
        {steps.map((st, i) => {
          const past = st.day < today;
          const isToday = st.day === today;
          const last = i === steps.length - 1;
          return (
            <View key={st.label} style={{ flexDirection: 'row', gap: space.md }}>
              <View style={{ alignItems: 'center', width: 16 }}>
                <View style={[s.dot, past ? { backgroundColor: c.textFaint, borderColor: c.textFaint } : isToday ? { backgroundColor: c.accent, borderColor: c.accent } : null]} />
                {!last ? <View style={s.rail} /> : null}
              </View>
              <View style={{ flex: 1, flexDirection: 'row', paddingBottom: last ? 0 : space.lg }}>
                <T variant="callout" style={{ flex: 1, color: past ? c.textMuted : c.text, fontFamily: 'Manrope_500Medium' }}>
                  {st.label}
                </T>
                <T variant="caption" style={{ color: past ? c.textFaint : isToday ? c.brandInk : c.textMuted, fontFamily: isToday ? 'Manrope_700Bold' : 'Manrope_500Medium' }}>
                  {past ? 'Sent' : isToday ? 'Today' : mediumDate(st.day)}
                </T>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingTop: space.sm },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: c.surface,
    borderRadius: radius.group,
    borderWidth: 1,
    borderColor: c.line,
    padding: space.lg,
  },
  timeline: { backgroundColor: c.surface, borderRadius: radius.group, borderWidth: 1, borderColor: c.line, padding: space.lg },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: c.brandInk, backgroundColor: c.surface, marginTop: 4 },
  rail: { flex: 1, width: 2, backgroundColor: c.line, marginTop: 2 },
  evidence: {
    gap: space.xs,
    backgroundColor: c.surface,
    borderRadius: radius.group,
    borderWidth: 1,
    borderColor: c.line,
    borderLeftWidth: 3,
    borderLeftColor: c.accent,
    padding: space.lg,
  },
  addPage: {
    width: 76,
    height: 99,
    borderRadius: radius.input - 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: c.line,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
}));
