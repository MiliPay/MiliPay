import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import clsx from "clsx";
import { Chips } from "@milipay/shared/components/ui/Tabs";
import { Pill, TONE_CLASSES } from "@milipay/shared/components/ui/StatusBadge";
import { useToast } from "@milipay/shared/components/ui/Toast";
import { fetchStaff, type StaffRow } from "@milipay/shared/features/staff/api";
import { STAFF_ROLES, roleMeta } from "@milipay/shared/features/staff/roles";
import { ROUTES } from "@milipay/shared/lib/constants";
import { initials, timeAgo } from "@milipay/shared/lib/utils/format";
import { CreateStaffModal } from "./CreateStaffModal";

/**
 * Staff (design handoff, admin "Staff"): everyone who can use the admin,
 * agent and support portals, with their role, whether they use two-factor,
 * when they last signed in, and an agent's registrations.
 */

type Filter = "all" | keyof typeof STAFF_ROLES;
const COLS = "grid grid-cols-[minmax(0,1.6fr)_130px_90px_110px_70px_120px_110px] gap-3.5";

/** "Invited" until they've signed in once. */
export function staffStatus(p: Pick<StaffRow, "status" | "lastSignIn">): ["Active" | "Invited" | "Suspended", "ok" | "warn" | "fail"] {
  if (p.status === "suspended") return ["Suspended", "fail"];
  if (!p.lastSignIn) return ["Invited", "warn"];
  return ["Active", "ok"];
}

export default function StaffPage() {
  const navigate = useNavigate();
  const { flash } = useToast();
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await fetchStaff());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load staff.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const count = (f: Filter) => (rows ?? []).filter((p) => f === "all" || p.role === f).length;
  const shown = (rows ?? []).filter((p) => filter === "all" || p.role === filter);

  return (
    <div className="flex max-w-[1480px] animate-fade-in flex-col gap-[18px] p-4 sm:p-7">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1">
          <h1 className="text-2xl font-bold tracking-[-.02em]">Staff</h1>
          <div className="mt-1 text-muted">Who can use the admin, agent and support portals, and what they can do.</div>
        </div>
        <button
          type="button"
          onClick={() => setInviting(true)}
          className="flex h-[38px] items-center gap-2 rounded-[10px] bg-brand px-3.5 font-bold text-brand-ink"
        >
          <UserPlus size={16} aria-hidden="true" />
          Invite staff
        </button>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3">
          <Chips<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "All", count: count("all") },
              ...(Object.keys(STAFF_ROLES) as (keyof typeof STAFF_ROLES)[]).map((r) => ({ id: r, label: STAFF_ROLES[r].label, count: count(r) })),
            ]}
          />
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className={clsx(COLS, "border-b border-line bg-field px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-faint")}>
              <div>Name</div>
              <div>Role</div>
              <div>State</div>
              <div>Status</div>
              <div>2FA</div>
              <div>Last active</div>
              <div className="text-right">Registrations</div>
            </div>
            {error && <div className="p-12 text-center text-fail">{error}</div>}
            {!error && !rows && <div className="p-12 text-center text-muted">Loading…</div>}
            {!error && rows && shown.length === 0 && <div className="p-12 text-center text-muted">No staff here.</div>}
            {shown.map((p) => {
              const role = roleMeta(p.role);
              const [st, tone] = staffStatus(p);
              const last = [p.lastSignIn, p.lastAction].filter(Boolean).sort().pop() ?? null;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate(ROUTES.staffDetails.replace(":id", p.id))}
                  className={clsx(COLS, "h-14 w-full items-center border-b border-line2 px-5 text-left hover:bg-hover")}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-chip text-[11px] font-bold text-muted">{initials(p.name) || "?"}</div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{p.name}</div>
                      <div className="truncate text-xs text-muted">{p.email}</div>
                    </div>
                  </div>
                  <div>
                    <span className={clsx("inline-flex rounded-md px-[9px] py-[3px] text-xs font-semibold", TONE_CLASSES[role.tone])}>{role.label}</span>
                  </div>
                  <div className="truncate text-muted">{p.state || "—"}</div>
                  <div>
                    <Pill tone={tone}>{st}</Pill>
                  </div>
                  <div className={p.twoFactor ? "text-brand-text" : "text-warn"} title={p.twoFactor ? "Uses an authenticator" : "No authenticator"}>
                    {p.twoFactor ? <ShieldCheck size={16} aria-label="Uses two-factor" /> : <ShieldOff size={16} aria-label="No two-factor" />}
                  </div>
                  <div className="text-[13px] text-muted">{last ? timeAgo(last) : p.lastSignIn ? "—" : "Invite sent"}</div>
                  <div className="text-right tabular-nums text-muted">{p.registrations ?? "—"}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <CreateStaffModal
        isOpen={inviting}
        onClose={() => setInviting(false)}
        onSuccess={(message) => {
          if (message) flash(message);
          void load();
        }}
      />
    </div>
  );
}
