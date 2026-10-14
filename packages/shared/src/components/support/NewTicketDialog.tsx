import { useEffect, useState } from "react";
import { Mail, MessageSquarePlus, Phone } from "lucide-react";
import clsx from "clsx";
import { createDeskTicket, type Urgency } from "@milipay/shared/features/support/desk";

/**
 * A ticket for a call or email that came in outside the app (the customer
 * page's "New ticket"). It opens assigned to you; the first note is internal.
 */
export function NewTicketDialog({
  open,
  name,
  customerId,
  signupId,
  onClose,
  onCreated,
}: {
  open: boolean;
  name: string;
  customerId?: string | null;
  signupId?: string | null;
  onClose: () => void;
  onCreated: (ticketId: string) => void;
}) {
  const [channel, setChannel] = useState<"call" | "email">("call");
  const [subject, setSubject] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("medium");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setChannel("call");
    setSubject("");
    setUrgency("medium");
    setNote("");
    setError(null);
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const ok = subject.trim().length >= 3;

  const create = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createDeskTicket({ customerId, signupId, channel, subject: subject.trim(), urgency, note: note.trim() });
      onCreated(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the ticket.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="New ticket">
      <div className="absolute inset-0 animate-fade-in bg-scrim" onClick={() => !busy && onClose()} />
      <div className="relative flex max-h-[86vh] w-full max-w-[500px] animate-rise-in flex-col gap-3.5 overflow-y-auto rounded-[20px] border border-line bg-panel p-[22px] text-fg shadow-modal">
        <div className="flex gap-3.5">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-soft text-brand-text">
            <MessageSquarePlus size={19} aria-hidden="true" />
          </div>
          <div>
            <div className="text-[17px] font-bold">New ticket for {name}</div>
            <div className="mt-[3px] text-[13px] leading-normal text-muted">For a call or email that came in outside the app. It opens assigned to you.</div>
          </div>
        </div>

        <div className="flex gap-1.5">
          {(
            [
              ["call", "Phone call", Phone],
              ["email", "Email", Mail],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setChannel(id)}
              className={clsx(
                "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] border text-[13px] font-semibold",
                channel === id ? "border-brand bg-brand-soft text-brand-text" : "border-line text-muted",
              )}
            >
              <Icon size={14} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted">Subject</span>
          <input
            autoFocus
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={160}
            placeholder="e.g. Electricity token not received"
            className="h-10 rounded-[10px] border border-line bg-field px-3 text-fg outline-none placeholder:text-faint focus:border-brand"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted">Urgency</span>
          <div className="flex gap-1.5">
            {(["low", "medium", "high", "critical"] as Urgency[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUrgency(u)}
                className={clsx(
                  "h-8 flex-1 rounded-lg border text-[12.5px] font-semibold capitalize",
                  urgency === u ? "border-brand bg-brand-soft text-brand-text" : "border-line text-muted",
                )}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="What did they tell you? (internal note)"
          aria-label="Note"
          className="w-full resize-none rounded-[10px] border border-line bg-field px-3 py-2.5 leading-[1.45] text-fg outline-none placeholder:text-faint focus:border-brand"
        />
        {error && <div className="rounded-[10px] bg-fail-soft px-3 py-2.5 text-[13px] text-fail">{error}</div>}
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} disabled={busy} className="flex h-10 items-center rounded-[10px] border border-line px-4 font-semibold hover:bg-hover">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void create()}
            disabled={!ok || busy}
            className="flex h-10 items-center rounded-[10px] bg-brand px-4 font-bold text-brand-ink disabled:opacity-45"
          >
            {busy ? "Creating…" : "Create ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}
