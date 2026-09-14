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
  statement: string;
}

const PORTAL_CONFIGS: Record<PortalType, PortalConfig> = {
  agent: {
    portalLabel: "Field Agent Network",
    badgeColor: "text-signal bg-signal/10 border-signal/20",
    badgeDot: "bg-signal",
    headline: "Biometric onboarding at the point of contact.",
    description:
      "Equipped for handheld palm vein capture, instant identity verification, and on-site merchant terminal deployment in the field.",
    statement:
      "Empowering Field Agents to register customers, onboard merchants, and resolve walk-in cases on-site with sub-second palm verification.",
  },
  admin: {
    portalLabel: "Central Governance Console",
    badgeColor: "text-status-warn bg-status-warn/10 border-status-warn/20",
    badgeDot: "bg-status-warn",
    headline: "Unified financial switch governance & risk.",
    description:
      "Supervisory oversight over merchant KYB reviews, POS hardware fleet security, and master settlement ledgers.",
    statement:
      "Providing executive clearance, compliance monitoring, and master ledger auditing across the entire MiliPay ecosystem.",
  },
  support: {
    portalLabel: "Customer Care Switch",
    badgeColor: "text-status-info bg-status-info/10 border-status-info/20",
    badgeDot: "bg-status-info",
    headline: "Omnichannel customer resolution & care.",
    description:
      "Dedicated support console for handling real-time mobile customer chat queues and two-tier ticket escalations.",
    statement:
      "Connecting support staff directly with customers to provide rapid assistance and seamless dispute resolution.",
  },
  merchant: {
    portalLabel: "Merchant Store Console",
    badgeColor: "text-status-ok bg-status-ok/10 border-status-ok/20",
    badgeDot: "bg-status-ok",
    headline: "Real-time store sales & smart POS management.",
    description:
      "Track daily customer transactions, monitor connected smart terminal health, and audit automated Mono DirectPay settlements.",
    statement:
      "Delivering instant split settlements, smart POS terminal management, and clear revenue insights for retail stores.",
  },
};

export function Portal3DShowcase({ portal }: Portal3DShowcaseProps) {
  const cfg = PORTAL_CONFIGS[portal] || PORTAL_CONFIGS.agent;

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

      {/* Center Showcase: Clean, Confident Typography */}
      <div className="relative z-10 my-auto py-12 max-w-lg">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold text-white tracking-tight leading-[1.15]">
          {cfg.headline}
        </h1>
        <p className="mt-5 text-base sm:text-lg text-ink-muted leading-relaxed">
          {cfg.description}
        </p>

        <div className="mt-8 pt-8 border-t border-white/[0.08]">
          <p className="text-sm text-ink-faint leading-relaxed italic">
            "{cfg.statement}"
          </p>
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

