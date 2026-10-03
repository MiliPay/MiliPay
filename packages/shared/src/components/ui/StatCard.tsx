import type { ReactNode } from "react";
import clsx from "clsx";
import { TONE_CLASSES, type Tone } from "./StatusBadge";

/**
 * A figure on a card (design handoff "StatCard"). Without an icon: the label
 * over a 22px number. With one: a tinted icon square, the number, then the
 * label, as on the Terminals page.
 */
export function StatCard({ label, value, icon, tone = "muted" }: { label: string; value: ReactNode; icon?: ReactNode; tone?: Tone }) {
  if (icon) {
    return (
      <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-panel px-[18px] py-4 shadow-card">
        <div className={clsx("flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px]", TONE_CLASSES[tone])}>{icon}</div>
        <div className="min-w-0">
          <div className="text-[22px] font-bold tabular-nums">{value}</div>
          <div className="text-[13px] text-muted">{label}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-line bg-panel px-[18px] py-4 shadow-card">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1 text-[22px] font-bold tabular-nums">{value}</div>
    </div>
  );
}
