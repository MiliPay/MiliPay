interface Step {
  id: number;
  label: string;
}

interface StepProgressProps {
  steps: Step[];
  current: number;
}

export function StepProgress({ steps, current }: StepProgressProps) {
  return (
    <div className="border-b border-ledger-line bg-ledger-raised px-3 sm:px-6 pt-4 sm:pt-6 pb-4 sm:pb-5">
      <div className="relative mx-auto flex max-w-xl items-center justify-between">
        {/* connector track */}
        <div className="absolute left-[9%] right-[9%] top-[16px] sm:top-[18px] h-px bg-ledger-line2" />
        <div
          className="absolute left-[9%] top-[16px] sm:top-[18px] h-px bg-signal transition-all duration-500"
          style={{ width: `${((current - 1) / (steps.length - 1)) * 82}%` }}
        />

        {steps.map((step) => {
          const done = current > step.id;
          const active = current === step.id;
          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center gap-1 sm:gap-1.5">
              <div
                className={`flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border text-xs font-display font-bold transition-all ${
                  done
                    ? "border-status-ok bg-status-ok text-ledger"
                    : active
                    ? "border-signal-bright bg-signal text-signal-ink shadow-[0_0_12px_rgba(var(--color-signal),0.4)]"
                    : "border-ledger-line2 bg-ledger-line text-ink-faint"
                }`}
              >
                {done ? "✓" : step.id}
              </div>
              <span
                className={`whitespace-nowrap text-[9px] sm:text-[10px] font-display font-semibold uppercase tracking-wide ${
                  active ? "text-signal" : done ? "text-status-ok" : "text-ink-faint"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}