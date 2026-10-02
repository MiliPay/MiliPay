import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
}

// Design handoff: brand fill with near-black text for the main action, a
// bordered panel button for the rest, red text for destructive ones.
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-brand text-brand-ink font-bold hover:brightness-[.97] disabled:opacity-45",
  secondary: "bg-panel text-fg border border-line font-semibold hover:bg-hover disabled:opacity-45",
  danger: "bg-transparent text-fail border border-line font-semibold hover:bg-fail-soft disabled:opacity-45",
  ghost: "bg-transparent text-muted font-semibold hover:text-fg hover:bg-hover disabled:opacity-45",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-[34px] px-3 text-[13px] gap-1.5 rounded-[9px]",
  md: "h-[38px] px-3.5 text-sm gap-2 rounded-[10px]",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", isLoading, disabled, className = "", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`
          inline-flex items-center justify-center whitespace-nowrap
          transition-colors duration-150
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2
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