import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { createStaffMember } from "@milipay/shared/features/staff/api";
import { STAFF_ROLES, assignableRoles } from "@milipay/shared/features/staff/roles";
import { NIGERIAN_STATES } from "@milipay/shared/lib/constants";
import type { Role } from "@milipay/shared/types";

/**
 * Invite staff (design handoff): name, work email, phone, state, NIN and a
 * role. create-staff makes the login and sends a one-time password by
 * WhatsApp or SMS; it never comes back here. An admin can invite agents and
 * support; only a super admin can invite administrators.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the result line for the toast. */
  onSuccess: (message?: string) => void;
}

const EMPTY = { fullName: "", email: "", phone: "", state: "", nin: "", role: "support" as Role };

export function CreateStaffModal({ isOpen, onClose, onSuccess }: Props) {
  const { user } = useAuth();
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const allowed = assignableRoles(user?.role);

  useEffect(() => {
    if (isOpen) {
      setF(EMPTY);
      setErr("");
      setBusy(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, busy, onClose]);

  if (!isOpen) return null;

  const set = (patch: Partial<typeof EMPTY>) => {
    setF((p) => ({ ...p, ...patch }));
    setErr("");
  };

  const send = async () => {
    if (!f.fullName.trim() || !/^\S+@\S+\.\S+$/.test(f.email.trim())) return setErr("Enter a name and a valid work email.");
    if (!/^0[789][01]\d{8}$/.test(f.phone)) return setErr("Enter an 11-digit Nigerian phone number. The one-time password goes there.");
    if (!/^\d{11}$/.test(f.nin)) return setErr("NIN must be 11 digits.");
    if (!allowed.includes(f.role)) return setErr("Only a super admin can invite administrators.");
    setBusy(true);
    try {
      const r = await createStaffMember({ fullName: f.fullName, email: f.email, phone: f.phone, nin: f.nin, role: f.role, state: f.state || undefined });
      onSuccess(
        r.delivered
          ? `Invite sent to ${f.fullName.trim()} · logged`
          : `${f.fullName.trim()} was added, but the password couldn't be sent · logged`,
      );
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send the invite.");
      setBusy(false);
    }
  };

  const input = "h-10 w-full rounded-[10px] border border-line bg-field px-3 outline-none focus:border-brand";
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="invite-title">
      <div className="absolute inset-0 animate-fade-in bg-scrim" onClick={() => !busy && onClose()} />
      <div className="relative flex max-h-[calc(100vh-32px)] w-[560px] max-w-full animate-rise-in flex-col gap-3.5 overflow-y-auto rounded-[20px] border border-line bg-panel p-6 shadow-pop">
        <div>
          <h2 id="invite-title" className="text-lg font-bold">
            Invite staff
          </h2>
          <div className="mt-1 text-muted">They get a one-time password by WhatsApp or SMS, and set up two-factor on first sign-in when it's required.</div>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted">Full name</span>
            <input className={input} placeholder="e.g. Amina Yusuf" value={f.fullName} onChange={(e) => set({ fullName: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted">Work email</span>
            <input className={input} type="email" placeholder="name@milipay.ng" value={f.email} onChange={(e) => set({ email: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted">Phone</span>
            <input
              className={clsx(input, "font-mono")}
              inputMode="tel"
              placeholder="0803 000 0000"
              value={f.phone}
              onChange={(e) => set({ phone: e.target.value.replace(/\D/g, "").slice(0, 11) })}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted">State</span>
            <select className={input} value={f.state} onChange={(e) => set({ state: e.target.value })}>
              <option value="">Select a state</option>
              {NIGERIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs font-semibold text-muted">NIN</span>
            <input
              className={clsx(input, "font-mono")}
              inputMode="numeric"
              placeholder="11 digits"
              value={f.nin}
              onChange={(e) => set({ nin: e.target.value.replace(/\D/g, "").slice(0, 11) })}
            />
          </label>
        </div>
        <div className="text-xs font-semibold text-muted">Role</div>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Role">
          {(Object.keys(STAFF_ROLES) as Role[]).map((r) => {
            const on = f.role === r;
            const ok = allowed.includes(r);
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!ok}
                onClick={() => set({ role: r })}
                className={clsx(
                  "rounded-xl border-[1.5px] p-3 text-left disabled:cursor-not-allowed disabled:opacity-45",
                  on ? "border-brand bg-brand-soft" : "border-line",
                )}
              >
                <div className="font-semibold">{STAFF_ROLES[r as keyof typeof STAFF_ROLES].label}</div>
                <div className="mt-0.5 text-xs leading-[1.4] text-muted">{ok ? STAFF_ROLES[r as keyof typeof STAFF_ROLES].desc : "Only a super admin can invite this role."}</div>
              </button>
            );
          })}
        </div>
        {err && <div className="rounded-[10px] bg-fail-soft px-3 py-2.5 text-[13px] text-fail">{err}</div>}
        <div className="mt-1 flex justify-end gap-2.5">
          <button type="button" onClick={onClose} disabled={busy} className="h-10 rounded-[10px] border border-line px-4 font-semibold">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy}
            className="flex h-10 items-center gap-2 rounded-[10px] bg-brand px-4 font-bold text-brand-ink disabled:opacity-60"
          >
            <Send size={15} aria-hidden="true" />
            {busy ? "Sending…" : "Send invite"}
          </button>
        </div>
      </div>
    </div>
  );
}
