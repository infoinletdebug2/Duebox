import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, ScrollView, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '../theme/tokens';
import { T } from '../ui/Text';
import { Button, IconButton } from '../ui/Button';
import { Icon } from '../ui/Icon';
import type { Page } from '../types';



/**
 * Full-screen page viewer: dark backdrop, one page per screen width, swipe
 * between pages. PDFs open in the system viewer (the signed URL is short-lived).
 */
export function PageViewer({ pages, index, onClose }: { pages: Page[]; index: number | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroller = useRef<ScrollView>(null);
  const [at, setAt] = useState(index ?? 0);

  useEffect(() => {
    if (index === null) return;
    setAt(index);
    const t = setTimeout(() => scroller.current?.scrollTo({ x: index * width, animated: false }), 0);
    return () => clearTimeout(t);
  }, [index, width]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setAt(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)));

  return (
    <Modal visible={index !== null} animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent={false}>
      <View style={{ flex: 1, backgroundColor: '#0A0B14' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: insets.top + space.xs, paddingHorizontal: space.xs }}>
          <IconButton icon="x" label="Close" onPress={onClose} tone="brand" />
          <T variant="headline" style={{ flex: 1, textAlign: 'center', color: '#FFFFFF' }} accessibilityLiveRegion="polite">
            Page {at + 1} of {pages.length}
          </T>
          <View style={{ width: 44 }} />
        </View>
        <ScrollView ref={scroller} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} onScroll={onScroll} scrollEventThrottle={64}>
          {pages.map((p) => (
            <View key={p.id} style={{ width, height: height - insets.top - insets.bottom - 64, alignItems: 'center', justifyContent: 'center', padding: space.md }}>
              {p.mime === 'application/pdf' ? (
                <View style={{ alignItems: 'center', gap: space.md }}>
                  <Icon name="file" size={48} color="#B9BCEB" />
                  <T style={{ color: '#FFFFFF' }}>This page is a PDF.</T>
                  {p.url ? <Button label="Open the PDF" tone="secondary" full={false} onPress={() => void Linking.openURL(p.url as string)} /> : null}
                </View>
              ) : p.url ? (
                <Image source={{ uri: p.url }} style={{ width: '100%', height: '100%' }} contentFit="contain" accessibilityLabel={`Page ${p.index + 1}`} />
              ) : (
                <T style={{ color: '#FFFFFF' }}>This page isn’t available right now.</T>
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
