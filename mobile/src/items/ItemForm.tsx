import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '../auth/context';
import { usePlanGate } from '../billing/gate';
import { font, makeStyles, radius, space, useColors } from '../theme/tokens';
import { T } from '../ui/Text';
import { Press, tap } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Chip, ChipRow, Field } from '../ui/Controls';
import { Avatar } from '../ui/Progress';
import { DateField } from '../documents/DatePicker';
import {
  ACTION,
  ACTIONS,
  ALL_OFFSETS,
  CATEGORIES,
  CATEGORY,
  FREE_OFFSETS,
  moneyInput,
  offsetsLabel,
  parseMoney,
  PRO_DEFAULT_OFFSETS,
  REPEAT,
} from '../lib/format';
import { isDay } from '../lib/dates';
import type { Action, Category, ItemInput, Member, Offset, Repeat } from '../types';

/**
 * The one item form (FR-I1…I4): new, edit, and each card on the scan confirm
 * screen. Only Title and Due date are required; everything else sits under
 * "More details" (design.md §16: ask only what is needed now).
 */

export interface FormState {
  title: string;
  dueDate: string | null;
  category: Category;
  action: Action;
  amount: string;
  issuer: string;
  reference: string;
  notes: string;
  repeat: Repeat;
  repeatYears: number;
  offsets: Offset[];
  assigneeId: string | null;
}

export function emptyForm(isPro: boolean, category: Category = 'other'): FormState {
  return {
    title: '',
    dueDate: null,
    category,
    action: category === 'subscriptions' ? 'cancel' : category === 'bills' ? 'pay' : category === 'kids_school' ? 'submit' : 'renew',
    amount: '',
    issuer: '',
    reference: '',
    notes: '',
    repeat: 'none',
    repeatYears: 5,
    offsets: isPro ? PRO_DEFAULT_OFFSETS : FREE_OFFSETS,
    assigneeId: null,
  };
}

export function formFrom(v: Partial<Omit<ItemInput, 'title' | 'dueDate'>> & { title?: string | null; dueDate?: string | null }, isPro: boolean): FormState {
  const base = emptyForm(isPro, v.category ?? 'other');
  return {
    ...base,
    title: v.title ?? '',
    dueDate: v.dueDate ?? null,
    action: v.action ?? base.action,
    amount: moneyInput(v.amountCents ?? null),
    issuer: v.issuer ?? '',
    reference: v.referenceLast4 ?? '',
    notes: v.notes ?? '',
    repeat: v.repeat ?? 'none',
    repeatYears: v.repeatYears ?? 5,
    offsets: v.offsets && v.offsets.length > 0 ? v.offsets : base.offsets,
    assigneeId: v.assigneeId ?? null,
  };
}

export function validate(f: FormState): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.title.trim().length === 0) out.title = 'Give it a short name, like “Car insurance”.';
  if (f.title.trim().length > 80) out.title = 'Keep it under 80 characters.';
  if (!f.dueDate || !isDay(f.dueDate)) out.dueDate = 'Pick the date it’s due.';
  if (f.amount.trim() && parseMoney(f.amount) === null) out.amount = 'Enter an amount like 412.50.';
  return out;
}

export function toInput(f: FormState): ItemInput {
  return {
    title: f.title.trim(),
    dueDate: f.dueDate as string,
    category: f.category,
    action: f.action,
    amountCents: f.amount.trim() ? parseMoney(f.amount) : null,
    issuer: f.issuer.trim() || null,
    referenceLast4: f.reference.replace(/\s/g, '').slice(-4) || null,
    notes: f.notes.trim() || null,
    repeat: f.repeat,
    repeatYears: f.repeat === 'years' ? f.repeatYears : null,
    offsets: f.offsets,
    assigneeId: f.assigneeId,
  };
}

