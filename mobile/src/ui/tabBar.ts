import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '../theme/tokens';

/**
 * The floating tab bar's geometry, in ONE place (visual-system.md: "a number
 * four files guess separately will be wrong in at least one of them"). The bar
 * and the Scan button float above the bottom inset; nothing in the layout
 * reserves their space, so every tab screen reads it from here.
 */
export const TAB_BAR_H = 60;
export const TAB_BAR_BOTTOM = 10;

export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + TAB_BAR_BOTTOM + TAB_BAR_H + space.xxl;
}

/** Same as the bar now — the Scan button sits beside it, not above the content. */
export const useFabSpace = useTabBarSpace;
