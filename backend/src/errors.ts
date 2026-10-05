import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { XenitionError } from '@xenition/sdk';
import { honoErrorHandler } from '@xenition/sdk/hono';
import { AppError } from './lib';

/**
 * The one error handler — installed on the root app, on the /api/v1 mount,
 * AND inside every router's build() (routers/*.ts).
 *
 * It must be on every router: `defineRouter()` installs the SDK's generic onError on
 * each router before calling build(), and a Hono sub-app's handler wins for
 * every route inside it — so without this,
 * every platform error from our routers (a wrong password, an email already
 * taken, Apple not set up) reached the phone as "Upstream request failed"
 * (502), and none of the mapping below ever ran. Anything that is not ours
 * (the SDK middleware's own HTTPExceptions: 401s, rate limits) still goes to
 * the SDK's handler.
 */
export function handleError(err: Error, c: Context) {
  if (err instanceof AppError) {
    const error: Record<string, unknown> = { code: err.code, message: err.message };
    if (err.fields) error.fields = err.fields;
    if (err.reason) error.reason = err.reason;
    return c.json({ success: false, error }, err.status as 400);
  }
  if (err instanceof XenitionError) {
    const [code, status, message] = mapPlatformError(err);
    return c.json({ success: false, error: { code, message } }, status as 400);
  }
  if (err instanceof HTTPException) return honoErrorHandler(err, c);
  console.error('unhandled:', err instanceof Error ? err.stack : err);
  return c.json(
    { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong on our side. Try again in a moment.' } },
    500,
  );
}

/** Platform codes are mapped, never passed through: the app branches on OUR codes. */
function mapPlatformError(err: XenitionError): [code: string, status: number, message: string] {
  switch (err.code) {
    case 'AUTH_INVALID_CREDENTIALS':
      return ['AUTH_INVALID_CREDENTIALS', 401, 'That email and password do not match.'];
    case 'AUTH_INVALID_TOKEN':
    case 'AUTH_EXPIRED_TOKEN':
      return ['AUTH_TOKEN_EXPIRED', 401, 'Sign in again to continue.'];
    case 'AUTH_EMAIL_EXISTS':
      return ['AUTH_EMAIL_TAKEN', 409, 'There is already an account with that email. Sign in instead.'];
    case 'AUTH_WEAK_PASSWORD':
      return ['VALIDATION_ERROR', 400, 'Choose a stronger password.'];
    case 'AUTH_PROVIDER_NOT_CONFIGURED':
      // 412 = "no native credentials yet": the app falls back to the browser lane.
      return ['AUTH_PROVIDER_NOT_CONFIGURED', 412, 'That sign-in method is not set up for this app yet.'];
    case 'AUTH_FORBIDDEN':
      return ['FORBIDDEN', 403, 'You do not have access to that.'];
    case 'NOT_FOUND':
      return ['NOT_FOUND', 404, 'That is not here.'];
    case 'VALIDATION_ERROR':
      return ['VALIDATION_ERROR', 400, 'Some of those details are not valid.'];
    case 'CONFLICT':
      return ['CONFLICT', 409, 'Someone else changed this first. Pull to refresh.'];
    case 'RATE_LIMITED':
      return ['RATE_LIMIT_EXCEEDED', 429, 'Too many attempts. Wait a moment and try again.'];
    case 'NOT_IMPLEMENTED':
      return ['INTERNAL_SERVER_ERROR', 501, 'That feature is not available yet.'];
    default:
      // The gateway (observed 2026-10-04) sends native-not-configured as code
      // UNKNOWN with this wording, not the documented AUTH_PROVIDER_NOT_CONFIGURED.
      if (/sign-in is not configured|not configured for this app/i.test(err.message)) {
        return ['AUTH_PROVIDER_NOT_CONFIGURED', 412, 'That sign-in method is not set up for this app yet.'];
      }
      console.error('platform error:', err.code, err.message);
      return ['INTERNAL_SERVER_ERROR', 502, 'We could not reach the service behind this. Try again in a moment.'];
  }
}
