import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Chip } from '../ui/Controls';
import { font, makeStyles, radius, space, useColors } from '../theme/tokens';
import { addDays, addMonths, isDay, localToday, longDate, monthGrid, monthYear, shiftMonths, WEEKDAY_LETTERS } from '../lib/dates';

const QUICK = [
  { label: 'Today', day: () => localToday() },
  { label: 'In a week', day: () => addDays(localToday(), 7) },
  { label: 'In a month', day: () => shiftMonths(localToday(), 1) },
  { label: 'In a year', day: () => shiftMonths(localToday(), 12) },
];
import { T } from '../ui/Text';
import { Button, IconButton, Press } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Sheet';

/**
 * A small month-grid date picker (no native dependency). Works on
 * `YYYY-MM-DD` strings end to end — never `new Date('YYYY-MM-DD')`.
 */
export function DatePicker({ value, onChange, max }: { value: string | null; onChange: (day: string) => void; max?: string }) {
  const c = useColors();
  const s = useStyles();
  const [month, setMonth] = useState(() => (value && isDay(value) ? value : localToday()).slice(0, 7) + '-01');
  useEffect(() => {
    if (value && isDay(value)) setMonth(`${value.slice(0, 7)}-01`);
  }, [value]);
  const days = monthGrid(month);
  const today = localToday();
  const nextDisabled = max ? addMonths(month, 1) > max : false;

  return (
    <View style={{ gap: space.sm }}>
      <View style={s.head}>
        <IconButton icon="chevron-left" label="Previous month" onPress={() => setMonth(addMonths(month, -1))} />
        <T variant="headline" style={{ flex: 1, textAlign: 'center' }} accessibilityRole="header">
          {monthYear(month)}
        </T>
        {nextDisabled ? <View style={{ width: 44 }} /> : <IconButton icon="chevron-right" label="Next month" onPress={() => setMonth(addMonths(month, 1))} />}
      </View>
      <View style={s.row}>
        {WEEKDAY_LETTERS.map((l, i) => (
          <T key={i} variant="caption" tone="faint" style={s.cellText}>
            {l}
          </T>
        ))}
      </View>
      {[0, 1, 2, 3, 4, 5].map((week) => (
        <View key={week} style={s.row}>
          {days.slice(week * 7, week * 7 + 7).map((day) => {
            const inMonth = day.slice(0, 7) === month.slice(0, 7);
            const selected = day === value;
            const disabled = max ? day > max : false;
            return (
              <Press
                key={day}
                onPress={() => onChange(day)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled }}
                accessibilityLabel={longDate(day)}
                style={[s.cell, selected && { backgroundColor: c.brandInk }]}
              >
                <T
                  variant="callout"
                  style={{
                    color: selected ? c.ground : inMonth ? c.text : c.textFaint,
                    fontFamily: day === today || selected ? font.bold : font.medium,
                  }}
                >
                  {String(Number(day.slice(8, 10)))}
                </T>
                {day === today && !selected ? <View style={[s.todayDot, { backgroundColor: c.brandInk }]} /> : null}
              </Press>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** A form row that shows a date and opens the picker in a sheet. */
export function DateField({
  label,
  value,
  onChange,
  aiRead,
  edited,
  max,
  testID,
}: {
  label: string;
  value: string | null;
  onChange: (day: string | null) => void;
  aiRead?: boolean;
  edited?: boolean;
  max?: string;
  testID?: string;
}) {
  const c = useColors();
  const s = useStyles();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(value);
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        <T variant="caption" tone="muted" style={{ flex: 1 }}>
          {label}
        </T>
        <FieldMark aiRead={aiRead} edited={edited} />
      </View>
      <Press
        testID={testID}
        onPress={() => {
          setPending(value);
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? longDate(value) : 'not set'}`}
        style={s.box}
      >
        <Icon name="calendar" size={18} color={c.textMuted} />
        <T style={{ flex: 1, color: value ? c.text : c.textFaint }}>{value ? longDate(value) : 'Choose a date'}</T>
      </Press>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingBottom: space.md }}>
          {QUICK.map((q) => (
            <Chip key={q.label} label={q.label} selected={pending === q.day()} onPress={() => setPending(q.day())} />
          ))}
        </ScrollView>
        <DatePicker value={pending} onChange={setPending} max={max} />
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          <Button
            label="Use this date"
            disabled={!pending}
            onPress={() => {
              onChange(pending);
              setOpen(false);
            }}
          />
          {value ? (
            <Button
              label="Clear date"
              tone="quiet"
              onPress={() => {
                onChange(null);
                setOpen(false);
              }}
            />
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}

/** "AI read this" / "You corrected this" — shared by every review field. */
export function FieldMark({ aiRead, edited }: { aiRead?: boolean; edited?: boolean }) {
  const c = useColors();
  if (edited) {
    return (
      <T variant="caption" tone="brand">
        You corrected this
      </T>
    );
  }
  if (!aiRead) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel="Read by AI — check it">
      <Icon name="sparkles" size={12} color={c.brandInk} />
      <T variant="caption" tone="brand">
        AI read this
      </T>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  head: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row' },
  cellText: { flex: 1, textAlign: 'center' },
  cell: { flex: 1, aspectRatio: 1, maxHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.chip },
  todayDot: { position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: 2 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 50,
    borderRadius: radius.input,
    backgroundColor: c.surfaceSunk,
    paddingHorizontal: space.lg,
  },
}));
