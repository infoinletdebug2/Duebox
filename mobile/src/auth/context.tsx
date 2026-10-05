import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, bindSession } from '../api/client';
import { clearSession, loadSession, saveSession } from './storage';
import { signInWith, type SocialProvider } from './social';
import { unregisterPush } from '../notifications/push';
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

  signIn(email: string, password: string): Promise<Me | null>;
  register(input: { email: string; password: string; name: string }): Promise<Me | null>;
  signInWithProvider(provider: SocialProvider): Promise<Me | null>;
  completeSocialSignIn(code: string): Promise<Me | null>;
  signOut(): Promise<void>;
  refresh(): Promise<Me | null>;
  setPlan(next: Plan): void;
  setPrefs(next: Prefs): void;
  markVerified(): void;
}

const AuthContext = createContext<AuthValue | null>(null);

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
      const { needsSetup: _n, needsVerification: _v, ...plain } = next;
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
    async (input: { email: string; password: string; name: string }) =>
      adopt(
        await api.anonymous.post<AuthResult>('/auth/register', {
          ...input,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      ),
    [adopt],
  );

  const signInWithProvider = useCallback(
    async (provider: SocialProvider) => {
      const result = await signInWith(provider);
      const next =
        result.kind === 'idToken'
          ? await api.anonymous.post<AuthResult>('/auth/social/id-token', {
              provider: result.provider,
              idToken: result.idToken,
              nonce: result.nonce,
              name: result.name,
            })
          : await api.anonymous.post<AuthResult>('/auth/social/complete', { code: result.code });
      return adopt(next);
    },
    [adopt],
  );

  const completeSocialSignIn = useCallback(
    async (code: string) => adopt(await api.anonymous.post<AuthResult>('/auth/social/complete', { code })),
    [adopt],
  );

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
      isPro: me?.plan?.tier === 'pro',
      loading,
      isOwner: me?.role === 'owner',
      signIn,
      register,
      signInWithProvider,
      completeSocialSignIn,
      signOut,
      refresh,
      setPlan,
      setPrefs,
      markVerified,
    }),
    [session, me, loading, signIn, register, signInWithProvider, completeSocialSignIn, signOut, refresh, setPlan, setPrefs, markVerified],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
