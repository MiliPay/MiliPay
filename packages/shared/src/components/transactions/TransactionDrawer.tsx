import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Circle,
  CircleDot,
  Copy,
  Hand,
  LifeBuoy,
  Loader,
  Smartphone,
  Store,
  Tv,
  Undo2,
  User,
  Wifi,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { Drawer, DrawerSection, KeyValues } from "@milipay/shared/components/ui/Drawer";
import { Pill } from "@milipay/shared/components/ui/StatusBadge";
import { useToast } from "@milipay/shared/components/ui/Toast";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import {
  detailRows,
  failureText,
  fetchTransactionDetail,
  lifecycle,
  resolutions,
  resolveTransaction,
  serviceOf,
  txHeadline,
  type ResolveAction,
  type TxDetail,
} from "@milipay/shared/features/transactions/admin";
import { SERVICE } from "@milipay/shared/features/dashboard/view";
import { presentTransactionStatus } from "@milipay/shared/lib/transactionStatus";
import { ROUTES } from "@milipay/shared/lib/constants";
import { formatNairaWhole, initials, timeAgo } from "@milipay/shared/lib/utils/format";

const SVC_ICON: Record<string, LucideIcon> = { palm: Hand, airtime: Smartphone, data: Wifi, power: Zap, cable: Tv, other: CircleDot };

const clock = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Africa/Lagos" }).format(new Date(iso))
    : "";

/**
 * The transaction drawer (design handoff, Transactions "side drawer"): the
 * amount and status, what went wrong, the lifecycle, the details, what it is
 * connected to, its audit trail, and — when the database allows a decision —
 * "Resolve manually" with a required reason.
 */
