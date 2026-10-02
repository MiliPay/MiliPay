import { useEffect, useState } from "react";
import { ScrollText, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { TONE_CLASSES } from "./StatusBadge";

/**
 * The confirm dialog for a sensitive action (design handoff "ReasonDialog"):
 * an icon and a question, optionally a list of reasons to pick from, a note,
 * and the line "This action is recorded in the audit log with your name."
 * Confirm stays disabled until a reason is picked (when there is a list) and
 * the note is filled in (when it is required).
 */
export interface ReasonDialogProps {
  open: boolean;
  title: string;
  body: string;
  icon: LucideIcon;
  tone?: "ok" | "fail";
  confirmLabel: string;
  reasons?: string[];
  noteRequired?: boolean;
  notePlaceholder?: string;
  onClose: () => void;
  /** Throw to keep the dialog open and show the message. */
  onConfirm: (note: string, reason: string | null) => Promise<void> | void;
}

export function ReasonDialog({
  open,
  title,
  body,
  icon: Icon,
  tone = "fail",
  confirmLabel,
  reasons,
  noteRequired,
  notePlaceholder,
  onClose,
  onConfirm,
}: ReasonDialogProps) {
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote("");
      setPicked(null);
      setError(null);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;
  const ok = (!reasons || picked !== null) && (!noteRequired || note.trim().length > 0);

  const confirm = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(note.trim(), reasons && picked !== null ? reasons[picked] : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade-in bg-scrim" onClick={() => !busy && onClose()} />
      <div className="relative flex max-h-[86vh] w-full max-w-[520px] animate-rise-in flex-col gap-3.5 overflow-y-auto rounded-[20px] border border-line bg-panel p-6 text-fg shadow-modal">
        <div className="flex items-start gap-3.5">
          <div className={clsx("flex h-[42px] w-[42px] flex-none items-center justify-center rounded-xl", TONE_CLASSES[tone])}>
            <Icon size={20} aria-hidden="true" />
          </div>
          <div className="flex-1">
            <div className="text-lg font-bold">{title}</div>
            <div className="mt-1 leading-normal text-muted">{body}</div>
          </div>
        </div>

        {reasons && (
          <div className="flex flex-col gap-1.5" role="radiogroup">
            {reasons.map((r, i) => {
              const on = picked === i;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPicked(i)}
                  className={clsx(
                    "flex gap-2.5 rounded-[10px] border px-3 py-2.5 text-left text-[13px] leading-[1.4]",
                    on ? "border-brand bg-brand-soft" : "border-line",
                  )}
                >
                  <span
                    className={clsx(
                      "mt-px flex h-4 w-4 flex-none items-center justify-center rounded-full border-[1.5px]",
                      on ? "border-brand" : "border-faint",
                    )}
                  >
                    <span className={clsx("h-2 w-2 rounded-full", on ? "bg-brand" : "bg-transparent")} />
                  </span>
                  {r}
                </button>
              );
            })}
          </div>
        )}

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder={notePlaceholder || (noteRequired ? "Add a note (required)" : "Optional note")}
          aria-label="Note"
          className="w-full resize-none rounded-[10px] border border-line bg-field px-3 py-2.5 leading-[1.45] text-fg outline-none focus:border-brand"
        />
        <div className="flex items-center gap-1.5 text-xs text-faint">
          <ScrollText size={13} aria-hidden="true" />
          This action is recorded in the audit log with your name.
        </div>
        {error && <div className="rounded-[10px] bg-fail-soft px-3 py-2.5 text-[13px] text-fail">{error}</div>}
        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex h-10 items-center rounded-[10px] border border-line px-4 font-semibold hover:bg-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={!ok || busy}
            className={clsx(
              "flex h-10 items-center rounded-[10px] px-4 font-bold disabled:opacity-45",
              tone === "ok" ? "bg-brand text-brand-ink" : "bg-fail text-[#fff]",
            )}
          >
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
