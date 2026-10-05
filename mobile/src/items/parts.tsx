import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { font, makeStyles, motion, radius, shadow, space, useColors, type Colors } from '../theme/tokens';
import { T } from '../ui/Text';
import { Press, tap } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Progress';
import { TAB_BAR_BOTTOM, TAB_BAR_H } from '../ui/tabBar';
import { countdown, countdownLabel, money } from '../lib/format';
import { addDays, dayOfMonth, localToday, monthShort, weekdayLetter, weekdayName } from '../lib/dates';
import type { Action, Item, Member } from '../types';

/**
 * The item vocabulary. One motif carries the whole app: the DATED CARD from
 * the artwork — a paper tile with a coloured strip and the day numeral. Its
 * strip says the urgency (plum today, marigold this week, brick late, leaf
 * done), always with words beside it, never colour alone.
 */

export type Urgency = 'late' | 'today' | 'soon' | 'later' | 'done';

export function urgencyOf(item: Pick<Item, 'daysLeft' | 'status'>): Urgency {
  if (item.status === 'done') return 'done';
  if (item.daysLeft < 0) return 'late';
  if (item.daysLeft === 0) return 'today';
  if (item.daysLeft <= 7) return 'soon';
  return 'later';
}

function urgencyColors(c: Colors, u: Urgency) {
  switch (u) {
    case 'late':
      return { strip: c.critical, stripText: '#FFFFFF', word: c.critical };
    case 'today':
      return { strip: c.brand, stripText: '#FFFFFF', word: c.brandInk };
    case 'soon':
      return { strip: c.accent, stripText: c.accentInk, word: c.brandInk };
    case 'done':
      return { strip: c.good, stripText: c.scheme === 'dark' ? '#141019' : '#FFFFFF', word: c.good };
    default:
      return { strip: c.brandSoft, stripText: c.brandInk, word: c.textMuted };
  }
}

/* ── the date tile ──────────────────────────────────────────────────────── */

export function DateTile({ day, urgency, size = 46 }: { day: string; urgency: Urgency; size?: number }) {
  const c = useColors();
  const u = urgencyColors(c, urgency);
  const strip = Math.round(size * 0.32);
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size * 1.08,
        borderRadius: Math.round(size * 0.24),
        backgroundColor: c.paper,
        borderWidth: 1,
        borderColor: c.line,
        overflow: 'hidden',
      }}
    >
      <View style={{ height: strip, backgroundColor: u.strip, alignItems: 'center', justifyContent: 'center' }}>
        <T style={{ color: u.stripText, fontFamily: font.bold, fontSize: Math.max(9, size * 0.2), lineHeight: strip }}>{monthShort(day)}</T>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <T style={{ fontFamily: font.display, fontSize: size * 0.44, lineHeight: size * 0.5, color: urgency === 'done' ? c.textMuted : c.text }}>{dayOfMonth(day)}</T>
      </View>
    </View>
  );
}

/* ── words ──────────────────────────────────────────────────────────────── */

const VERB: Record<Action, (issuer: string | null) => string> = {
  renew: (i) => (i ? `renew with ${i}` : 'renew'),
  pay: (i) => (i ? `pay ${i}` : 'pay'),
  submit: (i) => (i ? `submit to ${i}` : 'submit'),
  cancel: (i) => (i ? `cancel ${i}` : 'cancel'),
  book: (i) => (i ? `book with ${i}` : 'book it'),
  attend: (i) => (i ? `at ${i}` : 'attend'),
  other: (i) => (i ? `from ${i}` : 'due'),
};

/** "renew with State Farm" — the task in plain words. */
export function taskPhrase(item: Pick<Item, 'action' | 'issuer'>): string {
  return VERB[item.action](item.issuer);
}

