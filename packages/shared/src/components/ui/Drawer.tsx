import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * A panel that slides in from the right over a scrim (design handoff:
 * transaction drawer 540px, sign-up review 560px). Esc or the scrim closes
 * it. `header` is the top row, `footer` the pinned bottom (actions).
 */
export function Drawer({
  open,
  onClose,
  width = 540,
  header,
  footer,
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  width?: number;
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  label: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 animate-fade-in bg-scrim" onClick={onClose} />
      <div
        className="relative flex h-full w-full animate-drawer-in flex-col border-l border-line bg-panel text-fg"
        style={{ maxWidth: width }}
      >
        <div className="flex items-center gap-3 border-b border-line px-[22px] py-[18px]">
          <div className="flex min-w-0 flex-1 items-center gap-3">{header}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] text-muted hover:bg-hover"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-[22px]">{children}</div>
        {footer && <div className="border-t border-line bg-field px-[22px] py-4">{footer}</div>}
      </div>
    </div>
  );
}

/** The small uppercase heading over each section in a drawer. */
export function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 text-xs font-semibold uppercase tracking-[.06em] text-faint">{title}</div>
      {children}
    </div>
  );
}

/** A bordered key/value list (drawer details). */
export function KeyValues({ rows }: { rows: { k: string; v: ReactNode; mono?: boolean }[] }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-line">
      {rows.map((r, i) => (
        <div key={r.k} className={`flex justify-between gap-3 px-3.5 py-2.5 text-[13px] ${i ? "border-t border-line2" : ""}`}>
          <div className="text-muted">{r.k}</div>
          <div className={`text-right font-medium ${r.mono ? "font-mono" : ""}`}>{r.v}</div>
        </div>
      ))}
    </div>
  );
}
