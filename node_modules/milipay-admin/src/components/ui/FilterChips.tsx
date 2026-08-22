interface FilterChipsProps {
  options: { label: string; value: string }[];
  selected: string;
  onChange: (value: string) => void;
}

export function FilterChips({ options, selected, onChange }: FilterChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup">
      {options.map((option) => {
        const isSelected = option.value === selected;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(option.value)}
            className={`
              px-3.5 py-1.5 text-xs font-semibold rounded-full border transition-colors cursor-pointer
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2
              ${
                isSelected
                  ? "bg-signal/15 text-signal-bright border-signal/30"
                  : "bg-white/[0.02] text-ink-muted border-ledger-line hover:border-signal/30 hover:text-ink"
              }
            `}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
