import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../src/auth/context';
import { ApiError } from '../src/api/client';
import { invalidateItems } from '../src/api/hooks';
import { ToastProvider } from '../src/ui/Sheet';
import { useColors } from '../src/theme/tokens';
import { setCurrency } from '../src/lib/format';
import { installNotificationHandlers, registerPush } from '../src/notifications/push';
import { appOpened, sendAttribution } from '../src/lib/analytics';
import { noteFirstUse } from '../src/lib/review';
import { ReviewPrompt } from '../src/ui/ReviewPrompt';

/**
 * The root. Gates: fonts → stored session → the app. Push handlers are
 * installed once signed in, and the device re-registers on every launch.
 */

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => (error instanceof ApiError && !error.isOffline ? false : count < 2),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>
              <AppShell />
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Routes a signed-out person may stay on. */
const PUBLIC = new Set(['(auth)', 'auth', 'legal', 'discover']);

function AppShell() {
  const { loading, session, household, me } = useAuth();
  const c = useColors();
  const router = useRouter();
  const segments = useSegments();
  const qc = useQueryClient();

  // Eject on sign-out (traps.md: clearing auth state does not navigate). One-directional.
  useEffect(() => {
    if (loading || session) return;
    if (PUBLIC.has(segments[0] ?? '')) return;
    router.replace('/');
  }, [loading, session, segments, router]);

  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync().catch(() => undefined);
  }, [loading]);

  // Measurement (a no-op until Meta is configured) and the review prompt's day count.
  useEffect(() => {
    appOpened();
    void noteFirstUse();
  }, []);

  useEffect(() => {
    if (me?.user.id) sendAttribution(me.user.id);
  }, [me?.user.id]);

  useEffect(() => {
    if (household) setCurrency(household.currency);
  }, [household]);

  // Signed in: push registration and handlers.
  useEffect(() => {
    if (!session || !household) return;
    void registerPush();
    let cleanup: (() => void) | undefined;
    void installNotificationHandlers(
      (itemId) => router.push({ pathname: '/item/[id]', params: { id: itemId } }),
      () => invalidateItems(qc),
    ).then((fn) => {
      cleanup = fn;
    });
    return () => cleanup?.();
  }, [session, household, router, qc]);

  if (loading) return <View style={{ flex: 1, backgroundColor: c.brand }} />;

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <StatusBar style={c.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.ground }, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="discover" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="setup" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="offer" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="scan/index" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="item/new" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="paywall" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
        <Stack.Screen name="notifications-permission" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
      </Stack>
      <ReviewPrompt />
    </View>
  );
}
