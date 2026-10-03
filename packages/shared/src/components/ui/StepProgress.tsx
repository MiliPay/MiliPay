import clsx from "clsx";

/**
 * The register pages' step boxes (design handoff, "Register customer" /
 * "Register merchant"): a numbered box per step, a tick once it's done, the
 * current one highlighted. A finished step can be clicked to go back to it
 * while `canRevisit` holds (until the form is submitted).
 */
export interface StepItem {
  label: string;
  sub?: string;
}

export function StepProgress({
  steps,
  current,
  onPick,
  canRevisit = true,
}: {
  steps: StepItem[];
  /** 0-based; steps.length means everything is done. */
  current: number;
  onPick?: (index: number) => void;
  canRevisit?: boolean;
}) {
  return (
    <ol
      className="grid gap-2.5"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      aria-label="Steps"
    >
      {steps.map((s, i) => {
        const done = i < current;
        const on = i === current;
        const clickable = done && canRevisit && Boolean(onPick);
        return (
          <li key={s.label}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onPick?.(i)}
              aria-current={on ? "step" : undefined}
              aria-label={`Step ${i + 1}: ${s.label}${done ? ", done" : ""}`}
              className={clsx(
                "flex w-full items-center gap-2.5 rounded-[14px] border px-3.5 py-3 text-left",
                on ? "border-brand bg-brand-soft" : "border-line bg-panel",
                clickable ? "cursor-pointer" : "cursor-default",
              )}
            >
              <span
                className={clsx(
                  "flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-xs font-bold",
                  done || on ? "bg-brand text-brand-ink" : "bg-chip text-muted",
                )}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className={clsx("block truncate text-[13px] font-semibold", i > current ? "text-muted" : "text-fg")}>{s.label}</span>
                {s.sub && <span className="block truncate text-xs text-muted">{s.sub}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
