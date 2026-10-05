/**
 * Remove stored page images that no document points at any more.
 *
 *   npx tsx --env-file=.dev.vars scripts/sweep-orphans.ts            # dry run: counts only
 *   npx tsx --env-file=.dev.vars scripts/sweep-orphans.ts --apply    # delete them
 *
 * Why it exists: before @xenition/sdk 0.2.9, storage.delete percent-encoded
 * the slashes in a key and the gateway never matched it, so every document
 * and account deletion left its page images in storage. A file is an orphan when
 * it sits under households/ and no dx__page row holds its key — the page row
 * is removed in the same transaction that deletes a document, and an upload
 * in flight always has its row first. Nothing else is touched.
 */
import { XenitionClient, snakeRows } from '@xenition/sdk';

const key = process.env.XENITION_API_KEY;
if (!key) throw new Error('XENITION_API_KEY is required.');
const base = (process.env.XENITION_API_URL ?? 'https://api.xenition.com/v1').replace(/\/$/, '');
const bucket = process.env.DOC_BUCKET?.trim() || 'default';
const apply = process.argv.includes('--apply');
const client = new XenitionClient(key, { baseUrl: base });

const stored: { path: string; size?: number }[] = [];
for (let offset = 0; ; offset += 500) {
  const page = (await client.storage.list({ bucket, prefix: 'households/', limit: 500, offset })) as { files?: { path: string; size?: number }[] };
  const files = page.files ?? [];
  stored.push(...files);
  if (files.length < 500) break;
}

const rows = snakeRows((await client.query.raw<Record<string, unknown>>('SELECT storage_key FROM dx__page', [])).data ?? []) as { storage_key: string }[];
const live = new Set(rows.map((r) => r.storage_key));
const orphans = stored.filter((f) => !live.has(f.path));

console.log(`stored under households/: ${stored.length} · referenced by a page: ${stored.length - orphans.length} · orphans: ${orphans.length}`);
if (!apply) {
  console.log('dry run — pass --apply to delete the orphans.');
  process.exit(0);
}

let deleted = 0;
for (const f of orphans) {
  try {
    await client.storage.delete(f.path, { bucket });
    deleted += 1;
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') deleted += 1;
    else console.error('could not delete', (error as Error).message, f.path);
  }
}
console.log(`deleted ${deleted} of ${orphans.length}.`);
