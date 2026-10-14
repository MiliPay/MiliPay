import { useCallback, useEffect, useState } from "react";
import { Undo2, XCircle } from "lucide-react";
import clsx from "clsx";
import { ReasonDialog } from "@milipay/shared/components/ui/ReasonDialog";
import { Pill } from "@milipay/shared/components/ui/StatusBadge";
import { useToast } from "@milipay/shared/components/ui/Toast";
import { decideRefundRequest, fetchRefundRequests, type RefundRequest } from "@milipay/shared/features/support/desk";
import { presentTransactionStatus } from "@milipay/shared/lib/transactionStatus";
import { formatNairaWhole, timeAgo } from "@milipay/shared/lib/utils/format";

/**
 * Operations › Refund requests from support. Support can't move money, so a
 * refund they ask for waits here. Approving sends it through the same refund
 * as "Resolve › Refund" (the state machine decides if it's still allowed);
 * either way the decision needs a reason, goes on the audit log, and is
 * written to the ticket for the agent to see.
 */

const COLS = "grid grid-cols-[150px_minmax(160px,1fr)_minmax(220px,2fr)_110px_96px_190px] gap-3.5";

export function RefundRequestsCard({ onDecided }: { onDecided?: () => void }) {
  const { flash } = useToast();
  const [rows, setRows] = useState<RefundRequest[] | null>(null);
  const [deciding, setDeciding] = useState<{ row: RefundRequest; approve: boolean } | null>(null);

  const load = useCallback(() => {
    fetchRefundRequests().then(setRows, () => setRows([]));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (!rows || rows.length === 0) return null;
  const pending = rows.filter((r) => r.pending).length;

  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
      <div className="flex items-center px-5 pb-3 pt-4">
        <h2 className="flex-1 text-[15px] font-bold">Refund requests from support</h2>
        <div className={clsx("text-xs", pending ? "font-semibold text-warn" : "text-muted")}>{pending ? `${pending} waiting` : "None waiting"}</div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[960px]">
          <div className={clsx(COLS, "border-y border-line bg-field px-5 py-[9px] text-[11px] font-semibold uppercase tracking-[.06em] text-faint")}>
            <div>Reference</div>
            <div>Customer</div>
            <div>Reason</div>
            <div className="text-right">Amount</div>
            <div className="text-right">Asked</div>
            <div />
          </div>
          {rows.map((r) => {
            const st = presentTransactionStatus(r.txStatus);
            return (
              <div key={r.id} className={clsx(COLS, "min-h-14 items-center border-b border-line2 px-5 py-2")}>
                <div className="min-w-0">
                  <div className="truncate font-mono text-[12.5px] font-medium">{r.reference}</div>
                  <div className="text-xs text-muted">{st.label}</div>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold">{r.customer || "—"}</div>
                  <div className="truncate font-mono text-xs text-muted">{r.ticketId ?? ""}</div>
                </div>
                <div className="min-w-0">
                  <div className="line-clamp-2 text-[13px]">{r.reason}</div>
                  <div className="truncate text-xs text-muted">
                    {r.requestedBy ?? "Support"}
                    {r.decisionNote ? ` · ${r.status === "approved" ? "Approved" : "Declined"} by ${r.decidedBy ?? "an admin"}: ${r.decisionNote}` : ""}
                  </div>
                </div>
                <div className="text-right font-semibold tabular-nums">{formatNairaWhole(r.amount)}</div>
                <div className="text-right text-[13px] text-muted">{timeAgo(r.requestedAt).replace(" ago", "")}</div>
                <div className="flex justify-end gap-1.5">
                  {r.pending ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setDeciding({ row: r, approve: false })}
                        className="flex h-[30px] items-center rounded-lg border border-line px-3 text-xs font-semibold hover:bg-hover"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeciding({ row: r, approve: true })}
                        className="flex h-[30px] items-center rounded-lg bg-brand px-3 text-xs font-bold text-brand-ink"
                      >
                        Approve refund
                      </button>
                    </>
                  ) : (
                    <Pill tone={r.status === "approved" ? "ok" : "muted"}>{r.status === "approved" ? "Approved" : "Declined"}</Pill>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ReasonDialog
        open={deciding !== null}
        tone={deciding?.approve ? "ok" : "fail"}
        icon={deciding?.approve ? Undo2 : XCircle}
        title={deciding?.approve ? `Refund ${deciding ? formatNairaWhole(deciding.row.amount) : ""}?` : "Decline this refund request?"}
        body={
          deciding?.approve
            ? `${deciding.row.reference} goes back to the customer's bank. Support asked: "${deciding.row.reason}"`
            : "The agent sees your reason on the ticket and can tell the customer."
        }
        noteRequired
        notePlaceholder={deciding?.approve ? "Why the refund is right (required)" : "Why not (required)"}
        confirmLabel={deciding?.approve ? "Approve refund" : "Decline"}
        onClose={() => setDeciding(null)}
        onConfirm={async (note) => {
          if (!deciding) return;
          await decideRefundRequest(deciding.row.id, deciding.approve, note);
          flash(deciding.approve ? `${deciding.row.reference} refund started · logged` : "Request declined · logged");
          setDeciding(null);
          load();
          onDecided?.();
        }}
      />
    </div>
  );
}
