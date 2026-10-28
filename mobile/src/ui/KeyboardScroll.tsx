import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, ScrollView, TextInput, View, type KeyboardEvent, type ScrollViewProps } from 'react-native';

/**
 * A form's scroll view that keeps the focused field above the keyboard.
 *
 * Why not react-native-keyboard-aware-scroll-view (what this replaced): it was
 * last released in 2021 and finds the focused input through APIs the New
 * Architecture changed, and on Android edge-to-edge `adjustResize` no longer
 * shrinks the window — so the keyboard simply covered the fields.
 *
 * How: on keyboard show, measure how much of THIS scroll view the keyboard
 * covers (in window coordinates, so it is right whether or not the window
 * resized), pad the content by that much, and scroll the focused input into
 * the visible part. Moving to the next field with the keyboard already up
 * fires no keyboard event, so fields call `reveal` on focus (FieldFocus).
 */

/** Fields call this on focus; it scrolls the focused input into view if the keyboard is up. */
export const FieldFocus = createContext<(() => void) | null>(null);

const MARGIN = 24;

export function KeyboardScroll({ children, contentContainerStyle, ...rest }: ScrollViewProps & { children: React.ReactNode }) {
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const scrollY = useRef(0);
  const frame = useRef({ y: 0, h: 0 });
  const covered = useRef(0);
  const [pad, setPad] = useState(0);

  const reveal = useCallback(() => {
    if (covered.current <= 0) return;
    // Let the focus land (and the padding apply) before measuring.
    requestAnimationFrame(() => {
      const input = TextInput.State.currentlyFocusedInput() as unknown as View | null;
      const content = contentRef.current;
      if (!input || !content || typeof input.measureLayout !== 'function') return;
      input.measureLayout(
        content,
        (_x, y, _w, h) => {
          const visible = frame.current.h - covered.current;
          const top = scrollY.current;
          if (y + h + MARGIN > top + visible) scrollRef.current?.scrollTo({ y: y + h + MARGIN - visible, animated: true });
          else if (y - MARGIN < top) scrollRef.current?.scrollTo({ y: Math.max(0, y - MARGIN), animated: true });
        },
        () => undefined,
      );
    });
  }, []);

  useEffect(() => {
    const show = (e: KeyboardEvent) => {
      const view = scrollRef.current as unknown as View | null;
      if (!view) return;
      view.measureInWindow((_x, y, _w, h) => {
        frame.current = { y, h };
        covered.current = Math.max(0, y + h - e.endCoordinates.screenY);
        setPad(covered.current);
        reveal();
      });
    };
    const hide = () => {
      covered.current = 0;
      setPad(0);
    };
    // iOS can move with the keyboard; Android only reports once it is up.
    const ios = Platform.OS === 'ios';
    const subs = [Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', show), Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', hide)];
    return () => subs.forEach((s) => s.remove());
  }, [reveal]);

  return (
    <FieldFocus.Provider value={reveal}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        onLayout={(e) => {
          frame.current = { ...frame.current, h: e.nativeEvent.layout.height };
        }}
        {...rest}
      >
        <View ref={contentRef} collapsable={false} style={[contentContainerStyle, pad ? { paddingBottom: pad + MARGIN } : null]}>
          {children}
        </View>
      </ScrollView>
    </FieldFocus.Provider>
  );
}
