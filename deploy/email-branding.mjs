#!/usr/bin/env node
/**
 * Brand the emails the platform sends for Duebox: the sign-up code, the
 * password reset, the email-change code. Xenition sends them, not this
 * worker; with nothing set they go out as "Xenition" in Xenition's gold.
 *
 *   node --env-file=$HOME/.xenition-admin.env deploy/email-branding.mjs
 *
 * Signs in as the account that owns app_duebox (as deploy/xenition.mjs does)
 * and PATCHes /v1/app-manage/app_duebox/email/branding:
 *   fromName    the From name and the wordmark ("Duebox"; plain ASCII)
 *   brandColor  the wordmark / button colour: Duebox plum
 *   logoUrl     https PNG drawn at 56 px: the worker serves the mark at
 *               /api/v1/brand/logo.png (backend/src/brand-logo.ts), so deploy
 *               the worker before pointing the branding at it.
 * Then prints the platform's `effective` values, which are what the emails use.
 */

const GATEWAY = (process.env.XENITION_GATEWAY ?? 'https://api.xenition.com').replace(/\/$/, '');
const APP_ID = 'app_duebox';
const BRANDING = {
  fromName: 'Duebox',
  brandColor: '#2E1A47',
  logoUrl: 'https://duebox.xenition.com/api/v1/brand/logo.png',
};

const die = (message) => {
  console.error(`email-branding: ${message}`);
  process.exit(1);
};

const email = process.env.XENITION_EMAIL;
const password = process.env.XENITION_PASSWORD;
if (!email || !password) die('set XENITION_EMAIL and XENITION_PASSWORD (the account that owns app_duebox)');

const logo = await fetch(BRANDING.logoUrl);
if (!logo.ok || logo.headers.get('content-type') !== 'image/png') {
  die(`${BRANDING.logoUrl} does not serve a PNG (${logo.status} ${logo.headers.get('content-type')}); deploy the worker first`);
}

// Note the path: /auth/login has no /v1 prefix.
const login = await (
  await fetch(`${GATEWAY}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
).json();
const token = login.accessToken ?? login.data?.accessToken;
if (!token) die('sign-in failed');

const url = `${GATEWAY}/v1/app-manage/${APP_ID}/email/branding`;
const patched = await fetch(url, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify(BRANDING),
});
if (!patched.ok) die(`PATCH failed (${patched.status}): ${(await patched.text()).slice(0, 300)}`);

const now = await (await fetch(url, { headers: { authorization: `Bearer ${token}` } })).json();
console.log('email-branding: effective', JSON.stringify(now.effective ?? now));
