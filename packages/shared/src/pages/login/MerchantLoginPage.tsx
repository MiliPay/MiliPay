import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  KeyRound,
  Mail,
  ShieldCheck,
  AlertTriangle,
  UserCheck,
  Headphones,
  Building2,
  Cpu,
  ExternalLink,
} from "lucide-react";
import { Input } from "@milipay/shared/components/ui/Input";
import { Button } from "@milipay/shared/components/ui/Button";
import { Card } from "@milipay/shared/components/ui/Card";
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
  portalBadge: string;
  badgeClass: string;
  iconColor: string;
  glowColor: string;
  title: string;
  description: string;
  emailPlaceholder: string;
  roleNotice: string;
  roleNoticeBg: string;
  terminalHint: string;
}

const PORTAL_META: Record<PortalType, PortalMetadata> = {
  agent: {
    name: "Agent Portal",
    portalBadge: "AGENT PORTAL",
    badgeClass: "bg-signal/15 text-signal-bright border-signal/30",
    iconColor: "text-signal-bright",
    glowColor: "rgba(0, 200, 150, 0.15)",
    title: "Sign in",
    description: "Register customers, capture biometrics and submit enrolments for approval.",
    emailPlaceholder: "you@milipay.app",
    roleNotice: "Enrolment needs a palm scanner connected to this device.",
    roleNoticeBg: "bg-signal/10 border-signal/20 text-signal-bright",
    terminalHint: "Agent Portal",
  },
  admin: {
    name: "Admin Panel",
    portalBadge: "ADMIN",
    badgeClass: "bg-status-warn/15 text-status-warn border-status-warn/30",
    iconColor: "text-status-warn",
    glowColor: "rgba(255, 180, 84, 0.15)",
    title: "Sign in",
    description: "Approve enrolments, manage merchants and staff, and resolve payments that need a decision.",
    emailPlaceholder: "you@milipay.app",
    roleNotice: "Every action here is recorded against your account.",
    roleNoticeBg: "bg-status-warn/10 border-status-warn/20 text-status-warn",
    terminalHint: "Admin Panel",
  },
  support: {
    name: "Service Portal",
    portalBadge: "SUPPORT",
    badgeClass: "bg-status-info/15 text-status-info border-status-info/30",
    iconColor: "text-status-info",
    glowColor: "rgba(59, 130, 246, 0.15)",
    title: "Sign in",
    description: "Answer customer chats, work the ticket queue and escalate what you cannot resolve.",
    emailPlaceholder: "you@milipay.app",
    roleNotice: "For the support team.",
    roleNoticeBg: "bg-status-info/10 border-status-info/20 text-status-info",
    terminalHint: "Service Portal",
  },
  merchant: {
    name: "Merchant Portal",
    portalBadge: "MERCHANT",
    badgeClass: "bg-status-ok/15 text-status-ok border-status-ok/30",
    iconColor: "text-status-ok",
    glowColor: "rgba(51, 224, 181, 0.15)",
    title: "Sign in",
    description: "See your sales, your terminals and what has been settled to your account.",
    emailPlaceholder: "you@yourbusiness.com",
    roleNotice: "For registered merchants.",
    roleNoticeBg: "bg-status-ok/10 border-status-ok/20 text-status-ok",
    terminalHint: "Merchant Portal",
  },
};

const PORTAL_LINKS: Array<{ type: PortalType; label: string; port: string }> = [
  { type: "agent", label: "Field Agent", port: "3001" },
  { type: "support", label: "Support Desk", port: "3002" },
  { type: "admin", label: "Admin Console", port: "3000" },
  { type: "merchant", label: "Merchant Hub", port: "3003" },
];

