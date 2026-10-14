import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Inbox, Mail, Phone, PhoneCall, RotateCcw, Search, X } from "lucide-react";
import clsx from "clsx";
import { Drawer, DrawerSection, KeyValues } from "@milipay/shared/components/ui/Drawer";
import { ReasonDialog, type ReasonDialogProps } from "@milipay/shared/components/ui/ReasonDialog";
import { Pill } from "@milipay/shared/components/ui/StatusBadge";
import { Chips, Tabs, ToolbarSearch } from "@milipay/shared/components/ui/Tabs";
import { useToast } from "@milipay/shared/components/ui/Toast";
import {
  AGENT_APPLICATION_STATUS,
  MERCHANT_LEAD_STATUS,
  fetchAgentApplications,
  fetchMerchantLeads,
  fetchWebsiteSummary,
  formatLocalPhone,
  internationalPhone,
  leadStatusStyle,
  nextStatuses,
  setLeadStatus,
  statusActionLabel,
  type AgentApplication,
  type LeadKind,
  type LeadStatus,
  type MerchantLead,
  type WebsiteSummary,
} from "@milipay/shared/features/website/admin";
import { initials, whenLabel } from "@milipay/shared/lib/utils/format";
import { EmptyState } from "./EmptyState";

/**
 * Website → Leads: terminal applications from merchants and applications to
 * become an agent, sent from the marketing website. Staff follow each one up
 * and move it along; every change needs a note and is audited.
 */

type Lead = MerchantLead | AgentApplication;
type StatusFilter = "all" | LeadStatus;

const MERCHANT_COLS = "grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)_120px_110px_110px_90px] gap-3.5";
const AGENT_COLS = "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_110px_110px_90px] gap-3.5";

const isMerchant = (l: Lead): l is MerchantLead => "businessName" in l;
const leadName = (l: Lead) => (isMerchant(l) ? l.businessName : l.fullName);

