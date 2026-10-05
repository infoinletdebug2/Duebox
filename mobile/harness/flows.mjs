/**
 * Interaction tests: drive the exported web build through the flows a person
 * actually takes — tap, type, wait for what should appear — and fail loudly
 * when it doesn't. The screenshot harness proves screens RENDER; this proves
 * they WORK (on the web build, against the stub).
 *
 *   HARNESS_PLAN=free node harness/serve.mjs   # the gate flows need a free plan
 *   node harness/flows.mjs                     # shots of each end state → harness/flows/
 *
 * Elements are found by testID (RN Web renders it as data-testid) or by
 * visible text. Raw CDP, like shoot.mjs.
 */
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const OUT = join(HERE, 'flows');
const WEB = 'http://localhost:8080';
const PORT = 9223;
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SESSION = { accessToken: 'harness-token', refreshToken: 'harness-refresh', expiresAt: Date.now() + 3600_000, user: { id: 'u-demo', email: 'dana@example.com', name: 'Dana Rivera', emailVerified: true } };
const TODAY = new Date().toISOString().slice(0, 10);
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── CDP ─────────────────────────────────────────────────────────────────── */

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const info = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      if (info.webSocketDebuggerUrl) return info.webSocketDebuggerUrl;
    } catch {
      /* not yet */
    }
    await wait(250);
  }
  throw new Error('Chrome never opened its debugging port.');
}

function client(socket) {
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    const w = pending.get(m.id);
    if (w) {
      pending.delete(m.id);
      m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result);
    }
  });
  return (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
}

