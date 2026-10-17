import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRightLeft, Boxes, Plus, Undo2, UserCheck, Warehouse } from "lucide-react";
import clsx from "clsx";
import { Modal } from "@milipay/shared/components/ui/Modal";
import { ReasonDialog, type ReasonDialogProps } from "@milipay/shared/components/ui/ReasonDialog";
import { StatCard } from "@milipay/shared/components/ui/StatCard";
import { Pill } from "@milipay/shared/components/ui/StatusBadge";
import { useToast } from "@milipay/shared/components/ui/Toast";
import {
  addStockTerminal,
  fetchStock,
  moveStockTerminal,
  stockByHolder,
  type StockList,
  type StockRow,
} from "@milipay/shared/features/merchants/admin";
import { HARDWARE_MODELS } from "@milipay/shared/features/merchants/merchantService";
import { ROUTES } from "@milipay/shared/lib/constants";
import { formatDate } from "@milipay/shared/lib/utils/format";
import { ChoiceChips, Field, FormError, SelectField } from "../register/formParts";

/**
 * POS terminals › Agent stock (admin): terminals that aren't at a merchant
 * yet, in the warehouse or in an agent's bag. Add new ones, give them to
 * agents, move them between agents, take them back. Agents assign them to
 * merchants from the agent portal. Every change is on the audit log.
 */

const COLS = "grid grid-cols-[120px_minmax(0,1.3fr)_minmax(0,1.3fr)_120px_190px] gap-3.5";
const WAREHOUSE = "Warehouse";
type Filter = "all" | "warehouse" | string;

function AddDialog({ open, agents, onClose, onAdded }: { open: boolean; agents: StockList["agents"]; onClose: () => void; onAdded: (tid: string, to: string) => void }) {
  const [tid, setTid] = useState("");
  const [serial, setSerial] = useState("");
  const [model, setModel] = useState("");
  const [to, setTo] = useState("warehouse");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      setTid("");
      setSerial("");
      setErr("");
    }
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await addStockTerminal(tid, serial, model, to === "warehouse" ? null : to);
      onAdded(r.tid, r.heldBy);
      setTid("");
      setSerial("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add the terminal.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Add terminal to stock">
      <div className="flex flex-col gap-4">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Terminal ID" placeholder="TRM-0000" mono value={tid} onChange={(e) => setTid(e.target.value.toUpperCase().slice(0, 40))} />
          <Field label="Serial number" placeholder="Printed under the device" mono value={serial} onChange={(e) => setSerial(e.target.value)} />
        </div>
        <ChoiceChips
          label="Device model"
          value={model}
          onChange={setModel}
          options={HARDWARE_MODELS.map((h) => ({ value: h.value, label: h.value.replace("HFSecurity ", "") }))}
        />
        <SelectField
          label="Give to"
          value={to}
          onChange={setTo}
          placeholder="Choose where it goes"
          options={[{ value: "warehouse", label: WAREHOUSE }, ...agents.map((a) => ({ value: a.id, label: `${a.name}${a.state ? ` · ${a.state}` : ""}` }))]}
        />
        {err && <FormError>{err}</FormError>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-[10px] border border-line px-4 font-semibold">
            Done
          </button>
          <button
            type="button"
            disabled={busy || !tid || !serial || !model}
            onClick={() => void submit()}
            className="h-10 rounded-[10px] bg-brand px-4 font-bold text-brand-ink disabled:opacity-45"
          >
            {busy ? "Adding…" : "Add terminal"}
          </button>
        </div>
        <div className="text-xs text-muted">Add as many as you need; the form stays open. Each one is recorded in the audit log.</div>
      </div>
    </Modal>
  );
}

