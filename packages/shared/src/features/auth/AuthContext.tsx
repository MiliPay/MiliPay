import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Role, StaffUser } from "@milipay/shared/types";
import { supabase } from "@milipay/shared/lib/supabase";
import { logAudit } from "@milipay/shared/features/audit/api";

/**
 * Where a signed-in person is with their second factor:
 * - "ok": nothing more to do (passed it, or it is not required of them)
 * - "verify": they have an authenticator set up; ask for the 6-digit code
 * - "enroll": it is required and they have none yet; set one up now
 */
export type MfaStep = "ok" | "verify" | "enroll";

export interface MfaEnrolment {
  factorId: string;
  /** SVG data URL of the QR code to scan. */
  qrCode: string;
  /** The same secret as text, for typing in by hand. */
  secret: string;
}

interface AuthContextValue {
  user: StaffUser | null;
  /** Signed in and through any second factor. */
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoggingOut: boolean;
  mfaStep: MfaStep;
  login: (email: string, password: string) => Promise<void>;
  verifyCode: (code: string) => Promise<void>;
  startEnrolment: () => Promise<MfaEnrolment>;
  finishEnrolment: (factorId: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  allowedRoles?: Role[];
  /** Staff portals ask for a second factor; the merchant portal does not. */
  staffMfa?: boolean;
  /** How this portal reads in the audit log: "Admin console". */
  auditTarget?: string;
}

/** Keys that outlive a sign-out: the theme is the browser's, not the person's. */
const KEEP_ON_SIGN_OUT = /^milipay\.theme\./;

export function AuthProvider({ children, allowedRoles, staffMfa = false, auditTarget }: AuthProviderProps) {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [mfaStep, setMfaStep] = useState<MfaStep>("ok");
  // Set by login() so the sign-in is recorded once, not on every page load.
  const freshSignIn = useRef(false);

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
      (event, session) => {
        if (!isMounted) return;

        // Ignore initial event to prevent pre-empting the in-flight initSession()
        if (!initialResolutionDone && event === "INITIAL_SESSION") {
          return;
        }

        // Other auth calls inside this callback can deadlock on supabase-js's
        // session lock, so the work runs just after it returns.
        setTimeout(() => {
          if (!isMounted) return;
          if (session?.user) {
            void mapSupabaseUser(session.user);
          } else {
            setUser(null);
            setMfaStep("ok");
            setIsLoading(false);
          }
        }, 0);
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /** Where this session stands with its second factor. */
  async function secondFactorStep(): Promise<MfaStep> {
    if (!staffMfa) return "ok";
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") return "ok";
    if (aal?.nextLevel === "aal2") return "verify";
    // No authenticator yet: needed only while Settings › Security requires it.
    // If the rule cannot be read (not deployed yet), it is not required.
    const { data: rules, error } = await supabase.rpc("staff_sign_in_rules");
    return !error && (rules as { mfaRequired?: boolean } | null)?.mfaRequired ? "enroll" : "ok";
  }

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
      setMfaStep("ok");
      setIsLoading(false);
      return;
    }

    let step: MfaStep = "ok";
    try {
      step = await secondFactorStep();
    } catch (err) {
      // Unknown means unproven: ask for the code rather than wave them in.
      console.warn("Could not read the second-factor state:", err);
      step = "verify";
    }

    setUser({
      id: supabaseUser.id,
      fullName: fullName || "System User",
      email: supabaseUser.email || "",
      phone: phone || "",
      role: role,
    });
    setMfaStep(step);
    setIsLoading(false);

    if (step === "ok" && freshSignIn.current) {
      freshSignIn.current = false;
      if (auditTarget) void logAudit({ category: "Auth", action: "signed in to", target: auditTarget });
    }
  }

  const login = useCallback(async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    freshSignIn.current = true;
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: password.trim(),
    });

    if (error) {
      freshSignIn.current = false;
      throw new Error(error.message);
    }

    if (data.user) {
      await mapSupabaseUser(data.user);
    }
  }, [allowedRoles]);

  /** The verified authenticator this account signs in with. */
  async function verifiedFactorId(): Promise<string> {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw new Error(error.message);
    const factor = data?.totp?.find((f) => f.status === "verified");
    if (!factor) throw new Error("No authenticator is set up for this account.");
    return factor.id;
  }

  async function confirmCode(factorId: string, code: string) {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) {
      if (auditTarget) {
        void logAudit({ category: "Auth", action: "failed sign-in (wrong 2FA code) to", target: auditTarget, result: "denied" });
      }
      throw new Error("That code didn't work. Codes change every 30 seconds.");
    }
    const { data } = await supabase.auth.getUser();
    if (data.user) await mapSupabaseUser(data.user);
  }

  const verifyCode = useCallback(async (code: string) => {
    await confirmCode(await verifiedFactorId(), code);
  }, [auditTarget]);

  const startEnrolment = useCallback(async (): Promise<MfaEnrolment> => {
    // An earlier attempt that was never confirmed would block a new one.
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const f of existing?.all ?? []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "MiliPay staff" });
    if (error || !data) throw new Error(error?.message || "Could not start setting up the authenticator.");
    return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
  }, []);

  const finishEnrolment = useCallback(async (factorId: string, code: string) => {
    await confirmCode(factorId, code);
    if (auditTarget) void logAudit({ category: "Auth", action: "set up two-factor sign-in for", target: auditTarget });
  }, [auditTarget]);

  const logout = useCallback(async () => {
    setIsLoggingOut(true);
    if (auditTarget && mfaStep === "ok") {
      await logAudit({ category: "Auth", action: "signed out of", target: auditTarget });
    }
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("Supabase signOut error:", err);
    } finally {
      try {
        for (const key of Object.keys(localStorage)) {
          if (KEEP_ON_SIGN_OUT.test(key)) continue;
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
      setMfaStep("ok");
      setIsLoggingOut(false);
    }
  }, [auditTarget, mfaStep]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null && mfaStep === "ok",
      isLoading,
      isLoggingOut,
      mfaStep,
      login,
      verifyCode,
      startEnrolment,
      finishEnrolment,
      logout,
    }),
    [user, mfaStep, isLoading, isLoggingOut, login, verifyCode, startEnrolment, finishEnrolment, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
