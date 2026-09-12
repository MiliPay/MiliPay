import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-signal text-signal-ink hover:bg-signal-bright disabled:bg-signal-dim disabled:text-ink-faint",
  secondary:
    "bg-transparent text-ink border border-ledger-line2 hover:border-signal/50 hover:text-signal-bright disabled:opacity-40",
  danger:
    "bg-transparent text-status-fail border border-status-fail/30 hover:bg-status-fail/10 disabled:opacity-40",
  ghost:
    "bg-transparent text-ink-muted hover:text-ink hover:bg-white/[0.04] disabled:opacity-40",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "text-sm px-3 py-2 gap-1.5",
  md: "text-sm px-5 py-3 gap-2",
  lg: "text-base px-7 py-3.5 gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", isLoading, disabled, className = "", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`
          inline-flex items-center justify-center font-display font-semibold rounded
          transition-colors duration-150
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2
          disabled:cursor-not-allowed
          ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}
        `}
        {...props}
      >
        {isLoading && (
          <span className="relative flex items-center justify-center w-4 h-4 shrink-0 mr-1.5" aria-hidden="true">
            <span className="absolute inset-0 rounded-full border-2 border-current opacity-25" />
            <span className="absolute inset-0 rounded-full border-2 border-current border-t-transparent animate-spin" />
          </span>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";