export function ItemForm({
  value,
  onChange,
  errors = {},
  members,
  evidence,
  aiRead,
  startOpen,
  compact,
}: {
  value: FormState;
  onChange: (next: FormState) => void;
  errors?: Record<string, string>;
  members?: Member[];
  /** The words the AI took the date from (BR-03) — shown under the date. */
  evidence?: string | null;
  /** Fields the AI filled, for the "AI read this" mark. */
  aiRead?: { title?: boolean; dueDate?: boolean; amount?: boolean };
  startOpen?: boolean;
  compact?: boolean;
}) {
  const c = useColors();
  const s = useStyles();
  const [more, setMore] = useState(Boolean(startOpen));
  const set = <K extends keyof FormState>(key: K, v: FormState[K]) => onChange({ ...value, [key]: v });

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.xs }}>
        <DateField
          label="Due date"
          value={value.dueDate}
          onChange={(d) => set('dueDate', d)}
          aiRead={aiRead?.dueDate}
          testID="form-due"
        />
        {evidence ? (
          <View style={s.evidence} accessibilityLabel={`Found in the letter: ${evidence}`}>
            <Icon name="sparkles" size={14} color={c.brandInk} />
            <T variant="caption" style={{ flex: 1, fontStyle: 'italic' }}>
              “{evidence}”
            </T>
          </View>
        ) : null}
        {errors.dueDate ? (
          <T variant="caption" tone="critical">
            {errors.dueDate}
          </T>
        ) : null}
      </View>

      <Field
        label="What is it?"
        value={value.title}
        onChangeText={(t) => set('title', t)}
        placeholder="Car insurance"
        maxLength={80}
        autoCapitalize="sentences"
        error={errors.title}
        hint={aiRead?.title ? 'AI read this — change it if it’s off.' : undefined}
        testID="form-title"
      />

      <View style={{ gap: space.sm }}>
        <T variant="caption" tone="muted">
          What do you need to do?
        </T>
        <ChipRow>
          {ACTIONS.map((a) => (
            <Chip key={a} label={a === 'other' ? 'Other' : ACTION[a]} selected={value.action === a} onPress={() => set('action', a)} />
          ))}
        </ChipRow>
      </View>

      {!more ? (
        <Press onPress={() => setMore(true)} accessibilityRole="button" style={s.moreBtn} testID="form-more">
          <T variant="callout" tone="brand">
            More details
          </T>
          <T variant="caption" tone="muted" style={{ flex: 1 }} numberOfLines={1}>
            category, amount, repeat, reminders
          </T>
          <Icon name="chevron-down" size={18} color={c.brandInk} />
        </Press>
      ) : (
        <MoreDetails value={value} set={set} errors={errors} members={members} compact={compact} aiAmount={aiRead?.amount} />
      )}
    </View>
  );
}

