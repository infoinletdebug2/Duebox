import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysBetween, localInstant, toDay, todayIn } from './dates';
import { nextDueDate, planReminders, snoozeAt } from './planner';
import { coerceExtraction, maskReference, parseAmountCents, parseModelJson } from './extract';
import { reminderText } from '../jobs/deliver';

describe('dates', () => {
  it('accepts only real days', () => {
    expect(toDay('2026-02-28')).toBe('2026-02-28');
    expect(toDay('2026-02-30')).toBeNull();
    expect(toDay('2026-2-3')).toBeNull();
    expect(toDay(20260101)).toBeNull();
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-05', '2026-10-12')).toBe(7);
    expect(daysBetween('2026-10-05', '2026-10-04')).toBe(-1);
  });

  it('clamps to the end of a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-08-31', 3)).toBe('2026-11-30');
    expect(addMonths('2026-12-15', 12)).toBe('2027-12-15');
  });

  it('puts 9:00 local on the right instant, including both DST days', () => {
    // New York: EDT (UTC-4) in summer, EST (UTC-5) in winter.
    expect(localInstant('2026-07-01', 9, 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(localInstant('2026-12-01', 9, 'America/New_York').toISOString()).toBe('2026-12-01T14:00:00.000Z');
    // Spring forward (2026-03-08) and fall back (2026-11-01) — 9:00 is unambiguous on both.
    expect(localInstant('2026-03-08', 9, 'America/New_York').toISOString()).toBe('2026-03-08T13:00:00.000Z');
    expect(localInstant('2026-11-01', 9, 'America/New_York').toISOString()).toBe('2026-11-01T14:00:00.000Z');
    // London: BST ends 2026-10-25.
    expect(localInstant('2026-10-24', 9, 'Europe/London').toISOString()).toBe('2026-10-24T08:00:00.000Z');
    expect(localInstant('2026-10-25', 9, 'Europe/London').toISOString()).toBe('2026-10-25T09:00:00.000Z');
    // Dhaka: no DST, UTC+6.
    expect(localInstant('2026-10-05', 9, 'Asia/Dhaka').toISOString()).toBe('2026-10-05T03:00:00.000Z');
  });

  it('falls back to UTC for an unknown zone', () => {
    expect(localInstant('2026-10-05', 9, 'Mars/Olympus').toISOString()).toBe('2026-10-05T09:00:00.000Z');
    expect(todayIn('Mars/Olympus', new Date('2026-10-05T12:00:00Z'))).toBe('2026-10-05');
  });

  it('knows today differs by zone', () => {
    const at = new Date('2026-10-05T02:00:00Z');
    expect(todayIn('America/Los_Angeles', at)).toBe('2026-10-04');
    expect(todayIn('Asia/Dhaka', at)).toBe('2026-10-05');
  });
});

describe('planReminders', () => {
  const now = new Date('2026-10-05T12:00:00Z');

  it('plans before, due-day and overdue at the household hour', () => {
    const plan = planReminders({ dueDate: '2026-11-20', offsets: [30, 7, 1], remindHour: 9, timezone: 'UTC', status: 'open', now });
    expect(plan.map((p) => [p.kind, p.offsetDays, p.fireAt])).toEqual([
      ['before', 30, '2026-10-21T09:00:00.000Z'],
      ['before', 7, '2026-11-13T09:00:00.000Z'],
      ['before', 1, '2026-11-19T09:00:00.000Z'],
      ['due', 0, '2026-11-20T09:00:00.000Z'],
      ['overdue', -1, '2026-11-21T09:00:00.000Z'],
    ]);
  });

  it('skips offsets already in the past', () => {
    const plan = planReminders({ dueDate: '2026-10-10', offsets: [30, 7, 1], remindHour: 9, timezone: 'UTC', status: 'open', now });
    expect(plan.map((p) => p.offsetDays)).toEqual([1, 0, -1]);
  });

  it('nudges in an hour when added on the day after the hour', () => {
    const plan = planReminders({ dueDate: '2026-10-05', offsets: [7], remindHour: 9, timezone: 'UTC', status: 'open', now });
    expect(plan[0]).toEqual({ kind: 'due', offsetDays: 0, fireAt: '2026-10-05T13:00:00.000Z' });
    expect(plan[1]?.kind).toBe('overdue');
  });

  it('plans nothing for a done item, and only the overdue nudge when it is late', () => {
    expect(planReminders({ dueDate: '2026-11-20', offsets: [7], remindHour: 9, timezone: 'UTC', status: 'done', now })).toEqual([]);
    const late = planReminders({ dueDate: '2026-10-04', offsets: [7], remindHour: 18, timezone: 'UTC', status: 'open', now });
    expect(late).toEqual([{ kind: 'overdue', offsetDays: -1, fireAt: '2026-10-05T18:00:00.000Z' }]);
  });

  it('de-duplicates offsets', () => {
    const plan = planReminders({ dueDate: '2026-12-20', offsets: [7, 7, 1], remindHour: 9, timezone: 'UTC', status: 'open', now });
    expect(plan.filter((p) => p.kind === 'before')).toHaveLength(2);
  });

  it('snoozes to the household hour N days out', () => {
    expect(snoozeAt(1, 9, 'Asia/Dhaka', now)).toBe('2026-10-06T03:00:00.000Z');
  });
});

