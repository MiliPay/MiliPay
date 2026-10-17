import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Building2, Phone, Plus, Router } from "lucide-react";
import { Drawer, DrawerSection, KeyValues } from "@milipay/shared/components/ui/Drawer";
import { Pill } from "@milipay/shared/components/ui/StatusBadge";
import { useToast } from "@milipay/shared/components/ui/Toast";
import { AGENT_ROUTES } from "@milipay/shared/components/layout/AgentLayout";
import {
  MERCHANT_STATUS,
  categoryStyle,
  fetchMerchantDetail,
  fetchMerchantList,
  type MerchantDetail,
  type MerchantRow,
} from "@milipay/shared/features/merchants/admin";
import { assignTerminal, fetchStock, type StockTerminal } from "@milipay/shared/features/agent/api";
import { formatDate, formatNaira, timeAgo } from "@milipay/shared/lib/utils/format";
import { AutoGrid, Empty, ErrorLine, Page, PageHeader, Panel, SectionTitle } from "./parts";

/**
 * Merchants (handoff screen 9): the agent's merchants as cards, each opening
 * a merchant drawer, and the terminals in their stock, each opening a
 * terminal drawer to assign it.
 */

function MerchantDrawer({
  id,
  stock,
  onClose,
  onAssigned,
}: {
  id: string | null;
  stock: StockTerminal[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const { flash } = useToast();
  const [m, setM] = useState<MerchantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    fetchMerchantDetail(id).then(setM, (e) => setError(e instanceof Error ? e.message : "Could not load this merchant."));
  }, [id]);

  useEffect(() => {
    setM(null);
    setError(null);
    load();
  }, [load]);

  const add = async (t: StockTerminal) => {
    if (!m) return;
    setBusy(t.id);
    try {
      await assignTerminal(t.id, m.id);
      flash(`${t.terminalId} assigned to ${m.name}.`);
      onAssigned();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign that terminal.");
    } finally {
      setBusy(null);
    }
  };

  const status = m ? MERCHANT_STATUS[m.status] ?? [m.status, "muted"] : null;

  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      label="Merchant"
      header={
        m && (
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">{m.name}</div>
            <div className="mt-1">{status && <Pill tone={status[1]}>{status[0]}</Pill>}</div>
          </div>
        )
      }
      footer={
        m && (
          <div className="flex gap-2">
            {m.directorPhone && (
              <a href={`tel:${m.directorPhone}`} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[12px] border border-line text-sm font-semibold text-fg">
                <Phone size={16} /> Call owner
              </a>
            )}
            <a
              href={`mailto:support@milipay.ng?subject=${encodeURIComponent(`Problem with merchant ${m.name}`)}`}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[12px] border border-line text-sm font-semibold text-fg"
            >
              <AlertTriangle size={16} /> Report a problem
            </a>
          </div>
        )
      }
    >
      {error && <ErrorLine>{error}</ErrorLine>}
      {!m && !error && <div className="h-40 animate-pulse rounded-[14px] bg-field" />}
      {m && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Payments today", String(m.paymentsToday)],
              ["Volume", formatNaira(m.volume)],
              ["Terminals", String(m.terminals.length)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-[14px] border border-line p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[.06em] text-faint">{k}</div>
                <div className="mt-1 text-base font-bold text-fg">{v}</div>
              </div>
            ))}
          </div>
          <DrawerSection title="Business">
            <KeyValues
              rows={[
                { k: "CAC", v: m.cac ?? "—", mono: true },
                { k: "Owner", v: m.director },
                { k: "Phone", v: m.directorPhone ?? "—", mono: true },
                { k: "Settlement", v: `${m.bank} · ${m.accountNumber}` },
                { k: "Registered", v: formatDate(m.createdAt) },
              ]}
            />
          </DrawerSection>
          <DrawerSection title="Terminals">
            {m.terminals.length === 0 ? (
              <Empty>No terminal yet.</Empty>
            ) : (
              <div className="flex flex-col gap-2">
                {m.terminals.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-[14px] border border-line px-4 py-3">
                    <Router size={18} className="text-muted" />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-sm text-fg">{t.tid}</div>
                      <div className="text-[13px] text-muted">{t.lastHeartbeat ? `Seen ${timeAgo(t.lastHeartbeat)}` : "Not switched on yet"}</div>
                    </div>
                    {t.state === "online" ? (
                      <Pill tone="ok" pulse>
                        Online
                      </Pill>
                    ) : (
                      <Pill tone="warn">Waiting</Pill>
                    )}
                  </div>
                ))}
              </div>
            )}
          </DrawerSection>
          {stock.length > 0 && (
            <DrawerSection title="Add a terminal from your stock">
              <div className="flex flex-wrap gap-2">
                {stock.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => add(t)}
                    className="flex h-9 items-center gap-1.5 rounded-full border border-line px-3 font-mono text-[13px] text-fg hover:bg-hover disabled:opacity-50"
                  >
                    <Plus size={14} /> {busy === t.id ? "Assigning…" : t.terminalId}
                  </button>
                ))}
              </div>
            </DrawerSection>
          )}
        </>
      )}
    </Drawer>
  );
}