let page;
const evaluate = async (expression) => (await page('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
const text = () => evaluate('document.body.innerText');
const url = () => evaluate('location.pathname + location.search');

async function open(path, { signedIn = true, onboarded = true } = {}) {
  await page('Page.navigate', { url: `${WEB}/legal/terms` });
  await wait(400);
  await evaluate(`localStorage.clear(); ${signedIn ? `localStorage.setItem('duebox.session', ${JSON.stringify(JSON.stringify(SESSION))});` : ''} ${onboarded ? "localStorage.setItem('duebox.onboarded','1');" : ''}`);
  await page('Page.navigate', { url: `${WEB}${path}` });
  await wait(600);
}

/** Wait until `needle` (string, or predicate on the page text) is true. */
async function see(needle, timeout = 10_000) {
  const end = Date.now() + timeout;
  for (;;) {
    const t = (await text()) ?? '';
    if (typeof needle === 'function' ? needle(t) : t.includes(needle)) return t;
    if (Date.now() > end) throw new Error(`never saw ${typeof needle === 'function' ? 'the expected state' : JSON.stringify(needle)}`);
    await wait(200);
  }
}

const FIND = (needle) => `(() => {
  const n = ${JSON.stringify(needle)};
  return document.querySelector('[data-testid=' + JSON.stringify(n) + ']')
    ?? [...document.querySelectorAll('div,span,a,button')].filter((e) => e.innerText?.trim() === n).at(-1)
    ?? null;
})()`;

/**
 * Tap like a finger: find the element, scroll it into view, wait until it has
 * STOPPED MOVING (sheets slide in over ~300ms — a tap computed mid-slide lands
 * where the button was), then press and release at its centre.
 */
async function click(needle) {
  let prev = null;
  for (let i = 0; i < 40; i++) {
    const r = await evaluate(`(() => { const el = ${FIND(needle)}; if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (r && prev && Math.abs(r.x - prev.x) < 0.5 && Math.abs(r.y - prev.y) < 0.5) {
      for (const type of ['mousePressed', 'mouseReleased']) await page('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await wait(250);
      return;
    }
    prev = r;
    await wait(120);
  }
  throw new Error(`nothing to tap (or it never stopped moving): ${needle}`);
}

async function type(testId, value) {
  await evaluate(`document.querySelector('[data-testid=${JSON.stringify(testId)}]')?.focus()`);
  await page('Input.insertText', { text: value });
  await wait(400);
}

async function shot(name) {
  const s = await page('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(OUT, `${name}.png`), Buffer.from(s.data, 'base64'));
}

/* ── the flows ───────────────────────────────────────────────────────────── */

const FLOWS = [
  {
    name: 'discover: five slides → Get started → welcome, flag set',
    async run() {
      await open('/discover', { signedIn: false, onboarded: false });
      await see('Deadlines hide in paper');
      await click('discover-next');
      await see('Snap the letter.');
      await click('discover-next');
      await see('See exactly where the date came from');
      await click('discover-back');
      await see('Snap the letter.');
      await click('discover-next');
      await click('discover-next');
      await see('Reminded before');
      await click('discover-next');
      await see('Share the load at home');
      await shot('01-discover-last');
      await click('discover-next');
      await see('remember the date');
      if ((await evaluate("localStorage.getItem('duebox.onboarded')")) !== '1') throw new Error('onboarded flag not set');
    },
  },
  {
    name: 'discover: Skip goes straight to welcome',
    async run() {
      await open('/discover', { signedIn: false, onboarded: false });
      await see('Deadlines hide in paper');
      await click('discover-skip');
      await see('remember the date');
    },
  },
  {
    name: 'first launch routes to the pitch; later launches to welcome',
    async run() {
      await open('/', { signedIn: false, onboarded: false });
      await see('Deadlines hide in paper');
      await open('/', { signedIn: false, onboarded: true });
      await see('remember the date');
    },
  },
  {
    name: 'setup: two taps → POST /setup with the answers → welcome offer',
    async run() {
      await open('/setup');
      await see('What usually slips through?');
      await click('setup-pick-insurance');
      await click('setup-pick-vehicle');
      await see('2 picked');
      await click('setup-next');
      await see('When should reminders arrive?');
      await click('setup-hour-18');
      await click('setup-next');
      await see('days of Pro have started');
      const sent = JSON.parse((await evaluate("fetch('http://localhost:8787/api/v1/__last/POST/setup').then(r => r.text())")) ?? 'null');
      if (sent?.remindHour !== 18 || JSON.stringify(sent?.focus) !== '["insurance","vehicle"]') throw new Error(`setup sent ${JSON.stringify(sent)}`);
    },
  },
  {
    name: 'offer: marks itself seen; leaving asks once about the discount → home',
    async run() {
      await open('/offer');
      await evaluate("localStorage.setItem('duebox.harnessStore','1')");
      await open('/offer');
      await evaluate("localStorage.setItem('duebox.harnessStore','1')");
      await page('Page.reload');
      await see('$27.99');
      const seen = JSON.parse((await evaluate("fetch('http://localhost:8787/api/v1/__last/PATCH/auth/me').then(r => r.text())")) ?? 'null');
      if (seen?.offerSeen !== true) throw new Error(`offer not marked seen: ${JSON.stringify(seen)}`);
      await click('offer-plan-monthly');
      await click('offer-skip');
      await see('This is a one-time offer');
      await click('offer-leave');
      await see((t) => t.includes('due this week') || t.includes('Next up'));
    },
  },
  {
    name: 'home: smart headline, strip, mark Next up done → toast with Undo',
    async run() {
      await open('/(tabs)/home');
      await see('1 overdue, 2 due this week.');
      await see('School trip form');
      await click('next-up-done');
      const t = await see((x) => x.includes('One less thing') || x.includes('Next one'));
      if (!t.includes('Undo')) throw new Error('toast has no Undo');
      await shot('02-home-done-toast');
    },
  },
  {
    name: 'home: tap a day in the strip → sheet lists what is due that day',
    async run() {
      await open('/(tabs)/home');
      await see('School trip form');
      await click(`day-${day(6)}`);
      await see((t) => t.includes('Car insurance') && /October|November/.test(t));
      await shot('03-home-day-sheet');
    },
  },
  {
    name: 'all items: search narrows the list',
    async run() {
      await open('/(tabs)/items');
      await see('Car insurance');
      await type('items-search', 'tax');
      await see((t) => t.includes('Property tax') && !t.includes('Car insurance'));
      await click('Done');
      await see('Nothing matches');
    },
  },
  {
    name: 'new item: empty save shows both errors; a template fills the preview',
    async run() {
      await open('/item/new');
      await see('Start from a common one');
      await click('item-save');
      await see('Pick the date it’s due.');
      await see('Give it a short name');
      await click('template-Car insurance');
      const t = await see((x) => x.includes('renew') && x.includes('every year'));
      if (t.includes('Start from a common one')) throw new Error('templates still shown after choosing one');
      await shot('04-new-item-template');
    },
  },
  {
    name: 'new item (free): a Pro-only reminder opens the paywall with the right headline',
    async run() {
      await open('/item/new');
      await click('form-more');
      await see('Remind me');
      await click('offset-30');
      await see('Get reminded your way');
      if (!(await url()).includes('/paywall')) throw new Error('not on the paywall');
      await see('Restore purchases');
      await shot('05-paywall-custom-reminders');
    },
  },
  {
    name: 'item: snooze from the sheet → toast',
    async run() {
      await open('/item/i-car');
      await see('Reminders at 9:00 AM');
      await click('item-snooze');
      await see('Remind me again');
      await click('Tomorrow');
      await see('Snoozed until tomorrow.');
    },
  },
  {
    name: 'item: overflow → delete asks with the consequence named',
    async run() {
      await open('/item/i-car');
      await see('Car insurance');
      await evaluate("document.querySelector('[aria-label=\"More actions\"]')?.click()");
      await see('Delete item');
      await click('item-menu-delete');
      await see('Delete “Car insurance”?');
      await see('2 attached pages');
      await shot('06-delete-confirm');
    },
  },
  {
    name: 'scan confirm: two deadlines saved → leaves the confirm screen',
    async run() {
      await open('/scan/s-1');
      await see('We found 2 deadlines');
      await click('confirm-save');
      await see((t) => t.includes('Saved 2 deadlines') || !t.includes('We found 2 deadlines'));
    },
  },
  {
    name: 'read failed → Type it in opens the manual form',
    async run() {
      await open('/scan/s-2');
      await see('No date found');
      await click('Type it in');
      await see('Start from a common one');
    },
  },
  {
    name: 'settings: notifications toggle stays on brand and flips',
    async run() {
      await open('/settings/notifications');
      await see('Deadline reminders');
      const before = await evaluate("document.querySelector('[aria-label=\"Overdue nudges\"]')?.checked");
      await evaluate("document.querySelector('[aria-label=\"Overdue nudges\"]')?.click()");
      await wait(400);
      const after = await evaluate("document.querySelector('[aria-label=\"Overdue nudges\"]')?.checked");
      if (before === after) throw new Error(`switch did not flip (${before} → ${after})`);
    },
  },
  {
    name: 'signed out: a private route sends you to sign-in, never shows data',
    async run() {
      await open('/(tabs)/home', { signedIn: false, onboarded: true });
      await see('remember the date');
    },
  },
];

/* ── run ─────────────────────────────────────────────────────────────────── */

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(HERE, '.chrome-flows')}`, '--window-size=393,852', '--no-first-run', '--disable-gpu'], { stdio: 'ignore' });
let failed = 0;
try {
  const socket = new WebSocket(await connect());
  await new Promise((r) => socket.addEventListener('open', r));
  const send = client(socket);
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  page = (m, p) => send(m, p, sessionId);
  await page('Page.enable');
  await page('Runtime.enable');
  await page('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });

  for (const flow of FLOWS) {
    try {
      await flow.run();
      console.log(`  ✓ ${flow.name}`);
    } catch (e) {
      failed += 1;
      console.log(`  ✗ ${flow.name}\n      ${e.message}  (at ${await url()})`);
      await shot(`FAIL-${FLOWS.indexOf(flow) + 1}`);
    }
  }
  socket.close();
} finally {
  chrome.kill();
}
console.log(`\n${FLOWS.length - failed}/${FLOWS.length} flows passed`);
if (failed) process.exitCode = 1;
