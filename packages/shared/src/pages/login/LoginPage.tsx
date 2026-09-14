import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  KeyRound,
  Mail,
  AlertTriangle,
  Eye,
  EyeOff,
  HelpCircle,
} from "lucide-react";
import { Button } from "@milipay/shared/components/ui/Button";
import { Modal } from "@milipay/shared/components/ui/Modal";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { ROUTES } from "@milipay/shared/lib/constants";
import { loginSchema } from "@milipay/shared/features/auth/authSchema";
import { z } from "zod";
import { Portal3DShowcase, type PortalType } from "./Portal3DShowcase";

export interface LoginPageProps {
  portal?: PortalType;
}

interface PortalMetadata {
  name: string;
  badgeLabel: string;
  badgeDot: string;
  badgeColor: string;
  emailPlaceholder: string;
  helpMessage: string;
}

const PORTAL_META: Record<PortalType, PortalMetadata> = {
  agent: {
    name: "Field Agent Portal",
    badgeLabel: "Field Agent Console",
    badgeDot: "bg-signal",
    badgeColor: "text-signal bg-signal/10 border-signal/20",
    emailPlaceholder: "agent@milipay.app",
    helpMessage:
      "Field Agent credentials are centrally provisioned by the MiliPay Operations Admin. If you have forgotten your password or require a PIN reset for field onboarding, please reach out to your operations supervisor.",
  },
  admin: {
    name: "Admin Panel",
    badgeLabel: "Admin Console",
    badgeDot: "bg-status-warn",
    badgeColor: "text-status-warn bg-status-warn/10 border-status-warn/20",
    emailPlaceholder: "admin@milipay.app",
    helpMessage:
      "Admin Panel credentials require master supervisory clearance. If you have lost access, please contact the MiliPay Super Administrator to initiate verified credential recovery.",
  },
  support: {
    name: "Service Portal",
    badgeLabel: "Support Console",
    badgeDot: "bg-status-info",
    badgeColor: "text-status-info bg-status-info/10 border-status-info/20",
    emailPlaceholder: "support@milipay.app",
    helpMessage:
      "Service Portal accounts are assigned to authorized customer care personnel. Please contact your support desk team lead to unlock your account or request a temporary password.",
  },
  merchant: {
    name: "Merchant Portal",
    badgeLabel: "Merchant Hub",
    badgeDot: "bg-status-ok",
    badgeColor: "text-status-ok bg-status-ok/10 border-status-ok/20",
    emailPlaceholder: "store@merchant.com",
    helpMessage:
      "Merchant store accounts are initialized during on-site registration. If you cannot access your store console, please email merchant-support@milipay.app with your Business Name and POS Terminal ID.",
  },
};

