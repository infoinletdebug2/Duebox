import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, View, KeyboardAvoidingView, Platform, Animated as RNAnimated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GUTTER, makeStyles, radius, shadow, space, useColors } from '../theme/tokens';
import { T } from './Text';
import { Button, Press } from './Button';

/** A bottom sheet: radius 32, grabber, dims what is behind it. */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[s.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <View style={s.grabber} />
          {title ? (
            <T variant="title" style={{ marginBottom: space.md }}>
              {title}
            </T>
          ) : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Destructive confirms name what will be lost (design.md §26). */
export function ConfirmSheet({
  visible,
  onClose,
  title,
  message,
  confirmLabel,
  onConfirm,
  destructive = true,
  loading,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <T tone="muted" style={{ marginBottom: space.xl }}>
        {message}
      </T>
      <View style={{ gap: space.sm }}>
        <Button label={confirmLabel} tone={destructive ? 'destructive' : 'primary'} onPress={onConfirm} loading={loading} />
        <Button label="Cancel" tone="quiet" onPress={onClose} />
      </View>
    </Sheet>
  );
}

/** A plain list of actions inside a sheet. */
export function SheetAction({ label, onPress, destructive, icon, testID }: { label: string; onPress: () => void; destructive?: boolean; icon?: React.ReactNode; testID?: string }) {
  const c = useColors();
  return (
    <Press onPress={onPress} testID={testID} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52 }}>
      {icon}
      <T variant="headline" style={destructive ? { color: c.critical } : null}>
        {label}
      </T>
    </Press>
  );
}

/* ── toast (with Undo) ──────────────────────────────────────────────────── */

interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

const ToastContext = createContext<(options: ToastOptions) => void>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}

/** A brand pill with an optional accent action; 4 s by default (DESIGN-SYSTEM §6, §10). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const c = useColors();
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const opacity = useRef(new RNAnimated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    RNAnimated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: Platform.OS !== 'web' }).start(() => setToast(null));
  }, [opacity]);

  const show = useCallback(
    (options: ToastOptions) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(options);
      RNAnimated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== 'web' }).start();
      timer.current = setTimeout(hide, options.durationMs ?? 4000);
    },
    [opacity, hide],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <RNAnimated.View pointerEvents="box-none" style={[s.toastWrap, { bottom: insets.bottom + 88, opacity }]}>
          <View style={s.toast} accessibilityLiveRegion="polite" accessibilityRole="alert">
            <T variant="callout" style={{ color: '#FFFFFF', flex: 1 }} numberOfLines={2}>
              {toast.message}
            </T>
            {toast.actionLabel ? (
              <Press
                onPress={() => {
                  toast.onAction?.();
                  hide();
                }}
                accessibilityRole="button"
                style={{ paddingHorizontal: space.sm, minHeight: 36, justifyContent: 'center' }}
              >
                <T variant="callout" style={{ color: c.accent, fontFamily: 'Manrope_700Bold' }}>
                  {toast.actionLabel}
                </T>
              </Press>
            ) : null}
          </View>
        </RNAnimated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: c.overlay },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: GUTTER,
    paddingTop: space.sm,
    ...shadow.lifted,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.line, marginBottom: space.lg },
  toastWrap: { position: 'absolute', left: GUTTER, right: GUTTER, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: c.scheme === 'dark' ? '#3A2A50' : '#2E1A47',
    borderRadius: radius.chip,
    paddingVertical: space.sm + 2,
    paddingLeft: space.xl,
    paddingRight: space.md,
    maxWidth: 520,
    alignSelf: 'stretch',
    ...shadow.lifted,
  },
}));
