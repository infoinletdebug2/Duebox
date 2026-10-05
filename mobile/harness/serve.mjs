/**
 * The browser harness: static server for the exported web build + a stub of
 * Duebox's API with realistic data (a two-person household, seven open
 * deadlines — one overdue — two done, a scan waiting in the inbox).
 *
 *   HARNESS_PLAN=free  serve a free plan · HARNESS_EMPTY=1  a brand-new household
 *
 *   npx expo export --platform web --output-dir dist-web
 *   node harness/serve.mjs            # web 8080 + stub on EXPO_PUBLIC_API_PORT
 *   node harness/serve.mjs --web-only # the bundle talks to the REAL worker
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(HERE, '..', 'dist-web');
const WEB_ONLY = process.argv.includes('--web-only');
const API_PORT = (() => {
  try {
    const m = readFileSync(join(HERE, '..', '.env'), 'utf8').match(/^EXPO_PUBLIC_API_PORT=(\d+)/m);
    return m ? Number(m[1]) : 8787;
  } catch {
    return 8787;
  }
})();

const TODAY = new Date().toISOString().slice(0, 10);
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const iso = (n) => `${day(n)}T15:00:00.000Z`;

const base = {
  status: 'open', amountCents: null, issuer: null, referenceLast4: null, notes: null, repeat: 'none', repeatYears: null,
  offsets: [30, 7, 1], assigneeId: null, attachmentCount: 0, nextReminderAt: iso(1), doneAt: null, doneById: null,
  createdAt: iso(-20), updatedAt: iso(-2),
};
const item = (id, days, fields) => ({ ...base, id, dueDate: day(days), daysLeft: days, ...fields });

const ITEMS = [
  item('i-car', 6, { title: 'Car insurance', category: 'insurance', action: 'renew', amountCents: 41200, issuer: 'State Farm', referenceLast4: '4821', repeat: 'yearly', attachmentCount: 2, notes: 'Policy covers both cars. Ask about the multi-policy discount.' }),
  item('i-tax', -3, { title: 'Property tax — 2nd instalment', category: 'bills', action: 'pay', amountCents: 18650, issuer: 'Travis County', assigneeId: 'm-2' }),
  item('i-trip', 2, { title: 'School trip form', category: 'kids_school', action: 'submit', amountCents: 2500, issuer: 'Lakeside Elementary' }),
  item('i-stream', 18, { title: 'Streaming free trial', category: 'subscriptions', action: 'cancel', amountCents: 1599, issuer: 'StreamFlix' }),
  item('i-dentist', 24, { title: 'Dentist check-up', category: 'health', action: 'book', assigneeId: 'm-2' }),
  item('i-pass', 140, { title: 'Passport renewal — Sam', category: 'id_travel', action: 'renew', repeat: 'years', repeatYears: 10 }),
  item('i-reg', 75, { title: 'Car registration', category: 'vehicle', action: 'renew', amountCents: 8400, issuer: 'Texas DMV', repeat: 'yearly' }),
];
const DONE = [
  item('i-done-1', -12, { title: 'Water bill', category: 'bills', action: 'pay', status: 'done', amountCents: 6420, issuer: 'Austin Water', doneAt: iso(-13) }),
  item('i-done-2', -30, { title: 'Home insurance', category: 'home', action: 'renew', status: 'done', amountCents: 98000, issuer: 'Lemonade', doneAt: iso(-31), repeat: 'yearly' }),
];

const MEMBERS = [
  { id: 'm-1', displayName: 'Dana Rivera', initial: 'D', role: 'owner', isMe: true, email: 'dana@example.com' },
  { id: 'm-2', displayName: 'Sam Rivera', initial: 'S', role: 'member', isMe: false, email: 'sam@example.com' },
];

const TRIAL = { isTrial: false, trialDays: 7, trialEndsAt: null, trialUsed: true };
const PLAN_FREE = { ...TRIAL, tier: 'free', source: 'none', renewsAt: null, expiresAt: null, limits: { openItems: 5, scansPerMonth: 3, members: 1 }, usage: { openItems: 4, scansThisMonth: 2, month: TODAY.slice(0, 7) } };
const PLAN_PRO = { ...TRIAL, tier: 'pro', source: 'store', renewsAt: iso(200), expiresAt: null, limits: { openItems: null, scansPerMonth: 100, members: 5 }, usage: { openItems: ITEMS.length, scansThisMonth: 9, month: TODAY.slice(0, 7) } };


const PLAN_TRIAL = { ...PLAN_PRO, source: 'trial', isTrial: true, trialEndsAt: iso(7), renewsAt: null };
/** Default: a household in its 7-day trial (what a new owner sees). HARNESS_PLAN=free|pro for the others. */
const PLAN = process.env.HARNESS_PLAN === 'free' ? PLAN_FREE : process.env.HARNESS_PLAN === 'pro' ? PLAN_PRO : PLAN_TRIAL;

