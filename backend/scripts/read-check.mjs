#!/usr/bin/env node
/**
 * Reader check — run real images through the real scan pipeline (create →
 * PUT → read) and print what the AI found. Uses a throwaway account it deletes.
 *
 *   node scripts/read-check.mjs scripts/fixtures/*.jpg            # local worker
 *   API=https://duebox.xenition.com node scripts/read-check.mjs photo.jpg
 */
import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';

const API = (process.env.API ?? 'http://localhost:8787').replace(/\/$/, '') + '/api/v1';
const files = process.argv.slice(2);
if (!files.length) throw new Error('usage: read-check.mjs <image.jpg|.pdf> …');
const email = `readcheck+${Date.now()}@duebox.test`;
const password = 'read-check-Password-1';
let token = '';

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-timezone': 'America/Chicago', 'x-region': 'US', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

token = (await call('POST', '/auth/register', { email, password })).json.data.accessToken;
await call('GET', '/auth/me');
await call('POST', '/setup', { focus: [], remindHour: 9 }); // Pro trial: enough scans for the batch

try {
  for (const file of files) {
    const mime = file.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
    const created = await call('POST', '/scans', { source: 'library', pages: [{ mime, bytes: statSync(file).size }] });
    if (created.status !== 201) { console.log(`✗ ${basename(file)}: create ${created.status} ${JSON.stringify(created.json.error)}`); continue; }
    const up = created.json.data.uploads[0];
    await fetch(up.uploadUrl, { method: 'PUT', headers: up.headers, body: readFileSync(file) });
    const t0 = Date.now();
    const read = await call('POST', `/scans/${created.json.data.scan.id}/read`);
    const ms = Date.now() - t0;
    if (read.status !== 200) { console.log(`✗ ${basename(file)}: ${read.status} ${read.json.error?.code} ${read.json.error?.reason ?? ''} — ${read.json.error?.message} (${ms} ms)`); continue; }
    console.log(`✓ ${basename(file)} (${ms} ms)`);
    for (const c of read.json.data.candidates) {
      console.log(`    ${c.title} → ${c.dueDate ?? '(no date)'} [${c.confidence.dueDate}]  ${c.amountCents != null ? (c.amountCents / 100).toFixed(2) + ' ' + (c.currency ?? '') : ''}  ${c.issuer ?? ''}`);
      if (c.evidence) console.log(`      “${c.evidence}”`);
    }
  }
} finally {
  await call('DELETE', '/auth/me', { password });
}
