import { useColorScheme } from 'nativewind';
import { themeColors, type ThemeColors } from './tokens';

/**
 * The active theme's semantic colours, for props a className cannot set: icon
 * `color`, gradient stops, `boxShadow`. Follows NativeWind's colour scheme —
 * the same switch the CSS variables in global.css follow — so the two can
 * never disagree about which theme is showing.
 */
export function useThemeColors(): ThemeColors & { isDark: boolean } {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  return { ...(isDark ? themeColors.dark : themeColors.light), isDark };
}

/** Hex colour at `alpha` (0–1), for the redesign's "same colour at 14%" tints. */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
