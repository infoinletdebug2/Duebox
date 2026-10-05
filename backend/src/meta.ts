import type { Context } from 'hono';
import { env, readEnvVar, scoped } from './lib';
import { bundleId, productIds } from './config';

/**
 * Meta Conversions API for app events — the server half of ads measurement.
 *
 * The app's Meta SDK reports `StartTrial` and `Subscribe` too, but on iOS a
 * person who declines App Tracking Transparency makes those unattributable.
 * Sending the same events from here, keyed to the install's anonymous id
 * (handed over at `PATCH /auth/me/attribution`), keeps trials and revenue
 * attributable either way. Meta deduplicates the two copies on `_eventId`.
 *
 *   1. **Dormant until configured.** No `META_APP_ID` + `META_CAPI_ACCESS_TOKEN`
 *      (the shipped default) → every call returns immediately.
 *   2. **Never throws, never blocks.** A Meta outage must never fail a
 *      purchase: the POST goes to `waitUntil` and every failure is dropped.
 *   3. **No personal data.** Anonymous install id, device context, event
 *      name, value, currency. No email, no name, no document content.
 */

const GRAPH_VERSION = 'v21.0';
/** The stores' first-year subscription cut (small-business rate). */
const NET_OF_STORE_FEE = 0.85;

interface AttributionRow {
  fb_anon_id: string | null;
  att_status: string | null;
  install_platform: string | null;
  app_version: string | null;
  os_version: string | null;
  device_model: string | null;
  locale: string | null;
}

export function metaConfigured(c: Context): boolean {
  return Boolean(readEnvVar(c, 'META_APP_ID')?.trim() && readEnvVar(c, 'META_CAPI_ACCESS_TOKEN')?.trim());
}

/** List price net of the store fee — an estimate for ad optimisation only. */
export function netValueFor(c: Context, productId: string): { value: number; currency: string } {
  const read = env(c);
  const ids = productIds(read);
  const price = (name: string, fallback: number) => Number(read(name) ?? '') || fallback;
  const gross =
    productId === ids.monthly ? price('META_VALUE_MONTHLY', 4.99)
    : productId === ids.yearly ? price('META_VALUE_YEARLY', 34.99)
    : productId === ids.offerMonthly ? price('META_VALUE_OFFER_MONTHLY', 3.99)
    : productId === ids.offerYearly ? price('META_VALUE_OFFER_YEARLY', 27.99)
    : 0;
  return { value: Math.round(gross * NET_OF_STORE_FEE * 100) / 100, currency: read('META_VALUE_CURRENCY')?.trim() || 'USD' };
}

/** Meta's `extinfo`: 16 positional strings; the position is the meaning. */
function extinfo(c: Context, row: AttributionRow): string[] {
  const ios = row.install_platform === 'ios';
  return [
    ios ? 'i2' : 'a2',
    bundleId(env(c)),
    '',
    row.app_version ?? '',
    row.os_version ?? '',
    row.device_model ?? '',
    row.locale ?? '',
    '', '', '', '', '', '', '', '', '',
  ];
}

function background(c: Context, work: Promise<void>): void {
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    // Node dev server: no execution context; the promise already runs.
    void work;
  }
}

export interface MetaServerEvent {
  userId: string;
  eventName: 'StartTrial' | 'Subscribe' | string;
  /** Dedup key shared with the app's SDK copy (the store transaction id). */
  eventId: string;
  value?: number;
  currency?: string;
}

export function trackServerEvent(c: Context, event: MetaServerEvent): void {
  if (!metaConfigured(c)) return;
  const appId = readEnvVar(c, 'META_APP_ID')!.trim();
  const token = readEnvVar(c, 'META_CAPI_ACCESS_TOKEN')!.trim();

  const work = (async () => {
    try {
      const row = await scoped(c).from('dx__profile').where('user_id', event.userId).limit(1).first<AttributionRow>();
      if (!row?.fb_anon_id) return;
      const custom: Record<string, string | number> = {
        _eventName: event.eventName,
        _logTime: Math.floor(Date.now() / 1000),
        _eventId: event.eventId,
      };
      if (event.value !== undefined) {
        custom._valueToSum = event.value;
        custom.fb_currency = event.currency ?? 'USD';
      }
      const trackingAllowed = row.att_status === 'authorized' || row.install_platform === 'android';
      const form = new URLSearchParams({
        event: 'CUSTOM_APP_EVENTS',
        advertiser_tracking_enabled: trackingAllowed ? '1' : '0',
        application_tracking_enabled: '1',
        anon_id: row.fb_anon_id,
        extinfo: JSON.stringify(extinfo(c, row)),
        custom_events: JSON.stringify([custom]),
        access_token: token,
      });
      const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${appId}/activities`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      if (!response.ok) console.error('meta capi rejected', event.eventName, response.status);
    } catch (error) {
      console.error('meta capi failed', event.eventName, error instanceof Error ? error.message : error);
    }
  })();
  background(c, work);
}
