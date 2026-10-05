import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'expo-router';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { font, GUTTER, radius, space } from '../theme/tokens';
import { T } from './Text';
import { Icon } from './Icon';
import { Mark } from './artwork';
import { notNow, onReviewOffer, previewReviewOffer, rateNow, type ReviewTrigger } from '../lib/review';
import { reviewPrompt } from '../lib/analytics';

/**
 * The review sheet. Mounted once at the root and opened by `lib/review.ts`
 * when an offer is due — see that file for when, and for the store rules the
 * wording follows (one neutral ask, no sentiment gate).
 *
 * Waits a beat before rising, so it lands after the confirmation toast, never
 * on top of it. Plum card, a marigold row of stars that pop in one by one.
 */

const SETTLE_MS = 1600;
const INK = '#1E1229';
const MARIGOLD = '#F2B33D';

const COPY: Record<ReviewTrigger, { title: string; body: string }> = {
  first_scan: {
    title: 'First letter, read',
    body: 'Duebox found the date and will remind you before it’s due. If that saved you a job, a quick rating helps other households find it.',
  },
  done: {
    title: 'Things getting done',
    body: 'You’ve been clearing deadlines with Duebox for a few days now. A quick rating helps others find it — it takes ten seconds.',
  },
};

export function ReviewPrompt() {
  const insets = useSafeAreaInsets();
  const [trigger, setTrigger] = useState<ReviewTrigger | null>(null);
  const [pending, setPending] = useState<ReviewTrigger | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  // Never on top of the "turn on reminders" screen that can follow the first save.
  const blocked = pathname.includes('notifications-permission');

  useEffect(() => {
    const off = onReviewOffer((next) => setPending(next));
    // Harness only: `?review=1` on the web build opens the sheet for a screenshot.
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.search.includes('review=1')) previewReviewOffer();
    return () => {
      off();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Rise a beat after the screen settles, and only where it won't cover a decision.
  useEffect(() => {
    if (!pending || blocked) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setTrigger(pending);
      setPending(null);
      reviewPrompt('shown', pending);
    }, SETTLE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pending, blocked]);

  const close = () => {
    if (trigger) notNow(trigger);
    setTrigger(null);
  };

  const rate = async () => {
    if (!trigger) return;
    const current = trigger;
    // Close first: the store's own sheet must not open underneath ours.
    setTrigger(null);
    await rateNow(current);
  };

  const copy = COPY[trigger ?? 'first_scan'];

  return (
    <Modal visible={trigger !== null} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Not now" accessibilityRole="button" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]} accessibilityViewIsModal testID="review-prompt">
        <View style={styles.grip} />
        <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Mark size={52} />
        </View>
        <View style={styles.stars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} index={i} visible={trigger !== null} />
          ))}
        </View>
        <T variant="display" align="center" style={styles.title} accessibilityRole="header">
          {copy.title}
        </T>
        <T align="center" style={styles.body}>
          {copy.body}
        </T>
        <View style={styles.actions}>
          <Pressable onPress={() => void rate()} accessibilityRole="button" accessibilityLabel="Rate Duebox" style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]} testID="review-rate">
            <Icon name="star" size={18} color={INK} strokeWidth={2.4} />
            <T variant="headline" style={{ color: INK }}>
              Rate Duebox
            </T>
          </Pressable>
          <Pressable onPress={close} accessibilityRole="button" style={styles.later} testID="review-later">
            <T variant="callout" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Not now
            </T>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Five stars that pop in one after another. Static under Reduce Motion. */
function Star({ index, visible }: { index: number; visible: boolean }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      scale.value = 1;
      return;
    }
    scale.value = visible ? withDelay(260 + index * 90, withSpring(1, { damping: 9, stiffness: 180 })) : 0;
  }, [visible, reduced, index, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.star, style]}>
      <Icon name="star" size={18} color={INK} strokeWidth={2.6} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(16,8,24,0.55)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: INK,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: GUTTER,
    paddingTop: space.sm,
    alignItems: 'center',
    gap: space.md,
  },
  grip: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', marginBottom: space.sm },
  badge: { marginTop: space.sm },
  stars: { flexDirection: 'row', gap: 6 },
  star: { width: 30, height: 30, borderRadius: 15, backgroundColor: MARIGOLD, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFFFFF', marginTop: space.xs },
  body: { color: 'rgba(255,255,255,0.75)', fontSize: 16, lineHeight: 23, fontFamily: font.body },
  actions: { alignSelf: 'stretch', gap: space.xs, marginTop: space.sm },
  cta: {
    height: 56,
    borderRadius: radius.chip,
    backgroundColor: MARIGOLD,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  later: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