export default function LoginPage({ portal }: LoginPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine active portal type (explicit prop > hostname/port heuristic > fallback)
  const activePortal: PortalType = (() => {
    if (portal) return portal;
    if (typeof window !== "undefined") {
      const host = window.location.hostname.toLowerCase();
      const port = window.location.port;
      if (port === "3000" || host.includes("admin")) return "admin";
      if (port === "3001" || host.includes("agent")) return "agent";
      if (port === "3002" || host.includes("service") || host.includes("support")) return "support";
      if (port === "3003" || host.includes("merchant")) return "merchant";
    }
    return "agent";
  })();

  const meta = PORTAL_META[activePortal] || PORTAL_META.agent;

  // Rate limiting state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState<number | null>(null);
  const [lockoutCountdown, setLockoutCountdown] = useState(0);

  const from = (location.state as any)?.from?.pathname || ROUTES.dashboard;

  // Redirect to target or dashboard if already logged in (never redirect while still verifying session)
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, from]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (lockoutTime) {
      timer = setInterval(() => {
        const remaining = Math.ceil((lockoutTime - Date.now()) / 1000);
        if (remaining <= 0) {
          setLockoutTime(null);
          setFailedAttempts(0);
          setLockoutCountdown(0);
        } else {
          setLockoutCountdown(remaining);
        }
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [lockoutTime]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lockoutTime) return;

    setError(null);
    setIsSubmitting(true);

    try {
      // 1. Zod Validation
      const validatedData = loginSchema.parse({ email, password });

      // 2. Auth call
      await login(validatedData.email, validatedData.password);

      // Reset attempts on success
      setFailedAttempts(0);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0].message);
      } else if (err instanceof Error) {
        setError(err.message);

        // Basic Client-side Rate Limiting for Failed Auth
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);
        if (newAttempts >= 3) {
          setError("Too many failed attempts. Try again in 30 seconds.");
          setLockoutTime(Date.now() + 30000);
        }
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // Prevent flash of login form while determining if user already has an active session
  if (isLoading) {
    return (
      <LoadingState
        fullScreen
        title="Securing Session..."
        description="Authenticating staff clearance and establishing session."
      />
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#080C0A] text-ink flex flex-col lg:grid lg:grid-cols-12 overflow-x-hidden">
      {/* LEFT SIDE: Clean Brand Hero Showcase (7 columns on desktop) */}
      <div className="hidden lg:block lg:col-span-7 h-full min-h-screen">
        <Portal3DShowcase portal={activePortal} />
      </div>

      {/* RIGHT SIDE: Authenticated Sign-In Console (5 columns on desktop) */}
      <div className="w-full lg:col-span-5 min-h-screen flex flex-col justify-between p-6 sm:p-10 lg:p-12 xl:p-16 relative bg-[#080C0A]">
        {/* Subtle Ambient Light */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-signal/[0.03] rounded-full blur-3xl pointer-events-none" />

        {/* Mobile Header: Logo & Badge */}
        <div className="lg:hidden flex items-center justify-between pb-6 border-b border-white/[0.06] mb-8">
          <img
            src="/logo-white.png"
            alt="MiliPay"
            className="h-8 w-auto object-contain"
          />
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${meta.badgeColor}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${meta.badgeDot}`} />
            <span>{meta.badgeLabel}</span>
          </div>
        </div>

        {/* Center Login Form Container */}
        <div className="my-auto w-full max-w-[400px] mx-auto py-8">
          {/* Desktop Portal Badge */}
          <div
            className={`hidden lg:inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border mb-6 ${meta.badgeColor}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${meta.badgeDot}`} />
            <span>{meta.badgeLabel}</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-display font-semibold text-white tracking-tight">
            Sign in to your account
          </h1>
          <p className="text-sm text-ink-muted mt-2">
            Enter your credentials to continue to {meta.name}.
          </p>

          {error && (
            <div className="mt-6 flex items-start gap-3 p-3.5 rounded-xl bg-status-fail/10 border border-status-fail/20 text-status-fail text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-ink-muted">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
                <input
                  type="email"
                  required
                  placeholder={meta.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!!lockoutTime || isSubmitting}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-white placeholder:text-ink-faint/60 focus:outline-none focus:border-signal focus:ring-1 focus:ring-signal transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-ink-muted">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowHelpModal(true)}
                  className="text-xs text-ink-faint hover:text-signal transition-colors focus:outline-none"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={!!lockoutTime || isSubmitting}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-white placeholder:text-ink-faint/60 focus:outline-none focus:border-signal focus:ring-1 focus:ring-signal transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink transition-colors p-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-white/20 bg-white/[0.04] text-signal focus:ring-signal focus:ring-offset-0 w-4 h-4"
                />
                <span className="text-xs text-ink-muted">Remember this device</span>
              </label>
            </div>

            <Button
              type="submit"
              size="lg"
              isLoading={isSubmitting}
              disabled={!!lockoutTime}
              className="w-full font-semibold shadow-md mt-2"
            >
              {lockoutTime ? `Locked (${lockoutCountdown}s)` : "Sign in"}
            </Button>
          </form>
        </div>

        {/* Bottom Quiet Footer */}
        <div className="pt-6 border-t border-white/[0.06] text-center">
          <p className="text-xs text-ink-faint">
            Protected by bank-grade biometric encryption & verified clearance.
          </p>
        </div>
      </div>

      {/* Forgot Password Help Modal */}
      <Modal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        title="Account Recovery"
        size="sm"
      >
        <div className="p-6 space-y-4">
          <div className="w-10 h-10 rounded-xl bg-signal/10 border border-signal/20 flex items-center justify-center text-signal">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-medium text-white">
              Password Reset Policy
            </h3>
            <p className="text-xs text-ink-muted leading-relaxed mt-2">
              {meta.helpMessage}
            </p>
          </div>
          <div className="pt-2">
            <Button
              variant="secondary"
              className="w-full text-xs"
              onClick={() => setShowHelpModal(false)}
            >
              Understood
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}