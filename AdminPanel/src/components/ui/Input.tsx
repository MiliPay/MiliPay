import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, mono, required, className = "", id, ...props }, ref) => {
    const inputId = id ?? props.name;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-semibold text-ink-muted uppercase tracking-wide"
          >
            {label} {required && <span className="text-status-warn">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={`
            w-full rounded bg-white/[0.03] border px-4 py-3 text-[15px]
            text-ink placeholder-ink-faint outline-none transition-colors
            focus:border-signal/60 focus:ring-1 focus:ring-signal/30
            ${error ? "border-status-fail/60" : "border-ledger-line2"}
            ${mono ? "font-data tracking-wider" : "font-body"}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-status-fail">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-xs text-ink-faint">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";