/**
 * The App Store / Play review and hands-on test account: signed up, set up,
 * email confirmed, and granted Duebox Pro with NO expiry — so it never meets
 * the hard paywall and every screen can be reached — then filled with the
 * demo deadlines (scripts/seed-demo.ts).
 *
 *   cd backend && npx tsx --env-file=.dev.vars scripts/demo-account.ts
 *   DEMO_EMAIL=… DEMO_PASSWORD=… API=http://localhost:8787 npx tsx --env-file=.dev.vars scripts/demo-account.ts
 *
 * Idempotent: an existing account is signed in to instead of created, so it
 * can be re-run after a reviewer deletes the account. The grant is a support
 * grant (source 'grant'), visible as such in billing, never a fake purchase.
 * The credentials go in App Store Connect → App Review Information and Play
 * Console → App access.
 */
import { execFileSync } from 'node:child_process';
import { XenitionClient } from '@xenition/sdk';

const API = `${(process.env.API ?? 'https://duebox.xenition.com').replace(/\/+$/, '')}/api/v1`;
const EMAIL = (process.env.DEMO_EMAIL ?? 'demo@infoinlet.com').toLowerCase();
const PASSWORD = process.env.DEMO_PASSWORD ?? '';
if (!PASSWORD) throw new Error('DEMO_PASSWORD is not set — it lives in backend/.dev.vars (never in the repo: it is public).');
const key = process.env.XENITION_API_KEY ?? '';
if (!key.startsWith('xen_service_')) throw new Error('XENITION_API_KEY missing: run with --env-file=.dev.vars');
const client = new XenitionClient(key, { baseUrl: process.env.XENITION_API_URL });
client.modules.use('billing');

let token = '';
async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-timezone': 'America/Chicago', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// 1. The account: sign in, or create it.
let auth = await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
if (auth.status !== 200) {
  auth = await call('POST', '/auth/register', { email: EMAIL, password: PASSWORD, name: 'Demo' });
  if (auth.status !== 201) throw new Error(`could not create ${EMAIL}: ${auth.status} ${JSON.stringify(auth.json)}`);
  console.log(`created ${EMAIL}`);
} else {
  console.log(`signed in to the existing ${EMAIL}`);
}
token = auth.json.data.accessToken;
const userId: string = auth.json.data.user.id;

// 2. The household exists after the first /auth/me; setup done (two taps).
await call('GET', '/auth/me');
const setup = await call('POST', '/setup', { focus: ['bills', 'insurance', 'subscriptions'], remindHour: 9 });
if (setup.status !== 200) throw new Error(`setup failed: ${setup.status} ${JSON.stringify(setup.json)}`);

// 3. Email confirmed (a reviewer cannot read this inbox).
await client.query.raw(`UPDATE dx__profile SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE user_id = $1`, [userId]);

// 4. Pro with no expiry: the hard paywall stands aside for this account only.
await client.modules.billing.grant({ userId, entitlement: 'pro', expiresAt: null, source: 'grant' });

// 5. Demo deadlines.
execFileSync(process.execPath, ['--import', 'tsx', 'scripts/seed-demo.ts', EMAIL], { stdio: 'inherit', env: process.env });

const me = await call('GET', '/auth/me');
const plan = me.json?.data?.plan;
console.log(`\n${EMAIL}: entitled=${plan?.entitled} status=${plan?.status} verified=${me.json?.data?.user?.emailVerified}`);
