/**
 * Drive the exported web build in headless Chrome and screenshot every screen.
 *
 *   node harness/serve.mjs      # in one shell
 *   node harness/shoot.mjs      # in another
 *
 * Raw CDP over a WebSocket, no Puppeteer. The dependency buys an API this
 * script uses four calls from, and every install of it is another 100MB of
 * Chromium beside the one already on the machine.
 *
 * Screens land in `harness/shots/`.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SHOTS = join(HERE, process.argv.includes('--dark') ? 'shots-dark' : 'shots');
const PROFILE = join(HERE, '.chrome-profile');
const WEB = 'http://localhost:8080';
const PORT = 9222;

/** A phone, not a desktop. The layout only means anything at this width. */
const VIEWPORT = { width: 393, height: 852, deviceScaleFactor: 2 };

const CHROME =
  process.env.CHROME_PATH ??
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

/**
 * The session the app restores on launch.
 *
 * Seeding `localStorage` rather than typing into the sign-in form: the form is
 * shot separately, and driving a real login through a stub would be testing
 * the stub. On web, `auth/storage.ts` falls back to `localStorage` under this
 * exact key.
 */
const SESSION = {
  accessToken: process.env.DUEBOX_TOKEN ?? 'harness-token',
  refreshToken: process.env.DUEBOX_REFRESH ?? 'harness-refresh',
  expiresAt: Date.now() + 3600_000,
  user: { id: 'u-demo', email: 'dana@example.com', name: 'Dana Rivera', emailVerified: true },
};

/** `expect` names words only the WORKING screen has — stub data, not titles. */
const SCREENS = [
  { path: '/discover', name: '01-discover', anonymous: true, settle: 1200, expect: ['Deadlines hide in paper', 'Skip'] },
  { path: '/setup', name: '05-setup', settle: 1200, expect: ['What usually slips through?', 'Insurance', 'Continue'] },
  { path: '/offer', name: '06-offer', settle: 1600, storage: { 'duebox.harnessStore': '1' }, expect: ['days of Pro have started', '$27.99', 'Restore purchases'] },
  { path: '/(auth)/welcome', name: '02-welcome', anonymous: true, expect: ['remember the date', 'Continue with email'] },
  { path: '/(auth)/sign-up', name: '03-sign-up', anonymous: true, expect: ['Email', 'Password'] },
  { path: '/(auth)/sign-in', name: '04-sign-in', anonymous: true, expect: ['Email', 'Password'] },
  { path: '/offer', name: '06b-offer-no-store', settle: 1600, expect: ['days of Pro have started', '$27.99', 'Prices in USD'] },
  { path: '/(auth)/forgot-password', name: '07-forgot', anonymous: true, expect: ['Reset your password', 'Send code'] },
  { path: '/(auth)/reset-password?email=dana%40example.com', name: '08-reset', anonymous: true, expect: ['Enter your code', 'dana@example.com', 'Save new password'] },
  { path: '/(tabs)/home', name: '10-home', settle: 1400, expect: ['1 overdue, 2 due this week', 'Next up', 'School trip form', 'Car insurance', '$412.00', '3 days late', 'ready to check'] },
  { path: '/(tabs)/items', name: '11-items', expect: ['Property tax', 'Passport renewal'] },
  { path: '/item/i-car', name: '12-item', expect: ['Found in the letter', '4821', 'Reminders at 9:00 AM', 'On the day'] },
  { path: '/item/i-car/edit', name: '13-item-edit', expect: ['Due date', 'Remind me'] },
  { path: '/item/new', name: '14-item-new', expect: ['What is it?', 'More details'] },
  { path: '/item/new?category=insurance', name: '14b-item-new-more', expect: ['Category', 'Repeats', 'Remind me'] },
  { path: '/scan', name: '15-scan', expect: ['Snap the page', 'Camera', 'PDF'] },
  { path: '/scan/s-1', name: '16-confirm', expect: ['We found 2 deadlines', 'Deadline 2 of 2', 'Check this', 'return the completed form'] },
  { path: '/scan/s-2', name: '17-read-failed', expect: ['No date found', 'Type it in'] },
  { path: '/notifications-permission?title=Car%20insurance', name: '18-permission', expect: ['Car insurance', 'Turn on reminders'] },
  { path: '/paywall?reason=item_limit', name: '20-paywall', settle: 1400, expect: ['Restore purchases', 'Terms'] },
  { path: '/(tabs)/settings', name: '30-settings', expect: ['The Riveras', 'Delete account', 'Duebox 1'] },
  { path: '/settings/household', name: '31-household', expect: ['Sam Rivera', 'K7PQ2M'] },
  { path: '/settings/notifications', name: '32-notifications', expect: ['Deadline reminders', 'Overdue nudges'] },
  { path: '/settings/reminder-time', name: '33-reminder-time', expect: ['9:00 AM'] },
  { path: '/settings/subscription', name: '34-subscription', expect: ['Duebox Pro', 'Scans this month'] },
  { path: '/settings/account', name: '35-account', expect: ['dana@example.com'] },
  { path: '/settings/export', name: '36-export', expect: ['CSV'] },
  { path: '/settings/delete', name: '37-delete', expect: ['The Riveras'] },
  { path: '/legal/privacy', name: '40-privacy', anonymous: true, expect: ['OpenRouter', 'last 4'] },
  { path: '/legal/terms', name: '41-terms', anonymous: true, expect: ['auto-renewing'] },
  { path: '/join/K7PQ2M', name: '42-join', expect: ['The Riveras'] },
  { path: '/(tabs)/home?review=1', name: '43-review-prompt', settle: 2600, expect: ['First letter, read', 'Rate Duebox'] },
];