/** Kept for the detail screen: a small pill with the countdown words. */
export function CountdownPill({ daysLeft, done }: { daysLeft: number; done?: boolean }) {
  const c = useColors();
  const s = useStyles();
  const u = urgencyColors(c, done ? 'done' : urgencyOf({ daysLeft, status: 'open' }));
  const bg = done ? c.goodSoft : daysLeft < 0 ? c.criticalSoft : daysLeft === 0 ? c.brand : c.brandSoft;
  const fg = done ? c.good : daysLeft === 0 ? c.onBrand : u.word === c.textMuted ? c.brandInk : u.word;
  return (
    <View style={[s.pill, { backgroundColor: bg }]} accessibilityLabel={done ? 'done' : countdownLabel(daysLeft)}>
      {done ? <Icon name="check" size={12} color={fg} strokeWidth={3} /> : daysLeft < 0 ? <Icon name="clock" size={12} color={fg} strokeWidth={2.4} /> : null}
      <T variant="caption" style={{ color: fg, fontFamily: font.semibold }}>
        {done ? 'Done' : countdown(daysLeft)}
      </T>
    </View>
  );
}

/* ── the done circle ────────────────────────────────────────────────────── */

/** The one orchestrated moment (DESIGN-SYSTEM §8): the check fills, a success haptic. */
export function DoneCircle({ done, onPress, label }: { done: boolean; onPress: () => void; label: string }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const [local, setLocal] = useState(done);
  const fill = useSharedValue(done ? 1 : 0);

  useEffect(() => {
    setLocal(done);
  }, [done]);

  useEffect(() => {
    fill.value = reduce ? (local ? 1 : 0) : withSpring(local ? 1 : 0, motion.spring);
  }, [local, reduce, fill]);

  const inner = useAnimatedStyle(() => ({ transform: [{ scale: fill.value }], opacity: fill.value }));

  return (
    <Press
      onPress={() => {
        if (!local) tap('success');
        setLocal(!local);
        onPress();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: local }}
      accessibilityLabel={label}
      hitSlop={10}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: local ? c.good : c.line, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[{ position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: c.good, alignItems: 'center', justifyContent: 'center' }, inner]}>
          <Icon name="check" size={15} color={c.scheme === 'dark' ? '#141019' : '#FFFFFF'} strokeWidth={3} />
        </Animated.View>
      </View>
    </Press>
  );
}

/* ── a row ──────────────────────────────────────────────────────────────── */

/**
 * DueRow: date tile · title (+ amount on the right) · one sentence that says
 * when and what — "In 6 days, renew with State Farm" — · the done circle.
 */