export default function LoginPage({ portal }: LoginPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        description="Checking your account."
      />
    );
  }

  const renderPortalIcon = () => {
    switch (activePortal) {
      case "agent":
        return <UserCheck className="w-6 h-6 text-signal-bright" />;
      case "admin":
        return <ShieldCheck className="w-6 h-6 text-status-warn" />;
      case "support":
        return <Headphones className="w-6 h-6 text-status-info" />;
      case "merchant":
        return <Building2 className="w-6 h-6 text-status-ok" />;
    }
  };

  const handlePortalSwitch = (targetPort: string) => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.port = targetPort;
      url.pathname = "/login";
      window.location.href = url.toString();
    }
  };

  return (
    <div className="min-h-screen w-full bg-ledger text-ink flex flex-col lg:grid lg:grid-cols-12 overflow-x-hidden">
      {/* LEFT SIDE: 3D Isometric Visual Showcase (7 columns on desktop) */}
      <div className="w-full lg:col-span-7 h-[420px] sm:h-[480px] lg:h-auto min-h-full relative overflow-hidden bg-ledger-surface/40">
        <Portal3DShowcase portal={activePortal} />
      </div>

      {/* RIGHT SIDE: Authenticated Sign-In Console (5 columns on desktop) */}
      <div className="w-full lg:col-span-5 flex flex-col justify-between p-6 sm:p-10 lg:p-12 xl:p-14 relative z-10 bg-ledger">
        {/* Ambient background glow behind form */}
        <div
          className="absolute top-1/3 right-1/4 w-80 h-80 rounded-full blur-[120px] pointer-events-none opacity-40"
          style={{ background: meta.glowColor }}
        />

        {/* Top Identification Banner */}
        <div className="flex items-center justify-between gap-2 mb-6">
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold uppercase tracking-wider border shadow-sm ${meta.badgeClass}`}
          >
            {renderPortalIcon()}
            <span>{meta.portalBadge}</span>
          </div>

          <span className="text-[11px] text-ink-faint">
            {meta.name}
          </span>
        </div>

        {/* Center Login Card Container */}
        <div className="my-auto max-w-md w-full mx-auto">
          {/* Mobile Brand Logo Banner */}
          <div className="flex lg:hidden justify-center mb-5">
            <div className="inline-flex items-center justify-center px-5 py-2.5 bg-white rounded-2xl shadow-md border border-white/20">
              <img src="/logo.png" alt="MiliPay" className="h-8 w-auto object-contain" />
            </div>
          </div>

          <Card
            raised
            className="p-8 sm:p-9 border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl relative z-10"
          >
            {/* Header Identity */}
            <div className="flex items-center gap-3.5 mb-5">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center border shadow-inner"
                style={{
                  background: `${meta.glowColor}`,
                  borderColor: "rgba(255, 255, 255, 0.12)",
                }}
              >
                {renderPortalIcon()}
              </div>
              <div>
                <h1 className="text-xl font-display font-bold text-white tracking-tight">
                  {meta.title}
                </h1>
                <p className="text-xs text-ink-muted leading-tight">
                  {meta.description}
                </p>
              </div>
            </div>

            {/* Role Notice Prompt */}
            <div
              className={`mb-6 p-3 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 ${meta.roleNoticeBg}`}
            >
              <Cpu className="w-4 h-4 shrink-0 mt-0.5 opacity-80" />
              <span>{meta.roleNotice}</span>
            </div>

            {error && (
              <div className="mb-6 flex items-center gap-3 p-3 rounded-xl bg-status-fail/10 border border-status-fail/20 text-status-fail text-sm">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="relative">
                <Mail className="absolute left-4 top-[42px] w-[18px] h-[18px] text-ink-faint pointer-events-none" />
                <Input
                  label="Email"
                  type="email"
                  placeholder={meta.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-11"
                  disabled={!!lockoutTime || isSubmitting}
                />
              </div>

              <div className="relative">
                <KeyRound className="absolute left-4 top-[42px] w-[18px] h-[18px] text-ink-faint pointer-events-none" />
                <Input
                  label="Password"
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-11"
                  disabled={!!lockoutTime || isSubmitting}
                />
              </div>

              <Button
                type="submit"
                size="lg"
                isLoading={isSubmitting}
                disabled={!!lockoutTime}
                className="w-full mt-2 font-semibold shadow-lg"
              >
                {lockoutTime ? `Locked — try again in ${lockoutCountdown}s` : "Sign in"}
              </Button>
            </form>

            {/* Terminal hardware hint */}
            <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-ink-muted">
              <span className="truncate">{meta.terminalHint}</span>
              <span className="flex items-center gap-1 text-signal shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-signal animate-ping" />
                Online
              </span>
            </div>
          </Card>
        </div>

        {/* Bottom Cross-Portal Switcher & Regulatory Footnote */}
        <div className="mt-8 pt-6 border-t border-white/[0.06] flex flex-col gap-4">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-faint block mb-2">
              Other portals
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PORTAL_LINKS.map((p) => {
                const isCurrent = p.type === activePortal;
                return (
                  <button
                    key={p.type}
                    type="button"
                    onClick={() => handlePortalSwitch(p.port)}
                    disabled={isCurrent}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center justify-between border ${
                      isCurrent
                        ? "bg-white/[0.08] text-white border-white/[0.2] font-semibold cursor-default"
                        : "bg-white/[0.02] text-ink-muted border-white/[0.05] hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <span>{p.label}</span>
                    {isCurrent ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-signal" />
                    ) : (
                      <ExternalLink className="w-3 h-3 opacity-40" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-ink-faint gap-2">
            <span>Biometric data is held in Nigeria and never leaves MiliPay infrastructure.</span>
            <span>MiliPay Financial Switch v2.4</span>
          </div>
        </div>
      </div>
    </div>
  );
}