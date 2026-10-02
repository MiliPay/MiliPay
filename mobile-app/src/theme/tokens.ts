/**
 * The same values as tailwind.config.js, for the places a className cannot
 * reach: React Navigation's theme, icon `color` props, LinearGradient stops,
 * StatusBar, and shadow colours.
 *
 * Keep the two in step. If you add a colour here it belongs in the Tailwind
 * config too, and vice versa — a colour that exists in only one of them is how
 * the app drifted into 53 different hex values in the first place.
 */

export const colors = {
  ledger: {
    base: "#080C0A",
    raised: "#0A1F1A",
    line: "#1A3A30",
    line2: "#234539",
  },
  signal: {
    base: "#00C896",
    bright: "#33E0B5",
    dim: "#0A6650",
    ink: "#04120E",
  },
  ink: {
    base: "#E8FFF6",
    muted: "#86B3A4",
    faint: "#4F7568",
  },
  status: {
    ok: "#33E0B5",
    info: "#3B82F6",
    warn: "#FFB454",
    fail: "#FF5C5C",
  },
} as const;

/**
 * The redesign's semantic colours, for the places a className cannot reach.
 * Identical to the CSS variables in global.css — keep the two in step. Read
 * them through useThemeColors() so the active theme is picked for you.
 * Source: design_handoff_milipay_redesign/README.md, "Design tokens".
 */
export interface ThemeColors {
  bg: string;
  card: string;
  cardLine: string;
  line: string;
  chip: string;
  input: string;
  text: string;
  muted: string;
  faint: string;
  brand: string;
  brandText: string;
  brandSoft: string;
  warn: string;
  warnSoft: string;
  fail: string;
  failSoft: string;
  tab: string;
  sheet: string;
  scrim: string;
  /** Card shadow. The dark theme has none. */
  shadow: string | undefined;
}

export const themeColors: { light: ThemeColors; dark: ThemeColors } = {
  light: {
    bg: '#F2F5F4',
    card: '#FFFFFF',
    cardLine: '#E9EFEC',
    line: '#E3EAE7',
    chip: '#EDF2F0',
    input: '#F4F7F6',
    text: '#0B1A15',
    muted: '#56695F',
    // Darkened from the design's #8A9C95 (2.6:1) to pass WCAG AA (4.5:1) on
    // the page, cards and chips; still lighter than muted.
    faint: '#64716C',
    brand: '#00C896',
    brandText: '#0A6650',
    brandSoft: 'rgba(0, 200, 150, 0.12)',
    warn: '#A86400',
    warnSoft: 'rgba(255, 180, 84, 0.2)',
    fail: '#D2383E',
    failSoft: 'rgba(255, 92, 92, 0.12)',
    tab: '#FFFFFF',
    sheet: '#FFFFFF',
    scrim: 'rgba(8, 12, 10, 0.45)',
    shadow: '0px 1px 2px rgba(10, 40, 30, 0.04), 0px 6px 20px rgba(10, 40, 30, 0.05)',
  },
  dark: {
    bg: '#080C0A',
    card: '#0F1714',
    cardLine: '#1A2823',
    line: '#1E2D27',
    chip: '#16211D',
    input: '#16211D',
    text: '#E8FFF6',
    muted: '#86B3A4',
    // Lightened from the design's #5E8577 (4.0:1 on chips) to pass 4.5:1.
    faint: '#648E7F',
    brand: '#00C896',
    brandText: '#33E0B5',
    brandSoft: 'rgba(0, 200, 150, 0.16)',
    warn: '#FFB454',
    warnSoft: 'rgba(255, 180, 84, 0.14)',
    fail: '#FF5C5C',
    failSoft: 'rgba(255, 92, 92, 0.14)',
    tab: '#0B110F',
    sheet: '#111A17',
    scrim: 'rgba(0, 0, 0, 0.62)',
    shadow: undefined,
  },
};

/** Fixed colours the redesign uses in both themes. */
export const brandFixed = {
  /** Text on the brand green. */
  onBrand: '#04120E',
  /** Splash, Palm and Tier hero cards: linear-gradient(145deg, …). */
  heroGradient: ['#0A7A5A', '#065F46', '#022C22'] as const,
  heroGradientStops: [0, 0.45, 1] as const,
  /** Gold tier / "Popular" badge. */
  gold: ['#F5C24B', '#E0A526'] as const,
  goldText: '#3A2600',
} as const;

/**
 * Service tints: icon colour; the tile is the same colour at 14%. Airtime is
 * #00C896 in the prototype's SVC constant (the README says #10B981; the
 * handoff rule is that the HTML wins).
 */
export const serviceColors = {
  airtime: '#00C896',
  data: '#3B82F6',
  power: '#F97316',
  cable: '#A855F7',
} as const;

/** Network badges: the redesign's telco circles (TELCOS in the prototype). */
export const telcoColors = {
  mtn: { name: 'MTN', short: 'MTN', bg: '#FFCC00', fg: '#111111' },
  airtel: { name: 'Airtel', short: 'A', bg: '#E40000', fg: '#FFFFFF' },
  glo: { name: 'Glo', short: 'glo', bg: '#4CAF50', fg: '#FFFFFF' },
  '9mobile': { name: '9mobile', short: '9m', bg: '#006B3E', fg: '#FFFFFF' },
} as const;

/**
 * Linked-bank card faces, by position (the prototype's ACCTS gradients): the
 * first linked account is green, the second blue, the third plum.
 */
export const bankCardThemes = [
  { gradient: ['#065F46', '#022C22'] as const, accent: '#33E0B5', shadow: 'rgba(6, 95, 70, 0.7)' },
  { gradient: ['#1E40AF', '#0F172A'] as const, accent: '#60A5FA', shadow: 'rgba(30, 64, 175, 0.7)' },
  { gradient: ['#831843', '#4A044E'] as const, accent: '#F472B6', shadow: 'rgba(131, 24, 67, 0.7)' },
] as const;

export function bankCardTheme(index: number) {
  return bankCardThemes[((index % bankCardThemes.length) + bankCardThemes.length) % bankCardThemes.length];
}

/** Type scale. Money uses `data`; everything else uses the body sizes. */
export const typography = {
  display: { fontFamily: "Inter_700Bold", fontSize: 28, lineHeight: 34 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 20, lineHeight: 26 },
  heading: { fontFamily: "Inter_600SemiBold", fontSize: 16, lineHeight: 22 },
  body: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  micro: { fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 15 },
  /** Amounts. Tabular figures so columns of naira line up. */
  data: { fontFamily: "SpaceMono_400Regular", fontSize: 15 },
  dataLarge: { fontFamily: "SpaceMono_700Bold", fontSize: 30 },
} as const;

/** 4pt grid. Use these rather than arbitrary numbers. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

/** React Navigation's dark theme, wearing our palette. */
export const navigationTheme = {
  dark: true,
  colors: {
    primary: colors.signal.base,
    background: colors.ledger.base,
    card: colors.ledger.raised,
    text: colors.ink.base,
    border: colors.ledger.line,
    notification: colors.status.fail,
  },
} as const;
