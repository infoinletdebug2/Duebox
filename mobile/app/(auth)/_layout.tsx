import { Stack } from 'expo-router';
import { useColors } from '../../src/theme/tokens';

/**
 * The signed-out world: welcome, sign-in, sign-up, verify, forgot and reset.
 * No navigator chrome — every screen draws its own shape (AuthShell).
 */
export default function AuthLayout() {
  const c = useColors();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.ground }, animation: 'slide_from_right' }} />;
}
