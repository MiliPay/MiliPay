import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Wrench } from "lucide-react";
import { Drawer, DrawerSection, KeyValues } from "@milipay/shared/components/ui/Drawer";
import { Pill } from "@milipay/shared/components/ui/StatusBadge";
import { Tabs } from "@milipay/shared/components/ui/Tabs";
import { useToast } from "@milipay/shared/components/ui/Toast";
import {
  fetchRegistrations,
  registrationStatus,
  resubmitRegistration,
  type Registration,
  type RegistrationTab,
} from "@milipay/shared/features/agent/api";
import { formatNaira, formatTimestamp, whenLabel } from "@milipay/shared/lib/utils/format";
import { CaptureTile, Empty, ErrorLine, Page, PageHeader, Panel, type Captured } from "./parts";

/**
 * My registrations (handoff screen 8) with the detail drawer, and Fix and
 * resubmit (screen 7) inside it: admin's note, recapture, send back.
 */

const TABS: { id: RegistrationTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending review" },
  { id: "approved", label: "Approved" },
  { id: "fix", label: "Needs fixing" },
  { id: "upgrades", label: "Upgrades" },
];

const isTab = (v: string | null): v is RegistrationTab => TABS.some((t) => t.id === v);

function FixPanel({ reg, onDone }: { reg: Registration; onDone: () => void }) {
  const { flash } = useToast();
  const [palm, setPalm] = useState<Captured | null>(null);
  const [face, setFace] = useState<Captured | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reason = (reg.reason ?? "").toLowerCase();
  // Recapture only what failed; when admin's note doesn't say, offer both.
  const wantsPalm = reason.includes("palm") || !reason.includes("face");
  const wantsFace = reason.includes("face") || reason.includes("photo") || !reason.includes("palm");
  const ready = (!palm || palm.quality >= 70) && (!face || face.quality >= 70) && Boolean(palm || face);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await resubmitRegistration(reg.id, {
        ...(palm ? { palmVeinTemplate: palm.template, palmQuality: palm.quality } : {}),
        ...(face ? { faceTemplate: face.template, faceQuality: face.quality } : {}),
      });
      flash("Sent back for review.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resubmit.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DrawerSection title="Fix and resubmit">
      <div className="flex flex-col gap-3">
        <div className="rounded-[12px] bg-fail-soft px-4 py-3 text-[13px] text-fail">
          <div className="font-semibold">Admin's note</div>
          <div className="mt-0.5">{reg.reason || "No note was left. Recapture the palm and face."}</div>
        </div>
        {wantsPalm && <CaptureTile kind="palm" value={palm} onChange={setPalm} />}
        {wantsFace && <CaptureTile kind="face" value={face} onChange={setFace} />}
        {error && <ErrorLine>{error}</ErrorLine>}
        <button
          type="button"
          disabled={!ready || busy}
          onClick={send}
          className="h-12 rounded-[12px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-45"
        >
          {busy ? "Sending…" : "Resubmit for review"}
        </button>
      </div>
    </DrawerSection>
  );
}

