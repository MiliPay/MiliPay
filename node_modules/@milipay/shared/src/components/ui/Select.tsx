import { forwardRef, type SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: readonly string[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder = "Select an option", required, id, className = "", ...props }, ref) => {
    const selectId = id ?? props.name;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="text-xs font-semibold text-ink-muted uppercase tracking-wide"
          >
            {label} {required && <span className="text-status-warn">*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={Boolean(error)}
          className={`
            w-full rounded bg-white/[0.03] border px-4 py-3 text-[15px]
            text-ink outline-none transition-colors appearance-none
            focus:border-signal/60 focus:ring-1 focus:ring-signal/30
            ${error ? "border-status-fail/60" : "border-ledger-line2"}
            ${className}
          `}
          {...props}
        >
          <option value="" disabled className="text-ink-faint">
            {placeholder}
          </option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-status-fail">{error}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";