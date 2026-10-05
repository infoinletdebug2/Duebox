import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useHome, useItems } from '../../src/api/hooks';
import { useAuth } from '../../src/auth/context';
import { font, makeStyles, radius, space, useColors } from '../../src/theme/tokens';
import { Screen } from '../../src/ui/Screen';
import { T } from '../../src/ui/Text';
import { Button, Press } from '../../src/ui/Button';
import { Icon } from '../../src/ui/Icon';
import { Group } from '../../src/ui/Layout';
import { Avatar } from '../../src/ui/Progress';
import { Banner, ErrorState, ListSkeleton, Skeleton } from '../../src/ui/Feedback';
import { Sheet } from '../../src/ui/Sheet';
import { AllDone, EmptyTray } from '../../src/ui/artwork';
import { useFabSpace } from '../../src/ui/tabBar';
import { DueRow, NextUpHero, SectionHead, WeekRail, summarize } from '../../src/items/parts';
import { useDone } from '../../src/items/useDone';
import { CATEGORY, money, plural } from '../../src/lib/format';
import { localToday, longDate, weekdayName } from '../../src/lib/dates';
import { loadDiscovery } from '../../src/onboarding/discovery';
import { hasAskedForPush, permissionStatus, type PushPermission } from '../../src/notifications/push';
import { noteFirstUse } from '../../src/lib/review';
import type { Category, Item } from '../../src/types';

/**
 * HOME (SCREENS #3, FR-H1…H5). One answer: what is due next, and when.
 *
 * The headline is a sentence worked out from the data ("1 overdue, 2 due this
 * week."), not a greeting. Under it, the next 14 days as date cells — the one
 * memorable element — then Next up and the sections. Empty home has one action.
 */
