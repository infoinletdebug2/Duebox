import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, bindSession } from '../api/client';
import { clearSession, loadSession, saveSession } from './storage';
import { signInWith, signInWithBrowser, type SocialProvider } from './social';
import { unregisterPush } from '../notifications/push';
import { resetUser } from '../lib/analytics';
import type { AuthResult, Household, Me, Plan, Prefs, Role, Session } from '../types';

/**
 * Who is signed in, their household, role and plan.
 *
 * The session lives in a ref as well as state: the API client reads the ref,
 * so a token refresh can never authenticate the next request with the
 * previous token (a closure over state would).
 */

interface AuthValue {
  session: Session | null;
  me: Me | null;
  household: Household | null;
  role: Role | null;
  plan: Plan | null;
  prefs: Prefs | null;
  isPro: boolean;
  loading: boolean;
  isOwner: boolean;
  /** Signed in, owner, two-tap setup not done yet → /setup. */
  needsSetup: boolean;
  /** Set up, but the household is not subscribed: everything but the paywall is closed. */
  needsSubscription: boolean;

  signIn(email: string, password: string): Promise<Me | null>;
  /** `codeSent: false` means the first verification email did not go out; the verify screen asks again. */
  register(input: { email: string; password: string; name?: string }): Promise<{ me: Me | null; codeSent: boolean }>;
  signInWithProvider(provider: SocialProvider): Promise<Me | null>;
  completeSocialSignIn(code: string): Promise<Me | null>;
  signOut(): Promise<void>;
  refresh(): Promise<Me | null>;
  setPlan(next: Plan): void;
  /** Adopt a fresh `Me` the server returned (setup, household changes). */
  setMeData(next: Me): void;
  setPrefs(next: Prefs): void;
  markVerified(): void;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * A brokered sign-in code is single-use, and two places may hold it at once:
 * the screen that opened the browser (openAuthSessionAsync hands the URL
 * back) and app/auth.tsx (Android and cold starts also deliver the same
 * `…/auth?code=` as a deep link). Whoever asks first redeems it; the other
 * gets the same answer instead of a "code already used" error screen.
 */
const redeeming = new Map<string, Promise<Me | null>>();

function redeemOnce(code: string, adopt: (next: AuthResult) => Promise<Me | null>): Promise<Me | null> {
  let pending = redeeming.get(code);
  if (!pending) {
    pending = api.anonymous.post<AuthResult>('/auth/social/complete', { code }).then(adopt);
    redeeming.set(code, pending);
    pending.catch(() => redeeming.delete(code));
  }
  return pending;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef<Session | null>(null);

  const applySession = useCallback(
    (next: Session | null) => {
      sessionRef.current = next;
      setSession(next);
      if (next) {
        void saveSession(next);
      } else {
        void clearSession();
        setMe(null);
        // Everything cached belongs to the person who just left.
        queryClient.clear();
        resetUser();
      }
    },
    [queryClient],
  );

  useEffect(() => {
    bindSession(
      () => sessionRef.current,
      (next) => applySession(next),
    );
  }, [applySession]);

  const refresh = useCallback(async (): Promise<Me | null> => {
    if (!sessionRef.current) return null;
    try {
      const next = await api.get<Me>('/auth/me');
      setMe(next);
      const current = sessionRef.current;
      if (current) {
        const merged = { ...current, user: { ...current.user, ...next.user } };
        sessionRef.current = merged;
        setSession(merged);
        void saveSession(merged);
      }
      return next;
    } catch (error) {
      // A flaky connection on launch must not sign anyone out; a dead token
      // already becomes a sign-out through the client's 401 handling.
      if (error instanceof ApiError && error.isAuth) applySession(null);
      return null;
    }
  }, [applySession]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadSession();
      if (cancelled) return;
      if (stored) {
        sessionRef.current = stored;
        setSession(stored);
        await refresh();
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const adopt = useCallback(
    async (next: AuthResult) => {
      const { needsSetup: _n, needsVerification: _v, codeSent: _c, ...plain } = next;
      applySession(plain);
      return refresh();
    },
    [applySession, refresh],
  );

  const signIn = useCallback(
    async (email: string, password: string) => adopt(await api.anonymous.post<AuthResult>('/auth/login', { email, password })),
    [adopt],
  );

  const register = useCallback(
    async (input: { email: string; password: string; name?: string }) => {
      const result = await api.anonymous.post<AuthResult>('/auth/register', {
        ...input,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      // An older server leaves codeSent out; it did send, as it always tried to.
      return { me: await adopt(result), codeSent: result.codeSent !== false };
    },
    [adopt],
  );

  const signInWithProvider = useCallback(
    async (provider: SocialProvider) => {
      let result = await signInWith(provider);
      if (result.kind === 'idToken') {
        try {
          return await adopt(
            await api.anonymous.post<AuthResult>('/auth/social/id-token', {
              provider: result.provider,
              idToken: result.idToken,
              nonce: result.nonce,
              name: result.name,
            }),
          );
        } catch (failure) {
          // 412: the platform holds no native credentials for this app yet, so
          // the phone's token cannot be verified. The brokered sign-in in the
          // browser still works — continue there instead of showing an error.
          if (!(failure instanceof ApiError && (failure.status === 412 || failure.code === 'AUTH_PROVIDER_NOT_CONFIGURED'))) throw failure;
          result = await signInWithBrowser(provider);
          if (result.kind !== 'code') throw failure;
        }
      }
      return redeemOnce(result.code, adopt);
    },
    [adopt],
  );

  const completeSocialSignIn = useCallback(async (code: string) => redeemOnce(code, adopt), [adopt]);

  const signOut = useCallback(async () => {
    // Told to the server, but a failure never keeps anyone signed in. The
    // device's push token goes first, so a signed-out phone gets no reminders.
    await unregisterPush().catch(() => undefined);
    await api.post('/auth/logout', { refreshToken: sessionRef.current?.refreshToken }).catch(() => undefined);
    applySession(null);
  }, [applySession]);

  const setPlan = useCallback((next: Plan) => {
    setMe((current) => (current ? { ...current, plan: next } : current));
  }, []);

  const setMeData = useCallback((next: Me) => setMe(next), []);

  const setPrefs = useCallback((next: Prefs) => {
    setMe((current) => (current ? { ...current, prefs: next } : current));
  }, []);

  const markVerified = useCallback(() => {
    setMe((current) => (current ? { ...current, user: { ...current.user, emailVerified: true } } : current));
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      me,
      household: me?.household ?? null,
      role: me?.role ?? null,
      plan: me?.plan ?? null,
      prefs: me?.prefs ?? null,
      // Fails open to FREE (BR-12): no plan answer is not Pro.
      isPro: me?.plan?.entitled === true,
      loading,
      isOwner: me?.role === 'owner',
      needsSetup: Boolean(me?.needsSetup),
      // Hard paywall: set up, but the household's subscription is not live.
      needsSubscription: Boolean(me && !me.needsSetup && me.plan && !me.plan.entitled),
      signIn,
      register,
      signInWithProvider,
      completeSocialSignIn,
      signOut,
      refresh,
      setPlan,
      setMeData,
      setPrefs,
      markVerified,
    }),
    [session, me, loading, signIn, register, signInWithProvider, completeSocialSignIn, signOut, refresh, setPlan, setMeData, setPrefs, markVerified],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
