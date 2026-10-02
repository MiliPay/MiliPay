import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * The design's underline tab bar with count pills (Transactions, Customers,
 * Sign-ups, Terminals). `hot` tabs show their count in the warning tint when
 * it isn't zero (e.g. "Pending review 4").
 */
export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number | null;
  hot?: boolean;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  right,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-4" role="tablist">
      {tabs.map((t) => {
        const on = t.id === value;
        const hot = t.hot && Number(t.count) > 0;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={clsx(
              "-mb-px flex flex-none items-center gap-2 border-b-2 px-2.5 pb-3 pt-3.5 whitespace-nowrap",
              on ? "border-brand font-semibold text-fg" : "border-transparent font-medium text-muted",
            )}
          >
            {t.label}
            {t.count !== undefined && t.count !== null && (
              <span className={clsx("rounded-full px-[7px] py-px text-[11px] font-semibold", hot ? "bg-warn-soft text-warn" : "bg-chip text-muted")}>
                {t.count.toLocaleString("en-NG")}
              </span>
            )}
          </button>
        );
      })}
      {right && (
        <>
          <div className="flex-1" />
          {right}
        </>
      )}
    </div>
  );
}

/** The design's filter chips (service chips, categories). */
export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; icon?: ReactNode; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={clsx(
              "flex h-8 items-center gap-1.5 rounded-lg border px-[11px] text-[13px] font-medium",
              on ? "border-brand bg-brand-soft text-brand-text" : "border-line text-muted",
            )}
          >
            {o.icon}
            {o.label}
            {o.count !== undefined && <span className="font-bold">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** The search field inside a table toolbar. */
export function ToolbarSearch({
  value,
  onChange,
  placeholder,
  width = 320,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  width?: number;
  icon: ReactNode;
}) {
  return (
    <label
      className="flex h-9 min-w-0 items-center gap-2 rounded-[9px] border border-line bg-field px-2.5 text-faint"
      style={{ width, maxWidth: "100%" }}
    >
      {icon}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-fg outline-none"
      />
    </label>
  );
}
