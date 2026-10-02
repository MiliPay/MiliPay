import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

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
            className="text-xs font-semibold text-muted"
          >
            {label} {required && <span className="text-warn">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            aria-invalid={Boolean(error)}
            className={`
              w-full h-11 rounded-[10px] bg-field border pl-3 pr-10 text-sm
            text-fg outline-none transition-colors appearance-none cursor-pointer
              focus:border-brand
              ${error ? "border-fail" : "border-line"}
              ${className}
            `}
            {...props}
          >
            <option value="" disabled className="text-faint">
              {placeholder}
            </option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
        </div>
        {error && <p className="text-xs text-fail">{error}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";