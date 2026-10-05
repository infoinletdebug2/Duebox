import type { Context } from 'hono';
import { readEnvVar } from './lib';
import { rawRows } from './services';

/**
 * Expo push — the ONLY push call (ARCHITECTURE §5). A plain fetch, no
 * dependency. Tokens Expo reports as `DeviceNotRegistered` are disabled.
 */

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  categoryId?: string;
}

const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

export function isExpoToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[.+\]$/.test(token);
}

/**
 * Send up to 100 messages. Returns which ones Expo accepted, by index.
 * Throws only when the whole request failed (retried on the next run).
 */
export async function sendBatch(c: Context, messages: PushMessage[]): Promise<boolean[]> {
  if (messages.length === 0) return [];
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
  const accessToken = readEnvVar(c, 'EXPO_ACCESS_TOKEN');
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  const response = await fetch(EXPO_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(
      messages.map((m) => ({
        to: m.to,
        title: m.title,
        body: m.body,
        data: m.data,
        sound: 'default',
        priority: 'high',
        channelId: 'reminders',
        ...(m.categoryId ? { categoryId: m.categoryId } : {}),
      })),
    ),
  });
  if (!response.ok) throw new Error(`expo push ${response.status}`);
  const payload = (await response.json().catch(() => null)) as { data?: Array<{ status?: string; details?: { error?: string } }> } | null;
  const tickets = payload?.data ?? [];
  const dead: string[] = [];
  const accepted = messages.map((m, i) => {
    const t = tickets[i];
    if (t?.status === 'ok') return true;
    if (t?.details?.error === 'DeviceNotRegistered') dead.push(m.to);
    return false;
  });
  if (dead.length > 0) {
    await rawRows(c, `UPDATE dx__device SET disabled_at = now() WHERE expo_push_token = ANY($1::text[]) AND disabled_at IS NULL`, [dead]).catch(
      (error: unknown) => console.error('disable push tokens failed:', error instanceof Error ? error.message : error),
    );
  }
  return accepted;
}
