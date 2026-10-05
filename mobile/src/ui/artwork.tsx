import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop, Text as SText } from 'react-native-svg';
import { useColors } from '../theme/tokens';

/**
 * Duebox's drawings (DESIGN-SYSTEM §9, visual-system.md "four rules"):
 *   1. one light, from the upper-left, matching the ambient;
 *   2. everything sits on a soft, asymmetric ground ellipse;
 *   3. a lit hairline on the light side;
 *   4. no primary at full strength — fills are two tones of one hue.
 * Gradient ids are prefixed per drawing (`dx-<drawing>-`): SVG ids are a
 * document-wide namespace on web (traps.md). No blur filters (Android mush).
 */

function usePalette() {
  const c = useColors();
  const dark = c.scheme === 'dark';
  return {
    dark,
    plumHi: dark ? '#4A3466' : '#4A2F6E',
    plumLo: dark ? '#2A1D3D' : '#2E1A47',
    paperHi: dark ? '#F4EFF8' : '#FFFFFF',
    paperLo: dark ? '#D9D0E3' : '#EDE7E2',
    goldHi: '#F7C866',
    goldLo: '#E39E22',
    leafHi: dark ? '#9BDAB2' : '#5FA97C',
    leafLo: dark ? '#5FA97C' : '#2F7A4F',
    ink: dark ? '#C9B6F2' : '#2E1A47',
    line: dark ? 'rgba(46,26,71,0.28)' : 'rgba(46,26,71,0.16)',
    ground: dark ? 'rgba(0,0,0,0.45)' : 'rgba(46,26,71,0.10)',
    lit: 'rgba(255,255,255,0.55)',
  };
}

/** The app mark: plum square, a white card with a marigold folded corner and a check. */
export function Mark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Duebox" accessibilityRole="image">
      <Defs>
        <LinearGradient id="dx-mark-bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#4A2F6E" />
          <Stop offset="1" stopColor="#24133A" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="64" height="64" rx="15" fill="url(#dx-mark-bg)" />
      <Path d="M17 15 H40 L48 23 V47 a3 3 0 0 1 -3 3 H17 a3 3 0 0 1 -3 -3 V18 a3 3 0 0 1 3 -3 Z" fill="#FFFFFF" />
      <Path d="M40 15 V20 a3 3 0 0 0 3 3 H48 Z" fill="#F2B33D" />
      <Path d="M21.5 34 L27.5 40 L39.5 27.5" stroke="#2E1A47" strokeWidth={4.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** A dated card: marigold header strip with the month, the day numeral below. */
function DateCard({ x, y, w, day, month, id }: { x: number; y: number; w: number; day: string; month: string; id: string }) {
  const p = usePalette();
  const h = w * 1.05;
  return (
    <G>
      <Defs>
        <LinearGradient id={`${id}-paper`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.paperHi} />
          <Stop offset="1" stopColor={p.paperLo} />
        </LinearGradient>
        <LinearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.goldHi} />
          <Stop offset="1" stopColor={p.goldLo} />
        </LinearGradient>
      </Defs>
      <Rect x={x} y={y} width={w} height={h} rx={w * 0.14} fill={`url(#${id}-paper)`} />
      <Path d={`M${x} ${y + w * 0.14} a${w * 0.14} ${w * 0.14} 0 0 1 ${w * 0.14} ${-w * 0.14} H${x + w - w * 0.14} a${w * 0.14} ${w * 0.14} 0 0 1 ${w * 0.14} ${w * 0.14} V${y + h * 0.3} H${x} Z`} fill={`url(#${id}-gold)`} />
      {/* lit hairline on the light (upper-left) side */}
      <Path d={`M${x + w * 0.1} ${y + 1} H${x + w * 0.6}`} stroke={p.lit} strokeWidth={1.2} strokeLinecap="round" />
      <SvgText x={x + w / 2} y={y + h * 0.22} size={w * 0.13} color="#2A1640" weight="700" text={month} />
      <SvgText x={x + w / 2} y={y + h * 0.78} size={w * 0.42} color={p.plumLo} weight="700" text={day} />
    </G>
  );
}

/** react-native-svg Text, wrapped so every drawing uses the same font. */
function SvgText({ x, y, size, color, weight, text }: { x: number; y: number; size: number; color: string; weight: '600' | '700'; text: string }) {
  return (
    <SText x={x} y={y} fontSize={size} fontWeight={weight} fill={color} textAnchor="middle" fontFamily="BricolageGrotesque_700Bold">
      {text}
    </SText>
  );
}

