import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useHome, useItems } from '../../src/api/hooks';
import { font, makeStyles, radius, space, useColors } from '../../src/theme/tokens';
import { Screen, PageTitle } from '../../src/ui/Screen';
import { Chip, ChipRow, Segmented } from '../../src/ui/Controls';
import { Group } from '../../src/ui/Layout';
import { EmptyState, ErrorState, ListSkeleton } from '../../src/ui/Feedback';
import { Icon } from '../../src/ui/Icon';
import { EmptyTray } from '../../src/ui/artwork';
import { useFabSpace } from '../../src/ui/tabBar';
import { DueRow, SectionHead } from '../../src/items/parts';
import { useDone } from '../../src/items/useDone';
import { CATEGORIES, CATEGORY } from '../../src/lib/format';
import { monthYear } from '../../src/lib/dates';
import type { Category, Item, ItemStatus } from '../../src/types';

/**
 * ALL ITEMS (SCREENS #9, FR-I10). Find one: search, Open / Done, category
 * chips, grouped by month. Open sorts by due date; Done by when it was done.
 */
export default function Items() {
  const router = useRouter();
  const c = useColors();
  const s = useStyles();
  const bottom = useFabSpace();
  const [status, setStatus] = useState<ItemStatus>('open');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [q, setQ] = useState('');
  const list = useItems(status, category, q);
  const home = useHome();
  const { markDone } = useDone();

  const groups = useMemo(() => {
    const out: { month: string; items: Item[] }[] = [];
    for (const item of list.data?.items ?? []) {
      const day = status === 'done' && item.doneAt ? item.doneAt.slice(0, 10) : item.dueDate;
      const month = `${day.slice(0, 7)}-01`;
      const last = out.at(-1);
      if (last && last.month === month) last.items.push(item);
      else out.push({ month, items: [item] });
    }
    return out;
  }, [list.data, status]);

  const filtering = q.trim().length > 0 || category !== 'all';

  return (
    <Screen bottomPad={bottom} refreshing={list.isRefetching} onRefresh={() => void list.refetch()} testID="screen-items">
      <PageTitle title="All items" />

      <View style={{ gap: space.md }}>
        <View style={s.search}>
          <Icon name="search" size={18} color={c.textMuted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search titles, issuers, notes"
            placeholderTextColor={c.textFaint}
            style={s.searchInput}
            returnKeyType="search"
            accessibilityLabel="Search items"
            autoCorrect={false}
            testID="items-search"
          />
          {q ? <Icon name="x" size={16} color={c.textMuted} /> : null}
        </View>
        <Segmented
          options={[
            { value: 'open', label: 'Open' },
            { value: 'done', label: 'Done' },
          ]}
          value={status}
          onChange={setStatus}
        />
        <ChipRow>
          <Chip label="All" selected={category === 'all'} onPress={() => setCategory('all')} />
          {CATEGORIES.map((cat) => (
            <Chip key={cat} label={CATEGORY[cat].label} icon={CATEGORY[cat].icon} selected={category === cat} onPress={() => setCategory(cat)} />
          ))}
        </ChipRow>
      </View>

      {list.isLoading ? (
        <ListSkeleton rows={5} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : groups.length === 0 ? (
        filtering ? (
          <EmptyState compact title="Nothing matches" message="Try another word, or clear the category." />
        ) : status === 'done' ? (
          <EmptyState compact title="Nothing done yet" message="Items you mark done land here, so you can always find the letter again." />
        ) : (
          <EmptyState
            art={<EmptyTray size={150} />}
            title="No open deadlines"
            message="Snap a letter and we’ll find the date."
            actionLabel="Scan a letter"
            onAction={() => router.push('/scan')}
          />
        )
      ) : (
        groups.map((g) => (
          <View key={g.month}>
            <SectionHead title={monthYear(g.month)} count={g.items.length} />
            <Group>
              {g.items.map((i) => (
                <DueRow key={i.id} item={i} members={home.data?.members} onDone={markDone} />
              ))}
            </Group>
          </View>
        ))
      )}
    </Screen>
  );
}

const useStyles = makeStyles((c) => ({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    borderRadius: radius.input,
    backgroundColor: c.surfaceSunk,
    paddingHorizontal: space.md,
  },
  searchInput: { flex: 1, minWidth: 0, borderWidth: 0, color: c.text, fontFamily: font.body, fontSize: 16, paddingVertical: space.sm },
}));
