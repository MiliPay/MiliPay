import clsx from "clsx";

interface LoadingStateProps {
  title?: string;
  description?: string;
  fullScreen?: boolean;
  minHeight?: string;
  className?: string;
}

export function LoadingState({
  title = "Loading...",
  description = "Please wait while we retrieve the latest information from the secure network.",
  fullScreen = false,
  minHeight = "min-h-[360px]",
  className,
}: LoadingStateProps) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center p-6 text-center select-none",
        fullScreen ? "fixed inset-0 z-50 bg-ledger" : clsx("w-full", minHeight),
        className
      )}
    >
      {/* Brand Holographic / Radar Pulse Container */}
      <div className="relative flex items-center justify-center mb-6">
        {/* Ambient Ring Glow */}
        <div className="absolute w-20 h-20 rounded-full bg-signal/10 blur-xl animate-pulse" />
        
        {/* Pulsing Concentric Radar Rings */}
        <div className="absolute w-16 h-16 rounded-full border border-signal/20 animate-ping opacity-30" />
        <div className="absolute w-12 h-12 rounded-full border border-signal/30 animate-pulse" />

        {/* Central Glowing Icon Emblem */}
        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-b from-ledger-raised to-ledger border border-signal/40 flex items-center justify-center shadow-[0_0_25px_rgba(var(--color-signal),0.35)]">
          <div className="w-5 h-5 rounded-lg bg-signal/20 border border-signal/50 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-signal shadow-[0_0_8px_rgba(var(--color-signal),1)]" />
          </div>
        </div>
      </div>

      {/* Typography */}
      <h3 className="text-base sm:text-lg font-display font-medium text-ink tracking-tight mb-1.5">
        {title}
      </h3>
      {description && (
        <p className="text-xs sm:text-sm text-ink-muted max-w-sm leading-relaxed mb-5">
          {description}
        </p>
      )}

      {/* Shimmer Progress Beam */}
      <div className="w-36 sm:w-48 h-1 bg-white/[0.05] rounded-full overflow-hidden relative">
        <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-signal to-transparent rounded-full animate-scan-sweep" />
      </div>
    </div>
  );
}
