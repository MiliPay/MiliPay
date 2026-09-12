import React from "react";
import {
  CheckCircle2,
  Lock,
  Smartphone,
  Server,
  Headphones,
  Store,
} from "lucide-react";

export type PortalType = "agent" | "admin" | "support" | "merchant";

interface Portal3DShowcaseProps {
  portal: PortalType;
}

interface PortalConfig {
  name: string;
  badge: string;
  tagline: string;
  description: string;
  accentGlow: string;
  badgeBg: string;
  badgeText: string;
  icon: React.ComponentType<{ className?: string }>;
  highlights: string[];
}

const PORTAL_CONFIGS: Record<PortalType, PortalConfig> = {
  agent: {
    name: "Field Agent Portal",
    badge: "Field Agent Console",
    tagline: "Biometric Field Enrollment",
    description: "Secure handheld terminal interface for roaming customer registrations, merchant pairing, and walk-in support.",
    accentGlow: "rgba(0, 200, 150, 0.18)",
    badgeBg: "bg-signal/15",
    badgeText: "text-signal-bright border-signal/30",
    icon: Smartphone,
    highlights: [
      "HF-FP08PV & VP930Pro Handheld Capture",
      "Sub-200ms Local RAM Vein Matching",
      "CBN & NDPA Certified Biometrics",
    ],
  },
  admin: {
    name: "Admin Panel",
    badge: "Central Supervisory Console",
    tagline: "Supervisory Governance & Risk",
    description: "Master administrative console for KYB compliance, POS terminal fleet lockdown, and master settlement ledgers.",
    accentGlow: "rgba(255, 180, 84, 0.18)",
    badgeBg: "bg-status-warn/15",
    badgeText: "text-status-warn border-status-warn/30",
    icon: Server,
    highlights: [
      "Master KYB & Merchant Lifecycle Control",
      "POS Hardware Inventory & Security Lockdown",
      "Platform Fee (1.5%) & Master Settlement Auditing",
    ],
  },
  support: {
    name: "Service Portal",
    badge: "Customer Care & Live Desk",
    tagline: "Omnichannel Support Switch",
    description: "Digital customer desk handling live mobile chats, dispute verification, and two-tier ticket escalations.",
    accentGlow: "rgba(59, 130, 246, 0.18)",
    badgeBg: "bg-status-info/15",
    badgeText: "text-status-info border-status-info/30",
    icon: Headphones,
    highlights: [
      "Real-Time Mobile Customer Chat Queue",
      "Two-Tier Formal Dispute Architecture",
      "NIN & Linked Account Verification",
    ],
  },
  merchant: {
    name: "Merchant Portal",
    badge: "Merchant Store Manager",
    tagline: "Smart POS & Settlements",
    description: "Retail store portal for tracking customer transactions, monitoring HP605PV terminals, and reviewing payouts.",
    accentGlow: "rgba(51, 224, 181, 0.18)",
    badgeBg: "bg-status-ok/15",
    badgeText: "text-status-ok border-status-ok/30",
    icon: Store,
    highlights: [
      "Live 98.5% Split Settlement Tracking",
      "HFSecurity HP605PV Terminal Telemetry",
      "Automated Mono DirectPay Disbursements",
    ],
  },
};

export function Portal3DShowcase({ portal }: Portal3DShowcaseProps) {
  const cfg = PORTAL_CONFIGS[portal] || PORTAL_CONFIGS.agent;
  const IconComponent = cfg.icon;

  return (
    <div className="relative w-full h-full flex flex-col justify-between p-8 sm:p-12 lg:p-14 bg-ledger-raised/50 border-r border-white/[0.06] overflow-hidden">
      {/* Subtle Ambient Radial Glow */}
      <div
        className="absolute top-1/3 left-1/3 w-[450px] h-[450px] rounded-full blur-[140px] pointer-events-none opacity-50"
        style={{
          background: `radial-gradient(circle, ${cfg.accentGlow} 0%, transparent 70%)`,
        }}
      />

      {/* Top Bar with Status and Portal Badge */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-signal animate-pulse" />
          <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">
            MiliPay Network Active
          </span>
        </div>

        <div
          className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border flex items-center gap-1.5 shadow-sm ${cfg.badgeBg} ${cfg.badgeText}`}
        >
          <IconComponent className="w-3.5 h-3.5" />
          <span>{cfg.badge}</span>
        </div>
      </div>

      {/* Main Center Showcase */}
      <div className="relative z-10 my-auto py-8 max-w-md mx-auto w-full">
        {/* Crisp Card Featuring the Official MiliPay Logo Asset */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center px-6 py-4 bg-white rounded-2xl shadow-[0_10px_35px_rgba(0,0,0,0.35)] border border-white/20">
            <img
              src="/logo.png"
              alt="MiliPay - Payments in Milliseconds"
              className="h-10 sm:h-12 w-auto object-contain"
            />
          </div>
        </div>

        {/* Portal Title & Clear Identity */}
        <h1 className="text-3xl font-display font-bold text-white tracking-tight">
          {cfg.tagline}
        </h1>
        <p className="mt-3 text-sm text-ink-muted leading-relaxed">
          {cfg.description}
        </p>

        {/* 3 Simple Clean Highlights */}
        <div className="mt-8 space-y-3">
          {cfg.highlights.map((text, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
            >
              <div className="w-6 h-6 rounded-lg bg-signal/10 border border-signal/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-signal-bright" />
              </div>
              <span className="text-xs font-medium text-ink tracking-wide">
                {text}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Regulatory / Security Guarantee */}
      <div className="relative z-10 pt-6 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-ink-muted">
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-signal" />
          <span>NDPA Certified Local Data Sovereignty</span>
        </div>
        <span>v2.4</span>
      </div>
    </div>
  );
}

