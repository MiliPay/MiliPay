import { useCallback, useEffect, useState } from "react";
import { Check, UserCog, X } from "lucide-react";
import clsx from "clsx";
import { ReasonDialog, type ReasonDialogProps } from "@milipay/shared/components/ui/ReasonDialog";
import { TONE_CLASSES } from "@milipay/shared/components/ui/StatusBadge";
import { useToast } from "@milipay/shared/components/ui/Toast";
import { decideProfileChange, describeChanges, fetchProfileChangeQueue, type QueuedProfileChange } from "@milipay/shared/features/staff/profileChanges";
import { roleMeta } from "@milipay/shared/features/staff/roles";
import { timeAgo } from "@milipay/shared/lib/utils/format";

/**
 * Profile changes waiting for you (Staff page). A super admin sees admins',
 * agents' and support's; an admin sees agents' and support's. Approving
 * applies the change; rejecting needs a reason. Both ask you to confirm and
 * go on the audit log. Hidden when nothing is waiting.
 */

type DialogConfig = Omit<ReasonDialogProps, "open" | "onClose">;

export function ProfileChangesPanel({ onDecided }: { onDecided?: () => void }) {
  const { flash } = useToast();
  const [rows, setRows] = useState<QueuedProfileChange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogConfig | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchProfileChangeQueue());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load profile changes.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!error && rows.length === 0) return null;

  const decide = (r: QueuedProfileChange, approve: boolean) => {
    const lines = describeChanges(r.changes, r.previous)
      .map((c) => `${c.label}: ${c.from} → ${c.to}`)
      .join("\n");
    setDialog(
      approve
        ? {
            title: `Approve ${r.name}'s change?`,
            body: `Their profile changes straight away.\n${lines}`,
            icon: Check,
            tone: "ok",
            confirmLabel: "Approve and apply",
            notePlaceholder: "Note (optional)",
            onConfirm: async (note) => {
              await decideProfileChange(r.id, true, note);
              setDialog(null);
              flash(`${r.name}'s profile updated · logged`);
              await load();
              onDecided?.();
            },
          }
        : {
            title: `Reject ${r.name}'s change?`,
            body: `Their profile stays as it is. They see your reason.\n${lines}`,
            icon: X,
            tone: "fail",
            confirmLabel: "Reject",
            noteRequired: true,
            notePlaceholder: "Reason (required)",
            onConfirm: async (note) => {
              await decideProfileChange(r.id, false, note);
              setDialog(null);
              flash(`${r.name}'s change rejected · logged`);
              await load();
              onDecided?.();
            },
          },
    );
  };

  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
      <div className="flex items-center gap-2 px-[18px] pb-2.5 pt-4">
        <UserCog size={16} className="text-warn" aria-hidden="true" />
        <h2 className="flex-1 text-[15px] font-bold">Profile changes waiting for you</h2>
        <span className="rounded-md bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">{rows.length}</span>
      </div>
      {error && <div className="border-t border-line2 px-[18px] py-3 text-[13px] text-fail">{error}</div>}
      {rows.map((r) => {
        const role = roleMeta(r.role);
        return (
          <div key={r.id} className="flex flex-wrap items-center gap-3 border-t border-line2 px-[18px] py-3 text-[13px]">
            <div className="min-w-[220px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{r.name}</span>
                <span className={clsx("inline-flex rounded-md px-[7px] py-0.5 text-[11px] font-semibold", TONE_CLASSES[role.tone])}>{role.label}</span>
                <span className="text-xs text-muted">asked {timeAgo(r.requestedAt)}</span>
              </div>
              <ul className="mt-1 flex flex-col gap-0.5">
                {describeChanges(r.changes, r.previous).map((c) => (
                  <li key={c.label}>
                    <span className="text-muted">{c.label}:</span> <span className="line-through opacity-70">{c.from}</span> → <span className="font-semibold">{c.to}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => decide(r, false)} className="flex h-9 items-center gap-1.5 rounded-[10px] border border-line px-3 font-semibold text-fail">
                <X size={15} aria-hidden="true" />
                Reject
              </button>
              <button type="button" onClick={() => decide(r, true)} className="flex h-9 items-center gap-1.5 rounded-[10px] bg-brand px-3 font-bold text-brand-ink">
                <Check size={15} aria-hidden="true" />
                Approve
              </button>
            </div>
          </div>
        );
      })}
      {dialog && <ReasonDialog open onClose={() => setDialog(null)} {...dialog} />}
    </div>
  );
}
