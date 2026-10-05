import { useMemo } from 'react';
import { StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Duebox's tokens — DESIGN-SYSTEM.md §3–§4 is the specification.
 *
 * The seed: PLUM (brand: structure, the Next-up hero, "due soon"), MARIGOLD
 * (accent: the one button you press), PAPER (warm neutral ground), BRICK
 * (late — only late) and LEAF (done — only done). There is deliberately no
 * amber: marigold owns warm, so "due this week" is plum weight, not a colour.
 *
 * Every text pair here was measured (TEST-LOG): text 15.3:1, muted 5.4:1,
 * marigold text 8.8:1, late 6.5:1, done 5.2:1 in light; all ≥ 7.3:1 in dark.
 */

export interface Colors {
  scheme: 'light' | 'dark';
  ground: string;
  surface: string;
  paper: string;
  surfaceSunk: string;
  /** Plum fill (hero, active states). */
  brand: string;
  brandSoft: string;
  /** Plum used AS TEXT/ICON on the ground. */
  brandInk: string;
  accent: string;
  accentPressed: string;
  accentInk: string;
  accentSoft: string;
  /** Marigold as text on the plum fill. */
  accentOnBrand: string;
  text: string;
  textMuted: string;
  textFaint: string;
  line: string;
  good: string;
  goodSoft: string;
  /** Kept for the kit's Banner; Duebox has no amber, so it is plum. */
  warn: string;
  warnSoft: string;
  critical: string;
  criticalSoft: string;
  info: string;
  infoSoft: string;
  onBrand: string;
  onBrandMuted: string;
  overlay: string;
}

const light: Colors = {
  scheme: 'light',
  ground: '#F5F3F8',
  surface: '#FFFFFF',
  paper: '#FFFFFF',
  surfaceSunk: '#ECE8F1',
  brand: '#2E1A47',
  brandSoft: 'rgba(46,26,71,0.08)',
  brandInk: '#2E1A47',
  accent: '#F2B33D',
  accentPressed: '#E0A02A',
  accentInk: '#2A1640',
  accentSoft: 'rgba(242,179,61,0.18)',
  accentOnBrand: '#F5BE55',
  text: '#221A2B',
  textMuted: '#6A6175',
  textFaint: '#8F8799',
  line: '#E5E0EC',
  good: '#2F7A4F',
  goodSoft: 'rgba(47,122,79,0.10)',
  warn: '#2E1A47',
  warnSoft: 'rgba(46,26,71,0.08)',
  critical: '#B3261E',
  criticalSoft: 'rgba(179,38,30,0.08)',
  info: '#2E1A47',
  infoSoft: 'rgba(46,26,71,0.08)',
  onBrand: '#FFFFFF',
  onBrandMuted: '#CBBFDA',
  overlay: 'rgba(20,16,25,0.45)',
};

const dark: Colors = {
  scheme: 'dark',
  ground: '#141019',
  surface: '#1D1726',
  paper: '#231C2D',
  surfaceSunk: '#0F0C13',
  brand: '#2A1D3D',
  brandSoft: 'rgba(201,182,242,0.12)',
  brandInk: '#C9B6F2',
  accent: '#F5BE55',
  accentPressed: '#E8AE40',
  accentInk: '#1E1229',
  accentSoft: 'rgba(245,190,85,0.16)',
  accentOnBrand: '#F5BE55',
  text: '#EEE9F3',
  textMuted: '#A79FB3',
  textFaint: '#6E6679',
  line: '#2A2333',
  good: '#7FCB9B',
  goodSoft: 'rgba(127,203,155,0.14)',
  warn: '#C9B6F2',
  warnSoft: 'rgba(201,182,242,0.12)',
  critical: '#F28B82',
  criticalSoft: 'rgba(242,139,130,0.12)',
  info: '#C9B6F2',
  infoSoft: 'rgba(201,182,242,0.12)',
  onBrand: '#FFFFFF',
  onBrandMuted: '#B8ACC9',
  overlay: 'rgba(0,0,0,0.6)',
};

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

/**
 * Member initials (household of up to 5). Muted, told apart by letter as
 * well as colour (state never by colour alone).
 */
const MEMBER_LIGHT = ['#5B3F86', '#2F6F8F', '#8A4B6B', '#4F6B3A', '#7A5A2E'];
const MEMBER_DARK = ['#B9A2E6', '#86BEDA', '#E3A2C2', '#A9C98F', '#DDB880'];

export function memberColor(index: number, scheme: 'light' | 'dark' = 'light'): string {
  const list = scheme === 'dark' ? MEMBER_DARK : MEMBER_LIGHT;
  return list[((index % list.length) + list.length) % list.length] as string;
}

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 40, giant: 56 } as const;
export const radius = { chip: 999, input: 12, tile: 14, row: 14, group: 18, card: 20, hero: 28, sheet: 28, button: 16 } as const;
export const GUTTER = 20;
export const TOUCH = 44;

export const font = {
  display: 'BricolageGrotesque_700Bold',
  displaySemi: 'BricolageGrotesque_600SemiBold',
  body: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
} as const;

export const type = {
  countdown: { fontFamily: font.display, fontSize: 56, lineHeight: 58, letterSpacing: -2 },
  hero: { fontFamily: font.display, fontSize: 40, lineHeight: 44, letterSpacing: -1 },
  display: { fontFamily: font.display, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontFamily: font.displaySemi, fontSize: 21, lineHeight: 26, letterSpacing: -0.2 },
  amount: { fontFamily: font.semibold, fontSize: 22, lineHeight: 28 },
  headline: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: font.body, fontSize: 16, lineHeight: 22 },
  callout: { fontFamily: font.semibold, fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  micro: { fontFamily: font.bold, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
} satisfies Record<string, TextStyle>;

export const shadow = {
  lifted: {
    shadowColor: '#2E1A47',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} satisfies Record<string, ViewStyle>;

/** Motion tokens (DESIGN-SYSTEM §8). */
export const motion = {
  fast: 150,
  normal: 220,
  slow: 300,
  spring: { damping: 20, stiffness: 260 },
} as const;

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export function makeStyles<T extends NamedStyles<T>>(factory: (c: Colors) => T) {
  return function useStyles(): T {
    const colors = useColors();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
