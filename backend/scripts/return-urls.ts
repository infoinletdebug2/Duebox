/**
 * Register where Apple / Google sign-in may return for Duebox.
 *
 *   cd backend && npx tsx --env-file=.dev.vars scripts/return-urls.ts          # register + list
 *   cd backend && npx tsx --env-file=.dev.vars scripts/return-urls.ts --list   # list only
 *
 * With nothing registered the platform accepts ANY custom-scheme deep link
 * ("open-to-deep-links"), so a sign-in could be delivered to an app that is
 * not Duebox. The first registration switches it to an exhaustive allowlist,
 * after which only these two work:
 *   duebox://auth                                   an installed build
 *   https://duebox.xenition.com/api/v1/auth/social/callback
 *                                                   the relay Expo Go signs in through
 * Expo Go's own exp:// address stops working directly at that moment, which is
 * why the relay (routers/auth.ts) has to be deployed first. Service key only
 * (XENITION_API_KEY in .dev.vars). Idempotent.
 */

const base = (process.env.XENITION_API_URL ?? 'https://api.xenition.com/v1').replace(/\/+$/, '');
const key = process.env.XENITION_API_KEY ?? '';
if (!key.startsWith('xen_service_')) {
  console.error('return-urls: XENITION_API_KEY (a xen_service_ key) is missing; run with --env-file=.dev.vars');
  process.exit(1);
}

const publicUrl = (process.env.PUBLIC_URL ?? 'https://duebox.xenition.com').replace(/\/+$/, '');
const scheme = process.env.APP_SCHEME ?? 'duebox';
const URLS = [`${scheme}://auth`, `${publicUrl}/api/v1/auth/social/callback`];
const endpoint = `${base}/app-platform/auth/oauth/return-urls`;
const headers = { 'x-api-key': key, 'content-type': 'application/json' };

if (!process.argv.includes('--list')) {
  for (const url of URLS) {
    const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ url }) });
    console.log(`return-urls: ${url} → ${res.status}${res.ok ? '' : ` ${(await res.text()).slice(0, 200)}`}`);
    if (!res.ok) process.exit(1);
  }
}

const now = (await (await fetch(endpoint, { headers })).json()) as { mode?: string; urls?: string[] };
console.log(`return-urls: mode=${now.mode} urls=${JSON.stringify(now.urls)}`);