/** WELCOME: a letter tray, a letter half out, a dated card rising from it. */
export function TrayHero({ size = 220 }: { size?: number }) {
  const p = usePalette();
  return (
    <Svg width={size} height={size * 0.8} viewBox="0 0 240 192" accessibilityLabel="A letter tray with a dated card rising from it" accessibilityRole="image">
      <Defs>
        <LinearGradient id="dx-tray-body" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.plumHi} />
          <Stop offset="1" stopColor={p.plumLo} />
        </LinearGradient>
        <LinearGradient id="dx-tray-letter" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.paperHi} />
          <Stop offset="1" stopColor={p.paperLo} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="128" cy="172" rx="98" ry="13" fill={p.ground} />
      {/* the letter, tilted, behind */}
      <G transform="rotate(-8 92 96)">
        <Rect x="44" y="70" width="104" height="80" rx="8" fill="url(#dx-tray-letter)" />
        <Rect x="58" y="86" width="56" height="5" rx="2.5" fill={p.line} />
        <Rect x="58" y="98" width="76" height="5" rx="2.5" fill={p.line} />
        <Rect x="58" y="110" width="66" height="5" rx="2.5" fill={p.line} />
        <Rect x="58" y="122" width="40" height="5" rx="2.5" fill={p.goldLo} opacity={0.75} />
      </G>
      {/* the dated card, rising */}
      <DateCard x={128} y={22} w={72} day="14" month="MAR" id="dx-tray-card" />
      {/* the tray */}
      <Path d="M34 128 H214 L202 168 a6 6 0 0 1 -6 4 H52 a6 6 0 0 1 -6 -4 Z" fill="url(#dx-tray-body)" />
      <Path d="M40 129 H140" stroke="rgba(255,255,255,0.3)" strokeWidth={1.4} strokeLinecap="round" />
      <Rect x="104" y="146" width="40" height="6" rx="3" fill="rgba(255,255,255,0.22)" />
    </Svg>
  );
}

/** EMPTY HOME: the tray, empty, a small marigold clip on its rim. */
export function EmptyTray({ size = 180 }: { size?: number }) {
  const p = usePalette();
  return (
    <Svg width={size} height={size * 0.62} viewBox="0 0 200 124" accessibilityLabel="An empty letter tray" accessibilityRole="image">
      <Defs>
        <LinearGradient id="dx-empty-body" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.plumHi} />
          <Stop offset="1" stopColor={p.plumLo} />
        </LinearGradient>
        <LinearGradient id="dx-empty-clip" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.goldHi} />
          <Stop offset="1" stopColor={p.goldLo} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="106" cy="108" rx="84" ry="11" fill={p.ground} />
      <Path d="M24 56 H176 L164 98 a6 6 0 0 1 -6 4 H42 a6 6 0 0 1 -6 -4 Z" fill="url(#dx-empty-body)" />
      <Path d="M30 57 H110" stroke="rgba(255,255,255,0.3)" strokeWidth={1.4} strokeLinecap="round" />
      <Rect x="80" y="76" width="40" height="6" rx="3" fill="rgba(255,255,255,0.22)" />
      <Rect x="138" y="40" width="14" height="26" rx="5" fill="url(#dx-empty-clip)" />
      <Path d="M140 42 V50" stroke={p.lit} strokeWidth={1.2} strokeLinecap="round" />
    </Svg>
  );
}

/** ALL DONE: a neat stack of cards with a leaf check. */
export function AllDone({ size = 170 }: { size?: number }) {
  const p = usePalette();
  return (
    <Svg width={size} height={size * 0.7} viewBox="0 0 200 140" accessibilityLabel="A neat stack of finished cards" accessibilityRole="image">
      <Defs>
        <LinearGradient id="dx-done-paper" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.paperHi} />
          <Stop offset="1" stopColor={p.paperLo} />
        </LinearGradient>
        <LinearGradient id="dx-done-leaf" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.leafHi} />
          <Stop offset="1" stopColor={p.leafLo} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="108" cy="124" rx="80" ry="11" fill={p.ground} />
      <Rect x="46" y="76" width="112" height="40" rx="8" fill={p.paperLo} />
      <Rect x="40" y="60" width="112" height="40" rx="8" fill="url(#dx-done-paper)" opacity={0.9} />
      <Rect x="34" y="42" width="112" height="44" rx="8" fill="url(#dx-done-paper)" />
      <Rect x="50" y="56" width="52" height="5" rx="2.5" fill={p.line} />
      <Rect x="50" y="68" width="36" height="5" rx="2.5" fill={p.line} />
      <Path d="M42 43 H96" stroke={p.lit} strokeWidth={1.2} strokeLinecap="round" />
      <Circle cx="146" cy="44" r="22" fill="url(#dx-done-leaf)" />
      <Path d="M135 44 L143 52 L157 37" stroke="#FFFFFF" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** READ FAILED: a crumpled page and a pencil. */
