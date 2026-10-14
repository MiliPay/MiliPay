import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** The empty table: an icon on a soft square, a line saying why, and what to do next. */
export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-[14px] bg-chip text-muted">
        <Icon size={22} aria-hidden="true" />
      </div>
      <div className="font-semibold">{title}</div>
      <div className="max-w-[420px] text-[13px] leading-normal text-muted">{body}</div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