export function TransactionDrawer({
  txKey,
  onClose,
  onChanged,
}: {
  /** Transaction id or reference; null closes the drawer. */
  txKey: string | null;
  onClose: () => void;
  /** Called after a manual resolution, so lists can refresh. */
  onChanged?: () => void;
}) {
  const { flash } = useToast();
  const [tx, setTx] = useState<TxDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<ResolveAction | null>(null);

  const load = useCallback(async () => {
    if (!txKey) return;
    try {
      const d = await fetchTransactionDetail(txKey);
      setTx(d);
      setError(d ? null : "That transaction wasn't found.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this transaction.");
    }
  }, [txKey]);

  useEffect(() => {
    setTx(null);
    setError(null);
    setNote("");
    void load();
  }, [load]);

  const resolve = async (action: ResolveAction) => {
    if (!tx) return;
    if (!note.trim()) {
      flash("Add a reason first. It goes on the audit trail.", "fail");
      return;
    }
    setBusy(action);
    try {
      await resolveTransaction(tx.reference, action, note.trim());
      flash(`${tx.reference} ${action === "refund" ? "refund started" : "marked delivered"} · logged`);
      setNote("");
      await load();
      onChanged?.();
    } catch (e) {
      flash(e instanceof Error ? e.message : "That didn't work.", "fail");
    } finally {
      setBusy(null);
    }
  };

  const service = tx ? serviceOf(tx) : "other";
  const s = SERVICE[service] ?? SERVICE.other;
  const Icon = SVC_ICON[service] ?? CircleDot;
  const status = tx ? presentTransactionStatus(tx.status) : null;
  const actions = tx ? resolutions(tx.status) : [];
  const failure = tx ? failureText(tx) : null;

  const header = tx ? (
    <>
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px]" style={{ background: s.color + "24", color: s.color }}>
        <Icon size={19} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-bold">
          {tx.palm ? `${tx.customer?.name || "Customer"} → ${tx.merchantName || "merchant"}` : txHeadline(tx)}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-muted">
          <span className="truncate">{tx.reference}</span>
          <button
            type="button"
            aria-label="Copy reference"
            onClick={() => void navigator.clipboard?.writeText(tx.reference).then(() => flash("Reference copied"))}
            className="flex text-faint hover:text-fg"
          >
            <Copy size={13} />
          </button>
        </div>
      </div>
    </>
  ) : (
    <div className="text-base font-bold">Transaction</div>
  );

  const footer =
    tx && actions.length > 0 ? (
      <div className="flex flex-col gap-2.5">
        <div className="text-[13px] font-semibold">Resolve manually</div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Reason (required, recorded against your name)"
          aria-label="Reason"
          className="w-full resize-none rounded-[10px] border border-line bg-panel px-3 py-2.5 leading-[1.45] outline-none focus:border-brand"
        />
        <div className="flex gap-2.5">
          {actions.includes("mark_delivered") && (
            <button
              type="button"
              onClick={() => void resolve("mark_delivered")}
              disabled={busy !== null}
              className={clsx(
                "flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] bg-brand font-bold text-brand-ink",
                note.trim() ? "" : "opacity-50",
              )}
            >
              <Check size={16} strokeWidth={2.5} aria-hidden="true" />
              {busy === "mark_delivered" ? "Saving…" : "Mark delivered"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void resolve("refund")}
            disabled={busy !== null}
            className={clsx(
              "flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] border border-line bg-panel font-semibold",
              note.trim() ? "" : "opacity-50",
            )}
          >
            <Undo2 size={16} aria-hidden="true" />
            {busy === "refund" ? "Saving…" : "Refund customer"}
          </button>
        </div>
      </div>
    ) : undefined;

  return (
    <Drawer open={txKey !== null} onClose={onClose} header={header} footer={footer} label="Transaction">
      {!tx && !error && <LoadingState title="Loading the transaction" minHeight="min-h-[240px]" />}
      {error && <div className="rounded-xl bg-fail-soft p-3.5 text-[13px] text-fail">{error}</div>}
      {tx && status && (
        <>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[13px] text-muted">Amount</div>
              <div className="mt-0.5 text-[30px] font-bold tabular-nums tracking-[-.02em]">{formatNairaWhole(tx.amount)}</div>
            </div>
            <Pill tone={status.tone} size="lg">
              {status.label}
            </Pill>
          </div>

          {failure && (
            <div className="flex gap-2.5 rounded-xl bg-fail-soft px-3.5 py-3 text-[13px] leading-[1.45] text-fail">
              <AlertTriangle size={16} className="mt-px flex-none" aria-hidden="true" />
              <div>{failure}</div>
            </div>
          )}

          <DrawerSection title="Lifecycle">
            {lifecycle(tx).map((p, i, all) => (
              <div key={p.label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={clsx(
                      "flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full border-[1.5px]",
                      p.state === "done" && "border-brand bg-brand text-brand-ink",
                      p.state === "current" && "border-warn text-warn",
                      p.state === "failed" && "border-fail bg-fail-soft text-fail",
                      p.state === "todo" && "border-line text-faint",
                    )}
                  >
                    {p.state === "done" ? (
                      <Check size={12} strokeWidth={3} />
                    ) : p.state === "failed" ? (
                      <X size={12} strokeWidth={3} />
                    ) : p.state === "current" ? (
                      <Loader size={12} strokeWidth={3} />
                    ) : (
                      <Circle size={12} strokeWidth={3} />
                    )}
                  </div>
                  {i < all.length - 1 && <div className="min-h-[18px] w-0.5 flex-1 bg-line" />}
                </div>
                <div className="flex flex-1 justify-between gap-2.5 pb-3.5">
                  <div>
                    <div className={clsx("font-semibold", p.state === "todo" ? "text-faint" : "text-fg")}>{p.label}</div>
                    <div className="mt-px text-xs text-muted">{p.sub}</div>
                  </div>
                  <div className="font-mono text-xs text-muted">{clock(p.at)}</div>
                </div>
              </div>
            ))}
          </DrawerSection>

          <KeyValues rows={detailRows(tx)} />

          {(tx.customer || tx.merchant || tx.tickets.length > 0) && (
            <DrawerSection title="Connected">
              <div className="flex flex-wrap gap-2">
                {tx.customer && (
                  <Connected
                    to={ROUTES.customerDetails.replace(":id", tx.customer.id)}
                    icon={User}
                    label={tx.customer.name || "Customer"}
                    sub={`Customer${tx.customer.tier ? ` · Tier ${tx.customer.tier}` : ""}`}
                  />
                )}
                {tx.merchant && (
                  <Connected to={ROUTES.merchantDetails.replace(":id", tx.merchant.id)} icon={Store} label={tx.merchant.name} sub="Merchant" />
                )}
                {tx.tickets.map((k) => (
                  <Connected
                    key={k.id}
                    to={ROUTES.supportDetails.replace(":id", k.id)}
                    icon={LifeBuoy}
                    label={k.ticketId || "Ticket"}
                    sub="Open ticket"
                  />
                ))}
              </div>
            </DrawerSection>
          )}

          <DrawerSection title="Audit trail">
            {tx.audit.map((e, i) => (
              <TrailRow key={i} actor={e.actorName} text={e.action} note={e.reason} at={e.at} />
            ))}
            <TrailRow actor="System" text="created the transaction" at={tx.createdAt} system />
          </DrawerSection>
        </>
      )}
    </Drawer>
  );
}

function Connected({ to, icon: Icon, label, sub }: { to: string; icon: LucideIcon; label: string; sub: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 hover:border-brand">
      <Icon size={15} className="text-muted" aria-hidden="true" />
      <span>
        <span className="block text-[13px] font-semibold">{label}</span>
        <span className="block text-[11px] text-muted">{sub}</span>
      </span>
      <ArrowUpRight size={13} aria-hidden="true" />
    </Link>
  );
}

function TrailRow({ actor, text, note, at, system }: { actor: string; text: string; note?: string | null; at: string; system?: boolean }) {
  return (
    <div className="flex gap-2.5 border-t border-line2 py-2 text-[13px]">
      <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-chip text-[10px] font-bold text-muted">
        {system ? "SY" : initials(actor)}
      </div>
      <div className="flex-1 leading-[1.45]">
        <span className="font-semibold">{actor}</span> <span className="text-muted">{text}</span>
        {note && <div className="mt-1 rounded-lg bg-field px-2.5 py-1.5 text-xs text-muted">"{note}"</div>}
      </div>
      <div className="text-xs text-faint">{timeAgo(at)}</div>
    </div>
  );
}
