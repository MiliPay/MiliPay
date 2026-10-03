import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, Ban, Check, FileBadge, MapPin, Percent, Plus, RotateCcw, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { Modal } from "@milipay/shared/components/ui/Modal";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { ReasonDialog, type ReasonDialogProps } from "@milipay/shared/components/ui/ReasonDialog";
import { Pill } from "@milipay/shared/components/ui/StatusBadge";
import { useToast } from "@milipay/shared/components/ui/Toast";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { HARDWARE_MODELS } from "@milipay/shared/features/merchants/merchantService";
import {
  FEE_CHOICES,
  MERCHANT_STATUS,
  TERMINAL_STATUS,
  addTerminal,
  categoryStyle,
  feeLabel,
  fetchMerchantDetail,
  heartbeatLabel,
  merchantAction,
  merchantActions,
  scheduleLabel,
  type MerchantDetail,
} from "@milipay/shared/features/merchants/admin";
import { formatNairaCompact, formatNairaWhole } from "@milipay/shared/lib/utils/format";
import { CategoryIcon, StatTile } from "./parts";

/**
 * A merchant's page (design handoff, admin "merchant"): who they are, what
 * they've taken, where their money goes, and their terminals. Admins can
 * approve a pending merchant, change the fee, suspend and reactivate, each
 * with a reason that goes on the audit log; agents see the merchants they
 * registered, read-only.
 */

type DialogConfig = Omit<ReasonDialogProps, "open" | "onClose">;

const months = (iso: string) => {
  const m = Math.floor((Date.now() - Date.parse(iso)) / (30.4 * 86_400_000));
  return m < 1 ? "this month" : `${m} month${m === 1 ? "" : "s"} ago`;
};

