#!/usr/bin/env node
/**
 * Deploy Duebox to production through Xenition's own app pipeline.
 *
 *   XENITION_EMAIL=… XENITION_PASSWORD=… node deploy/xenition.mjs
 *   (or: node --env-file=$HOME/.xenition-admin.env deploy/xenition.mjs)
 *
 * What it sends to POST https://api.xenition.com/v1/generate/app-deploy:
 *   backend/   the worker (src/, package.json, tsconfig.json) — the pipeline
 *              runs npm install + wrangler deploy and installs the app's
 *              XENITION_* secrets itself
 *   frontend/  the website (/, /privacy, /terms, /support) as a tiny Vite
 *              project; the pipeline serves it from the SAME Worker, which
 *              answers /api/* and /health first
 *
 * The account that signs in must own `app_duebox` (the admin account that
 * minted its keys), so the deploy reuses that app, its database and keys.
 * Result: one URL, https://duebox.xenition.com.
 *
 * The OpenRouter key is NOT sent: it is the app's own AI key inside Xenition (backend/scripts/ai-key.ts).
 * The pipeline writes only text files, so the website's two PNGs are inlined
 * as data: URLs.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GATEWAY = (process.env.XENITION_GATEWAY ?? 'https://api.xenition.com').replace(/\/$/, '');
const APP_NAME = 'Duebox';

const die = (msg) => {
  console.error(`deploy: ${msg}`);
  process.exit(1);
};

function walk(dir, keep) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, keep));
    else if (keep(p)) out.push(p);
  }
  return out;
}

/* ── backend ─────────────────────────────────────────────────────────────── */

const backendDir = join(ROOT, 'backend');
const pkg = JSON.parse(readFileSync(join(backendDir, 'package.json'), 'utf8'));
// The build server has no GitHub SSH key: fetch the SDK over https, same commit.
pkg.dependencies['@xenition/sdk'] = pkg.dependencies['@xenition/sdk'].replace(/^github:([^#]+)/, 'git+https://github.com/$1.git');
const files = [
  { path: 'backend/package.json', content: JSON.stringify(pkg, null, 2) + '\n' },
  { path: 'backend/tsconfig.json', content: readFileSync(join(backendDir, 'tsconfig.json'), 'utf8') },
  ...walk(join(backendDir, 'src'), (p) => p.endsWith('.ts') && !p.endsWith('.test.ts')).map((p) => ({
    path: 'backend/' + relative(backendDir, p).replaceAll('\\', '/'),
    content: readFileSync(p, 'utf8'),
  })),
];

/* ── frontend: the website ───────────────────────────────────────────────── */

execFileSync(process.execPath, [join(ROOT, 'website', 'build.mjs')], { stdio: 'inherit' });
const dist = join(ROOT, 'website', 'dist');
const dataUrl = (name) => `data:image/png;base64,${readFileSync(join(dist, name)).toString('base64')}`;
const inline = (html) => html.replaceAll('/icon.png', dataUrl('icon.png')).replaceAll('/favicon.png', dataUrl('favicon.png'));

files.push(
  {
    path: 'frontend/package.json',
    content: JSON.stringify(
      {
        name: 'duebox-site',
        private: true,
        description: 'Duebox reads your letters, finds the deadlines and reminds you before they are due.',
        type: 'module',
        scripts: { build: 'vite build' },
        devDependencies: { vite: '^5.4.0' },
      },
      null,
      2,
    ) + '\n',
  },
  { path: 'frontend/index.html', content: inline(readFileSync(join(dist, 'index.html'), 'utf8')) },
);
for (const page of ['privacy', 'terms', 'support', 'delete-account']) {
  // public/ is copied into dist as-is: /privacy/index.html, …
  files.push({ path: `frontend/public/${page}/index.html`, content: inline(readFileSync(join(dist, page, 'index.html'), 'utf8')) });
}

/* ── sign in, deploy, wait ───────────────────────────────────────────────── */

async function call(method, url, body, token) {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
}

const email = process.env.XENITION_EMAIL;
const password = process.env.XENITION_PASSWORD;
if (!email || !password) die('set XENITION_EMAIL and XENITION_PASSWORD (the account that owns app_duebox)');
// Note the path: /auth/login has no /v1 prefix.
const login = await call('POST', `${GATEWAY}/auth/login`, { email, password });
const token = login.json.accessToken ?? login.json.data?.accessToken;
if (!token) die(`sign-in failed (${login.status})`);

const bytes = files.reduce((n, f) => n + f.content.length, 0);
console.log(`deploy: ${files.length} files, ${(bytes / 1024).toFixed(0)} KB → ${GATEWAY}/v1/generate/app-deploy`);
// suffix '@bare': publish at duebox.<site domain> (the owner of app_duebox only;
// gateway 2ec57cb6+). Without it the address carries a -<hash>.
const started = await call('POST', `${GATEWAY}/v1/generate/app-deploy`, { app_name: APP_NAME, suffix: '@bare', files }, token);
const jobId = started.json.job_id;
if (!jobId) die(`deploy did not start (${started.status}): ${JSON.stringify(started.json).slice(0, 300)}`);

let last = '';
for (let i = 0; i < 180; i += 1) {
  await new Promise((r) => setTimeout(r, 10_000));
  const { json } = await call('GET', `${GATEWAY}/v1/generate/app-deploy/${jobId}`, undefined, token);
  if (json.stage && json.stage !== last) console.log(`deploy: ${(last = json.stage)}`);
  if (json.status === 'completed' || json.status === 'failed') {
    if (!json.ok) die(`failed: ${json.error ?? json.reason ?? JSON.stringify(json).slice(0, 400)}`);
    console.log(`\ndeploy: live\n  site + API  ${json.url || json.frontend_url}\n  worker      ${json.worker_name ?? ''}\n  app         ${json.app_id ?? ''}`);
    process.exit(0);
  }
}
die('timed out after 30 minutes; the job may still finish — check the URL later');
