import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";
export type Portal = "admin" | "support" | "agent";

/**
 * Light and dark, per portal and per browser. Each portal's index.html sets
 * `data-theme` from the same key before React loads, so the page never
 * flashes the wrong theme; this keeps it in step after that.
 */
export const themeKey = (portal: Portal) => `milipay.theme.${portal}`;

interface ThemeValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function readSaved(portal: Portal, fallback: Theme): Theme {
  try {
    const saved = localStorage.getItem(themeKey(portal));
    return saved === "light" || saved === "dark" ? saved : fallback;
  } catch {
    return fallback;
  }
}

export function ThemeProvider({
  portal,
  defaultTheme = "light",
  children,
}: {
  portal: Portal;
  defaultTheme?: Theme;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>(() => readSaved(portal, defaultTheme));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t);
      try {
        localStorage.setItem(themeKey(portal), t);
      } catch {
        // Private windows and blocked storage: the choice lasts this visit.
      }
    },
    [portal],
  );

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark") }),
    [theme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
