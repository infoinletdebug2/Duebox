import { describe, expect, it } from 'vitest';
import type { Purchase } from '@xenition/sdk';
import { isStoreTrial, willRenew } from './billing';

const base = (over: Partial<Purchase>): Purchase => ({
  id: 'p', user_id: 'u', platform: 'apple', product_id: 'duebox_pro_yearly', transaction_id: 't', original_transaction_id: 'o',
  status: 'active', purchased_at: null, expires_at: null, auto_renewing: true, environment: 'production', raw: {},
  created_at: '', updated_at: '', ...over,
});

describe('isStoreTrial', () => {
  it('Apple: an introductory free-trial transaction is a trial', () => {
    expect(isStoreTrial(base({ raw: { offerType: 1, offerDiscountType: 'FREE_TRIAL' } }))).toBe(true);
  });
  it('Apple: offerType 1 with no discount type (older payloads) is a trial', () => {
    expect(isStoreTrial(base({ raw: { offerType: 1 } }))).toBe(true);
  });
  it('Apple: the renewal after the trial is not', () => {
    expect(isStoreTrial(base({ raw: { type: 'Auto-Renewable Subscription' } }))).toBe(false);
  });
  it('Apple: a paid intro price is not a free trial', () => {
    expect(isStoreTrial(base({ raw: { offerType: 1, offerDiscountType: 'PAY_AS_YOU_GO' } }))).toBe(false);
  });
  it('Play: bought through the trial offer, first order → trial', () => {
    const raw = { latestOrderId: 'GPA.3312-1234-5678-90123', lineItems: [{ offerDetails: { basePlanId: 'yearly', offerId: 'free-trial' } }] };
    expect(isStoreTrial(base({ platform: 'google', raw }))).toBe(true);
  });
  it('Play: the first renewal order (..0) means the trial converted', () => {
    const raw = { latestOrderId: 'GPA.3312-1234-5678-90123..0', lineItems: [{ offerDetails: { basePlanId: 'yearly', offerId: 'free-trial' } }] };
    expect(isStoreTrial(base({ platform: 'google', raw }))).toBe(false);
  });
  it('Play: monthly on its base plan (no offer) is never a trial', () => {
    const raw = { latestOrderId: 'GPA.1-2-3-4', lineItems: [{ offerDetails: { basePlanId: 'monthly' } }] };
    expect(isStoreTrial(base({ platform: 'google', product_id: 'duebox_pro_monthly', raw }))).toBe(false);
  });
});

describe('willRenew', () => {
  it('Play reads the line item, not the row flag', () => {
    const raw = { lineItems: [{ autoRenewingPlan: { autoRenewEnabled: false } }] };
    expect(willRenew(base({ platform: 'google', auto_renewing: true, raw }))).toBe(false);
  });
  it('Apple uses the row flag', () => {
    expect(willRenew(base({ auto_renewing: false }))).toBe(false);
  });
});