export default function RegistrationsPage() {
  const [params, setParams] = useSearchParams();
  const tab: RegistrationTab = isTab(params.get("tab")) ? (params.get("tab") as RegistrationTab) : "all";
  const openId = params.get("id");
  const [rows, setRows] = useState<Registration[] | null>(null);
  const [all, setAll] = useState<Registration[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, everything] = await Promise.all([fetchRegistrations(tab), tab === "all" ? null : fetchRegistrations("all")]);
      setRows(list);
      setAll(everything ?? list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your registrations.");
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (next: { tab?: RegistrationTab; id?: string | null }) => {
    const p = new URLSearchParams(params);
    if (next.tab !== undefined) (next.tab === "all" ? p.delete("tab") : p.set("tab", next.tab));
    if (next.id !== undefined) (next.id ? p.set("id", next.id) : p.delete("id"));
    setParams(p, { replace: true });
  };

  const counts: Record<RegistrationTab, number> | null = all
    ? {
        all: all.length,
        pending: all.filter((r) => r.status === "pending").length,
        approved: all.filter((r) => r.status === "active").length,
        fix: all.filter((r) => r.status === "rejected").length,
        upgrades: all.filter((r) => r.kind === "upgrade").length,
      }
    : null;
  const open = (all ?? []).find((r) => r.id === openId) ?? (rows ?? []).find((r) => r.id === openId) ?? null;

  return (
    <Page>
      <PageHeader title="My registrations" sub="Customers you registered or upgraded. Commission counts once a registration is approved." />
      <Tabs
        tabs={TABS.map((t) => ({ ...t, count: counts?.[t.id] ?? null, hot: t.id === "fix" && (counts?.fix ?? 0) > 0 }))}
        value={tab}
        onChange={(id) => set({ tab: id })}
      />
      {error && <ErrorLine>{error}</ErrorLine>}
      {rows === null ? (
        !error && <div className="h-64 animate-pulse rounded-[20px] bg-panel" />
      ) : rows.length === 0 ? (
        <Empty>Nothing here yet.</Empty>
      ) : (
        <Panel className="!p-0">
          <div className="divide-y divide-line">
            {rows.map((r) => {
              const [label, tone] = registrationStatus(r);
              return (
                <button key={r.id} type="button" onClick={() => set({ id: r.id })} className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left hover:bg-hover">
                  <div className="min-w-[180px] flex-1">
                    <div className="text-sm font-semibold text-fg">{r.name}</div>
                    <div className="font-mono text-[13px] text-muted">{r.phone}</div>
                    {r.status === "rejected" && r.reason && <div className="mt-0.5 text-[13px] text-fail">{r.reason}</div>}
                  </div>
                  <div className="w-24 text-[13px] text-muted">{r.kind === "upgrade" ? "Upgrade" : "Customer"}</div>
                  <div className="w-20 text-[13px] text-muted">{whenLabel(r.at)}</div>
                  <Pill tone={tone}>{label}</Pill>
                </button>
              );
            })}
          </div>
        </Panel>
      )}

      <Drawer
        open={Boolean(open)}
        onClose={() => set({ id: null })}
        label="Registration"
        header={
          open && (
            <div className="min-w-0">
              <div className="truncate text-base font-semibold">{open.name}</div>
              <div className="mt-1">
                <Pill tone={registrationStatus(open)[1]}>{registrationStatus(open)[0]}</Pill>
              </div>
            </div>
          )
        }
      >
        {open && (
          <>
            <KeyValues
              rows={[
                { k: "Type", v: open.kind === "upgrade" ? "Tier 2 upgrade" : "New customer" },
                { k: "Phone", v: open.phone, mono: true },
                { k: "NIN", v: open.ninLast4 ? `••••••• ${open.ninLast4}` : "—", mono: true },
                { k: "Palm", v: open.palm ? "Captured" : <span className="text-fail">Missing</span> },
                { k: "Face", v: open.face ? "Captured" : <span className="text-fail">Missing</span> },
                { k: "Tier", v: `Tier ${open.tier}` },
                {
                  k: "Commission",
                  v: open.status === "active" || open.kind === "upgrade" ? formatNaira(open.commission) : `${formatNaira(open.commission)} when approved`,
                },
              ]}
            />
            <DrawerSection title="Timeline">
              <ol className="flex flex-col gap-2 text-[13px]">
                <li className="text-muted">
                  {open.kind === "upgrade" ? "Upgraded" : "Registered"} · <span className="text-fg">{formatTimestamp(open.at)}</span>
                </li>
                {open.approvedAt && (
                  <li className="text-muted">
                    Approved · <span className="text-fg">{formatTimestamp(open.approvedAt)}</span>
                  </li>
                )}
                {open.status === "rejected" && <li className="text-fail">Declined: {open.reason || "no note"}</li>}
                {open.status === "pending" && <li className="text-warn">Waiting for admin review</li>}
              </ol>
            </DrawerSection>
            {open.status === "rejected" && open.kind === "customer" && (
              <FixPanel
                reg={open}
                onDone={() => {
                  set({ id: null });
                  load();
                }}
              />
            )}
            {open.status === "rejected" && open.kind !== "customer" && (
              <div className="flex items-center gap-2 text-[13px] text-muted">
                <Wrench size={14} /> Only the agent who registered this customer can fix it.
              </div>
            )}
          </>
        )}
      </Drawer>
    </Page>
  );
}
