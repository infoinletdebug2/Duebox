/**
 * Duebox's public site — the home page plus the Privacy Policy, Terms,
 * Support and account-deletion URLs the App Store and Google Play require.
 * Served by the same Worker as the API (deploy/xenition.mjs).
 *
 *   node website/build.mjs          # → website/dist/
 *
 * The legal TEXT is not duplicated here: it is compiled straight out of the
 * app's own screens (mobile/app/legal/*.tsx), so the in-app policy and the
 * public one can never disagree. Edit the app file, rebuild the site.
 */
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const MOBILE = join(HERE, '..', 'mobile');
const DIST = join(HERE, 'dist');
const require = createRequire(join(MOBILE, 'package.json'));
const ts = require('typescript');

/** The app config values the legal screens import — keep in step with mobile/.env. */
const CONFIG = { SUPPORT_EMAIL: 'contact@infoinlet.com', TRIAL_DAYS: 7 };
const SUPPORT_EMAIL = CONFIG.SUPPORT_EMAIL;
const SITE = 'https://duebox.xenition.com';
const YEAR = new Date().getUTCFullYear();

/** Compile the constants of a legal screen (everything above `export default`). */
async function legal(file) {
  let src = await readFile(join(MOBILE, 'app', 'legal', file), 'utf8');
  src = src.split(/export default/)[0];
  src = src.replace(/^import .*$/gm, '').replace(/^export /gm, '');
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
  const names = Object.keys(CONFIG);
  const fn = new Function(...names, `${js}; return { EFFECTIVE, SUMMARY: typeof SUMMARY === 'undefined' ? [] : SUMMARY, SECTIONS };`);
  return fn(...names.map((n) => CONFIG[n]));
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const linkify = (s) => esc(s).replace(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi, '<a href="mailto:$1">$1</a>');

function block(b) {
  if (typeof b === 'string') return `<p>${linkify(b)}</p>`;
  if (b && Array.isArray(b.bullets)) return `<ul>${b.bullets.map((x) => `<li>${linkify(x)}</li>`).join('')}</ul>`;
  return '';
}

/* Plum (structure), marigold (the one thing you press), paper (everything else). */
const CSS = `
:root{--ground:#F5F3F8;--surface:#fff;--ink:#1E1229;--muted:#5E5470;--line:#E6E1EE;--plum:#2E1A47;--plum-ink:#2E1A47;--marigold:#F2B33D;--on-marigold:#2A1640}
@media (prefers-color-scheme:dark){:root{--ground:#141019;--surface:#1D1726;--ink:#F1ECF7;--muted:#A99FB8;--line:#2E2638;--plum:#2E1A47;--plum-ink:#C9B6F2;--marigold:#F5BE55;--on-marigold:#1E1229}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--ground);color:var(--ink);font:17px/1.6 Manrope,system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--plum-ink)}
.wrap{max-width:780px;margin:0 auto;padding:24px 20px 64px}
header{display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:8px 0 24px}
header img{width:40px;height:40px;border-radius:11px}
header>a{font:700 22px/1 "Bricolage Grotesque",Manrope,system-ui,sans-serif;text-decoration:none;color:var(--ink)}
nav{margin-left:auto;display:flex;gap:16px;font-size:15px}nav a{color:var(--muted);text-decoration:none;font-weight:600}nav a:hover{color:var(--ink)}
h1{font:700 42px/1.08 "Bricolage Grotesque",Manrope,system-ui,sans-serif;letter-spacing:-.02em;margin:8px 0}
h2{font:600 23px/1.3 "Bricolage Grotesque",Manrope,system-ui,sans-serif;margin:36px 0 8px}
.eff{color:var(--muted);font-size:15px}
.summary{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:16px 24px;margin:24px 0}
.hero{background:linear-gradient(160deg,#3C2560,#2E1A47 55%,#1E1229);color:#fff;border-radius:28px;padding:44px 30px;margin:8px 0 28px;position:relative;overflow:hidden}
.hero h1{color:#fff;font-size:48px;max-width:560px}.hero p{color:#D9CFEA;font-size:19px;max-width:560px}
.hero .tile{position:absolute;right:28px;top:28px;width:96px;border-radius:18px;background:#fff;color:#2E1A47;text-align:center;box-shadow:0 18px 40px rgba(0,0,0,.35);overflow:hidden}
.hero .tile b{display:block;background:var(--marigold);color:#2A1640;font-size:13px;letter-spacing:.08em;padding:4px 0}
.hero .tile span{display:block;font:700 46px/1.15 "Bricolage Grotesque",sans-serif;padding:4px 0 8px}
@media (max-width:620px){.hero .tile{display:none}.hero h1{font-size:38px}}
.cta{display:inline-block;margin-top:14px;background:var(--marigold);color:var(--on-marigold);font-weight:700;padding:14px 22px;border-radius:999px;text-decoration:none}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(210px,100%),1fr));gap:12px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:18px}
.card h3{margin:0 0 6px;font-size:17px}.card p{margin:0;color:var(--muted);font-size:15px}
.steps{counter-reset:s;list-style:none;padding:0;margin:20px 0;display:grid;gap:10px}
.steps li{counter-increment:s;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px 18px 14px 58px;position:relative}
.steps li::before{content:counter(s);position:absolute;left:16px;top:13px;width:28px;height:28px;border-radius:50%;background:var(--plum);color:#fff;font-weight:700;display:grid;place-items:center;font-size:14px}
footer{margin-top:48px;color:var(--muted);font-size:14px;border-top:1px solid var(--line);padding-top:16px}
`;

function page({ title, description, body, path }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<link rel="icon" href="/favicon.png"><link rel="canonical" href="${SITE}${path}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700&family=Manrope:wght@400;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head>
<body><div class="wrap">
<header><img src="/icon.png" alt=""><a href="/">Duebox</a><nav><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/support">Support</a></nav></header>
${body}
<footer>© ${YEAR} InfoInlet · <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/delete-account">Delete account</a></footer>
</div></body></html>`;
}

function legalPage(title, path, doc) {
  const summary = doc.SUMMARY.length ? `<div class="summary"><h2 style="margin-top:8px">The short version</h2><ul>${doc.SUMMARY.map((s) => `<li>${linkify(s)}</li>`).join('')}</ul></div>` : '';
  const sections = doc.SECTIONS.map((s, i) => `<h2>${i + 1}. ${esc(s.heading)}</h2>${s.body.map(block).join('')}`).join('');
  return page({
    title: `${title} — Duebox`,
    description: `Duebox ${title.toLowerCase()}.`,
    path,
    body: `<h1>${esc(title)}</h1><p class="eff">Effective ${esc(doc.EFFECTIVE)}</p>${summary}${sections}`,
  });
}

const home = page({
  title: 'Duebox — Snap the letter. We’ll remember the date.',
  description: 'Duebox reads renewals, bills and forms, shows you the words each deadline came from, and reminds you 30, 7 and 1 days before it’s due.',
  path: '/',
  body: `<section class="hero"><div class="tile"><b>NOV</b><span>20</span></div>
<h1>Snap the letter. We’ll remember the date.</h1>
<p>Renewal notices, bills, school forms, free trials — Duebox reads the deadline, shows you exactly where it found it, and reminds you before the day, not on it.</p>
<a class="cta" href="/support">Get help</a></section>
<div class="grid">
<div class="card"><h3>Snap it</h3><p>Camera, photos or a PDF. The AI finds up to three deadlines in seconds — you check and save.</p></div>
<div class="card"><h3>See the evidence</h3><p>The words the date came from sit right beside it. No clear date? It never guesses.</p></div>
<div class="card"><h3>Reminded before</h3><p>30, 7 and 1 days ahead at the hour you choose. Done or Snooze from the notification.</p></div>
<div class="card"><h3>Share at home</h3><p>Invite a partner, assign who handles what. Repeating things roll over on their own.</p></div>
</div>
<h2>Free to start</h2>
<p>Five deadlines and three scans a month, free forever. Every new household also gets ${CONFIG.TRIAL_DAYS} days of Pro after setup — no card. Pro is unlimited deadlines, 100 scans a month and household sharing.</p>`,
});

const support = page({
  title: 'Support — Duebox',
  description: 'Get help with Duebox.',
  path: '/support',
  body: `<h1>Support</h1>
<p>Email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> — a person replies, usually within one business day.</p>
<h2>Common questions</h2>
<p><strong>How does Duebox read my letters?</strong> An AI model reads the page images to find the deadline, through a provider that is not allowed to keep or train on them. You confirm every date before anything is saved, and only the last four characters of any reference number are kept.</p>
<p><strong>Why didn’t I get a reminder?</strong> Check that notifications are on for Duebox in your phone’s settings and in Duebox → Settings → Notifications. Reminders arrive at your household’s reminder time; a deadline assigned to someone else reminds them, not you.</p>
<p><strong>What happens when the free trial ends?</strong> Your household moves to the free plan. Nothing is hidden or deleted; you can keep using five open deadlines and three scans a month.</p>
<p><strong>How do I cancel Pro?</strong> Subscriptions are managed by Apple or Google: iPhone Settings → your name → Subscriptions, or Google Play → Payments &amp; subscriptions.</p>
<p><strong>I forgot my password.</strong> On the sign-in screen tap “Forgot password”, enter your email, and type the 6-digit code we send you.</p>
<p><strong>How do I delete my account?</strong> In the app: Settings → Delete account. Everything is erased. No app? See <a href="/delete-account">Delete your account</a>.</p>`,
});

// Google Play requires a web page where someone can ask for deletion WITHOUT the app.
const deleteAccount = page({
  title: 'Delete your account — Duebox',
  description: 'How to delete your Duebox account and everything in it.',
  path: '/delete-account',
  body: `<h1>Delete your Duebox account</h1>
<p>You can delete your account at any time. Deleting it removes your account and everything you stored in Duebox.</p>
<h2>In the app (fastest)</h2>
<ol class="steps">
<li>Open Duebox and go to <strong>Settings</strong>.</li>
<li>Tap <strong>Delete account</strong>.</li>
<li>Confirm with your password — or type <strong>DELETE</strong> if you sign in with Apple or Google.</li>
</ol>
<h2>Without the app</h2>
<p>Email <a href="mailto:${SUPPORT_EMAIL}?subject=Delete%20my%20Duebox%20account">${SUPPORT_EMAIL}</a> from the address you signed up with, with the subject “Delete my Duebox account”. We confirm it is you, delete the account, and reply when it is done — within 30 days.</p>
<h2>What is deleted</h2>
<ul>
<li>Your account and sign-in.</li>
<li>Every scanned page, photo and PDF, and everything read from them.</li>
<li>Your deadlines, reminders, notes and attachments.</li>
<li>If you own the household, the household itself — members you invited lose access.</li>
</ul>
<p>Your data disappears from the app straight away and is permanently erased from our systems, including backups, within 30 days. We keep nothing for advertising.</p>
<h2>Your subscription</h2>
<p>Deleting your account does not cancel an App Store or Google Play subscription. Cancel it in your store account: iPhone Settings → your name → Subscriptions, or Google Play → Payments &amp; subscriptions.</p>
<p>Want a copy first? In the app: Settings → Export my data (CSV or JSON).</p>`,
});

await rm(DIST, { recursive: true, force: true });
for (const dir of ['privacy', 'terms', 'support', 'delete-account']) await mkdir(join(DIST, dir), { recursive: true });
await writeFile(join(DIST, 'index.html'), home);
await writeFile(join(DIST, 'privacy', 'index.html'), legalPage('Privacy Policy', '/privacy', await legal('privacy.tsx')));
await writeFile(join(DIST, 'terms', 'index.html'), legalPage('Terms of Use', '/terms', await legal('terms.tsx')));
await writeFile(join(DIST, 'support', 'index.html'), support);
await writeFile(join(DIST, 'delete-account', 'index.html'), deleteAccount);
await copyFile(join(MOBILE, 'assets', 'store-icon-512.png'), join(DIST, 'icon.png'));
await copyFile(join(MOBILE, 'assets', 'favicon.png'), join(DIST, 'favicon.png'));
console.log('built website/dist: /, /privacy, /terms, /support, /delete-account');
