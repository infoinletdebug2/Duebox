import type { ApiFailure, ApiSuccess, GateReason, Session } from '../types';
import { API_URL } from '../config';

/**
 * The app's only network layer — hand-rolled, no SDK on the phone. Every path
 * is one of Duebox's own worker routes, in its own `{success, data}`
 * envelope, and the phone ships no platform credential.
 */

export { API_URL };
const BASE = `${API_URL}/api/v1`;

const TIMEZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

const REGION = (() => {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? 'en-US';
    return locale.split('-')[1]?.toUpperCase() ?? 'US';
  } catch {
    return 'US';
  }
})();

/** A one-off key for a retried write. */
export function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** `code` is what screens branch on; `message` is what a person reads. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly fields?: Record<string, string>,
    readonly reason?: GateReason,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get needsSubscription(): boolean {
    return this.code === 'SUBSCRIPTION_REQUIRED';
  }

  get isOffline(): boolean {
    return this.code === 'NETWORK_ERROR';
  }

  get isAuth(): boolean {
    return this.code === 'AUTH_TOKEN_EXPIRED' || this.code === 'AUTH_INVALID_CREDENTIALS';
  }
}

type SessionSource = () => Session | null;
type SessionSink = (session: Session | null) => void;

let readSession: SessionSource = () => null;
let writeSession: SessionSink = () => undefined;

/** Callbacks rather than an imported store, so the client never depends on React. */
export function bindSession(source: SessionSource, sink: SessionSink): void {
  readSession = source;
  writeSession = sink;
}

/**
 * Single-flight refresh. Refresh tokens ROTATE: six parallel refreshes would
 * invalidate each other and sign the user out mid-scan.
 */
let inFlight: Promise<Session | null> | null = null;

async function refreshSession(): Promise<Session | null> {
  if (inFlight) return inFlight;
  const current = readSession();
  if (!current?.refreshToken) return null;

  inFlight = (async () => {
    try {
      const response = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      const body = (await response.json()) as ApiSuccess<Session> | ApiFailure;
      if (!response.ok || !body.success) {
        writeSession(null);
        return null;
      }
      const next = { ...body.data, user: { ...current.user, ...body.data.user } };
      writeSession(next);
      return next;
    } catch {
      // Offline is not an expired session: keep it and recover later.
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  anonymous?: boolean;
  signal?: AbortSignal;
  /** Retried writes (notification actions, the offline queue) send one. */
  idempotencyKey?: string;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${BASE}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function send<T>(path: string, options: RequestOptions, retrying = false): Promise<T> {
  const session = readSession();
  const headers: Record<string, string> = {
    accept: 'application/json',
    // FR-A2: the first /auth/me creates the household from these.
    'x-timezone': TIMEZONE,
    'x-region': REGION,
  };
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (!options.anonymous && session?.accessToken) headers.authorization = `Bearer ${session.accessToken}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new ApiError('NETWORK_ERROR', 'No connection. Check your network and try again.', 0);
  }

  const text = await response.text();
  let body: ApiSuccess<T> | ApiFailure;
  try {
    body = text ? (JSON.parse(text) as ApiSuccess<T> | ApiFailure) : ({ success: true, data: undefined as T } as ApiSuccess<T>);
  } catch {
    throw new ApiError('BAD_RESPONSE', 'The server sent something unexpected. Try again in a moment.', response.status);
  }

  if (response.ok && body.success) return body.data;

  const failure = body as ApiFailure;
  // One retry, once, on the first 401.
  if (response.status === 401 && !retrying && !options.anonymous) {
    const refreshed = await refreshSession();
    if (refreshed) return send<T>(path, options, true);
    writeSession(null);
  }

  throw new ApiError(
    failure.error?.code ?? 'INTERNAL_SERVER_ERROR',
    failure.error?.message ?? 'Something went wrong.',
    response.status,
    failure.error?.fields,
    failure.error?.reason,
  );
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    send<T>(path, { method: 'GET', query, signal }),
  post: <T>(path: string, body?: unknown, idempotencyKey?: string) => send<T>(path, { method: 'POST', body, idempotencyKey }),
  patch: <T>(path: string, body?: unknown) => send<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => send<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string, body?: unknown) => send<T>(path, { method: 'DELETE', body }),
  anonymous: {
    get: <T>(path: string, query?: RequestOptions['query']) => send<T>(path, { method: 'GET', query, anonymous: true }),
    post: <T>(path: string, body?: unknown) => send<T>(path, { method: 'POST', body, anonymous: true }),
  },
};

/** A message a person can read, from anything thrown. */
export function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Try again.';
}

/**
 * Field errors for a form, keyed by the server's field names. The server sends
 * CODES per field (`REQUIRED`); the sentence a person reads is the error's
 * message, so every flagged field shows that.
 */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !error.fields) return {};
  return Object.fromEntries(Object.keys(error.fields).map((key) => [key, error.message]));
}