export default function Home() {
  const router = useRouter();
  const c = useColors();
  const s = useStyles();
  const bottom = useFabSpace();
  const { plan, me } = useAuth();
  const home = useHome();
  const { markDone, pending } = useDone();
  const [push, setPush] = useState<PushPermission | null>(null);
  const [asked, setAsked] = useState(false);
  const [dayOpen, setDayOpen] = useState<{ day: string; items: Item[] } | null>(null);

  useEffect(() => {
    void noteFirstUse();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void permissionStatus().then(setPush);
      void hasAskedForPush().then(setAsked);
    }, []),
  );

  const data = home.data;
  const today = localToday();
  const firstName = me?.user.name?.split(' ')[0] ?? '';

  const top = (line: string, sub: string | null) => (
    <View style={s.head}>
      <View style={{ flex: 1, gap: 6 }}>
        <T variant="callout" tone="muted">
          {weekdayName(today)}, {longDate(today).replace(/, \d{4}$/, '')}
        </T>
        <T style={s.headline} accessibilityRole="header" testID="home-headline">
          {line}
        </T>
        {sub ? (
          <T tone="muted" style={{ fontSize: 16 }}>
            {sub}
          </T>
        ) : null}
      </View>
      {firstName ? (
        <Press onPress={() => router.push('/(tabs)/settings')} accessibilityRole="button" accessibilityLabel="Settings">
          <Avatar name={firstName} index={0} size={40} />
        </Press>
      ) : null}
    </View>
  );

  if (home.isLoading) {
    return (
      <Screen bottomPad={bottom} testID="screen-home">
        <Skeleton height={86} width="80%" />
        <Skeleton height={76} style={{ borderRadius: radius.tile }} />
        <Skeleton height={230} style={{ borderRadius: radius.hero }} />
        <ListSkeleton rows={3} />
      </Screen>
    );
  }

  if (home.isError || !data) {
    return (
      <Screen bottomPad={bottom} testID="screen-home">
        {top('Your deadlines', null)}
        <ErrorState error={home.error} onRetry={() => void home.refetch()} />
      </Screen>
    );
  }

  const hide = (list: Item[]) => list.filter((i) => i.id !== data.nextUp?.id);
  const overdue = hide(data.overdue);
  const thisWeek = hide(data.thisWeek);
  const thisMonth = hide(data.thisMonth);
  const isEmpty = !data.nextUp && data.laterCount === 0 && data.overdue.length === 0;
  const showPushBanner = !isEmpty && (push === 'denied' || (push === 'undetermined' && asked));
  const freeLimit = plan?.limits.openItems ?? null;
  const used = plan?.usage.openItems ?? 0;
  const { line, monthCents } = summarize(data.overdue, data.thisWeek, data.thisMonth);
  const upcoming = [...data.thisWeek, ...data.thisMonth];
  const sub = monthCents > 0 ? `${money(monthCents)} due in the next 30 days` : data.nextUp ? `Next: ${data.nextUp.title}` : null;

  return (
    <Screen bottomPad={bottom} refreshing={home.isRefetching} onRefresh={() => void home.refetch()} testID="screen-home">
      {isEmpty ? top('Your tray is empty.', 'Add the first thing with a date.') : top(line, sub)}

      {!isEmpty ? <WeekRail items={upcoming} overdueCount={data.overdue.length} onDay={(day, items) => setDayOpen({ day, items })} /> : null}

      {showPushBanner ? (
        <Banner icon="bell-off" message="Reminders are off — you’ll only see deadlines in the app." actionLabel="Turn on" onPress={() => router.push('/settings/notifications')} />
      ) : null}

      {data.inbox.length > 0 ? (
        <Press onPress={() => router.push({ pathname: '/scan/[id]', params: { id: data.inbox[0]!.id } })} accessibilityRole="button" style={s.inbox} testID="home-inbox">
          <View style={s.inboxIcon}>
            <Icon name="sparkles" size={18} color={c.accentInk} />
          </View>
          <View style={{ flex: 1 }}>
            <T variant="headline">{data.inbox.length === 1 ? 'A scan is ready to check' : `${data.inbox.length} scans are ready to check`}</T>
            <T variant="caption" tone="muted">
              We read it — confirm the dates
            </T>
          </View>
          <Icon name="chevron-right" size={18} color={c.textMuted} />
        </Press>
      ) : null}

      {isEmpty ? (
        <EmptyHome />
      ) : (
        <>
          {data.nextUp ? <NextUpHero item={data.nextUp} onDone={() => markDone(data.nextUp as Item)} busy={pending === data.nextUp.id} /> : null}

          {overdue.length > 0 ? (
            <View>
              <SectionHead title="Overdue" count={overdue.length} tone="late" />
              <Group>
                {overdue.map((i) => (
                  <DueRow key={i.id} item={i} members={data.members} onDone={markDone} />
                ))}
              </Group>
            </View>
          ) : null}

          {thisWeek.length > 0 ? (
            <View>
              <SectionHead title="This week" count={thisWeek.length} />
              <Group>
                {thisWeek.map((i) => (
                  <DueRow key={i.id} item={i} members={data.members} onDone={markDone} />
                ))}
              </Group>
            </View>
          ) : null}

          {thisMonth.length > 0 ? (
            <View>
              <SectionHead title="Later this month" count={thisMonth.length} />
              <Group>
                {thisMonth.map((i) => (
                  <DueRow key={i.id} item={i} members={data.members} onDone={markDone} />
                ))}
              </Group>
            </View>
          ) : null}

          {data.laterCount > 0 ? (
            <Press onPress={() => router.push('/(tabs)/items')} accessibilityRole="button" style={s.later} testID="home-later">
              <T variant="callout" style={{ flex: 1 }}>
                {plural(data.laterCount, 'more deadline')} further out
              </T>
              <T variant="callout" tone="brand">
                See all
              </T>
            </Press>
          ) : null}

          {!data.nextUp && overdue.length === 0 ? (
            <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
              <AllDone size={150} />
              <T variant="title">Nothing due soon. Nice.</T>
            </View>
          ) : null}

          {freeLimit !== null && used >= freeLimit - 1 ? (
            <Press onPress={() => router.push({ pathname: '/paywall', params: { reason: 'item_limit' } })} accessibilityRole="button" style={s.limit}>
              <T variant="caption" tone="muted" style={{ flex: 1 }}>
                {used} of {freeLimit} free deadlines used
              </T>
              <T variant="caption" tone="brand" style={{ fontFamily: font.bold }}>
                Go unlimited
              </T>
            </Press>
          ) : null}
        </>
      )}

      <Sheet visible={dayOpen !== null} onClose={() => setDayOpen(null)} title={dayOpen ? `${weekdayName(dayOpen.day)}, ${longDate(dayOpen.day).replace(/, \d{4}$/, '')}` : ''}>
        <View style={{ marginHorizontal: -space.md }}>
          {(dayOpen?.items ?? []).map((i) => (
            <DueRow key={i.id} item={i} members={data.members} />
          ))}
        </View>
      </Sheet>
    </Screen>
  );
}

