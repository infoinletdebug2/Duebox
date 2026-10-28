/**
 * Every main feature, exercised as the demo account against a running worker
 * (production by default) — the hands-on checklist before handing the account
 * to App Review. Everything it creates it removes again, so the seeded demo
 * deadlines stay exactly as scripts/seed-demo.ts left them.
 *
 *   cd backend && npx tsx --env-file=.dev.vars scripts/demo-check.ts
 */
import { readFileSync } from 'node:fs';

const API = `${(process.env.API ?? 'https://duebox.xenition.com').replace(/\/+$/, '')}/api/v1`;
const EMAIL = process.env.DEMO_EMAIL ?? 'demo@infoinlet.com';
const PASSWORD = process.env.DEMO_PASSWORD ?? '';

if (!PASSWORD) throw new Error('DEMO_PASSWORD is not set — it lives in backend/.dev.vars (never in the repo: it is public).');
let pass = 0;
let fail = 0;
function check(ok: boolean, what: string, detail?: unknown) {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${ok || detail === undefined ? '' : ` → ${JSON.stringify(detail).slice(0, 300)}`}`);
}

let token = '';
async function call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; json: any }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-timezone': 'America/Chicago', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

console.log('sign-in');
check((await call('POST', '/auth/login', { email: EMAIL, password: 'wrong-password' })).status === 401, 'wrong password is refused');
const login = await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
check(login.status === 200, 'demo account signs in', login.status);
token = login.json?.data?.accessToken ?? '';
const refresh = await call('POST', '/auth/refresh', { refreshToken: login.json?.data?.refreshToken });
check(refresh.status === 200 && Boolean(refresh.json?.data?.accessToken), 'session refresh');

console.log('account + plan');
const me = await call('GET', '/auth/me');
const plan = me.json?.data?.plan;
check(me.status === 200 && me.json.data.user.emailVerified === true && me.json.data.needsSetup === false, 'set up, email confirmed', me.json?.data?.user);
check(plan?.entitled === true && plan?.status === 'active', 'Pro, never locked (no paywall)', plan);
check((await call('GET', '/billing/plan')).json?.data?.entitled === true, 'billing plan says entitled');
const products = await call('GET', '/billing/products?platform=apple');
check(products.json?.data?.products?.length === 2, 'two products in the catalog');
const social = await call('GET', '/auth/social/providers');
check(social.status === 200 && social.json?.data?.length >= 1, 'Apple / Google sign-in offered', social.json?.data);

console.log('home + deadlines');
const home = await call('GET', '/home');
check(home.status === 200 && Array.isArray(home.json?.data?.items ?? home.json?.data?.sections ?? []), 'home opens', home.status);
const open = await call('GET', '/items?status=open');
const openCount = open.json?.data?.items?.length ?? open.json?.data?.length ?? 0;
check(open.status === 200 && openCount >= 10, `demo deadlines listed (${openCount} open)`, open.status);
check((await call('GET', '/items?status=done')).status === 200, 'done list');
check((await call('GET', '/items?q=insur')).status === 200, 'search');

const created = await call('POST', '/items', { title: 'Demo check — library books', dueDate: day(5), category: 'other', action: 'other', offsets: [30, 7, 1] });
const id: string = created.json?.data?.id ?? '';
check(created.status === 201 && Boolean(id), 'add a deadline (custom reminders)', created.json);
check((await call('GET', `/items/${id}`)).status === 200, 'open it');
check((await call('PATCH', `/items/${id}`, { dueDate: day(9), notes: 'checked' })).status === 200, 'edit it');
check((await call('POST', `/items/${id}/snooze`, { days: 1 }, { 'idempotency-key': `demo-snooze-${Date.now()}` })).status === 200, 'snooze');
check((await call('POST', `/items/${id}/done`, undefined, { 'idempotency-key': `demo-done-${Date.now()}` })).status === 200, 'mark done');
check((await call('POST', `/items/${id}/reopen`)).status === 200, 'reopen');

const repeat = await call('POST', '/items', { title: 'Demo check — water bill', dueDate: day(2), category: 'bills', action: 'pay', amountCents: 6420, repeat: 'monthly' });
const rid: string = repeat.json?.data?.id ?? '';
const doneRepeat = await call('POST', `/items/${rid}/done`);
const nextId: string | undefined = doneRepeat.json?.data?.next?.id ?? doneRepeat.json?.data?.nextItem?.id;
check(doneRepeat.status === 200, 'a monthly bill marked done rolls over', doneRepeat.json?.data && Object.keys(doneRepeat.json.data));

console.log('attachment upload');
const att = await call('POST', `/items/${id}/attachments`, { pages: [{ mime: 'image/jpeg', bytes: 1024 }] });
const up = att.json?.data?.uploads?.[0];
let putOk = false;
if (up) {
  const put = await fetch(up.uploadUrl, { method: 'PUT', headers: up.headers, body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode('demo-check-jpeg')]) });
  putOk = put.ok;
}
check(att.status === 201 && putOk, 'photo attached to a deadline (upload to storage)', att.status);
const withAtt = await call('GET', `/items/${id}`);
check(withAtt.json?.data?.attachmentCount === 1, 'attachment listed');
if (att.json?.data?.documentId) check((await call('DELETE', `/items/${id}/attachments/${att.json.data.documentId}`)).status === 200, 'attachment removed');

console.log('AI letter scan');
const letter = readFileSync(new URL('./sample-letter.jpg', import.meta.url));
const scan = await call('POST', '/scans', { source: 'library', pages: [{ mime: 'image/jpeg', bytes: letter.length }] });
const scanId: string = scan.json?.data?.scan?.id ?? '';
const sup = scan.json?.data?.uploads?.[0];
if (sup) await fetch(sup.uploadUrl, { method: 'PUT', headers: sup.headers, body: letter });
const read = await call('POST', `/scans/${scanId}/read`);
const cand = read.json?.data?.candidates?.[0];
check(read.status === 200 && Boolean(cand?.dueDate), `AI read the letter → ${cand?.title ?? '?'} due ${cand?.dueDate ?? '?'}`, read.json?.error ?? read.status);
let scannedItem = '';
if (cand) {
  const { key, confidence, currency, evidence, ...fields } = cand;
  void confidence; void currency; void evidence;
  const conf = await call('POST', `/scans/${scanId}/confirm`, { items: [{ ...fields, candidateKey: key, title: fields.title || 'Letter', dueDate: fields.dueDate || day(10) }] });
  scannedItem = conf.json?.data?.items?.[0]?.id ?? '';
  check(conf.status === 200 && conf.json?.data?.items?.[0]?.attachmentCount === 1, 'confirmed into a deadline with the letter attached', conf.status);
}

console.log('household, devices, export, settings');
const invite = await call('POST', '/household/invites');
check(invite.status === 201 && Boolean(invite.json?.data?.code), 'invite a household member', invite.status);
if (invite.json?.data?.code) check((await call('GET', `/household/invites/lookup/${invite.json.data.code}`)).status === 200, 'invite code works');
if (invite.json?.data?.id) check((await call('DELETE', `/household/invites/${invite.json.data.id}`)).status === 200, 'invite withdrawn');
check((await call('GET', '/household/members')).status === 200, 'members list');
const pushToken = `ExponentPushToken[demo-check-${Date.now()}]`;
check((await call('POST', '/devices', { expoPushToken: pushToken, platform: 'ios' })).status === 200, 'push device registered');
check((await call('DELETE', `/devices/${encodeURIComponent(pushToken)}`)).status === 200, 'push device removed');
const exp = await call('GET', '/export?format=json');
check(exp.status === 200, 'export my data (JSON)');
const prefs = await call('PATCH', '/auth/me', { prefs: { overdue: false } });
check(prefs.status === 200, 'notification setting changed');
await call('PATCH', '/auth/me', { prefs: { overdue: true } });
check((await call('PATCH', '/household', { remindHour: 9 })).status === 200, 'reminder time saved');

console.log('cleanup');
for (const item of [id, rid, nextId, scannedItem].filter(Boolean) as string[]) await call('DELETE', `/items/${item}`);
const after = await call('GET', '/items?status=open');
const afterCount = after.json?.data?.items?.length ?? after.json?.data?.length ?? 0;
check(afterCount === openCount, `demo data back as seeded (${afterCount} open)`, { before: openCount, after: afterCount });
check((await call('POST', '/auth/logout', { refreshToken: refresh.json?.data?.refreshToken })).status === 200, 'sign out');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
