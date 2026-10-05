import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useColors } from '../theme/tokens';

/**
 * The one ambient light (DESIGN-SYSTEM §3.3): a plum radial at 8% from the
 * upper-left, anchored past the edge so no falloff ever reads as a circle.
 * A lighter tone of the brand hue, never its complement (the "pink screen"
 * lesson in visual-system.md). Should read as depth, never as a colour.
 */
export function Ambient() {
  const c = useColors();
  const tint = c.scheme === 'dark' ? '#C9B6F2' : '#2E1A47';
  const strength = c.scheme === 'dark' ? 0.07 : 0.08;
  return (
    <View pointerEvents="none" style={styles.fill}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="dx-ambient" cx="-10%" cy="-8%" rx="95%" ry="70%" fx="-10%" fy="-8%" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={tint} stopOpacity={strength} />
            <Stop offset="1" stopColor={tint} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#dx-ambient)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
