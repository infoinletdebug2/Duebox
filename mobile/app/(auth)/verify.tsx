import { useEffect, useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/auth/context';
import { api, fieldErrors, messageOf } from '../../src/api/client';
import { space } from '../../src/theme/tokens';
import { Button } from '../../src/ui/Button';
import { T } from '../../src/ui/Text';
import { useToast } from '../../src/ui/Sheet';
import { AuthShell, FormMessage } from '../../src/account/AuthShell';
import { CodeField } from '../../src/account/CodeField';
import { routeAfterAuth } from '../../src/account/pendingJoin';

/**
 * VERIFY EMAIL (SCREENS #2, FR-A1). Six digits from the email sign-up just
 * sent. Offered, never required: "Do this later" goes straight into the app,
 * because a missed email must not lock anyone out of their own deadlines.
 *
 * The code submits itself on the sixth digit. Resend waits out the server's
 * own cooldown (60 s from sign-up, then whatever `retryAfterSeconds` says).
 *
 * `?send=1`: sign-up's first code did not go out, so this screen asks for it
 * once on arrival — the same call as "Send a new code".
 */
const LENGTH = 6;

export default function Verify() {
  const router = useRouter();
  const { send } = useLocalSearchParams<{ send?: string }>();
  const toast = useToast();
  const { session, markVerified } = useAuth();
  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [cooldown, setCooldown] = useState(60);
  const [resending, setResending] = useState(false);

  // One ticking second. Stops itself at zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // The keyboard is the whole point of this screen.
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, []);

  const submit = async (value = code) => {
    if (value.length !== LENGTH || pending) return;
    setPending(true);
    setError(null);
    try {
      await api.post<{ verified: boolean }>('/auth/verify-code', { code: value });
      markVerified();
      toast({ message: 'Email confirmed.' });
      await routeAfterAuth(router);
    } catch (failure) {
      setError(failure);
      setCode('');
      setPending(false);
      inputRef.current?.focus();
    }
  };

  const resend = async (quiet = false) => {
    setResending(true);
    setError(null);
    try {
      const result = await api.post<{ sent: boolean; retryAfterSeconds: number }>('/auth/send-code');
      if (result.sent) {
        setCooldown(Math.max(30, result.retryAfterSeconds || 60));
        if (!quiet) toast({ message: 'A new code is on its way.' });
      } else {
        // Throttled or the mail service said no: let them try again soon, and say so.
        setCooldown(Math.min(60, Math.max(15, result.retryAfterSeconds || 30)));
        toast({ message: 'We couldn’t send a code just now. Try again in a moment.' });
      }
    } catch (failure) {
      setCooldown(0);
      toast({ message: messageOf(failure) });
    } finally {
      setResending(false);
    }
  };

  // Sign-up's first code did not go out: ask once, on arrival.
  const askedOnArrival = useRef(false);
  useEffect(() => {
    if (send !== '1' || askedOnArrival.current) return;
    askedOnArrival.current = true;
    void resend(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send]);

  const codeError = error && fieldErrors(error).code ? messageOf(error) : undefined;
  const general = error && !codeError ? messageOf(error) : null;
  const email = session?.user.email;

  return (
    <AuthShell
      title="Check your email"
      lead={email ? `We sent a ${LENGTH}-digit code to ${email}.` : `We sent you a ${LENGTH}-digit code.`}
      back={false}
      testID="screen-verify"
      below={
        <Button label="Do this later" tone="quiet" onPress={() => void routeAfterAuth(router)} testID="verify-later" />
      }
    >
      <CodeField
        ref={inputRef}
        value={code}
        onChange={(next) => {
          setCode(next);
          if (error) setError(null);
          if (next.length === LENGTH) void submit(next);
        }}
        length={LENGTH}
        error={codeError}
        disabled={pending}
        testID="verify-code"
      />
      <FormMessage message={general} />
      <Button label="Confirm email" onPress={() => void submit()} loading={pending} disabled={code.length !== LENGTH} testID="verify-submit" />
      <View style={{ alignItems: 'center', gap: space.xs }}>
        {cooldown > 0 ? (
          <T variant="caption" tone="muted" accessibilityLiveRegion="polite">
            Didn’t get it? You can ask again in {cooldown} s.
          </T>
        ) : (
          <Button label="Send a new code" tone="quiet" small full={false} loading={resending} onPress={() => void resend()} testID="verify-resend" />
        )}
        <T variant="caption" tone="faint" align="center">
          Check spam or promotions if it isn’t in your inbox.
        </T>
      </View>
    </AuthShell>
  );
}
