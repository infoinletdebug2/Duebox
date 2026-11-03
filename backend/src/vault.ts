/**
 * The provider-secret vault (dx__provider_secret). WHY: the Xenition deploy pipeline installs exactly three
 * secrets on the Worker (XENITION_API_KEY, XENITION_ANON_KEY, XENITION_API_URL: gateway appmgr/deploy.go
 * step 4) and has no way to add others, so the store keys (APPLE_*, GOOGLE_*, PUBSUB_SERVICE_ACCOUNT, or their
 * XENITION_-prefixed spellings) can never reach production as env, and /billing/verify answered 503
 * STORE_UNCONFIGURED. Ported from the App Factory apps (Clean Meld).
 *
 * `npm run migrate` encrypts each secret found in .dev.vars with AES-256-GCM under a key derived (HKDF-SHA256)
 * from the app's own XENITION_API_KEY, and stores only ciphertext. The Worker, which holds that service key,
 * decrypts once per isolate (re-read every 5 minutes). Another app's service key cannot decrypt the rows, and
 * nothing here is ever logged. Rotating XENITION_API_KEY means re-running migrate.
 */
export const VAULT_NAMES = [
  'APPLE_KEY_ID',
  'APPLE_ISSUER_ID',
  'APPLE_PRIVATE_KEY',
  'GOOGLE_CLIENT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
  'PUBSUB_SERVICE_ACCOUNT',
] as const;

const enc = new TextEncoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

async function keyFrom(serviceKey: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(serviceKey), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('duemeld-provider-secrets-v1'), info: enc.encode('dx__provider_secret') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function sealSecret(serviceKey: string, name: string, value: string): Promise<{ iv: string; ct: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(name) }, await keyFrom(serviceKey), enc.encode(value));
  return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

export async function openSecret(serviceKey: string, name: string, iv: string, ct: string): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: enc.encode(name) }, await keyFrom(serviceKey), unb64(ct));
  return new TextDecoder().decode(pt);
}

/** Per-isolate cache of decrypted secrets (never logged, never returned by any route). */
let cache: { at: number; values: Record<string, string> } | undefined;

export const vaultValues = (): Record<string, string> => cache?.values ?? {};

export async function loadVault(serviceKey: string, query: (sql: string) => Promise<{ name: string; iv: string; ct: string }[]>): Promise<boolean> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return false;
  const values: Record<string, string> = {};
  try {
    for (const r of await query(`SELECT name, iv, ciphertext AS ct FROM dx__provider_secret`)) {
      try {
        values[r.name] = await openSecret(serviceKey, r.name, r.iv, r.ct);
      } catch {
        console.error(`vault: ${r.name} could not be decrypted (was XENITION_API_KEY rotated? re-run migrate)`);
      }
    }
  } catch (e) {
    console.error('vault: read failed', (e as Error).message?.slice(0, 120));
    if (cache) return false;
  }
  const changed = JSON.stringify(Object.keys(values).sort()) !== JSON.stringify(Object.keys(cache?.values ?? {}).sort()) || Object.keys(values).some((k) => values[k] !== cache?.values[k]);
  cache = { at: Date.now(), values };
  return changed;
}