const ME = {
  user: { id: 'u-demo', email: 'dana@example.com', name: 'Dana Rivera', emailVerified: true },
  household: { id: 'h-1', name: 'The Riveras', timezone: 'America/Chicago', currency: 'USD', remindHour: 9, focus: ['insurance', 'vehicle'] },
  role: 'owner', memberId: 'm-1', prefs: { reminders: true, overdue: true }, plan: PLAN,
  needsSetup: false, offerSeen: true,
};


const page = (id, i) => ({ id: `${id}-p${i}`, index: i, mime: 'image/jpeg', url: `https://picsum.photos/seed/${id}${i}/900/1200` });

function longDay(d) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}

function detail(it) {
  return {
    ...it,
    attachments: it.attachmentCount ? [{ documentId: `d-${it.id}`, pages: Array.from({ length: it.attachmentCount }, (_, i) => page(it.id, i)) }] : [],
    evidence: it.id === 'i-car' ? `Your policy renews on ${longDay(it.dueDate)}. Renew by this date to keep your cover.` : null,
    seriesCount: it.repeat === 'yearly' ? 3 : 1,
  };
}

const SCAN = {
  id: 's-1', status: 'review', pageCount: 2, pages: [page('s-1', 0), page('s-1', 1)], readError: null, createdAt: iso(0),
  candidates: [
    { key: 'c1', title: 'School enrolment form', category: 'kids_school', action: 'submit', dueDate: day(12), evidence: `Please return the completed form by ${longDay(day(12))}.`, amountCents: null, currency: null, issuer: 'Lakeside Elementary', referenceLast4: null, repeat: 'none', notes: null, confidence: { title: 'high', dueDate: 'high', amount: 'low' } },
    { key: 'c2', title: 'Term fees', category: 'kids_school', action: 'pay', dueDate: day(26), evidence: 'Fees of $180.00 are due by the end of the month.', amountCents: 18000, currency: 'USD', issuer: 'Lakeside Elementary', referenceLast4: '0937', repeat: 'none', notes: null, confidence: { title: 'medium', dueDate: 'medium', amount: 'high' } },
  ],
};
const SCAN_FAILED = { ...SCAN, id: 's-2', status: 'failed', readError: 'no_date', candidates: [] };

const EMPTY = process.env.HARNESS_EMPTY === '1';

