# Traps

Failures hit, diagnosed and fixed on Expo + React Native + Hono-on-Workers + Xenition SDK.
Common thread: **the thing that breaks is not the thing the error names.**

---

## Native modules and Expo Go

### Native module throws at import time → whole app blank
- **Symptom:** app does not start in Expo Go: `'RNGoogleSignin' could not be found`. Nothing renders.
- **Cause:** `@react-native-google-signin`, `react-native-iap` call `TurboModuleRegistry.getEnforcing()` at module scope; it throws when the native side is absent. Any static import reachable from the root layout kills the module graph.
- **Fix:** lazy-load every native-only module and cache the *promise* (two first-launch callers would otherwise both import):
  ```ts
  type Mod = typeof import('react-native-iap');
  let promise: Promise<Mod | null> | undefined;
  export const IS_EXPO_GO = Constants.appOwnership === 'expo';
  function load(): Promise<Mod | null> {
    if (IS_EXPO_GO) return Promise.resolve(null);
    promise ??= import('react-native-iap').then((m) => m, () => null);
    return promise;
  }
  ```
  Every entry point: `const mod = await load(); if (!mod) return …`. `import type` stays static (erased).
- Affects `react-native-iap`, `@react-native-google-signin`, `expo-apple-authentication`, anything with a native binary.
- The web harness will NOT catch this — web-green is not proof for anything native.

### Lazy import alone still paints a red screen
- **Symptom:** full red error `Failed to get NitroModules … could not be found` (iap v16 pulls `react-native-nitro-modules`, needs New Architecture + native build).
- **Cause:** the rejected import throws inside Metro module evaluation before your catch.
- **Fix:** guard with `IS_EXPO_GO` (above) *and* catch. `executionEnvironment` cannot tell Expo Go from a dev build (both `storeClient`); deprecated `appOwnership` is the only field that can.

### Native config in app.json is ignored in Expo Go
- **Symptom:** fix "works" on one platform only, silently.
- **Cause:** Expo Go ships its own manifest. Inert there: `android.softwareKeyboardLayoutMode`, `android.permissions`, `ios.infoPlist`, entitlements, most `plugins` (run at prebuild).
- **Fix:** any native-config change is unverified until run in a dev build.

### `--legacy-peer-deps` prunes another package's dependency
- **Symptom:** missing module in a package you did not touch (e.g. `react-native-nitro-modules` vanished, breaking iap).
- **Fix:** typecheck after any install with that flag.

### Metro cache after install
- **Symptom:** fake `Unable to resolve …` right after `npm install`.
- **Fix:** stop the dev server, `npx expo start -c`.

---

## Env and config

### `EXPO_PUBLIC_*` is inlined from the file, literally
- `EXPO_PUBLIC_X=… npx expo start` does nothing — the value must be in `mobile/.env`.
- `process.env[name]` is not inlined (textual substitution). Write `process.env.EXPO_PUBLIC_X`.
- After editing `.env`: `npx expo start -c`; a reload serves old values.
- Everything here ships in the bundle. Ids, names, limits: fine. Secrets: never.

---

## Layout and rendering

### Reanimated: "Writing to `value` during component render"
- **Cause:** `sv.value = withTiming(...)` in the component body; render can run twice or be discarded.
- **Fix:** move into `useEffect` with real deps (event handlers are fine too).
- The reported line is usually wrong (lands on a module boundary, e.g. a plain constant). Grep `\.value\s*=` in `app/` and `src/`, check which are at render scope.

### SVG gradient ids are document-wide
- **Symptom:** second inline SVG on a screen silently paints with the first's gradient.
- **Fix:** prefix every id per drawing (`h-roof`, `j-glass`).

### Android: elevated child escapes `overflow: 'hidden'`
- **Symptom:** an `elevation` button inside a clipped floating tab bar punches through and covers content. iOS looks fine.
- **Fix:** make the raised element a sibling of the clipped container, not a child.

### `StyleSheet.absoluteFillObject` removed in RN 0.86
- **Fix:** write the four sides.

### Horizontal ScrollView sizes content container to content
- **Symptom:** `justifyContent: 'center'` in a pager page does nothing; cards sit at top.
- **Fix:** measure the track with `onLayout`, give each page that height.
- Related: `flex: 1` against `maxHeight` stops at the cap and dumps slack on the next sibling. Want a fixed block → fixed height.

### Wrapper without `flex` collapses every ScrollView inside it
- **Symptom:** form screen shows title, button, and nothing between. Looks designed, not broken.
- **Cause:** shell's inner wrapper has no `flex: 1`, so child `flex: 1` gets nothing; ScrollView → zero height.
- **Fix:** `flex: 1` on the non-scrolling branch only (inside a ScrollView content container, `flex: 1` stops content growing).

### Keyboard covers the input
- Neither platform scrolls a focused input clear by default. `automaticallyAdjustKeyboardInsets` is iOS only; Android's `softwareKeyboardLayoutMode: "resize"` is native config (inert in Expo Go; default pans the header off).
- **Fix:** `react-native-keyboard-aware-scroll-view` (pure JS, works everywhere, measures the focused field) in the shared screen shells, not per screen. Symptom only shows on short phones.

