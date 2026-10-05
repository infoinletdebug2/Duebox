import { fieldErrors, messageOf } from '../api/client';

/**
 * Turning a server refusal into words under the right input.
 *
 * The worker names the offending field with a CODE (`{ email: 'INVALID_EMAIL' }`)
 * and puts the sentence a person reads in `message`. It reports one field at a
 * time, so the message belongs under that field. Anything that names no field
 * this form owns — a wrong password, a rate limit, no connection — is shown
 * once, above the submit button.
 */
export interface FormErrors {
  fields: Record<string, string>;
  general: string | null;
}

export function formErrors(error: unknown, names: readonly string[]): FormErrors {
  if (!error) return { fields: {}, general: null };
  const coded = fieldErrors(error);
  const message = messageOf(error);
  const fields: Record<string, string> = {};
  for (const name of names) {
    if (coded[name]) fields[name] = message;
  }
  return { fields, general: Object.keys(fields).length > 0 ? null : message };
}

/** Good enough to catch a typo before a round trip; the server decides. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export const MIN_PASSWORD = 8;
