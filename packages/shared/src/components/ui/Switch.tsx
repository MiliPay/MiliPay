import clsx from "clsx";

/** The design's 42×24 switch. A button with role="switch", so it is reachable and announced. */
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={clsx(
        "h-6 w-[42px] flex-none rounded-full p-[3px] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        on ? "bg-brand" : "bg-line",
      )}
    >
      <span className={clsx("block h-[18px] w-[18px] rounded-full bg-[#fff] transition-transform duration-200", on && "translate-x-[18px]")} />
    </button>
  );
}
