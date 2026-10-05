import { Children, Fragment, isValidElement } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { makeStyles, radius, shadow, space, useColors } from '../theme/tokens';
import { T } from './Text';
import { Icon, type IconName } from './Icon';
import { Press } from './Button';

/**
 * Lists live in ONE row group with dividers, never a stack of shadowed cards
 * (design.md §11: containers must earn their existence).
 */
export function Group({ children, title, action, style }: { children: React.ReactNode; title?: string; action?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const s = useStyles();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={style}>
      {title || action ? (
        <View style={s.groupHead}>
          {title ? (
            <T variant="micro" tone="muted" style={{ flex: 1 }}>
              {title}
            </T>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {action}
        </View>
      ) : null}
      <View style={s.group}>
        {items.map((child, i) => (
          <Fragment key={(child as { key?: string }).key ?? i}>
            {i > 0 ? <View style={s.divider} /> : null}
            {child}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

export function Divider() {
  const s = useStyles();
  return <View style={s.divider} />;
}

/** A card: the hero panel, stat tiles and sheets only. */
export function Card({ children, style, lifted }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; lifted?: boolean }) {
  const s = useStyles();
  return <View style={[s.card, lifted && shadow.lifted, style]}>{children}</View>;
}

interface RowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconColor?: string;
  iconBg?: string;
  value?: string;
  onPress?: () => void;
  chevron?: boolean;
  right?: React.ReactNode;
  left?: React.ReactNode;
  destructive?: boolean;
  testID?: string;
}

/** A row ≥ 56pt tall: leading icon tile, title + subtitle, value, chevron. */
export function ListRow({ title, subtitle, icon, iconColor, iconBg, value, onPress, chevron = Boolean(onPress), right, left, destructive, testID }: RowProps) {
  const c = useColors();
  const s = useStyles();
  const content = (
    <View style={s.row}>
      {left}
      {icon ? (
        <View style={[s.iconTile, { backgroundColor: iconBg ?? c.brandSoft }]}>
          <Icon name={icon} size={19} color={iconColor ?? (destructive ? c.critical : c.brandInk)} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="headline" numberOfLines={1} style={destructive ? { color: c.critical } : null}>
          {title}
        </T>
        {subtitle ? (
          <T variant="caption" tone="muted" numberOfLines={2}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {value ? (
        <T variant="callout" tone="muted">
          {value}
        </T>
      ) : null}
      {right}
      {chevron ? <Icon name="chevron-right" size={18} color={c.textFaint} /> : null}
    </View>
  );
  if (!onPress) return <View testID={testID}>{content}</View>;
  return (
    <Press testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={value ? `${title}, ${value}` : title}>
      {content}
    </Press>
  );
}

/** label · value · delta (DESIGN-SYSTEM §6 StatTile). */
export function StatTile({ label, value, note, style }: { label: string; value: string; note?: string; style?: StyleProp<ViewStyle> }) {
  const s = useStyles();
  return (
    <View style={[s.stat, style]}>
      <T variant="micro" tone="muted">
        {label}
      </T>
      <T variant="title" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </T>
      {note ? (
        <T variant="caption" tone="muted" numberOfLines={1}>
          {note}
        </T>
      ) : null}
    </View>
  );
}

export function Row({ children, gap = space.md, style }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Stack({ children, gap = space.md, style }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

const useStyles = makeStyles((c) => ({
  groupHead: { flexDirection: 'row', alignItems: 'center', marginBottom: space.sm, paddingHorizontal: space.xs, minHeight: 20 },
  group: {
    backgroundColor: c.surface,
    borderRadius: radius.group,
    borderWidth: 1,
    borderColor: c.line,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: c.line, marginLeft: space.lg },
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: c.line,
    padding: space.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56 },
  iconTile: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stat: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: c.line,
    padding: space.md,
    gap: space.xxs,
    minWidth: 0,
  },
}));
