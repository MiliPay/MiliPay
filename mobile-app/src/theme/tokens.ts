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