export function ReadFailed({ size = 160 }: { size?: number }) {
  const p = usePalette();
  return (
    <Svg width={size} height={size * 0.75} viewBox="0 0 200 150" accessibilityLabel="A crumpled page and a pencil" accessibilityRole="image">
      <Defs>
        <LinearGradient id="dx-fail-paper" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.paperHi} />
          <Stop offset="1" stopColor={p.paperLo} />
        </LinearGradient>
        <LinearGradient id="dx-fail-pencil" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={p.goldHi} />
          <Stop offset="1" stopColor={p.goldLo} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="104" cy="134" rx="78" ry="10" fill={p.ground} />
      <Path d="M52 30 L118 22 L140 40 L146 112 L62 122 L56 92 L48 66 Z" fill="url(#dx-fail-paper)" />
      <Path d="M56 92 L90 80 L146 112 M48 66 L98 58 L140 40 M118 22 L98 58 L90 80" stroke={p.line} strokeWidth={1.4} fill="none" />
      <Path d="M54 31 L100 25" stroke={p.lit} strokeWidth={1.2} strokeLinecap="round" />
      <G transform="rotate(-32 150 90)">
        <Rect x="112" y="84" width="74" height="12" rx="3" fill="url(#dx-fail-pencil)" />
        <Path d="M186 84 L198 90 L186 96 Z" fill={p.paperLo} />
        <Path d="M195 88.5 L198 90 L195 91.5 Z" fill={p.ink} />
        <Rect x="104" y="84" width="10" height="12" rx="2" fill={p.plumHi} />
      </G>
    </Svg>
  );
}

/** PERMISSION: a bell with a marigold dated card behind it. */
export function BellArt({ size = 170 }: { size?: number }) {
  const p = usePalette();
  return (
    <Svg width={size} height={size * 0.82} viewBox="0 0 200 164" accessibilityLabel="A reminder bell" accessibilityRole="image">
      <Defs>
        <LinearGradient id="dx-bell-body" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.plumHi} />
          <Stop offset="1" stopColor={p.plumLo} />
        </LinearGradient>
        <LinearGradient id="dx-bell-clap" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.goldHi} />
          <Stop offset="1" stopColor={p.goldLo} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="106" cy="150" rx="74" ry="10" fill={p.ground} />
      <DateCard x={122} y={18} w={56} day="7" month="DAYS" id="dx-bell-card" />
      <Path d="M96 30 C70 30 56 52 56 78 V104 L44 122 H148 L136 104 V78 C136 52 122 30 96 30 Z" fill="url(#dx-bell-body)" />
      <Path d="M66 64 C70 48 80 40 92 38" stroke="rgba(255,255,255,0.35)" strokeWidth={2} strokeLinecap="round" fill="none" />
      <Circle cx="96" cy="132" r="12" fill="url(#dx-bell-clap)" />
      <Rect x="90" y="20" width="12" height="12" rx="6" fill={p.plumHi} />
    </Svg>
  );
}

