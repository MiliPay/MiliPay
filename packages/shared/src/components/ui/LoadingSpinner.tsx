import clsx from "clsx";

interface LoadingSpinnerProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  color?: "signal" | "white" | "info" | "muted";
  className?: string;
  label?: string;
}

export function LoadingSpinner({
  size = "md",
  color = "signal",
  className,
  label,
}: LoadingSpinnerProps) {
  const sizeClasses = {
    xs: "w-3.5 h-3.5 border-[1.5px]",
    sm: "w-4 h-4 border-2",
    md: "w-6 h-6 border-2",
    lg: "w-8 h-8 border-[2.5px]",
    xl: "w-12 h-12 border-3",
  };

  const colorClasses = {
    signal: "border-signal/20 border-t-signal text-signal",
    white: "border-white/20 border-t-white text-white",
    info: "border-status-info/20 border-t-status-info text-status-info",
    muted: "border-white/10 border-t-ink-muted text-ink-muted",
  };

  return (
    <div className={clsx("inline-flex items-center gap-2.5", className)}>
      <div
        className={clsx(
          "rounded-full animate-spin shrink-0",
          sizeClasses[size],
          colorClasses[color]
        )}
        style={{
          boxShadow: color === "signal" ? "0 0 12px rgba(var(--color-signal), 0.25)" : undefined,
        }}
        role="status"
        aria-label={label || "Loading"}
      />
      {label && <span className="text-xs text-ink-muted font-medium tracking-wide">{label}</span>}
    </div>
  );
}
