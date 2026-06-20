import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Role, StaffUser } from "@/types";

interface AuthContextValue {
  user: StaffUser | null;
  isAuthenticated: boolean;
  login: (user: StaffUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SESSION_KEY = "biopay.session";

function readStoredUser(): StaffUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StaffUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(readStoredUser);

  const login = useCallback((nextUser: StaffUser) => {
    setUser(nextUser);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextUser));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, login, logout }),
    [user, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

/** Resolves a mock role from login input. Replace with real auth call. */
export function resolveMockRole(phoneInput: string): Role {
  if (phoneInput === "admin") return "admin";
  if (phoneInput === "super") return "super_admin";
  return "agent";
}