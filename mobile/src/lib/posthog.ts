import { Platform } from 'react-native';
import Constants from 'expo-constants';
import PostHog from 'posthog-react-native';
import { POSTHOG_HOST, POSTHOG_TOKEN } from '../config';

/**
 * PostHog, the shared fleet project (Ay-Rojgar, Desher Kaj, the Meld apps all
 * send to the same one). Only `lib/analytics.ts` imports this.
 *
 *   - Every event carries `app: 'duebox'`, the platform, the app version and
 *     whether it is a debug build, so one project can hold every app.
 *   - Identity is the account id only — never an email, a name, or anything
 *     read from a letter.
 *   - Off on the web: the browser build only ever runs the harness, whose
 *     stub accounts would land in the shared project as real people.
 *   - Never throws.
 */

const APP = 'duebox';

let client: PostHog | null = null;

export function initPosthog(): void {
  if (client || !POSTHOG_TOKEN || Platform.OS === 'web') return;
  try {
    client = new PostHog(POSTHOG_TOKEN, { host: POSTHOG_HOST, captureAppLifecycleEvents: true, flushAt: 10 });
    void client.register({
      app: APP,
      platform: Platform.OS,
      app_version: Constants.expoConfig?.version ?? null,
      debug: __DEV__,
    });
  } catch {
    client = null;
  }
}

/** Short codes, numbers and flags only: never a string a person wrote. */
export type PosthogProps = Record<string, string | number | boolean | null>;

export function capture(event: string, props?: PosthogProps): void {
  try {
    client?.capture(event, props ?? {});
  } catch {
    // measurement only
  }
}

/** A screen by its route pattern ("item/[id]"), never the id itself. */
export function screen(name: string): void {
  try {
    void client?.screen(name);
  } catch {
    // measurement only
  }
}

/** The same id the server sends with trial_started / purchase_completed. */
export function identify(userId: string): void {
  try {
    client?.identify(userId);
  } catch {
    // measurement only
  }
}

/** Signed out: the next person on this phone starts fresh. */
export function reset(): void {
  try {
    client?.reset();
  } catch {
    // measurement only
  }
}