function lookup(method, path, q) {
  const m = (re) => path.match(re);
  if (method === 'POST' && m(/^\/items\/[^/]+\/done$/)) {
    const it = ITEMS.find((x) => path.includes(x.id)) ?? ITEMS[0];
    return { item: { ...it, status: 'done' }, next: it.repeat !== 'none' ? { ...it, id: `${it.id}-n`, dueDate: day(it.daysLeft + 365), daysLeft: it.daysLeft + 365 } : null };
  }
  if (method === 'POST' && path === '/items') return detail({ ...ITEMS[0], id: 'i-new', title: 'New item' });
  if (method === 'PATCH' && m(/^\/items\/[^/]+$/)) return detail(ITEMS.find((i) => path.endsWith(i.id)) ?? ITEMS[0]);
  if (method === 'POST' && m(/^\/items\/[^/]+\/(snooze|reopen)$/)) return ITEMS.find((i) => path.includes(i.id)) ?? ITEMS[0];
  if (method === 'POST' && path === '/scans/s-1/confirm') return { items: [detail({ ...ITEMS[2], id: 'i-c1', title: 'School enrolment form' }), detail({ ...ITEMS[2], id: 'i-c2', title: 'Term fees' })] };
  // Like the real worker, finishing setup starts the trial and every later answer carries it.
  if (method === 'POST' && path === '/setup') { ME.plan = PLAN_TRIAL; return { ...ME, offerSeen: false, trialStarted: true }; }
  if (method === 'PATCH' && path === '/auth/me') {
    const answer = { ...ME, offerSeen: true };
    ME.plan = PLAN; // the offer has seen the trial; later flows get the plan this run was started with
    return answer;
  }
  if (method !== 'GET') return null;
  if (path === '/auth/me') return ME;
  if (path === '/auth/social/providers') return [{ provider: 'apple' }, { provider: 'google' }];
  if (path === '/home') {
    if (EMPTY) return { nextUp: null, overdue: [], thisWeek: [], thisMonth: [], laterCount: 0, inbox: [], plan: PLAN_FREE, members: [MEMBERS[0]] };
    const open = [...ITEMS].sort((a, b) => a.daysLeft - b.daysLeft);
    return {
      nextUp: open.find((i) => i.daysLeft >= 0) ?? open[0],
      overdue: open.filter((i) => i.daysLeft < 0),
      thisWeek: open.filter((i) => i.daysLeft >= 0 && i.daysLeft <= 7),
      thisMonth: open.filter((i) => i.daysLeft > 7 && i.daysLeft <= 31),
      laterCount: open.filter((i) => i.daysLeft > 31).length,
      inbox: [{ id: 's-1', pageCount: 2, status: 'review', createdAt: iso(0) }],
      plan: PLAN,
      members: MEMBERS,
    };
  }
  if (path === '/items') {
    const status = q.get('status') ?? 'open';
    let list = status === 'done' ? DONE : [...ITEMS].sort((a, b) => a.daysLeft - b.daysLeft);
    if (EMPTY) list = [];
    const cat = q.get('category');
    if (cat) list = list.filter((i) => i.category === cat);
    const text = (q.get('q') ?? '').toLowerCase();
    if (text) list = list.filter((i) => `${i.title} ${i.issuer ?? ''} ${i.notes ?? ''}`.toLowerCase().includes(text));
    return { items: list, nextCursor: null };
  }
  if (m(/^\/items\/[^/]+$/)) return detail([...ITEMS, ...DONE].find((i) => path.endsWith(i.id)) ?? ITEMS[0]);
  if (path === '/scans/s-1') return SCAN;
  if (path === '/scans/s-2') return SCAN_FAILED;
  if (path === '/billing/plan') return PLAN;
  if (path === '/household/members') return MEMBERS;
  if (path === '/household/invites') return [{ id: 'inv-1', code: 'K7PQ2M', link: 'https://duebox.app/join/K7PQ2M', expiresAt: iso(5) }];
  if (m(/^\/household\/invites\/lookup\//)) return { householdName: 'The Riveras', invitedBy: 'Dana Rivera' };
  return null;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    let file = join(DIST, rel || 'index.html');
    let body;
    try {
      body = await readFile(file);
    } catch {
      file = join(DIST, 'index.html');
      body = await readFile(file);
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
}).listen(8080, () => console.log('web    http://localhost:8080'));

const LAST = {};
const stub = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/^\/api\/v1/, '');
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, x-timezone, x-region, idempotency-key', 'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS', 'content-type': 'application/json; charset=utf-8' };
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  // The flows read back what the app sent: GET /__last/<METHOD><path>.
  if (path.startsWith('/__last/')) return res.writeHead(200, cors).end(JSON.stringify(LAST[path.slice(8)] ?? null));
  if (req.method !== 'GET') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try { LAST[`${req.method}${path}`] = raw ? JSON.parse(raw) : null; } catch { LAST[`${req.method}${path}`] = raw; }
  }
  const data = lookup(req.method, path, url.searchParams);
  if (data) return res.writeHead(200, cors).end(JSON.stringify({ success: true, data }));
  if (req.method !== 'GET') return res.writeHead(200, cors).end(JSON.stringify({ success: true, data: {} }));
  console.log(`  stub miss: ${req.method} ${path}`);
  return res.writeHead(404, cors).end(JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Not stubbed.' } }));
});
if (WEB_ONLY) console.log(`api    not stubbed — real worker on ${API_PORT}`);
else stub.listen(API_PORT, () => console.log(`api    http://localhost:${API_PORT}/api/v1 (stub)`));