/** ONBOARDING 1 — snap: a phone framing a letter, the date picked out in marigold. */
export function SnapArt({ size = 230 }: { size?: number }) {
  const p = usePalette();
  return (
    <Svg width={size} height={size * 0.82} viewBox="0 0 240 196" accessibilityLabel="A phone reading the date on a letter" accessibilityRole="image">
      <Defs>
        <LinearGradient id="dx-snap-paper" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.paperHi} />
          <Stop offset="1" stopColor={p.paperLo} />
        </LinearGradient>
        <LinearGradient id="dx-snap-phone" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.plumHi} />
          <Stop offset="1" stopColor={p.plumLo} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="126" cy="182" rx="96" ry="11" fill={p.ground} />
      <G transform="rotate(-6 100 110)">
        <Rect x="36" y="44" width="120" height="132" rx="8" fill="url(#dx-snap-paper)" />
        <Rect x="52" y="62" width="60" height="6" rx="3" fill={p.line} />
        <Rect x="52" y="76" width="86" height="6" rx="3" fill={p.line} />
        <Rect x="52" y="90" width="76" height="6" rx="3" fill={p.line} />
        <Rect x="48" y="106" width="92" height="20" rx="6" fill={p.goldHi} opacity={0.55} />
        <Rect x="54" y="113" width="64" height="6" rx="3" fill={p.ink} opacity={0.7} />
        <Rect x="52" y="138" width="70" height="6" rx="3" fill={p.line} />
        <Path d="M38 45 H100" stroke={p.lit} strokeWidth={1.2} strokeLinecap="round" />
      </G>
      <Rect x="128" y="34" width="84" height="146" rx="16" fill="url(#dx-snap-phone)" />
      <Rect x="136" y="46" width="68" height="112" rx="8" fill={p.dark ? '#140E1C' : '#1B1027'} />
      <Path d="M142 60 V54 H150 M190 54 H198 V60 M198 144 V152 H190 M150 152 H142 V144" stroke={p.goldHi} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Rect x="148" y="94" width="44" height="14" rx="4" fill={p.goldHi} />
      <Circle cx="170" cy="168" r="6" fill="rgba(255,255,255,0.25)" />
      <Path d="M132 40 H180" stroke="rgba(255,255,255,0.3)" strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

/** ONBOARDING 2 — remind: three dated cards fanned out, 30 · 7 · 1. */
export function RemindArt({ size = 230 }: { size?: number }) {
  const p = usePalette();
  return (
    <Svg width={size} height={size * 0.78} viewBox="0 0 240 188" accessibilityLabel="Reminders 30, 7 and 1 days before" accessibilityRole="image">
      <Ellipse cx="126" cy="172" rx="96" ry="11" fill={p.ground} />
      <G transform="rotate(-12 70 110)">
        <DateCard x={30} y={58} w={66} day="30" month="DAYS" id="dx-remind-a" />
      </G>
      <G transform="rotate(8 180 110)">
        <DateCard x={146} y={58} w={66} day="1" month="DAY" id="dx-remind-c" />
      </G>
      <DateCard x={84} y={36} w={80} day="7" month="DAYS" id="dx-remind-b" />
    </Svg>
  );
}

/** ONBOARDING 3 — household: two overlapping cards with two initials. */
export function HouseholdArt({ size = 230 }: { size?: number }) {
  const p = usePalette();
  return (
    <Svg width={size} height={size * 0.74} viewBox="0 0 240 178" accessibilityLabel="Two people sharing the same deadlines" accessibilityRole="image">
      <Defs>
        <LinearGradient id="dx-house-paper" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.paperHi} />
          <Stop offset="1" stopColor={p.paperLo} />
        </LinearGradient>
        <LinearGradient id="dx-house-a" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.plumHi} />
          <Stop offset="1" stopColor={p.plumLo} />
        </LinearGradient>
        <LinearGradient id="dx-house-b" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.goldHi} />
          <Stop offset="1" stopColor={p.goldLo} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="124" cy="162" rx="96" ry="11" fill={p.ground} />
      <Rect x="34" y="64" width="172" height="44" rx="10" fill="url(#dx-house-paper)" />
      <Rect x="34" y="114" width="172" height="40" rx="10" fill="url(#dx-house-paper)" opacity={0.85} />
      <Rect x="62" y="80" width="80" height="6" rx="3" fill={p.line} />
      <Rect x="62" y="92" width="50" height="5" rx="2.5" fill={p.line} />
      <Rect x="62" y="128" width="70" height="6" rx="3" fill={p.line} />
      <Path d="M44 65 H120" stroke={p.lit} strokeWidth={1.2} strokeLinecap="round" />
      <Circle cx="182" cy="86" r="12" fill="url(#dx-house-a)" />
      <Circle cx="182" cy="134" r="12" fill="url(#dx-house-b)" />
      <Circle cx="96" cy="34" r="22" fill="url(#dx-house-a)" />
      <Circle cx="134" cy="34" r="22" fill="url(#dx-house-b)" />
      <Path d="M80 22 C84 16 90 14 96 14" stroke="rgba(255,255,255,0.4)" strokeWidth={1.6} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
