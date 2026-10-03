import type { InputHTMLAttributes, ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Info } from "lucide-react";
import clsx from "clsx";

/**
 * The register pages' form pieces (design handoff, "Register customer" /
 * "Register merchant"): a labelled 44px field, a select, choice chips, review
 * rows, the grey info box, and Back / Continue.
 */

export function Field({
  label,
  hint,
  hintTone = "muted",
  prefix,
  mono,
  full,
  ok,
  invalid,
  ...input
}: {
  label: string;
  hint?: ReactNode;
  hintTone?: "muted" | "ok" | "fail";
  prefix?: string;
  mono?: boolean;
  full?: boolean;
  ok?: boolean;
  invalid?: boolean;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={clsx("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <span className="text-xs font-semibold text-muted">{label}</span>
      <span
        className={clsx(
          "flex h-11 items-center gap-2 rounded-[10px] border bg-field px-3 focus-within:border-brand",
          invalid ? "border-fail" : "border-line",
        )}
      >
        {prefix && <span className="font-semibold text-muted">{prefix}</span>}
        <input {...input} className={clsx("h-full min-w-0 flex-1 bg-transparent outline-none", mono && "font-mono")} />
        {ok && <Check size={16} className="text-brand-text" aria-label="Checked" />}
      </span>
      {hint && (
        <span className={clsx("flex items-center gap-1.5 text-xs", hintTone === "ok" ? "text-brand-text" : hintTone === "fail" ? "text-fail" : "text-muted")}>
          {hint}
        </span>
      )}
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  placeholder,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: readonly (string | { value: string; label: string })[];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <span className="relative flex h-11 max-w-[360px] items-center rounded-[10px] border border-line bg-field focus-within:border-brand">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-full w-full cursor-pointer appearance-none bg-transparent pl-3 pr-[38px] text-fg outline-none"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => {
            const v = typeof o === "string" ? o : o.value;
            return (
              <option key={v} value={v}>
                {typeof o === "string" ? o : o.label}
              </option>
            );
          })}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute right-3 text-muted" aria-hidden="true" />
      </span>
    </label>
  );
}

export function ChoiceChips<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T | "";
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
}) {
  return (
    <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={label}>
      <span className="text-xs font-semibold text-muted">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={clsx(
                "flex h-9 items-center gap-1.5 rounded-[9px] border px-3.5 font-medium",
                on ? "border-brand bg-brand-soft text-brand-text" : "border-line text-fg",
              )}
            >
              {o.icon}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ReviewRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div className="grid gap-x-7 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-line2 py-[11px] text-[13px]">
          <div className="text-muted">{k}</div>
          <div className="text-right font-semibold">{v || "—"}</div>
        </div>
      ))}
    </div>
  );
}

export function InfoBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-xl bg-chip px-3.5 py-3 text-[13px] leading-[1.45] text-muted">
      <Info size={16} className="mt-px flex-none" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return <div className="rounded-[10px] bg-fail-soft px-3 py-2.5 text-[13px] text-fail">{children}</div>;
}

export function StepNav({
  onBack,
  onNext,
  canBack,
  nextLabel,
  busy,
}: {
  onBack: () => void;
  onNext: () => void;
  canBack: boolean;
  nextLabel: string;
  busy?: boolean;
}) {
  return (
    <div className="flex justify-between border-t border-line2">
      <button
        type="button"
        onClick={onBack}
        disabled={!canBack || busy}
        className="mt-3.5 flex h-[42px] items-center gap-1.5 rounded-[10px] border border-line px-4 font-semibold disabled:opacity-40"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        Back
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={busy}
        className="mt-3.5 flex h-[42px] items-center gap-1.5 rounded-[10px] bg-brand px-[18px] font-bold text-brand-ink disabled:opacity-60"
      >
        {nextLabel}
        <ArrowRight size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

export function DoneCard({ title, children, actions }: { title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-[26px] text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-brand-ink">
        <Check size={30} strokeWidth={3} aria-hidden="true" />
      </div>
      <div className="text-xl font-bold">{title}</div>
      <div className="max-w-[460px] leading-normal text-muted">{children}</div>
      <div className="mt-2 flex flex-wrap justify-center gap-2.5">{actions}</div>
    </div>
  );
}
