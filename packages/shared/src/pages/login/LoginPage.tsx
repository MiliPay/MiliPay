import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Copy, Lock, Mail, ScrollText, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { useAuth, type MfaEnrolment } from "@milipay/shared/features/auth/AuthContext";
import { loginSchema } from "@milipay/shared/features/auth/authSchema";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { ROUTES } from "@milipay/shared/lib/constants";
import { supabase } from "@milipay/shared/lib/supabase";
import type { Portal } from "@milipay/shared/lib/theme";
import { Logo } from "@milipay/shared/components/layout/AppShell";

/**
 * Staff sign-in (design handoff, admin and support "Sign in"): a green panel
 * with what the portal is for, and the form. Step 1 is email and password;
 * step 2 is the 6-digit code from an authenticator app. Someone who must use
 * two-factor sign-in but has not set it up does that here first.
 */

const COPY: Record<Portal, { eyebrow: string; title: string; body: string; foot: string }> = {
  admin: {
    eyebrow: "Admin console",
    title: "Run the MiliPay network from one place.",
    body: "Payments, customers, merchants and terminals, with a full record of who did what.",
    foot: "Access is limited to super admins and admins.",
  },
  support: {
    eyebrow: "Support portal",
    title: "Help customers fast, with the full picture.",
    body: "Chats, calls and emails in one inbox, with each customer's payments and history beside the conversation.",
    foot: "For support agents and super admins only.",
  },
  agent: {
    eyebrow: "Agent portal",
    title: "Register customers where they are.",
    body: "Check a customer's NIN, capture their palm and face, and send the registration for review.",
    foot: "For field agents and super admins only.",
  },
};