/** `--dark` shoots everything in dark mode into shots-dark/. */
const DARK = process.argv.includes('--dark');
/** `--only=10-today,11-lesson` re-shoots a few. */
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);

/* ── a minimal CDP client ─────────────────────────────────────────────────── */

async function connect() {
  // Chrome writes the WebSocket URL to /json/version once it is listening.
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const info = await response.json();
      if (info.webSocketDebuggerUrl) return info.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Chrome never opened its debugging port.');
}

function client(socket) {
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const waiter = pending.get(message.id);
    if (waiter) {
      pending.delete(message.id);
      message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
    }
  });
  return (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ── the run ──────────────────────────────────────────────────────────────── */

async function main() {
  if (ONLY.length === 0) await rm(SHOTS, { recursive: true, force: true });
  await mkdir(SHOTS, { recursive: true });

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE}`,
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
    ],
    { stdio: 'ignore' },
  );

  const wsUrl = await connect();
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve));
  const send = client(socket);

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);

  await page('Page.enable');
  await page('Runtime.enable');
  await page('Emulation.setDeviceMetricsOverride', {
    ...VIEWPORT,
    mobile: true,
  });
  if (DARK) await page('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });

  let failures = 0;
  for (const screen of SCREENS.filter((x) => ONLY.length === 0 || ONLY.includes(x.name))) {
    // The session is written BEFORE the app boots, so `loadSession()` finds it
    // on the first render rather than after a redirect to the welcome screen.
    await page('Page.navigate', { url: `${WEB}/` });
    await wait(300);
    await page('Runtime.evaluate', {
      expression: screen.anonymous
        ? `localStorage.removeItem('duebox.session')`
        : `localStorage.setItem('duebox.session', ${JSON.stringify(JSON.stringify(SESSION))})`,
    });
    await page('Runtime.evaluate', {
      expression: `localStorage.removeItem('duebox.harnessStore');${Object.entries(screen.storage ?? {})
        .map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
        .join('')}`,
    });

    await page('Page.navigate', { url: `${WEB}${screen.path}` });

    /**
     * Wait for the screen to actually have content, not for a stopwatch.
     *
     * A fixed sleep was the first version, and against the real gateway it
     * shot the loading skeleton — which has no text — on every authenticated
     * screen while still reporting success. Polling for text means a slow
     * endpoint produces a slow run rather than a wrong screenshot, and the
     * timeout below is what turns a genuinely hung screen into a failure.
     */
    const deadline = Date.now() + (screen.timeout ?? 20_000);
    let previous = null;
    let stable = 0;
    for (;;) {
      const probe = await page('Runtime.evaluate', {
        expression: `JSON.stringify({
          len: document.body.innerText.replace(/Home|All items|Settings/g, '').trim().length,
          has: ${JSON.stringify(screen.expect ?? [])}.every((t) => document.body.innerText.includes(t)),
        })`,
        returnByValue: true,
      });
      const { len, has } = JSON.parse(probe.result?.value ?? '{"len":0,"has":false}');

      /**
       * Settled means the text STOPPED CHANGING, not that some arrived.
       *
       * "is there any text" was the previous rule, and against a deployed
       * worker it shot the loading skeleton on Reports while reporting
       * success — a skeleton screen still has a title and a month picker, so
       * the old check passed the moment the shell painted, ~300ms before any
       * data landed. It only ever looked right because a worker on localhost
       * answered inside the 900ms settle that followed.
       *
       * Waiting for stability instead means the harness self-tunes to
       * whatever the backend's latency actually is, which is the whole point
       * of pointing it at a real one.
       */
      if (len > 0 && len === previous && has) {
        if (++stable >= 2) break;
      } else {
        stable = 0;
      }
      previous = len;
      if (Date.now() > deadline) break;
      await wait(400);
    }
    // Then a beat for the fonts and the one orchestrated entrance.
    await wait(screen.settle ?? 900);

    /**
     * Did the APP render, or did something else?
     *
     * "is the text non-empty" was the first version of this check, and it
     * reported 18/18 green while every screenshot said "This site can't be
     * reached" — Chrome's own error page has plenty of text. A checker that
     * passes on a dead server is worse than no checker, so this asks for
     * evidence the React tree actually mounted, and treats anything that
     * smells like a browser error page as a failure regardless.
     */
    const check = await page('Runtime.evaluate', {
      expression: `JSON.stringify({
        text: document.body.innerText,
        mounted: Boolean(document.querySelector('#root')?.children.length),
      })`,
      returnByValue: true,
    });
    const { text = '', mounted = false } = JSON.parse(check.result?.value ?? '{}');
    const looksLikeError =
      /can.t be reached|ERR_|refused to connect|Application error/i.test(text);

    /*
     * `expect` is what stops this harness reporting green on a screen that
     * rendered its chrome and nothing else.
     *
     * "Add a bill" passed for weeks as a title and a button with an empty
     * page between them, because the title is text and the check was "is
     * there text". A screen whose form collapsed still has a header, so the
     * assertion has to name something only the WORKING screen has.
     */
    const missing = screen.expect?.filter((needle) => !text.includes(needle)) ?? [];
    const ok = mounted && !looksLikeError && text.trim().length > 0 && missing.length === 0;
    if (!ok) failures += 1;

    const shot = await page('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(join(SHOTS, `${screen.name}.png`), Buffer.from(shot.data, 'base64'));
    console.log(
      `  ${ok ? '✓' : '✗'} ${screen.name}  ${
        ok
          ? (text.split('\n')[0]?.slice(0, 46) ?? '')
          : missing.length > 0
            ? `MISSING — ${missing.join(', ').slice(0, 40)}`
            : `NOT THE APP — ${text.split('\n')[0]?.slice(0, 40)}`
      }`,
    );
  }

  socket.close();
  chrome.kill();
  console.log(`\n${SCREENS.length - failures}/${SCREENS.length} screens rendered → harness/shots/`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('harness failed:', error.message);
  process.exit(1);
});