export default function MerchantDetailsPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { flash } = useToast();
  const [m, setM] = useState<MerchantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogConfig | null>(null);
  const [adding, setAdding] = useState(false);
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const listPath = pathname.startsWith("/dashboard/") ? "/dashboard/merchants" : "/merchants";

  const load = useCallback(async () => {
    try {
      const d = await fetchMerchantDetail(id);
      setM(d);
      setError(d ? null : "That merchant wasn't found, or isn't one you can see.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this merchant.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !m) {
    return (
      <div className="p-4 sm:p-7">
        <BackLink to={listPath} />
        <div className="mt-4 rounded-xl bg-fail-soft p-3.5 text-[13px] text-fail">{error}</div>
      </div>
    );
  }
  if (!m) return <LoadingState title="Loading the merchant" />;

  const done = async (message: string) => {
    setDialog(null);
    flash(message);
    await load();
  };

  const cat = categoryStyle(m.category);
  const [stLabel, stTone] = MERCHANT_STATUS[m.status] ?? [m.status, "muted"];
  const online = m.terminals.filter((t) => t.state === "online").length;

  const ACTION: Record<string, { label: string; icon: LucideIcon; style: "primary" | "plain" | "danger"; open: () => void }> = {
    approve: {
      label: "Approve",
      icon: Check,
      style: "primary",
      open: () =>
        setDialog({
          title: `Approve ${m.name}?`,
          body: "Their terminals can take palm payments straight away, and settlements go to the account below.",
          icon: Check,
          tone: "ok",
          confirmLabel: "Approve merchant",
          noteRequired: true,
          notePlaceholder: "What did you check? (required)",
          onConfirm: async (note) => {
            await merchantAction(m.id, "approve", note);
            await done(`${m.name} approved · logged`);
          },
        }),
    },
    fee: {
      label: "Edit fee",
      icon: Percent,
      style: "plain",
      open: () =>
        setDialog({
          title: "Change platform fee",
          body: `Current fee is ${feeLabel(m.fee)}. Choose the new rate. It applies to the next settlement.`,
          icon: Percent,
          tone: "ok",
          confirmLabel: "Save fee",
          reasons: FEE_CHOICES,
          noteRequired: true,
          notePlaceholder: "Why is the fee changing?",
          onConfirm: async (note, picked) => {
            const fee = parseFloat(picked ?? "");
            if (!(fee > 0)) throw new Error("Choose the new rate.");
            await merchantAction(m.id, "fee", note, fee);
            await done(`${m.name} updated · logged`);
          },
        }),
    },
    suspend: {
      label: "Suspend",
      icon: Ban,
      style: "danger",
      open: () =>
        setDialog({
          title: `Suspend ${m.name}?`,
          body: `All ${m.terminals.length} terminal${m.terminals.length === 1 ? "" : "s"} stop accepting payments. Pending settlements still go out.`,
          icon: Ban,
          tone: "fail",
          confirmLabel: "Suspend merchant",
          noteRequired: true,
          notePlaceholder: "Reason (required)",
          onConfirm: async (note) => {
            await merchantAction(m.id, "suspend", note);
            await done(`${m.name} updated · logged`);
          },
        }),
    },
    reactivate: {
      label: "Reactivate",
      icon: RotateCcw,
      style: "primary",
      open: () =>
        setDialog({
          title: `Reactivate ${m.name}?`,
          body: "Their terminals can take payments again.",
          icon: RotateCcw,
          tone: "ok",
          confirmLabel: "Reactivate",
          noteRequired: true,
          onConfirm: async (note) => {
            await merchantAction(m.id, "reactivate", note);
            await done(`${m.name} updated · logged`);
          },
        }),
    },
  };

  const kpis: [string, string][] = [
    ["Volume · 30 days", formatNairaCompact(m.volume)],
    ["Platform fees · 30 days", formatNairaCompact(m.fees)],
    ["Terminals online", `${online} / ${m.terminals.length}`],
    ["Payments today", String(m.paymentsToday)],
  ];
  const info: Row[] = [
    { k: "Director", v: m.director },
    { k: "Director phone", v: m.directorPhone ?? "—", mono: true },
    { k: "Director BVN", v: m.bvnLast4 ? `•••••••${m.bvnLast4}` : "Not provided", mono: Boolean(m.bvnLast4) },
    { k: "CAC number", v: m.cac || "Not provided", mono: Boolean(m.cac) },
    { k: "Category", v: cat.label },
    { k: "Onboarded by", v: `${m.onboardedBy?.name ?? "MiliPay staff"} · ${months(m.createdAt)}` },
    ...(m.approvedAt ? [{ k: "Approved by", v: `${m.approvedBy ?? "An admin"} · ${months(m.approvedAt)}` }] : []),
  ];
  const settle: Row[] = [
    { k: "Bank", v: m.bank },
    { k: "Account number", v: m.accountNumber, mono: true },
    { k: "Account name", v: m.accountNameChecked ? m.accountName : `${m.accountName} · not checked with the bank` },
    { k: "Schedule", v: scheduleLabel(m.schedule) },
    { k: "Platform fee", v: feeLabel(m.fee) },
    { k: "Mono sub-account", v: m.monoSubaccount ?? "Not created yet", mono: Boolean(m.monoSubaccount) },
  ];

  return (
    <div className="flex max-w-[1480px] animate-fade-in flex-col gap-[18px] p-4 sm:p-7">
      <BackLink to={listPath} />

      <div className="flex flex-wrap items-center gap-[18px] rounded-card border border-line bg-panel p-[22px] shadow-card">
        <CategoryIcon category={m.category} size={60} />
        <div className="min-w-[240px] flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-bold tracking-[-.02em]">{m.name}</h1>
            <Pill tone={stTone}>{stLabel}</Pill>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-[18px] gap-y-1 text-[13px] text-muted">
            <div>{cat.label}</div>
            <div className="flex items-center gap-1.5">
              <MapPin size={14} aria-hidden="true" />
              {[m.address, m.state].filter(Boolean).join(", ")}
            </div>
            {m.cac && (
              <div className="flex items-center gap-1.5">
                <FileBadge size={14} aria-hidden="true" />
                <span className="font-mono">{m.cac}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {merchantActions(m.status, isAdmin).map((key) => {
            const a = ACTION[key];
            return (
              <button
                key={key}
                type="button"
                onClick={a.open}
                className={clsx(
                  "flex h-[38px] items-center gap-2 rounded-[10px] border px-3.5 font-semibold",
                  a.style === "primary" && "border-brand bg-brand font-bold text-brand-ink",
                  a.style === "plain" && "border-line",
                  a.style === "danger" && "border-line text-fail",
                )}
              >
                <a.icon size={16} aria-hidden="true" />
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      {m.status === "pending" && (
        <div className="rounded-xl bg-warn-soft px-4 py-3 text-[13px] leading-[1.45] text-warn">
          Waiting for approval. Payments at this merchant's terminals are refused until an admin approves it.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {kpis.map(([label, value]) => (
          <StatTile key={label} label={label} value={value} />
        ))}
      </div>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <InfoCard title="Business & director" rows={info} />
        <InfoCard title="Settlement" rows={settle} />
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
        <div className="flex items-center px-5 pb-2.5 pt-4">
          <h2 className="flex-1 text-[15px] font-bold">Terminals</h2>
          {isAdmin && (
            <button type="button" onClick={() => setAdding(true)} className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-semibold">
              <Plus size={14} aria-hidden="true" />
              Add terminal
            </button>
          )}
        </div>
        {m.terminals.length === 0 && <div className="border-t border-line2 px-5 py-6 text-center text-muted">No terminals yet.</div>}
        <div className="overflow-x-auto">
          {m.terminals.map((t) => {
            const [l, tone] = TERMINAL_STATUS[t.state];
            return (
              <div
                key={t.id}
                className="grid h-12 min-w-[640px] grid-cols-[120px_minmax(0,1fr)_150px_140px_120px] items-center gap-3.5 border-t border-line2 px-5"
              >
                <div className="font-mono text-[12.5px] font-medium">{t.tid}</div>
                <div className="truncate text-muted">
                  {t.model} · <span className="font-mono">{t.serial}</span>
                </div>
                <div>
                  <Pill tone={tone}>{l}</Pill>
                </div>
                <div className="text-[13px] text-muted">Heartbeat {heartbeatLabel(t.lastHeartbeat).toLowerCase()}</div>
                <div className="text-right font-semibold tabular-nums">{formatNairaWhole(t.volumeToday)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {dialog && <ReasonDialog open onClose={() => setDialog(null)} {...dialog} />}
      {adding && (
        <AddTerminal
          merchantId={m.id}
          onClose={() => setAdding(false)}
          onAdded={async (tid) => {
            setAdding(false);
            flash(`${tid} assigned · logged`);
            await load();
          }}
        />
      )}
    </div>
  );
}

type Row = { k: string; v: ReactNode; mono?: boolean };

function InfoCard({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
      <h2 className="px-[18px] pb-2.5 pt-4 text-[15px] font-bold">{title}</h2>
      {rows.map((r) => (
        <div key={r.k} className="flex justify-between gap-3 border-t border-line2 px-[18px] py-2.5 text-[13px]">
          <div className="text-muted">{r.k}</div>
          <div className={clsx("text-right font-medium", r.mono && "font-mono")}>{r.v}</div>
        </div>
      ))}
    </div>
  );
}

function BackLink({ to }: { to: string }) {
  return (
    <Link to={to} className="flex w-max items-center gap-1.5 font-medium text-muted">
      <ArrowLeft size={15} aria-hidden="true" />
      Merchants
    </Link>
  );
}

function AddTerminal({ merchantId, onClose, onAdded }: { merchantId: string; onClose: () => void; onAdded: (tid: string) => Promise<void> }) {
  const [tid, setTid] = useState("");
  const [serial, setSerial] = useState("");
  const [model, setModel] = useState<string>(HARDWARE_MODELS[0].value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await addTerminal(merchantId, tid.trim().toUpperCase(), serial.trim(), model);
      await onAdded(r.tid);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add the terminal.");
      setBusy(false);
    }
  };

  const field = "h-11 w-full rounded-[10px] border border-line bg-field px-3 font-mono outline-none focus:border-brand";
  return (
    <Modal isOpen onClose={onClose} title="Add terminal">
      <div className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted">Terminal ID</span>
          <input value={tid} onChange={(e) => setTid(e.target.value.toUpperCase())} placeholder="TRM-0000" className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted">Device serial number</span>
          <input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Printed under the device" className={field} />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted">Device model</span>
          <div className="flex flex-wrap gap-2">
            {HARDWARE_MODELS.map((h) => (
              <button
                key={h.value}
                type="button"
                onClick={() => setModel(h.value)}
                className={clsx("h-9 rounded-[9px] border px-3.5 font-medium", model === h.value ? "border-brand bg-brand-soft text-brand-text" : "border-line")}
              >
                {h.value.replace("HFSecurity ", "")}
              </button>
            ))}
          </div>
        </div>
        <div className="text-[13px] text-muted">This action is recorded in the audit log with your name.</div>
        {err && <div className="rounded-[10px] bg-fail-soft px-3 py-2.5 text-[13px] text-fail">{err}</div>}
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className="h-10 rounded-[10px] border border-line px-4 font-semibold">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !tid.trim() || !serial.trim()}
            className="h-10 rounded-[10px] bg-brand px-4 font-bold text-brand-ink disabled:opacity-50"
          >
            {busy ? "Adding…" : "Assign terminal"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