export default function LoginPage({ portal }: { portal: Portal }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, isLoading, mfaStep, login, verifyCode, startEnrolment, finishEnrolment, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [enrolment, setEnrolment] = useState<MfaEnrolment | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const copy = COPY[portal];
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || ROUTES.dashboard;

  // Whether two-factor sign-in is on, so the panel only claims it when true.
  useEffect(() => {
    let live = true;
    supabase.rpc("staff_sign_in_rules").then(({ data, error: e }) => {
      if (live && !e) setMfaRequired(Boolean((data as { mfaRequired?: boolean } | null)?.mfaRequired));
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate(from, { replace: true });
  }, [isAuthenticated, isLoading, navigate, from]);

  // Someone who must set up an authenticator gets a QR code to scan.
  useEffect(() => {
    if (mfaStep !== "enroll" || enrolment) return;
    startEnrolment()
      .then(setEnrolment)
      .catch((e: Error) => setError(e.message));
  }, [mfaStep, enrolment, startEnrolment]);

  useEffect(() => {
    if (!lockedUntil) return;
    const t = setTimeout(() => {
      setLockedUntil(null);
      setFailures(0);
      setError(null);
    }, lockedUntil - Date.now());
    return () => clearTimeout(t);
  }, [lockedUntil]);

  const step: "password" | "verify" | "enroll" = !user ? "password" : mfaStep === "enroll" ? "enroll" : "verify";

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy || lockedUntil) return;
    setError(null);
    setNotice(null);

    if (step === "password") {
      let creds: { email: string; password: string };
      try {
        creds = loginSchema.parse({ email, password });
      } catch (err) {
        setError(err instanceof z.ZodError ? err.issues[0].message : "Check your email and password.");
        return;
      }
      setBusy(true);
      try {
        await login(creds.email, creds.password);
        setFailures(0);
      } catch (err) {
        const n = failures + 1;
        setFailures(n);
        if (n >= 3) {
          setLockedUntil(Date.now() + 30_000);
          setError("Too many failed attempts. Try again in 30 seconds.");
        } else {
          setError(err instanceof Error && /invalid/i.test(err.message) ? "That email and password don't match." : err instanceof Error ? err.message : "Could not sign in.");
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    if (code.length !== 6) {
      setError("Enter all 6 digits.");
      return;
    }
    setBusy(true);
    try {
      if (step === "enroll") {
        if (!enrolment) throw new Error("The QR code is still loading.");
        await finishEnrolment(enrolment.factorId, code);
      } else {
        await verifyCode(code);
      }
    } catch (err) {
      setCode("");
      setError(err instanceof Error ? err.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const differentAccount = async () => {
    setCode("");
    setError(null);
    setEnrolment(null);
    await logout();
  };

  if (isLoading || (busy && step === "password")) return <LoadingState fullScreen title="Signing in" />;

  return (
    <div className="fixed inset-0 z-[95] grid animate-fade-in grid-cols-1 bg-canvas text-[14px] text-fg lg:grid-cols-2">
      <div className="relative hidden flex-col overflow-hidden bg-[radial-gradient(120%_90%_at_20%_20%,#0a7a5a_0%,#065f46_40%,#022c22_80%,#011a14_100%)] px-14 py-12 text-[#fff] lg:flex">
        <div className="absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full border border-[rgba(51,224,181,.14)]" />
        {portal !== "support" && <div className="absolute -bottom-[60px] -right-[60px] h-80 w-80 rounded-full border border-[rgba(51,224,181,.2)]" />}
        <img src="/brand/logo-white.png" alt="MiliPay" className="h-[34px] w-auto self-start" />
        <div className="flex max-w-[460px] flex-1 flex-col justify-center gap-4">
          <div className="text-xs font-bold uppercase tracking-[.12em] text-[#33E0B5]">{copy.eyebrow}</div>
          <div className="text-[40px] font-bold leading-[1.1] tracking-[-.03em]">{copy.title}</div>
          <div className="text-base leading-[1.55] opacity-80">{copy.body}</div>
        </div>
        <div className="flex flex-col gap-2.5 text-[13px] opacity-85">
          {mfaRequired && (
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={16} aria-hidden="true" />
              Two-factor sign-in is required for all staff
            </div>
          )}
          <div className="flex items-center gap-2.5">
            <ScrollText size={16} aria-hidden="true" />
            Every sign-in and action is recorded in the audit log
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center overflow-y-auto p-6 sm:p-10">
        <form onSubmit={submit} className="flex w-full max-w-[380px] flex-col gap-[18px]" noValidate>
          <div className="self-start lg:hidden">
            <Logo className="h-8" />
          </div>

          {step === "password" && (
            <>
              <div>
                <h1 className="text-[26px] font-bold tracking-[-.02em]">Sign in</h1>
                <div className="mt-1.5 text-muted">Use your MiliPay staff email.</div>
              </div>
              <Field label="Work email" icon={<Mail size={16} />}>
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  placeholder="name@milipay.ng"
                  className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none"
                />
              </Field>
              <Field
                label="Password"
                icon={<Lock size={16} />}
                aside={
                  <button
                    type="button"
                    onClick={() => setNotice("Ask a super admin to reset your password.")}
                    className="text-xs font-semibold text-brand-text"
                  >
                    Forgot password?
                  </button>
                }
              >
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="••••••••"
                  className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none"
                />
              </Field>
            </>
          )}

          {step === "verify" && (
            <>
              <div>
                <h1 className="text-[26px] font-bold tracking-[-.02em]">Two-factor code</h1>
                <div className="mt-1.5 leading-normal text-muted">
                  Enter the 6-digit code from your authenticator app for <b className="text-fg">{user?.email}</b>.
                </div>
              </div>
              <CodeBoxes value={code} onChange={(v) => { setCode(v); setError(null); }} />
              <button type="button" onClick={() => void differentAccount()} className="w-max text-[13px] font-semibold text-muted">
                Use a different account
              </button>
            </>
          )}

          {step === "enroll" && (
            <>
              <div>
                <h1 className="text-[26px] font-bold tracking-[-.02em]">Set up two-factor sign-in</h1>
                <div className="mt-1.5 leading-normal text-muted">
                  Scan this code with an authenticator app such as Google Authenticator or Microsoft Authenticator, then enter the
                  6-digit code it shows. You'll need it every time you sign in.
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex h-[148px] w-[148px] flex-none items-center justify-center rounded-xl border border-line bg-[#fff] p-2">
                  {enrolment ? <img src={enrolment.qrCode} alt="QR code for your authenticator app" className="h-full w-full" /> : null}
                </div>
                {enrolment && (
                  <div className="min-w-0 text-xs text-muted">
                    Can't scan it? Type this key into the app instead:
                    <div className="mt-1.5 flex items-start gap-1.5">
                      <span className="break-all font-mono text-[13px] font-semibold text-fg">{enrolment.secret}</span>
                      <button
                        type="button"
                        aria-label="Copy the key"
                        onClick={() => void navigator.clipboard?.writeText(enrolment.secret).then(() => setNotice("Key copied."))}
                        className="flex-none text-faint hover:text-fg"
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <CodeBoxes value={code} onChange={(v) => { setCode(v); setError(null); }} />
              <button type="button" onClick={() => void differentAccount()} className="w-max text-[13px] font-semibold text-muted">
                Use a different account
              </button>
            </>
          )}

          {error && <div className="rounded-[10px] bg-fail-soft px-3 py-2.5 text-[13px] text-fail" role="alert">{error}</div>}
          {notice && !error && <div className="rounded-[10px] bg-chip px-3 py-2.5 text-[13px] text-muted">{notice}</div>}

          <button
            type="submit"
            disabled={busy || Boolean(lockedUntil)}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-60"
          >
            {step === "password" ? "Continue" : step === "enroll" ? "Verify and finish" : busy ? "Checking…" : "Verify and sign in"}
          </button>
          <div className="text-center text-xs text-faint">{copy.foot}</div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, icon, aside, children }: { label: string; icon: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex justify-between">
        <span className="text-xs font-semibold text-muted">{label}</span>
        {aside}
      </span>
      <span className="flex h-[46px] items-center gap-2.5 rounded-xl border border-line bg-panel px-3.5 text-faint focus-within:border-brand">
        {icon}
        {children}
      </span>
    </label>
  );
}

/** Six boxes over one invisible input, so paste and one-time-code autofill work. */
function CodeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative grid grid-cols-6 gap-2">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`flex h-14 items-center justify-center rounded-xl border-[1.5px] bg-panel font-mono text-[22px] font-bold ${
            i === value.length ? "border-brand" : "border-line"
          }`}
        >
          {value[i] ?? ""}
        </div>
      ))}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        aria-label="6-digit code"
        className="absolute inset-0 cursor-text opacity-0"
      />
    </div>
  );
}
