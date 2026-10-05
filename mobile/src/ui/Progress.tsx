import { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { memberColor, useColors } from '../theme/tokens';
import { T } from './Text';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * ProgressRing (DESIGN-SYSTEM §6). The arc tweens 220ms on change — started
 * in an effect, never during render (traps.md). Reduce Motion = no animation.
 */
export function ProgressRing({
  value,
  size = 28,
  stroke = 3,
  color,
  track,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color: string;
  track?: string;
  children?: React.ReactNode;
}) {
  const c = useColors();
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const progress = useSharedValue(clamped);

  useEffect(() => {
    progress.value = reduce ? clamped : withTiming(clamped, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [clamped, reduce, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? c.line} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
        />
      </Svg>
      {children}
    </View>
  );
}

/** A thin horizontal bar. */
export function ProgressBar({ value, color, height = 6 }: { value: number; color?: string; height?: number }) {
  const c = useColors();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: c.line, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}>
      <View style={{ width: `${clamped * 100}%`, height, borderRadius: height, backgroundColor: color ?? c.brandInk }} />
    </View>
  );
}

/** A household member's initial on their colour (shown when the household has more than one member). */
export function Avatar({ name, index = 0, size = 28 }: { name: string; index?: number; size?: number }) {
  const c = useColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: memberColor(index, c.scheme),
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessible={false}
    >
      <T variant="callout" style={{ color: c.scheme === 'dark' ? '#141019' : '#FFFFFF', fontFamily: 'Manrope_700Bold', fontSize: size * 0.44, lineHeight: size * 0.56 }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </T>
    </View>
  );
}
