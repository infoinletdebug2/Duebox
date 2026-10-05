import { View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { ScanFab } from '../../src/items/parts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth/context';
import { makeStyles, shadow, space, useColors } from '../../src/theme/tokens';
import { Icon, type IconName } from '../../src/ui/Icon';
import { Press } from '../../src/ui/Button';
import { T } from '../../src/ui/Text';
import { TAB_BAR_BOTTOM, TAB_BAR_H } from '../../src/ui/tabBar';

/**
 * Three tabs, not five (SCREENS): Home answers "what's next", Items answers
 * "find one", Settings holds the rest. Capture is the floating Scan button,
 * drawn as a SIBLING of the bar. The bar is absolutely positioned; its height
 * lives in `ui/tabBar.ts` and every tab screen reserves it from there.
 */
const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'home', label: 'Home', icon: 'home' },
  { name: 'items', label: 'All items', icon: 'inbox' },
  { name: 'settings', label: 'Settings', icon: 'settings' },
];

export default function TabsLayout() {
  const { session } = useAuth();
  if (!session) return <Redirect href="/(auth)/welcome" />;

  return (
    <View style={{ flex: 1 }}>
    <Tabs
      tabBar={(props) => <TabBar index={props.state.index} navigate={(name) => props.navigation.navigate(name)} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
    <ScanFabWhenNeeded />
    </View>
  );
}

/** The Scan button sits beside the bar on every tab — capture is always one tap away. */
function ScanFabWhenNeeded() {
  return <ScanFab />;
}

/**
 * A floating pill: the active tab grows to show its label on a plum fill,
 * the others are icons. It leaves room on the right for the Scan button.
 */
function TabBar({ index, navigate }: { index: number; navigate: (name: string) => void }) {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const s = useStyles();
  return (
    <View style={[s.bar, shadow.lifted, { bottom: insets.bottom + TAB_BAR_BOTTOM }]} accessibilityRole="tablist">
      {TABS.map((tab, i) => {
        const active = i === index;
        return (
          <Press
            key={tab.name}
            testID={`tab-${tab.name}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={() => navigate(tab.name)}
            style={[s.item, active && s.itemActive]}
          >
            <Icon name={tab.icon} size={21} color={active ? c.onBrand : c.textMuted} strokeWidth={active ? 2.4 : 2} />
            {active ? (
              <T variant="callout" numberOfLines={1} style={{ color: c.onBrand }}>
                {tab.label}
              </T>
            ) : null}
          </Press>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16 + TAB_BAR_H + 10,
    height: TAB_BAR_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    backgroundColor: c.surface,
    borderRadius: TAB_BAR_H / 2,
    borderWidth: 1,
    borderColor: c.line,
  },
  item: { height: TAB_BAR_H - 12, minWidth: 48, paddingHorizontal: space.md, borderRadius: (TAB_BAR_H - 12) / 2, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.sm },
  itemActive: { flex: 1, backgroundColor: c.brand },
}));
