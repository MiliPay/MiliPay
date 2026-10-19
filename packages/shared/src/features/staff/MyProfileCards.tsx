import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Clock, KeyRound, Lock, Mail, UserRound, X } from "lucide-react";
import clsx from "clsx";
import { useToast } from "@milipay/shared/components/ui/Toast";
import { supabase } from "@milipay/shared/lib/supabase";
import { NIGERIAN_STATES } from "@milipay/shared/lib/constants";
import { timeAgo } from "@milipay/shared/lib/utils/format";
import {
  approverText,
  changeMyPassword,
  describeChanges,
  fetchMyProfile,
  passwordError,
  profileDraftChanged,
  profileDraftError,
  requestProfileChange,
  withdrawProfileChange,
  type MyProfile,
  type ProfileDraft,
} from "./profileChanges";

/**
 * "Your details" and "Password", the same in the admin, agent and support
 * portals. The email is shown but never editable. Name, phone and state go
 * through request_staff_profile_change: a super admin's apply at once, anyone
 * else's wait for an approver. A password change applies at once.
 */

const input = "h-10 w-full rounded-[10px] border border-line bg-field px-3 outline-none focus:border-brand";

function Panel({ icon: Icon, title, children }: { icon: typeof UserRound; title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
      <h2 className="flex items-center gap-2 px-[18px] pb-2.5 pt-4 text-[15px] font-bold">
        <Icon size={16} className="text-muted" aria-hidden="true" />
        {title}
      </h2>
      <div className="flex flex-col gap-3 border-t border-line2 px-[18px] py-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

export function ProfileDetailsCard({ onChanged }: { onChanged?: () => void }) {
  const { flash } = useToast();
  const [p, setP] = useState<MyProfile | null>(null);
  const [d, setD] = useState<ProfileDraft>({ fullName: "", phone: "", state: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const me = await fetchMyProfile();
      setP(me);
      setD({ fullName: me.name, phone: me.phone ?? "", state: me.state ?? "" });
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load your profile.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!p) {
    return (
      <Panel icon={UserRound} title="Your details">
        {err ? <div className="rounded-[10px] bg-fail-soft px-3 py-2.5 text-[13px] text-fail">{err}</div> : <div className="text-muted">Loading…</div>}
      </Panel>
    );
  }

  const approver = approverText(p.role);
  const pending = p.request?.status === "pending" ? p.request : null;
  const decided = p.request && !pending ? p.request : null;
  const changed = profileDraftChanged(d, p);
  const set = (patch: Partial<ProfileDraft>) => {
    setD((x) => ({ ...x, ...patch }));
    setErr("");
  };

  const save = async () => {
    const problem = profileDraftError(d);
    if (problem) return setErr(problem);
    setBusy(true);
    try {
      const outcome = await requestProfileChange(d);
      if (outcome === "applied") {
        // The portal header reads the name from the session; fetch a fresh one.
        await supabase.auth.refreshSession();
        flash("Your details are updated · logged");
      } else {
        flash(`Sent to ${approver} to approve · logged`);
      }
      await load();
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Your change wasn't saved.");
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    try {
      await withdrawProfileChange();
      flash("Change withdrawn · logged");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not withdraw it.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel icon={UserRound} title="Your details">
      {pending && (
        <div className="rounded-xl border border-line bg-warn-soft p-3 text-[13px]">
          <div className="flex items-center gap-2 font-semibold text-warn">
            <Clock size={15} aria-hidden="true" />
            Waiting for {approver} to approve · sent {timeAgo(pending.requestedAt)}
          </div>
          <ul className="mt-2 flex flex-col gap-1">
            {describeChanges(pending.changes, pending.previous).map((c) => (
              <li key={c.label}>
                <span className="text-muted">{c.label}:</span> <span className="line-through opacity-70">{c.from}</span> → <span className="font-semibold">{c.to}</span>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => void withdraw()} disabled={busy} className="mt-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-fail disabled:opacity-60">
            <X size={14} aria-hidden="true" />
            Withdraw this change
          </button>
        </div>
      )}
      {decided && (
        <div className={clsx("rounded-xl p-3 text-[13px]", decided.status === "approved" ? "bg-brand-soft text-brand-text" : "bg-fail-soft text-fail")}>
          {decided.status === "approved"
            ? `Your last change was approved${decided.decidedBy ? ` by ${decided.decidedBy}` : ""}.`
            : `Your last change wasn't approved${decided.decidedBy ? ` by ${decided.decidedBy}` : ""}${decided.note ? `: "${decided.note}"` : "."}`}
        </div>
      )}

      <Field label="Email (your sign-in ID)">
        <div className="flex h-10 items-center gap-2 rounded-[10px] border border-line bg-chip px-3 text-muted" aria-readonly="true">
          <Mail size={15} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{p.email}</span>
          <Lock size={14} aria-label="Can't be changed" />
        </div>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name">
          <input className={input} value={d.fullName} maxLength={80} onChange={(e) => set({ fullName: e.target.value })} />
        </Field>
        <Field label="Phone">
          <input
            className={clsx(input, "font-mono")}
            inputMode="tel"
            placeholder="0803 000 0000"
            value={d.phone}
            onChange={(e) => set({ phone: e.target.value.replace(/[^\d+]/g, "").slice(0, 14) })}
          />
        </Field>
        <Field label="State">
          <select className={input} value={d.state} onChange={(e) => set({ state: e.target.value })}>
            <option value="">Not set</option>
            {NIGERIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {err && <div className="rounded-[10px] bg-fail-soft px-3 py-2.5 text-[13px] text-fail">{err}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[200px] flex-1 text-xs text-muted">
          {approver
            ? pending
              ? `Sending again replaces the change waiting for approval. Your details stay as they are until ${approver} approves.`
              : `Changes go to ${approver} to approve. Your details stay as they are until then.`
            : "Changes apply as soon as you save. Your email can't be changed."}
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !changed}
          className="flex h-10 items-center gap-2 rounded-[10px] bg-brand px-4 font-bold text-brand-ink disabled:opacity-50"
        >
          {busy ? "Saving…" : approver ? "Send for approval" : "Save changes"}
        </button>
      </div>
    </Panel>
  );
}

export function PasswordCard() {
  const { flash } = useToast();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const problem = passwordError(pw, confirm);
    if (problem) return setErr(problem);
    setBusy(true);
    try {
      await changeMyPassword(pw);
      setPw("");
      setConfirm("");
      setErr("");
      flash("Password changed");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Your password wasn't changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel icon={KeyRound} title="Password">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="New password">
          <input className={input} type="password" autoComplete="new-password" placeholder="At least 8 characters" value={pw} onChange={(e) => (setPw(e.target.value), setErr(""))} />
        </Field>
        <Field label="Type it again">
          <input className={input} type="password" autoComplete="new-password" value={confirm} onChange={(e) => (setConfirm(e.target.value), setErr(""))} />
        </Field>
      </div>
      {err && <div className="rounded-[10px] bg-fail-soft px-3 py-2.5 text-[13px] text-fail">{err}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[200px] flex-1 text-xs text-muted">Takes effect straight away; no approval needed. Use it next time you sign in.</div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !pw}
          className="flex h-10 items-center gap-2 rounded-[10px] border border-line px-4 font-semibold disabled:opacity-50"
        >
          {busy ? "Changing…" : "Change password"}
        </button>
      </div>
    </Panel>
  );
}
