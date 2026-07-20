import { forwardRef, useState, useEffect, useRef, useCallback, type InputHTMLAttributes } from "react";
import { Search, X } from "lucide-react";

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  onSearch: (value: string) => void;
  debounceMs?: number;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ onSearch, debounceMs = 300, placeholder = "Search…", className = "", ...props }, ref) => {
    const [value, setValue] = useState("");
    const timerRef = useRef<ReturnType<typeof setTimeout>>();

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = e.target.value;
        setValue(next);

        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          onSearch(next);
        }, debounceMs);
      },
      [onSearch, debounceMs]
    );

    const handleClear = useCallback(() => {
      setValue("");
      clearTimeout(timerRef.current);
      onSearch("");
    }, [onSearch]);

    useEffect(() => {
      return () => clearTimeout(timerRef.current);
    }, []);

    return (
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none"
          aria-hidden="true"
        />
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          aria-label={typeof placeholder === "string" ? placeholder : "Search"}
          className={`
            w-full rounded bg-white/[0.03] border border-ledger-line2 pl-9 pr-9 py-3 text-[15px]
            text-ink placeholder-ink-faint outline-none transition-colors font-body
            focus:border-signal/60 focus:ring-1 focus:ring-signal/30
            ${className}
          `}
          {...props}
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal rounded"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }
);

SearchInput.displayName = "SearchInput";