### Off-screen hidden input cannot be focused on Android
- **Symptom:** OTP boxes; tapping opens no keyboard.
- **Cause:** input parked at `left: -1000` is outside parent bounds → not hit-testable.
- **Fix:** overlay it full size on the boxes with `opacity: 0` and `color: 'transparent'` (some keyboards refuse "invisible" inputs).

### Web-only rendering traps (screenshots lie)
- `flex: 1` won't shrink RN Web's `<input>` below ~20 chars → pin `minWidth: 0`.
- Browser border/focus ring shows through → `borderWidth: 0` (`outlineStyle` does not typecheck).

---

## Navigation and auth

### Clearing auth state does not navigate
- **Symptom:** sign out from a tab leaves you on the tab, signed out, everything 401. Same on token expiry.
- **Cause:** routing decision in `app/index.tsx` only runs at `/`.
- **Fix:** root-layout guard that replaces to the auth route when the session disappears. One-directional only — do not redirect signed-in users off auth screens, or it races the sign-in form mid-submit.

### `defineRouter` hides errors as "Upstream request failed"
- **Symptom:** wrong password reaches the phone as `502 Upstream request failed` — looks like server down.
- **Cause:** `defineRouter()` (`@xenition/sdk/hono`) installs the SDK's generic `onError` on each router before `build()`; a sub-app's handler wins, so root `app.onError` never runs.
- **Fix:** `app.onError(handleError)` as the first line of every router's `build()`, on the `createXenitionApi()` mount, and on the root. Test: wrong-password login must return 401 in your envelope.
- Gateway wordings: wrong password can be `AUTH_INVALID_TOKEN` (not only `AUTH_INVALID_CREDENTIALS`) → on `/auth/login` treat every `AUTH_*` as "email and password don't match". Native sign-in without own client ids returns code `UNKNOWN` with "native apple sign-in is not configured for this app" (not `AUTH_PROVIDER_NOT_CONFIGURED`) → match wording, answer 412.

### Sign in with Apple native sheet needs your OWN client
- **Cause:** `sdk.auth.signInWithIdToken()` works only once the app has registered its own Apple/Google client ids (`listSocialProviders()` → `configured: true`). Zero-config SSO (`usingSSO: true`) covers only the brokered browser lane (`startSignIn` → consent → `completeSignIn`).
- **Fix:** providers route exposes `native: configured && enabled`; skip the native sheet while false (else user gets a sheet then a browser); on 412 continue in the browser lane instead of erroring.
- Return-URL policy is `open-to-deep-links` (any `myapp://`, Expo Go `exp://`) until the FIRST URL is registered; after that the list is exhaustive.

### Probe a platform capability before building on it — or refusing to
- A stale note said OTP was unsupported; `verifyOtp` with a bogus code returned `AUTH_INVALID_TOKEN 401`, so it existed.
- Probe with the **verify** call (emails nobody). 404 / NOT_IMPLEMENTED = unsupported; validation error = supported.

---

## Xenition SDK

- **`ours()` on a table without the scope column** → predicate on a missing column (e.g. `household_id` on a profile/household table). Use `scoped()`.
- **`oursLive()` adds `deleted_at IS NULL`** → kills endpoints on non-soft-deleted tables. Derive the soft-deleted set from migration SQL.
- **`QueryBuilder` is thenable** → an `async` helper returning one awaits it on the way out and runs an unfiltered `SELECT`.
- **Every module query is an HTTP round trip** → N+1 in a list = N network calls.
- **Plan cache collides across apps** → same-named tables in two apps break each other. Prefix every app's tables.
- Module routers answer `{error:{…}}`. If your envelope is `{success, data}`, don't mount them; use the module client behind your own routes.

### Billing lookup on a core path locks users out
- **Symptom:** new accounts cannot finish onboarding: `relation billing__entitlements does not exist` (migrate not run after enabling the module).
- **Fix:** every billing/entitlement lookup on a core flow fails SAFE to the free tier, and logs. A secondary system may degrade a feature, never block the primary flow.

---

## Verification harness

### Harness green on a dead app
- A check for "non-empty text" passes on Chrome's error page. **Assert the app mounted**; poll for content, don't sleep.
- "Is there text" passed ten broken screens for weeks (a header is text). Give each screen an `expect` list of words only the working version has (field labels, not titles), read from the component, not guessed. A check that cries wolf gets ignored.

### Stub on the wrong port: every screen "renders"
- **Symptom:** 26/26 screens green for weeks; every screen was its empty state. Requests died with `ERR_CONNECTION_REFUSED`.
- **Cause:** `.env` set `EXPO_PUBLIC_API_PORT` to a non-default port; stub defaulted to 8787. Metro inlined the `.env` value into the export.
- **Fix:** (1) derive the port — stub parses it from `.env`; (2) screenshot something only real data produces ("13 items", not the title); (3) never `catch {}` a fetch silently — degrade for the user, never silently for yourself.

### Shell tooling mangles source
- **Symptom:** words vanish from written files.
- **Cause:** backticks in `python -c "…"` run as command substitution in Bash; heredocs eat backslashes.
- **Fix:** use a file-write tool, or write the script to a file first and run it.