export default function AgentStockPage() {
  const { flash } = useToast();
  const [data, setData] = useState<StockList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [dialog, setDialog] = useState<Omit<ReasonDialogProps, "open" | "onClose"> | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchStock());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load stock.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const holders = useMemo(() => stockByHolder(data?.rows ?? []), [data]);
  const rows = (data?.rows ?? []).filter((r) =>
    filter === "all" ? true : filter === "warehouse" ? r.heldBy === null : r.heldBy?.id === filter,
  );
  const inWarehouse = data?.rows.filter((r) => !r.heldBy).length ?? 0;
  const withAgents = (data?.rows.length ?? 0) - inWarehouse;
  const agentsHolding = data?.agents.filter((a) => a.holding > 0).length ?? 0;

  const move = (t: StockRow) => {
    const targets = [
      ...(t.heldBy ? [{ id: null as string | null, label: WAREHOUSE, sub: "Take it back" }] : []),
      ...(data?.agents ?? [])
        .filter((a) => a.id !== t.heldBy?.id)
        .map((a) => ({ id: a.id as string | null, label: a.name, sub: `${a.state ?? "No state"} · holding ${a.holding}` })),
    ];
    setDialog({
      title: t.heldBy ? `Move ${t.tid}` : `Give ${t.tid} to an agent`,
      body: t.heldBy ? `${t.tid} is with ${t.heldBy.name}. Who has it now?` : "Pick the agent who's collecting it.",
      icon: ArrowRightLeft,
      tone: "ok",
      confirmLabel: "Move terminal",
      options: targets.map((x) => ({ label: x.label, sub: x.sub })),
      noteRequired: true,
      notePlaceholder: "Reason (required), e.g. collected at the Ibadan hub",
      onConfirm: async (note, _reason, picked) => {
        if (picked === null) throw new Error("Pick who has it.");
        const target = targets[picked];
        const r = await moveStockTerminal(t.id, target.id, note);
        setDialog(null);
        flash(`${r.tid} → ${r.heldBy} · logged`);
        await load();
      },
    });
  };

  const takeBack = (t: StockRow) =>
    setDialog({
      title: `Take ${t.tid} back?`,
      body: `${t.tid} leaves ${t.heldBy?.name ?? "the agent"}'s stock and goes back to the warehouse.`,
      icon: Undo2,
      tone: "fail",
      confirmLabel: "Take back",
      noteRequired: true,
      notePlaceholder: "Reason (required)",
      onConfirm: async (note) => {
        const r = await moveStockTerminal(t.id, null, note);
        setDialog(null);
        flash(`${r.tid} back in the warehouse · logged`);
        await load();
      },
    });

  return (
    <div className="flex max-w-[1480px] animate-fade-in flex-col gap-[18px] p-4 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[13px] text-muted">
            <Link to={ROUTES.terminals} className="hover:underline">
              POS terminals
            </Link>{" "}
            › Agent stock
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-[-.02em]">Agent stock</h1>
          <div className="mt-1 text-muted">Terminals not at a merchant yet. Agents assign them to merchants from the agent portal.</div>
        </div>
        <button type="button" onClick={() => setAdding(true)} className="flex h-10 items-center gap-2 rounded-[10px] bg-brand px-4 font-bold text-brand-ink">
          <Plus size={16} /> Add terminals
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard label="In stock" value={data ? data.rows.length : "—"} icon={<Boxes size={18} />} tone="info" />
        <StatCard label="In the warehouse" value={data ? inWarehouse : "—"} icon={<Warehouse size={18} />} tone="muted" />
        <StatCard label="With agents" value={data ? withAgents : "—"} icon={<UserCheck size={18} />} tone="ok" />
        <StatCard label="Agents holding stock" value={data ? `${agentsHolding} of ${data.agents.length}` : "—"} icon={<UserCheck size={18} />} tone="muted" />
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
        <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3">
          {[{ id: "all", name: "All", count: data?.rows.length ?? 0 }, ...holders.map((h) => ({ id: h.id ?? "warehouse", name: h.name, count: h.count }))].map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => setFilter(h.id)}
              className={clsx(
                "flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold",
                filter === h.id ? "border-brand bg-brand-soft text-brand-text" : "border-line text-muted hover:text-fg",
              )}
            >
              {h.name} <span className="tabular-nums opacity-70">{h.count}</span>
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className={clsx(COLS, "border-b border-line bg-field px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-faint")}>
              <div>Terminal</div>
              <div>Device</div>
              <div>Held by</div>
              <div>Since</div>
              <div />
            </div>
            {error && <div className="p-12 text-center text-fail">{error}</div>}
            {!error && !data && <div className="p-12 text-center text-muted">Loading…</div>}
            {!error && data && rows.length === 0 && (
              <div className="p-12 text-center text-muted">{data.rows.length === 0 ? "No terminals in stock. Add the ones you've received." : "Nothing here."}</div>
            )}
            {rows.map((t) => (
              <div key={t.id} className={clsx(COLS, "h-[52px] items-center border-b border-line2 px-5 hover:bg-hover")}>
                <div className="font-mono text-[12.5px] font-semibold">{t.tid}</div>
                <div className="truncate text-[13px] text-muted">
                  {(t.model ?? "—").replace("HFSecurity ", "")} · <span className="font-mono">{t.serial ?? "—"}</span>
                  {!t.active && (
                    <span className="ml-2">
                      <Pill tone="fail">Deactivated</Pill>
                    </span>
                  )}
                </div>
                <div className="truncate">
                  {t.heldBy ? (
                    <span className="font-medium">
                      {t.heldBy.name}
                      {t.heldBy.state && <span className="text-muted"> · {t.heldBy.state}</span>}
                    </span>
                  ) : (
                    <Pill tone="muted">Warehouse</Pill>
                  )}
                </div>
                <div className="text-[13px] text-muted">{formatDate(t.since)}</div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => move(t)}
                    className="flex h-[30px] items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-semibold text-brand-text"
                  >
                    <ArrowRightLeft size={13} aria-hidden="true" /> {t.heldBy ? "Move" : "Give to agent"}
                  </button>
                  {t.heldBy && (
                    <button
                      type="button"
                      onClick={() => takeBack(t)}
                      className="flex h-[30px] items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-semibold text-fail"
                    >
                      <Undo2 size={13} aria-hidden="true" /> Take back
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AddDialog
        open={adding}
        agents={data?.agents ?? []}
        onClose={() => setAdding(false)}
        onAdded={(tid, to) => {
          flash(`${tid} added · ${to} · logged`);
          void load();
        }}
      />
      {dialog && <ReasonDialog open onClose={() => setDialog(null)} {...dialog} />}
    </div>
  );
}
