import Constants from 'expo-constants';

/**
 * Everything configurable, from `.env`, in one place.
 *
 * Metro INLINES `EXPO_PUBLIC_*` at transform time, so each read is spelled
 * out literally — `process.env[name]` would read nothing at runtime
 * (traps.md). Everything here ships in the bundle: ids and labels, never a
 * secret. The phone holds no Xenition package and no credential; every
 * request goes to Duebox's own worker.
 */

function str(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value?.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Expo Go vs a build of our own. `executionEnvironment` cannot tell them apart
 * (it says `storeClient` for both); `appOwnership` is the only field that can.
 * Native modules (IAP, Apple sign-in, push tokens) are never touched in Expo Go.
 */
export const IS_EXPO_GO = Constants.appOwnership === 'expo';

/** The dev worker's port. Must match backend PORT. */
export const DEV_PORT = num(process.env.EXPO_PUBLIC_API_PORT, 8787);

/**
 * Derive the dev machine's LAN address from where Expo serves the bundle, so a
 * real phone works without editing a file. `localhost` works only in a
 * simulator and fails on devices as "the server is down".
 */
const host = Constants.expoConfig?.hostUri?.split(':')[0];

export const API_URL = (() => {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/$/, '');
  if (host) return `http://${host}:${DEV_PORT}`;
  return `http://localhost:${DEV_PORT}`;
})();

/** Must match backend PRO_*_ID byte for byte, and exist in both stores. */
export const PRODUCT_IDS = {
  monthly: str(process.env.EXPO_PUBLIC_PRO_MONTHLY_ID, 'duebox_pro_monthly'),
  yearly: str(process.env.EXPO_PUBLIC_PRO_YEARLY_ID, 'duebox_pro_yearly'),
} as const;

/** The store's introductory offer on yearly. Copy only — the store decides. */
export const TRIAL_DAYS = num(process.env.EXPO_PUBLIC_TRIAL_DAYS, 7);

/** A label, not a calculation: prices are localised store strings. 0 hides it. */
export const YEARLY_SAVING_PERCENT = num(process.env.EXPO_PUBLIC_YEARLY_SAVING_PERCENT, 41);

/** Free-tier numbers for copy before the server answers (the server decides). */
export const FREE_OPEN_ITEMS = num(process.env.EXPO_PUBLIC_FREE_OPEN_ITEMS, 5);
export const FREE_SCANS = num(process.env.EXPO_PUBLIC_FREE_SCANS, 3);

export const SUPPORT_EMAIL = str(process.env.EXPO_PUBLIC_SUPPORT_EMAIL, 'contact@infoinlet.com');
export const WEBSITE_URL = str(process.env.EXPO_PUBLIC_WEBSITE_URL, 'https://duebox.app');
export const APPLE_APP_ID = str(process.env.EXPO_PUBLIC_APPLE_APP_ID, '');
export const ANDROID_PACKAGE = str(process.env.EXPO_PUBLIC_ANDROID_PACKAGE, 'app.duebox.mobile');

/** EAS project id — needed for an Expo push token in a dev/store build. */
export const EAS_PROJECT_ID = str(
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? '',
);

/** Bump when the privacy text changes materially (shown on the policy). */
export const PRIVACY_EFFECTIVE = '2026-10-04';
