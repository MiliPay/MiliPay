import { useCallback, useEffect, useState } from "react";
import { Ban, Check, ChevronDown, Download, Lock, ScrollText, Search, ShieldAlert, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { Chips, ToolbarSearch } from "@milipay/shared/components/ui/Tabs";
import { TONE_CLASSES, type Tone } from "@milipay/shared/components/ui/StatusBadge";
import { useToast } from "@milipay/shared/components/ui/Toast";
import {
  AUDIT_CATEGORIES,
  auditRoleLabel,
  deviceLabel,
  fetchAuditEvents,
  fetchAuditSummary,
  logAudit,
  verifyAuditChain,
  type AuditCategory,
  type AuditEvent,
  type AuditSummary,
} from "@milipay/shared/features/audit/api";
import { initials } from "@milipay/shared/lib/utils/format";

/**
 * Admin › Audit log (design handoff): every action by staff and the system.
 * Rows can't be edited or deleted, and each one's hash covers the one
 * before, so "Verify chain" can prove nothing was changed. Click a row for
 * before/after, the reason given, the session and the hash.
 */

const PAGE = 30;
const COLS = "grid grid-cols-[150px_minmax(0,1.1fr)_minmax(0,2fr)_120px_minmax(0,1fr)_90px_24px] gap-3.5";

const stamp = (iso: string) => {
  const p = new Intl.DateTimeFormat("en-GB", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Africa/Lagos",
  }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("month")}-${v("day")} ${v("hour")}:${v("minute")}:${v("second")}`;
};

const pretty = (v: unknown) => (v === null || v === undefined ? "—" : JSON.stringify(v, null, 2));

export default function AuditLogPage() {
  const { flash } = useToast();
  const [category, setCategory] = useState<AuditCategory | "All">("All");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AuditEvent[] | null>(null);
  const [more, setMore] = useState(false);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    try {
      const list = await fetchAuditEvents({ category: category === "All" ? null : category, q: query, limit: PAGE });
      setRows(list);
      setMore(list.length === PAGE);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the audit log.");
    }
  }, [category, query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetchAuditSummary().then(setSummary, () => setSummary(null));
  }, []);

  const loadMore = async () => {
    if (!rows?.length) return;
    const next = await fetchAuditEvents({
      category: category === "All" ? null : category,
      q: query,
      beforeId: rows[rows.length - 1].id,
      limit: PAGE,
    });
    setRows([...rows, ...next]);
    setMore(next.length === PAGE);
  };

  const verify = async () => {
    setChecking(true);
    try {
      const r = await verifyAuditChain();
      flash(
        r.ok
          ? `Chain intact · ${r.checked.toLocaleString("en-NG")} events checked`
          : `Chain broken at event ${r.firstBadId}. Tell engineering now.`,
        r.ok ? "ok" : "fail",
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not check the chain.", "fail");
    } finally {
      setChecking(false);
    }
  };

  const exportCsv = async () => {
    try {
      const all: AuditEvent[] = [];
      let before: number | null = null;
      for (let i = 0; i < 50; i++) {
        const page = await fetchAuditEvents({ category: category === "All" ? null : category, q: query, beforeId: before, limit: 200 });
        all.push(...page);
        if (page.length < 200) break;
        before = page[page.length - 1].id;
      }
      const head = ["Event", "Time (UTC)", "Actor", "Role", "Category", "Action", "Target", "Result", "Reason", "IP", "Device", "Before", "After", "Hash"];
      const body = all.map((e) => [
        e.id,
        e.occurredAt,
        e.actorName,
        auditRoleLabel(e.actorRole),
        e.category,
        e.action,
        e.target ?? "",
        e.result,
        e.reason ?? "",
        e.ip ?? "",
        deviceLabel(e.userAgent),
        e.before ? JSON.stringify(e.before) : "",
        e.after ? JSON.stringify(e.after) : "",
        e.hash,
      ]);
      const csv = [head, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `milipay-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      await logAudit({ category: "Auth", action: "exported audit log", target: `${all.length.toLocaleString("en-NG")} rows` });
      flash("Audit log exported · this export is also logged");
      void load();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Export failed.", "fail");
    }
  };

  const stats: { label: string; value: number | undefined; icon: LucideIcon; tone: Tone }[] = [
    { label: "Events today", value: summary?.eventsToday, icon: ScrollText, tone: "muted" },
    { label: "Sensitive actions today", value: summary?.sensitiveToday, icon: ShieldAlert, tone: "warn" },
    { label: "Denied attempts today", value: summary?.deniedToday, icon: Ban, tone: "fail" },
    { label: "Active staff today", value: summary?.activeStaffToday, icon: Users, tone: "ok" },
  ];

  return (
    <div className="flex max-w-[1480px] animate-fade-in flex-col gap-[18px] p-4 sm:p-7">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-[-.02em]">Audit log</h1>
            <div className="flex items-center gap-[5px] rounded-full bg-chip px-[9px] py-[3px] text-xs font-semibold text-muted">
              <Lock size={12} aria-hidden="true" />
              Tamper-evident · kept 7 years
            </div>
          </div>
          <div className="mt-1 text-muted">Every action by staff and the system. Entries can't be edited or deleted.</div>
        </div>
        <button
          type="button"
          onClick={() => void verify()}
          disabled={checking}
          className="flex h-[38px] items-center gap-2 rounded-[10px] border border-line bg-panel px-3.5 font-semibold hover:bg-hover disabled:opacity-50"
        >
          <ShieldCheck size={16} aria-hidden="true" />
          {checking ? "Checking…" : "Verify chain"}
        </button>
        <button
          type="button"
          onClick={() => void exportCsv()}
          className="flex h-[38px] items-center gap-2 rounded-[10px] border border-line bg-panel px-3.5 font-semibold hover:bg-hover"
        >
          <Download size={16} aria-hidden="true" />
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {stats.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="flex items-center gap-3.5 rounded-2xl border border-line bg-panel px-[18px] py-4 shadow-card">
              <div className={clsx("flex h-[38px] w-[38px] items-center justify-center rounded-[11px]", TONE_CLASSES[k.tone])}>
                <Icon size={18} aria-hidden="true" />
              </div>
              <div>
                <div className="text-[22px] font-bold tabular-nums">{k.value ?? "—"}</div>
                <div className="text-[13px] text-muted">{k.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3">
          <ToolbarSearch value={q} onChange={setQ} width={280} placeholder="Actor, action or target" icon={<Search size={15} aria-hidden="true" />} />
          <Chips
            options={(["All", ...AUDIT_CATEGORIES] as const).map((c) => ({ id: c, label: c }))}
            value={category}
            onChange={(c) => setCategory(c as AuditCategory | "All")}
          />
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[1080px]">
            <div className={clsx(COLS, "border-b border-line bg-field px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-faint")}>
              <div>Time</div>
              <div>Actor</div>
              <div>Action</div>
              <div>Area</div>
              <div>IP · device</div>
              <div>Result</div>
              <div />
            </div>
            {error && <div className="p-12 text-center text-fail">{error}</div>}
            {!error && rows && rows.length === 0 && <div className="p-12 text-center text-muted">Nothing recorded matches this.</div>}
            {!error && !rows && <div className="p-12 text-center text-muted">Loading…</div>}
            {rows?.map((e) => {
              const open = openId === e.id;
              const system = e.actorRole === "system";
              const denied = e.result === "denied";
              return (
                <div key={e.id} className="border-b border-line2">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : e.id)}
                    aria-expanded={open}
                    className={clsx(COLS, "min-h-[52px] w-full items-center px-5 text-left hover:bg-hover", open && "bg-hover")}
                  >
                    <div className="font-mono text-xs text-muted">{stamp(e.occurredAt)}</div>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className={clsx(
                          "flex h-7 w-7 flex-none items-center justify-center rounded-full text-[10px] font-bold",
                          system ? "bg-info-soft text-info" : "bg-chip text-muted",
                        )}
                      >
                        {system ? "SY" : initials(e.actorName)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{e.actorName}</div>
                        <div className="text-xs text-muted">{auditRoleLabel(e.actorRole)}</div>
                      </div>
                    </div>
                    <div className="min-w-0 leading-[1.4]">
                      <span className="text-muted">{e.action}</span> {e.target && <span className="font-semibold">{e.target}</span>}
                    </div>
                    <div>
                      <span className="inline-flex rounded-md bg-chip px-2 py-[3px] text-xs font-semibold text-muted">{e.category}</span>
                    </div>
                    <div className="min-w-0 truncate text-xs text-muted">
                      <span className="font-mono">{e.ip || "—"}</span> · {deviceLabel(e.userAgent)}
                    </div>
                    <div className={clsx("inline-flex items-center gap-[5px] text-xs font-semibold", denied ? "text-fail" : "text-brand-text")}>
                      {denied ? <Ban size={13} aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
                      {denied ? "Denied" : "Success"}
                    </div>
                    <ChevronDown size={16} aria-hidden="true" className={clsx("text-faint transition-transform", open && "rotate-180")} />
                  </button>
                  {open && (
                    <div className="grid animate-fade-in gap-3.5 px-5 pb-[18px] pt-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_260px] lg:pl-[184px]">
                      <Diff title="Before" body={pretty(e.before)} cls="text-fail" />
                      <Diff title="After" body={pretty(e.after)} cls="text-brand-text" />
                      <div className="flex flex-col gap-2 text-xs">
                        <Info k="Event ID" v={`#${e.id}`} mono />
                        <Info k="Session" v={e.sessionId ? e.sessionId.slice(0, 8) + "…" : "—"} mono />
                        <Info k="Device" v={deviceLabel(e.userAgent)} />
                        <Info k="Reason given" v={e.reason || "—"} />
                        <Info k="Hash" v={e.hash.slice(0, 10) + "…"} mono faint />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {more && (
          <div className="flex justify-center p-3">
            <button type="button" onClick={() => void loadMore()} className="h-8 rounded-lg border border-line px-3 text-[13px] font-semibold hover:bg-hover">
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Diff({ title, body, cls }: { title: string; body: string; cls: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="border-b border-line bg-field px-3 py-2 text-[11px] font-semibold uppercase tracking-[.06em] text-faint">{title}</div>
      <pre className={clsx("m-0 whitespace-pre-wrap p-3 font-mono text-xs leading-[1.6]", cls)}>{body}</pre>
    </div>
  );
}

function Info({ k, v, mono, faint }: { k: string; v: string; mono?: boolean; faint?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <div className="text-muted">{k}</div>
      <div className={clsx("text-right", mono && "font-mono", faint && "text-faint")}>{v}</div>
    </div>
  );
}