function MoreDetails({
  value,
  set,
  errors,
  members,
  compact,
  aiAmount,
}: {
  value: FormState;
  set: <K extends keyof FormState>(key: K, v: FormState[K]) => void;
  errors: Record<string, string>;
  members?: Member[];
  compact?: boolean;
  aiAmount?: boolean;
}) {
  const c = useColors();
  const s = useStyles();
  const { isPro } = useAuth();
  const { openPaywall } = usePlanGate();

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }}>
        <T variant="caption" tone="muted">
          Category
        </T>
        <View style={s.catGrid}>
          {CATEGORIES.map((cat) => {
            const on = value.category === cat;
            return (
              <Press
                key={cat}
                onPress={() => set('category', cat)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={CATEGORY[cat].label}
                style={[s.cat, on && { backgroundColor: c.brand, borderColor: c.brand }]}
              >
                <Icon name={CATEGORY[cat].icon} size={16} color={on ? c.onBrand : c.brandInk} />
                <T variant="caption" numberOfLines={1} style={{ color: on ? c.onBrand : c.text, fontFamily: font.semibold, flexShrink: 1 }}>
                  {CATEGORY[cat].label}
                </T>
              </Press>
            );
          })}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Field
          label="Amount (optional)"
          value={value.amount}
          onChangeText={(t) => set('amount', t)}
          placeholder="0.00"
          keyboardType="decimal-pad"
          error={errors.amount}
          hint={aiAmount ? 'AI read this' : undefined}
          containerStyle={{ flex: 1 }}
          testID="form-amount"
        />
        <Field
          label="Reference (last 4)"
          value={value.reference}
          onChangeText={(t) => set('reference', t.replace(/\s/g, '').slice(-4))}
          placeholder="4821"
          maxLength={4}
          autoCapitalize="characters"
          containerStyle={{ flex: 1 }}
        />
      </View>

      <Field label="From (optional)" value={value.issuer} onChangeText={(t) => set('issuer', t)} placeholder="State Farm, DMV, school…" testID="form-issuer" />

      <View style={{ gap: space.sm }}>
        <T variant="caption" tone="muted">
          Repeats
        </T>
        <ChipRow>
          {(Object.keys(REPEAT) as Repeat[]).map((r) => (
            <Chip key={r} label={REPEAT[r]} selected={value.repeat === r} onPress={() => set('repeat', r)} />
          ))}
        </ChipRow>
        {value.repeat === 'years' ? (
          <ChipRow>
            {[2, 3, 4, 5, 10].map((n) => (
              <Chip key={n} label={`Every ${n} years`} selected={value.repeatYears === n} onPress={() => set('repeatYears', n)} />
            ))}
          </ChipRow>
        ) : null}
        {value.repeat !== 'none' ? (
          <T variant="caption" tone="faint">
            When you mark it done, we’ll add the next one for you.
          </T>
        ) : null}
      </View>

      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <T variant="caption" tone="muted" style={{ flex: 1 }}>
            Remind me
          </T>
          <T variant="caption" tone="faint">
            {offsetsLabel(value.offsets)} + on the day
          </T>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {ALL_OFFSETS.map((o) => {
            const on = value.offsets.includes(o);
            const locked = !isPro && o !== 7;
            return (
              <Press
                key={o}
                testID={`offset-${o}`}
                onPress={() => {
                  if (locked) return openPaywall('custom_reminders');
                  tap();
                  const next = on ? value.offsets.filter((x) => x !== o) : [...value.offsets, o].sort((a, b) => b - a);
                  set('offsets', next as Offset[]);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: locked }}
                accessibilityLabel={`${o} ${o === 1 ? 'day' : 'days'} before${locked ? ', Pro' : ''}`}
                style={[s.offset, on && { backgroundColor: c.brand, borderColor: c.brand }]}
              >
                <T variant="callout" style={{ color: on ? c.onBrand : locked ? c.textFaint : c.text }}>
                  {o}d
                </T>
                {locked ? <Icon name="lock" size={12} color={c.textFaint} /> : null}
              </Press>
            );
          })}
        </View>
        {!isPro ? (
          <T variant="caption" tone="faint">
            Free reminds you 7 days before and on the day. Pro lets you choose.
          </T>
        ) : null}
      </View>

      {members && members.length > 1 ? (
        <View style={{ gap: space.sm }}>
          <T variant="caption" tone="muted">
            Who handles it?
          </T>
          <ChipRow>
            <Chip label="Anyone" selected={value.assigneeId === null} onPress={() => set('assigneeId', null)} />
            {members.map((m, i) => (
              <Press
                key={m.id}
                onPress={() => set('assigneeId', m.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: value.assigneeId === m.id }}
                accessibilityLabel={m.isMe ? 'Me' : m.displayName}
                style={[s.person, value.assigneeId === m.id && { borderColor: c.brandInk, backgroundColor: c.brandSoft }]}
              >
                <Avatar name={m.displayName} index={i} size={22} />
                <T variant="caption" style={{ fontFamily: font.semibold }}>
                  {m.isMe ? 'Me' : m.displayName.split(' ')[0]}
                </T>
              </Press>
            ))}
          </ChipRow>
        </View>
      ) : null}

      {!compact ? (
        <Field label="Notes (optional)" value={value.notes} onChangeText={(t) => set('notes', t)} placeholder="Policy covers both cars. Call to switch to annual." multiline maxLength={1000} />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  evidence: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    backgroundColor: c.surfaceSunk,
    borderRadius: radius.input,
    padding: space.md,
    borderLeftWidth: 3,
    borderLeftColor: c.accent,
  },
  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    borderRadius: radius.input,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: c.line,
    paddingHorizontal: space.md,
  },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.surface,
    maxWidth: '100%',
  },
  offset: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 52,
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.surface,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingLeft: 6,
    paddingRight: space.md,
    borderRadius: radius.chip,
    borderWidth: 1.5,
    borderColor: c.line,
    backgroundColor: c.surface,
  },
}));
