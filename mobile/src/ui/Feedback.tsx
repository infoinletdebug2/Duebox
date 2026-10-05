import { useEffect, useRef } from 'react';
import { Animated, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { makeStyles, radius, space, useColors } from '../theme/tokens';
import { T } from './Text';
import { Button, Press } from './Button';
import { Icon, type IconName } from './Icon';
import { messageOf } from '../api/client';

/** Says what belongs here and offers the action (design.md §15). */
export function EmptyState({
  art,
  title,
  message,
  actionLabel,
  onAction,
  compact,
}: {
  art?: React.ReactNode;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  const s = useStyles();
  return (
    <View style={[s.empty, compact && { paddingVertical: space.xl }]}>
      {art ? <View style={{ marginBottom: space.md }}>{art}</View> : null}
      <T variant="title" align="center">
        {title}
      </T>
      {message ? (
        <T tone="muted" align="center" style={{ maxWidth: 320 }}>
          {message}
        </T>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: space.md, alignSelf: 'stretch' }}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const c = useColors();
  const s = useStyles();
  return (
    <View style={s.empty}>
      <Icon name="alert" size={32} color={c.textMuted} />
      <T variant="headline" align="center">
        That didn’t load
      </T>
      <T tone="muted" align="center">
        {messageOf(error)}
      </T>
      {onRetry ? (
        <View style={{ marginTop: space.sm }}>
          <Button label="Try again" tone="secondary" full={false} onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

/** A soft pulsing block. Reduced motion just shows the block. */
export function Skeleton({ height = 20, width = '100%', style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ height, width, borderRadius: 10, backgroundColor: c.line, opacity: pulse }, style]} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  const s = useStyles();
  return (
    <View style={s.skeletonGroup}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={s.skeletonRow}>
          <Skeleton height={36} width={36} style={{ borderRadius: 11 }} />
          <View style={{ flex: 1, gap: space.xs }}>
            <Skeleton height={14} width="60%" />
            <Skeleton height={12} width="35%" />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Thin, tinted, optionally dismissible (trial days left, offline). */
export function Banner({ icon = 'info', message, tone = 'brand', onPress, onDismiss, actionLabel }: { icon?: IconName; message: string; tone?: 'brand' | 'warn' | 'good'; onPress?: () => void; onDismiss?: () => void; actionLabel?: string }) {
  const c = useColors();
  const s = useStyles();
  const bg = tone === 'warn' ? c.warnSoft : tone === 'good' ? c.goodSoft : c.brandSoft;
  const fg = tone === 'warn' ? c.warn : tone === 'good' ? c.good : c.brandInk;
  const body = (
    <View style={[s.banner, { backgroundColor: bg }]}>
      <Icon name={icon} size={18} color={fg} />
      <T variant="caption" style={{ flex: 1, color: c.text }}>
        {message}
      </T>
      {actionLabel ? (
        <T variant="caption" style={{ color: fg, fontFamily: 'Manrope_700Bold' }}>
          {actionLabel}
        </T>
      ) : null}
      {onDismiss ? (
        <Press onPress={onDismiss} accessibilityLabel="Dismiss" hitSlop={10}>
          <Icon name="x" size={16} color={c.textMuted} />
        </Press>
      ) : null}
    </View>
  );
  return onPress ? (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={message}>
      {body}
    </Press>
  ) : (
    body
  );
}

const useStyles = makeStyles((c) => ({
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.huge, paddingHorizontal: space.lg },
  skeletonGroup: { backgroundColor: c.surface, borderRadius: radius.group, borderWidth: 1, borderColor: c.line, paddingVertical: space.xs },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.input, paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
}));
