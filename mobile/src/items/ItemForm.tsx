import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '../auth/context';
import { usePlanGate } from '../billing/gate';
import { makeStyles, radius, space, useColors } from '../theme/tokens';
import { T } from '../ui/Text';
import { Press, tap } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { ChoiceGrid, Field } from '../ui/Controls';
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
        <ChoiceGrid
          columns={4}
          options={ACTIONS.map((a) => ({ key: a, label: a === 'other' ? 'Other' : ACTION[a] }))}
          isOn={(k) => value.action === k}
          onPress={(k) => {
            tap();
            set('action', k as Action);
          }}
          testIDPrefix="action-"
        />
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
  const { isPro } = useAuth();
  const { openPaywall } = usePlanGate();

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }}>
        <T variant="caption" tone="muted">
          Category
        </T>
        <ChoiceGrid
          columns={2}
          align="left"
          options={CATEGORIES.map((cat) => ({ key: cat, label: cat === 'subscriptions' ? 'Trials & subs' : CATEGORY[cat].label, icon: CATEGORY[cat].icon }))}
          isOn={(k) => value.category === k}
          onPress={(k) => {
            tap();
            set('category', k as Category);
          }}
          testIDPrefix="category-"
        />
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
        <ChoiceGrid
          columns={3}
          options={(Object.keys(REPEAT) as Repeat[]).map((r) => ({ key: r, label: r === 'none' ? 'Once' : r === 'years' ? 'Every few yrs' : REPEAT[r] }))}
          isOn={(k) => value.repeat === k}
          onPress={(k) => {
            tap();
            set('repeat', k as Repeat);
          }}
          testIDPrefix="repeat-"
        />
        {value.repeat === 'years' ? (
          <ChoiceGrid
            columns={5}
            options={[2, 3, 4, 5, 10].map((n) => ({ key: String(n), label: `${n} yrs` }))}
            isOn={(k) => value.repeatYears === Number(k)}
            onPress={(k) => {
              tap();
              set('repeatYears', Number(k));
            }}
          />
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
        <ChoiceGrid
          columns={6}
          role="checkbox"
          options={ALL_OFFSETS.map((o) => ({ key: String(o), label: `${o}d`, locked: !isPro && o !== 7 }))}
          isOn={(k) => value.offsets.includes(Number(k) as Offset)}
          onPress={(k) => {
            const o = Number(k) as Offset;
            if (!isPro && o !== 7) return openPaywall('custom_reminders');
            tap();
            const on = value.offsets.includes(o);
            const next = on ? value.offsets.filter((x) => x !== o) : [...value.offsets, o].sort((a, b) => b - a);
            set('offsets', next as Offset[]);
          }}
          testIDPrefix="offset-"
        />
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
          <ChoiceGrid
            columns={3}
            options={[{ key: '', label: 'Anyone', icon: 'users' as const }, ...members.map((m) => ({ key: m.id, label: m.isMe ? 'Me' : m.displayName.split(' ')[0] ?? m.displayName, icon: 'user' as const }))]}
            isOn={(k) => (value.assigneeId ?? '') === k}
            onPress={(k) => {
              tap();
              set('assigneeId', k || null);
            }}
          />
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
}));