function TerminalDrawer({
  terminal,
  merchants,
  onClose,
  onAssigned,
}: {
  terminal: StockTerminal | null;
  merchants: MerchantRow[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const { flash } = useToast();
  const [merchantId, setMerchantId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eligible = merchants.filter((m) => m.status === "active" || m.status === "pending");
  const chosen = eligible.find((m) => m.id === merchantId);

  useEffect(() => {
    setMerchantId("");
    setError(null);
  }, [terminal]);

  return (
    <Drawer
      open={Boolean(terminal)}
      onClose={onClose}
      width={460}
      label="Terminal"
      header={terminal && <div className="truncate font-mono text-base font-semibold">{terminal.terminalId}</div>}
    >
      {terminal && (
        <>
          <KeyValues
            rows={[
              { k: "Status", v: <Pill tone="muted">In your stock</Pill> },
              { k: "Model", v: terminal.model ?? "—" },
              { k: "Serial", v: terminal.serial ?? "—", mono: true },
              { k: "Collected", v: formatDate(terminal.collectedAt) },
              { k: "Battery", v: "Shown once it's switched on" },
            ]}
          />
          <DrawerSection title="Assign to a merchant">
            {eligible.length === 0 ? (
              <Empty>Register a merchant first, then assign this terminal to them.</Empty>
            ) : (
              <div className="flex flex-col gap-3">
                <select
                  value={merchantId}
                  onChange={(e) => setMerchantId(e.target.value)}
                  aria-label="Merchant"
                  className="h-12 rounded-[12px] border border-line bg-field px-3 text-sm text-fg outline-none focus:border-brand"
                >
                  <option value="">Choose a merchant</option>
                  {eligible.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                {error && <ErrorLine>{error}</ErrorLine>}
                <button
                  type="button"
                  disabled={!chosen || busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      await assignTerminal(terminal.id, chosen!.id);
                      flash(`${terminal.terminalId} assigned to ${chosen!.name}.`);
                      onAssigned();
                      onClose();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Could not assign that terminal.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="h-12 rounded-[12px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-45"
                >
                  {busy ? "Assigning…" : chosen ? `Assign to ${chosen.name}` : "Assign"}
                </button>
              </div>
            )}
          </DrawerSection>
        </>
      )}
    </Drawer>
  );
}

export default function AgentMerchantsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const openId = params.get("id");
  const [rows, setRows] = useState<MerchantRow[] | null>(null);
  const [stock, setStock] = useState<StockTerminal[]>([]);
  const [terminal, setTerminal] = useState<StockTerminal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchMerchantList("all", "").then(
      (l) => {
        setRows(l.rows);
        setError(null);
      },
      (e) => setError(e instanceof Error ? e.message : "Could not load your merchants."),
    );
    fetchStock().then(setStock, () => setStock([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openMerchant = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set("id", id);
    else p.delete("id");
    setParams(p, { replace: true });
  };

  return (
    <Page>
      <PageHeader
        title="Merchants"
        sub="Businesses you registered, and the terminals you're holding."
        right={
          <button
            type="button"
            onClick={() => navigate(AGENT_ROUTES.registerMerchant)}
            className="flex h-11 items-center gap-2 rounded-[12px] bg-brand px-4 text-sm font-bold text-brand-ink"
          >
            <Building2 size={16} /> Register merchant
          </button>
        }
      />
      {error && <ErrorLine>{error}</ErrorLine>}
      {rows === null ? (
        !error && <div className="h-48 animate-pulse rounded-[20px] bg-panel" />
      ) : rows.length === 0 ? (
        <Empty>You haven't registered a merchant yet.</Empty>
      ) : (
        <AutoGrid min={280}>
          {rows.map((m) => {
            const cat = categoryStyle(m.category);
            const [label, tone] = MERCHANT_STATUS[m.status] ?? [m.status, "muted"];
            return (
              <Panel key={m.id} onClick={() => openMerchant(m.id)} className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-white" style={{ background: cat.color }}>
                    <Building2 size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold text-fg">{m.name}</div>
                    <div className="text-[13px] text-muted">
                      {cat.label} · {m.state}
                    </div>
                  </div>
                  <Pill tone={tone}>{label}</Pill>
                </div>
                <div className="flex gap-4 text-[13px] text-muted">
                  <span>
                    {m.terminals} terminal{m.terminals === 1 ? "" : "s"}
                  </span>
                  <span className="text-brand-text">{m.online} online</span>
                  <span>Since {formatDate(m.createdAt)}</span>
                </div>
              </Panel>
            );
          })}
        </AutoGrid>
      )}

      <section>
        <SectionTitle>Terminals in your stock</SectionTitle>
        {stock.length === 0 ? (
          <Empty>No terminals in your stock. Collect them from your hub.</Empty>
        ) : (
          <Panel className="!p-0">
            <div className="divide-y divide-line">
              {stock.map((t) => (
                <button key={t.id} type="button" onClick={() => setTerminal(t)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-hover">
                  <Router size={18} className="text-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm text-fg">{t.terminalId}</div>
                    <div className="text-[13px] text-muted">
                      {t.model ?? "Terminal"} · collected {formatDate(t.collectedAt)}
                    </div>
                  </div>
                  <span className="text-[13px] font-semibold text-brand-text">Assign</span>
                </button>
              ))}
            </div>
          </Panel>
        )}
      </section>

      <MerchantDrawer id={openId} stock={stock} onClose={() => openMerchant(null)} onAssigned={load} />
      <TerminalDrawer terminal={terminal} merchants={rows ?? []} onClose={() => setTerminal(null)} onAssigned={load} />
    </Page>
  );
}
