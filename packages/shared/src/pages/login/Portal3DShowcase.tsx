import React from "react";
import {
  Smartphone,
  Shield,
  Headphones,
  Store,
  Activity,
} from "lucide-react";

export type PortalType = "agent" | "admin" | "support" | "merchant";

interface Portal3DShowcaseProps {
  portal: PortalType;
}

interface PortalConfig {
  portalLabel: string;
  badgeColor: string;
  badgeDot: string;
  headline: string;
  description: string;
  cardTitle: string;
  cardBadge: string;
  cardBadgeColor: string;
  icon: React.ComponentType<{ className?: string }>;
  metrics: Array<{ label: string; value: string }>;
}

const PORTAL_CONFIGS: Record<PortalType, PortalConfig> = {
  agent: {
    portalLabel: "Field Agent Network",
    badgeColor: "text-signal bg-signal/10 border-signal/20",
    badgeDot: "bg-signal",
    headline: "Biometric onboarding at the point of contact.",
    description:
      "Equipped for handheld palm vein capture, instant identity verification, and on-site merchant terminal deployment in the field.",
    cardTitle: "Field Terminal Telemetry",
    cardBadge: "Ready for Scan",
    cardBadgeColor: "text-signal bg-signal/10 border-signal/25",
    icon: Smartphone,
    metrics: [
      { label: "Match Speed", value: "< 200ms" },
      { label: "Vein Sensor", value: "NIR Dual-Lens" },
      { label: "Hardware Model", value: "HF-FP08PV" },
      { label: "Encryption", value: "Local RAM Bytea" },
    ],
  },
  admin: {
    portalLabel: "Central Governance Console",
    badgeColor: "text-status-warn bg-status-warn/10 border-status-warn/20",
    badgeDot: "bg-status-warn",
    headline: "Unified financial switch governance & risk.",
    description:
      "Supervisory oversight over merchant KYB reviews, POS hardware fleet security, and master settlement ledgers.",
    cardTitle: "Switch Governance Telemetry",
    cardBadge: "Operational",
    cardBadgeColor: "text-status-warn bg-status-warn/10 border-status-warn/25",
    icon: Shield,
    metrics: [
      { label: "Financial Switch", value: "Active • 99.99%" },
      { label: "Hardware Fleet", value: "Encrypted & Paired" },
      { label: "Settlement Split", value: "Automated 98.5 / 1.5" },
      { label: "Audit Trails", value: "NDPA Compliant" },
    ],
  },
  support: {
    portalLabel: "Customer Care Switch",
    badgeColor: "text-status-info bg-status-info/10 border-status-info/20",
    badgeDot: "bg-status-info",
    headline: "Omnichannel customer resolution & care.",
    description:
      "Dedicated support console for handling real-time mobile customer chat queues and two-tier ticket escalations.",
    cardTitle: "Live Support Telemetry",
    cardBadge: "Queue Active",
    cardBadgeColor: "text-status-info bg-status-info/10 border-status-info/25",
    icon: Headphones,
    metrics: [
      { label: "Live Chat Switch", value: "Connected" },
      { label: "Dispute Flow", value: "Two-Tier Formal" },
      { label: "Escalations", value: "Direct to Admin" },
      { label: "Account Lookup", value: "Verified NIBSS" },
    ],
  },
  merchant: {
    portalLabel: "Merchant Store Console",
    badgeColor: "text-status-ok bg-status-ok/10 border-status-ok/20",
    badgeDot: "bg-status-ok",
    headline: "Real-time store sales & smart POS telemetry.",
    description:
      "Track daily customer transactions, monitor connected smart terminal health, and audit automated Mono DirectPay settlements.",
    cardTitle: "Store POS Telemetry",
    cardBadge: "Terminal Online",
    cardBadgeColor: "text-status-ok bg-status-ok/10 border-status-ok/25",
    icon: Store,
    metrics: [
      { label: "Settlement Rate", value: "98.5% Split" },
      { label: "Disbursement", value: "Instant T+0 / EOD" },
      { label: "POS Terminal", value: "HF-HP605PV" },
      { label: "Direct Debit", value: "Mono DirectPay" },
    ],
  },
};

export function Portal3DShowcase({ portal }: Portal3DShowcaseProps) {
  const cfg = PORTAL_CONFIGS[portal] || PORTAL_CONFIGS.agent;
  const IconComponent = cfg.icon;

  return (
    <div className="relative w-full h-full min-h-full flex flex-col justify-between p-8 sm:p-12 lg:p-16 bg-[#070B09] border-r border-white/[0.06] overflow-hidden select-none">
      {/* Subtle Atmospheric Gradient Light */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-signal/10 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-signal/5 rounded-full blur-3xl pointer-events-none translate-x-1/3 translate-y-1/3" />

      {/* Top Header: Official Brand Logo & Refined Portal Badge */}
      <div className="relative z-10 flex items-center justify-between gap-4">
        <div className="flex items-center">
          <img
            src="/logo-white.png"
            alt="MiliPay"
            className="h-9 sm:h-10 w-auto object-contain"
          />
        </div>

        <div
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${cfg.badgeColor}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.badgeDot}`} />
          <span>{cfg.portalLabel}</span>
        </div>
      </div>

      {/* Center Showcase: Clean Typography & Telemetry Card */}
      <div className="relative z-10 my-auto py-12 max-w-lg">
        {/* Authoritative Headline & Subtext */}
        <h1 className="text-3xl sm:text-4xl font-display font-semibold text-white tracking-tight leading-[1.2]">
          {cfg.headline}
        </h1>
        <p className="mt-4 text-base text-ink-muted leading-relaxed">
          {cfg.description}
        </p>

        {/* Bespoke Dark Telemetry Card */}
        <div className="mt-10 rounded-2xl bg-white/[0.03] border border-white/[0.08] p-6 backdrop-blur-sm shadow-xl">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-white">
                <IconComponent className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium text-white">
                {cfg.cardTitle}
              </span>
            </div>

            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border ${cfg.cardBadgeColor}`}
            >
              <Activity className="w-3 h-3 animate-pulse" />
              <span>{cfg.cardBadge}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {cfg.metrics.map((m, idx) => (
              <div key={idx} className="flex flex-col">
                <span className="text-xs text-ink-faint font-medium">
                  {m.label}
                </span>
                <span className="text-sm font-mono text-ink mt-0.5">
                  {m.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Quiet Footer */}
      <div className="relative z-10 pt-6 border-t border-white/[0.06] flex items-center justify-between text-xs text-ink-faint">
        <span>© 2026 MiliPay Technologies Ltd.</span>
        <span>Secure Biometric Infrastructure</span>
      </div>
    </div>
  );
}