const useStyles = makeStyles((c) => ({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingTop: space.sm },
  headline: { fontFamily: font.display, fontSize: 32, lineHeight: 37, letterSpacing: -0.8, color: c.text },
  inbox: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: c.surface, borderRadius: radius.group, borderWidth: 1, borderColor: c.line, padding: space.md },
  inboxIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  later: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: space.lg, borderRadius: radius.group, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line },
  limit: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs },
}));

/** FR-H5 — one drawing, one sentence, one action; suggestions from discovery. */
function EmptyHome() {
  const router = useRouter();
  const c = useColors();
  const [picked, setPicked] = useState<Category[]>([]);
  const done = useItems('done', 'all', '');

  useEffect(() => {
    void loadDiscovery().then((d) => setPicked(d?.categories ?? []));
  }, []);

  const everDone = (done.data?.items.length ?? 0) > 0;
  const suggestions = (picked.length > 0 ? picked : (['insurance', 'vehicle', 'subscriptions'] as Category[])).slice(0, 3);

  if (everDone) {
    return (
      <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.xl }} testID="home-all-done">
        <AllDone size={170} />
        <T variant="title" align="center">
          Nothing due. Nice.
        </T>
        <T tone="muted" align="center" style={{ maxWidth: 300 }}>
          Got a new letter? Snap it and we’ll keep track.
        </T>
      </View>
    );
  }

  return (
    <View style={{ gap: space.xl, paddingTop: space.lg }} testID="home-empty">
      <View style={{ alignItems: 'center', gap: space.md }}>
        <EmptyTray size={190} />
        <T variant="title" align="center">
          Your tray is empty
        </T>
        <T tone="muted" align="center" style={{ maxWidth: 320 }}>
          Snap a letter with a deadline. We’ll read it and remind you before it’s due.
        </T>
      </View>
      <View style={{ gap: space.sm }}>
        <Button label="Scan your first letter" icon="camera" onPress={() => router.push('/scan')} testID="home-empty-scan" />
        <Button label="Type one instead" tone="quiet" onPress={() => router.push('/item/new')} />
      </View>
      <View style={{ gap: space.sm }}>
        <T variant="micro" tone="muted" style={{ paddingHorizontal: space.xs }}>
          Good first ones
        </T>
        <Group>
          {suggestions.map((cat) => (
            <Press
              key={cat}
              onPress={() => router.push({ pathname: '/item/new', params: { category: cat } })}
              accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 56 }}
            >
              <Icon name={CATEGORY[cat].icon} size={20} color={c.brandInk} />
              <T variant="headline" style={{ flex: 1 }}>
                {SUGGESTION[cat]}
              </T>
              <Icon name="plus" size={18} color={c.textMuted} />
            </Press>
          ))}
        </Group>
      </View>
    </View>
  );
}

const SUGGESTION: Record<Category, string> = {
  id_travel: 'Passport expiry',
  vehicle: 'Car registration renewal',
  home: 'Home insurance or lease renewal',
  insurance: 'Car insurance renewal',
  bills: 'A bill with a due date',
  health: 'Prescription or check-up',
  kids_school: 'School form or trip payment',
  subscriptions: 'Free trial ending',
  work: 'Licence or certification renewal',
  other: 'Anything with a date',
};