export default function LeadsPage() {
  const { flash } = useToast();
  const [params, setParams] = useSearchParams();
  const kind: LeadKind = params.get("tab") === "agents" ? "agents" : "merchants";
  const openId = params.get("id");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Lead[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [summary, setSummary] = useState<WebsiteSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Omit<ReasonDialogProps, "open" | "onClose"> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    try {
      const list =
        kind === "merchants"
          ? await fetchMerchantLeads(status as "all", query)
          : await fetchAgentApplications(status as "all", query);
      setRows(list.rows);
      setCounts(list.counts);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load applications.");
    }
    fetchWebsiteSummary().then(setSummary, () => setSummary(null));
  }, [kind, status, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const setOpen = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set("id", id);
    else p.delete("id");
    setParams(p, { replace: true });
  };

  const switchKind = (k: LeadKind) => {
    if (k === kind) return;
    setRows(null);
    setCounts(null);
    setStatus("all");
    setParams(new URLSearchParams({ tab: k }), { replace: true });
  };

  const open = rows?.find((r) => r.id === openId) ?? null;

  const changeStatus = (lead: Lead, to: LeadStatus) => {
    const name = leadName(lead);
    const [label] = leadStatusStyle(kind, to);
    const bad = to === "declined";
    setDialog({
      title: `${statusActionLabel(to)}: ${name}?`,
      body: bad
        ? "The application is closed. Say why, so the next person knows what was decided."
        : to === "new"
          ? "The application goes back to the New queue."
          : `The application is marked ${label.toLowerCase()}. Note what was agreed or what happens next.`,
      icon: bad ? X : to === "new" ? RotateCcw : Check,
      tone: bad ? "fail" : "ok",
      confirmLabel: statusActionLabel(to),
      noteRequired: true,
      notePlaceholder: "Note (required): who you spoke to, what was agreed",
      onConfirm: async (note) => {
        await setLeadStatus(kind, lead.id, to, note);
        setDialog(null);
        flash(`${name} · ${label} · logged`);
        await load();
      },
    });
  };

  const options = Object.entries(kind === "merchants" ? MERCHANT_LEAD_STATUS : AGENT_APPLICATION_STATUS).map(([id, [label]]) => ({
    id: id as StatusFilter,
    label,
    count: counts?.[id],
  }));
  const cols = kind === "merchants" ? MERCHANT_COLS : AGENT_COLS;
  const filtered = Boolean(query) || status !== "all";

  return (
    <div className="flex max-w-[1480px] animate-fade-in flex-col gap-[18px] p-4 sm:p-7">
      <div>
        <h1 className="text-2xl font-bold tracking-[-.02em]">Leads</h1>
        <div className="mt-1 text-muted">Applications sent from the website. Call each one back, then record what was agreed.</div>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
        <Tabs<LeadKind>
          tabs={[
            { id: "merchants", label: "Merchants", count: summary?.newMerchantLeads ?? null, hot: true },
            { id: "agents", label: "Agents", count: summary?.newAgentApplications ?? null, hot: true },
          ]}
          value={kind}
          onChange={switchKind}
        />
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3">
          <ToolbarSearch
            value={q}
            onChange={setQ}
            width={300}
            placeholder={kind === "merchants" ? "Business, contact, CAC, phone or email" : "Name, area, phone or email"}
            icon={<Search size={15} aria-hidden="true" />}
          />
          <Chips<StatusFilter> options={[{ id: "all", label: "All", count: counts?.all }, ...options]} value={status} onChange={setStatus} />
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className={clsx(cols, "border-b border-line bg-field px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-faint")}>
              {(kind === "merchants"
                ? ["Business", "Contact", "State", "Tills", "Status"]
                : ["Applicant", "Area", "Workplace", "State", "Status"]
              ).map((h) => (
                <div key={h}>{h}</div>
              ))}
              <div className="text-right">Sent</div>
            </div>
            {error && <div className="p-12 text-center text-fail">{error}</div>}
            {!error && !rows && <div className="p-12 text-center text-muted">Loading…</div>}
            {!error && rows && rows.length === 0 && (
              <EmptyState
                icon={Inbox}
                title={filtered ? "Nothing matches this" : "No applications yet"}
                body={
                  filtered
                    ? "Try another search or status."
                    : kind === "merchants"
                      ? "Terminal applications from the website's Business page appear here."
                      : "Applications from the website's Agents page appear here."
                }
              />
            )}
            {rows?.map((l) => {
              const [label, tone] = leadStatusStyle(kind, l.status);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setOpen(l.id)}
                  className={clsx(cols, "min-h-[56px] w-full items-center border-b border-line2 px-5 py-2 text-left hover:bg-hover", openId === l.id && "bg-hover")}
                >
                  {isMerchant(l) ? (
                    <>
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{l.businessName}</div>
                        <div className="truncate text-xs text-muted">{l.businessType}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate">{l.contactName}</div>
                        <div className="font-mono text-xs text-muted">{formatLocalPhone(l.phone)}</div>
                      </div>
                      <div className="truncate text-[13px] text-muted">{l.state}</div>
                      <div className="text-[13px]">{l.tills}</div>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{l.fullName}</div>
                        <div className="font-mono text-xs text-muted">{formatLocalPhone(l.phone)}</div>
                      </div>
                      <div className="truncate text-[13px]">{l.area}</div>
                      <div className="truncate text-[13px] text-muted">{l.workplace}</div>
                      <div className="truncate text-[13px] text-muted">{l.state}</div>
                    </>
                  )}
                  <div>
                    <Pill tone={tone}>{label}</Pill>
                  </div>
                  <div className="text-right text-[13px] text-muted">{whenLabel(l.createdAt)}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {open && <LeadDrawer kind={kind} lead={open} onClose={() => setOpen(null)} onChange={changeStatus} />}
      {dialog && <ReasonDialog open onClose={() => setDialog(null)} {...dialog} />}
    </div>
  );
}

function LeadDrawer({
  kind,
  lead,
  onClose,
  onChange,
}: {
  kind: LeadKind;
  lead: Lead;
  onClose: () => void;
  onChange: (lead: Lead, to: LeadStatus) => void;
}) {
  const [label, tone] = leadStatusStyle(kind, lead.status);
  const name = leadName(lead);

  const details = isMerchant(lead)
    ? [
        { k: "Business type", v: lead.businessType },
        { k: "CAC number", v: lead.cac, mono: true },
        { k: "State", v: lead.state },
        { k: "Tills", v: lead.tills },
        { k: "Settlement bank", v: lead.settlementBank },
      ]
    : [
        { k: "State", v: lead.state },
        { k: "Area", v: lead.area },
        { k: "Where they'd work", v: lead.workplace },
      ];

  const next = nextStatuses(kind, lead.status);
  const footer = (
    <div className="flex flex-wrap gap-2.5">
      {next.map((s, i) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(lead, s)}
          className={clsx(
            "flex h-[42px] min-w-[120px] flex-1 items-center justify-center gap-2 rounded-[10px] border font-bold",
            s === "declined" ? "border-line text-fail" : i === 0 && s !== "new" ? "border-brand bg-brand text-brand-ink" : "border-line bg-panel",
          )}
        >
          {s === "declined" ? <X size={16} aria-hidden="true" /> : s === "new" ? <RotateCcw size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
          {statusActionLabel(s)}
        </button>
      ))}
    </div>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      width={540}
      label={name}
      footer={footer}
      header={
        <>
          <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-chip font-bold text-muted">{initials(name) || "?"}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold">{name}</div>
            <div className="text-xs text-muted">
              {kind === "merchants" ? "Terminal application" : "Agent application"} · {whenLabel(lead.createdAt)}
            </div>
          </div>
          <Pill tone={tone} size="lg">
            {label}
          </Pill>
        </>
      }
    >
      <DrawerSection title="Contact">
        <div className="flex flex-col gap-2">
          {isMerchant(lead) && <div className="font-semibold">{lead.contactName}</div>}
          <div className="flex flex-wrap gap-2">
            <a
              href={`tel:${internationalPhone(lead.phone)}`}
              className="flex h-9 items-center gap-2 rounded-[9px] border border-line px-3 font-mono text-[13px] font-semibold hover:bg-hover"
            >
              <Phone size={14} aria-hidden="true" />
              {formatLocalPhone(lead.phone)}
            </a>
            <a
              href={`mailto:${lead.email}`}
              className="flex h-9 min-w-0 max-w-full items-center gap-2 rounded-[9px] border border-line px-3 text-[13px] font-semibold hover:bg-hover"
            >
              <Mail size={14} aria-hidden="true" />
              <span className="truncate">{lead.email}</span>
            </a>
          </div>
        </div>
      </DrawerSection>

      <DrawerSection title="Application">
        <KeyValues rows={details} />
      </DrawerSection>

      <DrawerSection title="Follow-up">
        {lead.statusChangedAt ? (
          <div className="rounded-[14px] border border-line p-3.5">
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <PhoneCall size={14} aria-hidden="true" />
              Marked {label.toLowerCase()} by {lead.statusChangedBy ?? "an administrator"} · {whenLabel(lead.statusChangedAt)}
            </div>
            {lead.statusNote && <div className="mt-2 whitespace-pre-wrap leading-normal">{lead.statusNote}</div>}
          </div>
        ) : (
          <div className="text-[13px] text-muted">Nobody has followed this up yet. Each change is recorded on the audit log with its note.</div>
        )}
      </DrawerSection>
    </Drawer>
  );
}
