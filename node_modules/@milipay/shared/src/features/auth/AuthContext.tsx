import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Role, StaffUser } from "@milipay/shared/types";
import { supabase } from "@milipay/shared/lib/supabase";

interface AuthContextValue {
  user: StaffUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children, allowedRoles }: { children: ReactNode, allowedRoles?: Role[] }) {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize session and listen for auth state changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        mapSupabaseUser(session.user);
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          mapSupabaseUser(session.user);
        } else {
          setUser(null);
          setIsLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function mapSupabaseUser(supabaseUser: any) {
    let role = supabaseUser.app_metadata?.role as Role;
    let fullName = supabaseUser.user_metadata?.full_name;
    let phone = supabaseUser.phone;

    // Fallback: If role is not in app_metadata, query staff_profiles by id or email
    if (!role) {
      try {
        const { data: profile } = await supabase
          .from('staff_profiles')
          .select('role, full_name, phone')
          .or(`id.eq.${supabaseUser.id},email.ilike.${supabaseUser.email}`)
          .maybeSingle();

        if (profile) {
          role = profile.role as Role;
          fullName = fullName || profile.full_name;
          phone = phone || profile.phone;
        }
      } catch (err) {
        console.warn("Could not fetch staff profile role fallback:", err);
      }
    }

    // STRICT SECURITY CHECK
    if (allowedRoles && (!role || !allowedRoles.includes(role))) {
      await supabase.auth.signOut(); // Force log them out immediately
      setUser(null);
      setIsLoading(false);
      return;
    }

    setUser({
      id: supabaseUser.id,
      fullName: fullName || "System User",
      email: supabaseUser.email || "",
      phone: phone || "",
      role: role,
    });
    setIsLoading(false);
  }

  const login = useCallback(async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: password.trim(),
    });

    if (error) {
      throw new Error(error.message);
    }
    
    if (data.user) {
      await mapSupabaseUser(data.user);
    }
  }, [allowedRoles]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, isLoading, login, logout }),
    [user, isLoading, login, logout]
  );

  // You might want to return a full-screen loading spinner if isLoading is true
  // but for now we just render children.
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}