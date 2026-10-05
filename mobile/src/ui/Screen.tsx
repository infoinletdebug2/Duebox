import { RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter } from 'expo-router';
import { GUTTER, makeStyles, space, useColors } from '../theme/tokens';
import { Ambient } from './Ambient';
import { T } from './Text';
import { IconButton } from './Button';

interface ScreenProps {
  children: React.ReactNode;
  /** Scrolls by default. `false` for screens that manage their own list. */
  scroll?: boolean;
  /** Extra bottom padding — tab screens pass `useTabBarSpace()`. */
  bottomPad?: number;
  /** A form: keyboard-aware scrolling (traps.md: both platforms need it). */
  form?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: React.ReactNode;
  header?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** Respect the top safe area (false when a Header already does). */
  safeTop?: boolean;
  testID?: string;
}

/**
 * The one screen shell. The non-scrolling branch gets `flex: 1` so a child
 * list can fill it (traps.md: a wrapper with no flex collapses every
 * ScrollView inside it to zero height).
 */
export function Screen({
  children,
  scroll = true,
  bottomPad = 0,
  form,
  refreshing,
  onRefresh,
  footer,
  header,
  contentStyle,
  safeTop = true,
  testID,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const s = useStyles();
  const padTop = safeTop && !header ? insets.top + space.sm : space.sm;
  const padBottom = (footer ? space.lg : insets.bottom + space.xxl) + bottomPad;

  const refresh = onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={c.brandInk} /> : undefined;

  let body: React.ReactNode;
  if (!scroll) {
    body = <View style={[s.fill, { paddingTop: padTop }, contentStyle]}>{children}</View>;
  } else if (form) {
    body = (
      <KeyboardAwareScrollView
        enableOnAndroid
        extraScrollHeight={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.content, { paddingTop: padTop, paddingBottom: padBottom }, contentStyle]}
      >
        {children}
      </KeyboardAwareScrollView>
    );
  } else {
    body = (
      <ScrollView
        refreshControl={refresh}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.content, { paddingTop: padTop, paddingBottom: padBottom }, contentStyle]}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={s.root} testID={testID}>
      <Ambient />
      {header}
      {body}
      {footer ? <View style={[s.footer, { paddingBottom: insets.bottom + space.md }]}>{footer}</View> : null}
    </View>
  );
}

interface HeaderProps {
  title?: string;
  back?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  /** "close" for screens presented from the bottom. */
  closeIcon?: boolean;
}

/** Pushed screens: back chevron, a title, an optional right action. */
export function Header({ title, back = true, onBack, right, closeIcon }: HeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const s = useStyles();
  const goBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <View style={[s.header, { paddingTop: insets.top + space.xs }]}>
      <View style={s.headerSide}>{back ? <IconButton icon={closeIcon ? 'x' : 'chevron-left'} label={closeIcon ? 'Close' : 'Back'} onPress={goBack} /> : null}</View>
      <T variant="headline" numberOfLines={1} style={s.headerTitle}>
        {title ?? ''}
      </T>
      <View style={[s.headerSide, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

/** A screen title in display type, with an optional eyebrow and right slot. */
export function PageTitle({ title, eyebrow, right }: { title: string; eyebrow?: string; right?: React.ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.pageTitle}>
      <View style={{ flex: 1 }}>
        {eyebrow ? (
          <T variant="micro" tone="muted">
            {eyebrow}
          </T>
        ) : null}
        <T variant="display" accessibilityRole="header">
          {title}
        </T>
      </View>
      {right}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.ground },
  fill: { flex: 1 },
  content: { paddingHorizontal: GUTTER, gap: space.xxl },
  footer: {
    paddingHorizontal: GUTTER,
    paddingTop: space.md,
    backgroundColor: c.ground,
    borderTopWidth: 1,
    borderTopColor: c.line,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xs,
    paddingBottom: space.xs,
    backgroundColor: c.ground,
  },
  headerSide: { width: 88, justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center' },
  pageTitle: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, paddingTop: space.sm },
}));