export function DueRow({ item, members, onDone, testID }: { item: Item; members?: Member[]; onDone?: (item: Item) => void; testID?: string }) {
  const c = useColors();
  const s = useStyles();
  const router = useRouter();
  const urgency = urgencyOf(item);
  const u = urgencyColors(c, urgency);
  const assignee = members && members.length > 1 ? members.find((m) => m.id === item.assigneeId) : undefined;
  const assigneeIndex = assignee && members ? members.indexOf(assignee) : 0;
  const done = item.status === 'done';
  const when = done ? 'Done' : countdown(item.daysLeft).replace(/^in /, 'In ');

  return (
    <View style={s.row} testID={testID}>
      <Press
        style={s.rowMain}
        onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${done ? 'done' : countdownLabel(item.daysLeft)}, ${taskPhrase(item)}`}
      >
        <DateTile day={item.dueDate} urgency={urgency} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
            <T variant="headline" numberOfLines={2} style={[{ flex: 1 }, done ? { color: c.textMuted, textDecorationLine: 'line-through' } : null]}>
              {item.title}
            </T>
            {item.amountCents !== null ? (
              <T variant="callout" style={{ color: done ? c.textMuted : c.text }}>
                {money(item.amountCents)}
              </T>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {assignee ? <Avatar name={assignee.displayName} index={assigneeIndex} size={16} /> : null}
            <T variant="caption" numberOfLines={1} style={{ flex: 1, color: c.textMuted }}>
              <T variant="caption" style={{ color: u.word === c.textMuted ? c.text : u.word, fontFamily: font.bold }}>
                {when}
              </T>
              {`, ${taskPhrase(item)}`}
            </T>
          </View>
        </View>
      </Press>
      {onDone ? <DoneCircle done={done} onPress={() => onDone(item)} label={`Mark ${item.title} done`} /> : null}
    </View>
  );
}

/* ── the hero ───────────────────────────────────────────────────────────── */

/** NEXT UP — the nearest open item, on plum: the dated card, the countdown, Mark done. */
/**
 * The one thing due next, as a compact plum card: date tile, title, a
 * countdown pill with the amount, and a round "done" button. One row — Home
 * shows the whole week under it instead of one card filling the screen.
 */
export function NextUpHero({ item, onDone, busy }: { item: Item; onDone: () => void; busy?: boolean }) {
  const c = useColors();
  const s = useStyles();
  const router = useRouter();
  const late = item.daysLeft < 0;
  const n = Math.abs(item.daysLeft);
  const pill = item.daysLeft === 0 ? 'Due today' : late ? `${n} ${n === 1 ? 'day' : 'days'} late` : `${n} ${n === 1 ? 'day' : 'days'} left`;

  return (
    <Press
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Next up: ${item.title}, ${countdownLabel(item.daysLeft)}`}
      testID="next-up"
    >
      <View style={[s.hero, shadow.lifted]}>
        <DateTile day={item.dueDate} urgency={late ? 'late' : item.daysLeft === 0 ? 'today' : 'soon'} size={52} />
        <View style={{ flex: 1, gap: 4 }}>
          <T variant="caption" numberOfLines={1} style={{ color: c.onBrandMuted }}>
            Next up · {taskPhrase(item)}
          </T>
          <T variant="headline" numberOfLines={1} style={{ color: c.onBrand, fontFamily: font.display, fontSize: 19, lineHeight: 24 }}>
            {item.title}
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={[s.heroPill, { backgroundColor: late ? '#FFB4AC' : c.accentOnBrand }]}>
              <T variant="caption" style={{ color: '#1E1229', fontFamily: font.bold }}>
                {pill}
              </T>
            </View>
            {item.amountCents !== null ? (
              <T variant="callout" style={{ color: c.onBrand }}>
                {money(item.amountCents)}
              </T>
            ) : null}
          </View>
        </View>
        <Press
          onPress={onDone}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Mark ${item.title} done`}
          hitSlop={8}
          style={s.heroDone}
          testID="next-up-done"
        >
          <Icon name="check" size={22} color="#1E1229" strokeWidth={2.6} />
        </Press>
      </View>
    </Press>
  );
}

/* ── the fortnight strip ────────────────────────────────────────────────── */

/**
 * The next 14 days as date cells. A marigold mark under a day = something is
 * due; a brick mark on today = something is already late. Tap a marked day
 * to see what's on it.
 */
export function WeekRail({ items, overdueCount, onDay }: { items: Item[]; overdueCount: number; onDay: (day: string, items: Item[]) => void }) {
  const c = useColors();
  const s = useStyles();
  const today = localToday();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const byDay = new Map<string, Item[]>();
  for (const it of items) byDay.set(it.dueDate, [...(byDay.get(it.dueDate) ?? []), it]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: space.lg }} testID="week-rail">
      {days.map((d, i) => {
        const list = byDay.get(d) ?? [];
        const isToday = i === 0;
        const marks = Math.min(3, list.length);
        const label = `${weekdayName(d)} ${dayOfMonth(d)}${list.length ? `, ${list.length} due` : ', nothing due'}${isToday && overdueCount ? `, ${overdueCount} late` : ''}`;
        return (
          <Press
            key={d}
            onPress={() => {
              if (list.length > 0) onDay(d, list);
            }}
            accessibilityRole="button"
            accessibilityLabel={label}
            testID={`day-${d}`}
            style={[s.dayCell, isToday && { backgroundColor: c.scheme === 'dark' ? '#4A3466' : c.brand, borderColor: c.scheme === 'dark' ? '#4A3466' : c.brand }, list.length > 0 && !isToday && { borderColor: c.accent }]}
          >
            <T variant="caption" style={{ color: isToday ? c.onBrandMuted : c.textMuted, fontFamily: font.semibold }}>
              {weekdayLetter(d)}
            </T>
            <T style={{ fontFamily: font.display, fontSize: 19, lineHeight: 22, color: isToday ? c.onBrand : c.text }}>{dayOfMonth(d)}</T>
            <View style={{ flexDirection: 'row', gap: 3, height: 6 }}>
              {isToday && overdueCount > 0 ? <View style={[s.mark, { backgroundColor: '#FF8A80' }]} /> : null}
              {Array.from({ length: marks }, (_, k) => (
                <View key={k} style={[s.mark, { backgroundColor: c.accent }]} />
              ))}
            </View>
          </Press>
        );
      })}
    </ScrollView>
  );
}

/* ── scan button ────────────────────────────────────────────────────────── */

/**
 * Marigold circle beside the floating tab bar, in the thumb zone. A SIBLING of
 * the bar, never a child (traps.md: an elevated child escapes overflow:hidden
 * on Android). Long-press → type one instead.
 */
export function ScanFab() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[{ position: 'absolute', right: 16, bottom: insets.bottom + TAB_BAR_BOTTOM }, style]} pointerEvents="box-none">
      <Press
        testID="scan-fab"
        accessibilityRole="button"
        accessibilityLabel="Scan a letter"
        accessibilityHint="Long press to type one instead"
        onPressIn={() => {
          if (!reduce) scale.value = withTiming(0.94, { duration: motion.fast });
        }}
        onPressOut={() => {
          if (!reduce) scale.value = withSpring(1, motion.spring);
        }}
        onPress={() => router.push('/scan')}
        onLongPress={() => {
          tap();
          router.push('/item/new');
        }}
        style={{
          width: TAB_BAR_H,
          height: TAB_BAR_H,
          borderRadius: TAB_BAR_H / 2,
          backgroundColor: c.accent,
          alignItems: 'center',
          justifyContent: 'center',
          ...shadow.lifted,
        }}
      >
        <Icon name="camera" size={26} color={c.accentInk} strokeWidth={2.2} />
      </Press>
    </Animated.View>
  );
}

/* ── section head ───────────────────────────────────────────────────────── */

export function SectionHead({ title, count, tone }: { title: string; count?: number; tone?: 'late' }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginBottom: space.sm, paddingHorizontal: space.xs }}>
      <T variant="headline" style={{ color: tone === 'late' ? c.critical : c.text }}>
        {title}
      </T>
      {count !== undefined ? (
        <T variant="caption" tone="faint">
          {count}
        </T>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  pill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 24, paddingHorizontal: space.sm + 2, borderRadius: radius.chip },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: space.xs, minHeight: 72 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingLeft: space.md },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: c.brand, borderRadius: radius.card, padding: space.md },
  heroPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.chip },
  heroDone: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  dayCell: {
    width: 46,
    paddingVertical: space.sm,
    borderRadius: radius.tile,
    borderWidth: 1.5,
    borderColor: c.line,
    backgroundColor: c.surface,
    alignItems: 'center',
    gap: 2,
  },
  mark: { width: 6, height: 6, borderRadius: 3 },
}));

/** Used by the Home header — counts and money for the smart sentence. */
export function summarize(overdue: Item[], thisWeek: Item[], thisMonth: Item[]) {
  const late = overdue.length;
  const week = thisWeek.length;
  const monthCents = [...overdue, ...thisWeek, ...thisMonth].reduce((n, i) => n + (i.amountCents ?? 0), 0);
  let line: string;
  if (late > 0 && week > 0) line = `${late} overdue, ${week} due this week.`;
  else if (late > 0) line = `${late} overdue. The rest can wait.`;
  else if (week > 0) line = `${week} due this week.`;
  else if (thisMonth.length > 0) line = 'A quiet week ahead.';
  else line = 'Nothing due soon.';
  return { line, monthCents };
}

