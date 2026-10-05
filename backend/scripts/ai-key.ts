/**
 * Register (or rotate) this app's OpenRouter key INSIDE Xenition, so the
 * reader's sdk.ai.chat calls use it and the worker never holds it.
 *
 *   OPENROUTER_API_KEY=sk-or-… npx tsx --env-file=.dev.vars scripts/ai-key.ts
 *
 * Idempotent: an existing openrouter key is updated, never duplicated. The
 * key value is never printed.
 */
import { XenitionClient } from '@xenition/sdk';

const key = process.env.OPENROUTER_API_KEY;
if (!key) throw new Error('Set OPENROUTER_API_KEY for this run.');
const client = new XenitionClient(process.env.XENITION_API_KEY!, { baseUrl: process.env.XENITION_API_URL });
const existing = (await client.ai.keys.list()).filter((k) => k.provider === 'openrouter');
if (existing[0]) {
  await client.ai.keys.update(existing[0].id, { apiKey: key, isActive: true });
  console.log(`updated the app's openrouter key (${existing[0].id})`);
} else {
  const created = await client.ai.keys.create({ displayName: 'Duebox reader', provider: 'openrouter', apiKey: key });
  console.log(`registered the app's openrouter key (${created.id})`);
}
console.log('keys now:', (await client.ai.keys.list()).map((k) => `${k.provider}:${k.isActive ? 'active' : 'off'}`).join(', '));
