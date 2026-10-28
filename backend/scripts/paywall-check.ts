/**
 * The hard paywall, end to end against a running worker (production by default):
 *
 *   cd backend && npx tsx --env-file=.dev.vars scripts/paywall-check.ts
 *   API=http://localhost:8787 npx tsx --env-file=.dev.vars scripts/paywall-check.ts
 *
 * Signs up a throwaway @duebox.test account and checks: locked after setup
 * (402 on data routes, export and the plan still open), two products with the
 * trial on yearly, then — with the entitlement granted through the SDK, as a
 * verified store purchase would — open; then revoked, locked again. The
 * account is deleted at the end. Store purchases themselves need a device.
 */
import { XenitionClient } from '@xenition/sdk';

const API = `${(process.env.API ?? 'https://duebox.xenition.com').replace(/\/+$/, '')}/api/v1`;
const key = process.env.XENITION_API_KEY ?? '';
if (!key.startsWith('xen_service_')) throw new Error('XENITION_API_KEY missing: run with --env-file=.dev.vars');
const client = new XenitionClient(key, { baseUrl: process.env.XENITION_API_URL });
client.modules.use('billing');
const billing = client.modules.billing;

let pass = 0;
let fail = 0;
function check(ok: boolean, what: string, detail?: unknown) {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${ok || detail === undefined ? '' : ` → ${JSON.stringify(detail).slice(0, 300)}`}`);
}

let token = '';
async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-timezone': 'Europe/Berlin', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const email = `apitest+paywall${Date.now()}@duebox.test`;
const password = 'Pa55word-paywall-1';

const reg = await call('POST', '/auth/register', { email, password });
token = reg.json?.data?.accessToken ?? '';
const uid: string = reg.json?.data?.user?.id ?? '';
check(reg.status === 201 && Boolean(token), 'sign up');

try {
  const me = await call('GET', '/auth/me');
  const plan = me.json?.data?.plan;
  check(plan?.entitled === false && plan?.status === 'none', 'new account: not entitled, status none', plan);
  check(plan?.trialEligible === true && plan?.trialDays === 3, 'new account: trial eligible, 3 days', plan);
  check(!('tier' in (plan ?? {})) && !('trialUsed' in (plan ?? {})), 'plan has no free-tier fields', plan);

  const setup = await call('POST', '/setup', { focus: ['bills'], remindHour: 9 });
  check(setup.status === 200 && setup.json?.data?.plan?.entitled === false && !('trialStarted' in (setup.json?.data ?? {})), 'setup grants nothing', setup.json?.data?.plan);

  for (const [m, p] of [['GET', '/home'], ['GET', '/items'], ['POST', '/items'], ['POST', '/scans'], ['GET', '/household/members']] as const) {
    const r = await call(m, p, m === 'POST' ? { title: 'Car insurance', dueDate: '2027-01-15' } : undefined);
    check(r.status === 402 && r.json?.error?.code === 'SUBSCRIPTION_REQUIRED', `locked: ${m} ${p} → 402`, { status: r.status, body: r.json });
  }
  for (const p of ['/billing/plan', '/export', '/auth/me']) {
    const r = await call('GET', p);
    check(r.status === 200, `open while locked: GET ${p}`, { status: r.status, body: r.json });
  }
  const trial = await call('POST', '/billing/trial');
  check(trial.status === 404, 'server trial route is gone', trial.status);

  const products = await call('GET', '/billing/products?platform=apple');
  const list = products.json?.data?.products ?? [];
  check(
    list.length === 2 && list[0]?.productId === 'duebox_pro_yearly' && list[0]?.trial === true && list[1]?.trial === false,
    'two products, trial on yearly only',
    list,
  );

  // What a verified store purchase leads to: the entitlement on the owner.
  await billing.grant({ userId: uid, entitlement: 'pro', expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), source: 'grant' });
  const open = await call('GET', '/auth/me');
  check(open.json?.data?.plan?.entitled === true && open.json?.data?.plan?.status === 'active', 'granted: entitled', open.json?.data?.plan);
  const home = await call('GET', '/home');
  check(home.status === 200, 'granted: /home opens', home.status);
  const item = await call('POST', '/items', { title: 'Car insurance', dueDate: '2027-01-15', offsets: [30, 14, 1] });
  check(item.status === 201 || item.status === 200, 'granted: custom reminder offsets accepted (no free-tier gate)', { status: item.status, body: item.json });

  await billing.revoke(uid, 'pro');
  const locked = await call('GET', '/home');
  check(locked.status === 402, 'revoked: locked again', locked.status);
  const after = await call('GET', '/auth/me');
  check(after.json?.data?.plan?.entitled === false, 'revoked: plan says not entitled', after.json?.data?.plan);
} finally {
  const del = await call('DELETE', '/auth/me', { password });
  check(del.status === 200, 'cleanup: account deleted', del.status);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