describe('nextDueDate', () => {
  it('counts from the old due date and clamps month ends', () => {
    expect(nextDueDate('2026-01-31', 'monthly', null)).toBe('2026-02-28');
    expect(nextDueDate('2026-11-30', 'quarterly', null)).toBe('2027-02-28');
    expect(nextDueDate('2026-03-15', 'half_yearly', null)).toBe('2026-09-15');
    expect(nextDueDate('2028-02-29', 'yearly', null)).toBe('2029-02-28');
    expect(nextDueDate('2026-06-01', 'years', 5)).toBe('2031-06-01');
    expect(nextDueDate('2026-06-01', 'years', null)).toBe('2028-06-01');
    expect(nextDueDate('2026-06-01', 'none', null)).toBeNull();
  });
});

describe('extraction', () => {
  it('masks references to their last 4', () => {
    expect(maskReference('POL-8823-1190-AB12')).toBe('AB12');
    expect(maskReference('12')).toBe('12');
    expect(maskReference('---')).toBeNull();
    expect(maskReference(1234)).toBeNull();
  });

  it('parses printed amounts to cents', () => {
    expect(parseAmountCents('$1,412.50')).toBe(141250);
    expect(parseAmountCents('412.5')).toBe(41250);
    expect(parseAmountCents('€1.234,56')).toBe(123456);
    expect(parseAmountCents('USD 80')).toBe(8000);
    expect(parseAmountCents('-20')).toBeNull();
    expect(parseAmountCents('call us')).toBeNull();
  });

  it('reads fenced JSON', () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseModelJson('Here: {"a":2} done')).toEqual({ a: 2 });
    expect(parseModelJson('nothing')).toBeNull();
  });

  it('keeps usable candidates, never a guessed or impossible date', () => {
    const out = coerceExtraction(
      {
        candidates: [
          {
            title: 'Car insurance renewal',
            category: 'insurance',
            action: 'renew',
            dueDate: '2026-11-20',
            evidence: 'Your policy renews on 20 November 2026',
            amount: '$412.50',
            currency: 'usd',
            issuer: 'State Farm',
            reference: 'SF-99-8812-7731',
            repeat: 'yearly',
            notes: null,
            confidence: { title: 'high', dueDate: 'high', amount: 'medium' },
          },
          { title: 'Bad date', category: 'weird', action: 'pay', dueDate: '2026-02-30', evidence: 'x', amount: null, repeat: 'sometimes' },
          { title: null, dueDate: null },
          { title: 'Far future', category: 'home', action: 'other', dueDate: '2099-01-01', evidence: 'x' },
          { title: 'Fourth', dueDate: '2026-12-01' },
        ],
      },
      '2026-10-05',
    );
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ key: 'c1', amountCents: 41250, currency: 'USD', referenceLast4: '7731', repeat: 'yearly', dueDate: '2026-11-20' });
    expect(out[1]).toMatchObject({ key: 'c2', title: 'Bad date', category: 'other', dueDate: null, evidence: null, repeat: 'none' });
    expect(out[1]?.confidence.dueDate).toBe('low');
    expect(out[2]).toMatchObject({ title: 'Far future', dueDate: null });
  });

  it('returns nothing for garbage', () => {
    expect(coerceExtraction(null, '2026-10-05')).toEqual([]);
    expect(coerceExtraction({ candidates: 'x' }, '2026-10-05')).toEqual([]);
  });
});

describe('reminder text', () => {
  const base = { title: 'Car insurance', action: 'renew', amountCents: 41250, currency: 'USD' };
  it('names the action, the time left and the amount', () => {
    expect(reminderText({ ...base, dueDate: '2026-10-12' }, '2026-10-05')).toEqual({ title: 'Renew car insurance', body: 'Due in 7 days · $412.50' });
    expect(reminderText({ ...base, dueDate: '2026-10-05' }, '2026-10-05').body).toBe('Due today · $412.50');
    expect(reminderText({ ...base, dueDate: '2026-10-04', amountCents: null }, '2026-10-05').body).toBe('Was due yesterday');
  });
  it('does not repeat the verb or lower-case an acronym', () => {
    expect(reminderText({ ...base, title: 'Renew passport', dueDate: '2026-10-06' }, '2026-10-05').title).toBe('Renew passport');
    expect(reminderText({ ...base, title: 'DMV registration', dueDate: '2026-10-06' }, '2026-10-05').title).toBe('Renew DMV registration');
  });
});
