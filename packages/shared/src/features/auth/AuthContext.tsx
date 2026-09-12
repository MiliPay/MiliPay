import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Role, StaffUser } from "@milipay/shared/types";
import { supabase } from "@milipay/shared/lib/supabase";

interface AuthContextValue {
  user: StaffUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoggingOut: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children, allowedRoles }: { children: ReactNode, allowedRoles?: Role[] }) {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Initialize session and listen for auth state changes
  useEffect(() => {
    let isMounted = true;
    let initialResolutionDone = false;

    async function initSession() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (error) {
          console.warn("Session retrieval warning:", error);
          setUser(null);
          setIsLoading(false);
          return;
        }

        if (session?.user) {
          await mapSupabaseUser(session.user);
        } else {
          setUser(null);
          setIsLoading(false);
        }
      } catch (err) {
        console.warn("Session initialization error:", err);
        if (isMounted) {
          setUser(null);
          setIsLoading(false);
        }
      } finally {
        if (isMounted) {
          initialResolutionDone = true;
        }
      }
    }

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;

        // Ignore initial event to prevent pre-empting the in-flight initSession()
        if (!initialResolutionDone && event === "INITIAL_SESSION") {
          return;
        }

        if (session?.user) {
          await mapSupabaseUser(session.user);
        } else {
          setUser(null);
          setIsLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function mapSupabaseUser(supabaseUser: any) {
    let role = supabaseUser.app_metadata?.role as Role;
    let fullName = supabaseUser.user_metadata?.full_name;
    let phone = supabaseUser.phone;

    const cacheKey = `milipay_staff_profile_${supabaseUser.id}`;

    // 1. Check instant local cache for snappy zero-delay restoration
    if (!role) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.role) role = parsed.role;
          if (parsed.full_name) fullName = fullName || parsed.full_name;
          if (parsed.phone) phone = phone || parsed.phone;
        }
      } catch (_) {}
    }

    // 2. Fallback query to staff_profiles by id or email if still not determined
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
        } else {
          // Check merchants table if this user is a store merchant
          const { data: merchantRecord } = await supabase
            .from('merchants')
            .select('business_name, director_name, director_phone')
            .or(`auth_user_id.eq.${supabaseUser.id},email.ilike.${supabaseUser.email}`)
            .maybeSingle();

          if (merchantRecord) {
            role = 'merchant';
            fullName = fullName || merchantRecord.director_name || merchantRecord.business_name;
            phone = phone || merchantRecord.director_phone;
          }
        }
      } catch (err) {
        console.warn("Could not fetch profile role fallback:", err);
      }
    }

    // 3. Cache the resolved staff profile locally for instant hydration on page reloads
    if (role) {
      try {
        localStorage.setItem(
          cacheKey,
          JSON.stringify({ role, full_name: fullName, phone })
        );
      } catch (_) {}
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
    setIsLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("Supabase signOut error:", err);
    } finally {
      try {
        for (const key of Object.keys(localStorage)) {
          if (
            key.startsWith("sb-") ||
            key.includes("supabase.auth") ||
            key.includes("milipay")
          ) {
            localStorage.removeItem(key);
          }
        }
        sessionStorage.clear();
      } catch (_) {}
      setUser(null);
      setIsLoggingOut(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, isLoading, isLoggingOut, login, logout }),
    [user, isLoading, isLoggingOut, login, logout]
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