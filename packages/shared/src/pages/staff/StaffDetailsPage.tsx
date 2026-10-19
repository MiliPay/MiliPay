import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Ban, Check, KeyRound, Laptop, LogOut, Mail, MapPin, Minus, Phone, RotateCcw, Smartphone, UserCog, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { ReasonDialog, type ReasonDialogProps } from "@milipay/shared/components/ui/ReasonDialog";
import { Pill, TONE_CLASSES } from "@milipay/shared/components/ui/StatusBadge";
import { useToast } from "@milipay/shared/components/ui/Toast";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { fetchStaffDetail, signOutOtherSessions, staffAction, type StaffDetail } from "@milipay/shared/features/staff/api";
import { PasswordCard, ProfileDetailsCard } from "@milipay/shared/features/staff/MyProfileCards";
import { PERMISSIONS, STAFF_ROLES, assignableRoles, canManage, deviceLabel, isPhoneUa, roleMeta } from "@milipay/shared/features/staff/roles";
import { ROUTES } from "@milipay/shared/lib/constants";
import { initials, timeAgo } from "@milipay/shared/lib/utils/format";
import type { Role } from "@milipay/shared/types";
import { staffStatus } from "./StaffPage";

/**
 * A member of staff (design handoff, admin "staffOne"), and "My profile":
 * who they are, what their role allows, where they're signed in, and what
 * they've done. Change role, Reset 2FA, Reset password and Suspend go through
 * staff-admin with a reason; on your own profile you can sign out your other
 * sessions, edit your details (with approval by role) and change your password.
 */

type DialogConfig = Omit<ReasonDialogProps, "open" | "onClose">;

const stamp = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })
    .format(new Date(iso))
    .replace(",", "");

export default function StaffDetailsPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { flash } = useToast();
  const [p, setP] = useState<StaffDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogConfig | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchStaffDetail(id);
      setP(d);
      setError(d ? null : "That staff member wasn't found.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this profile.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !p) {
    return (
      <div className="p-4 sm:p-7">
        <BackLink />
        <div className="mt-4 rounded-xl bg-fail-soft p-3.5 text-[13px] text-fail">{error}</div>
      </div>
    );
  }
  if (!p) return <LoadingState title="Loading the profile" />;

  const role = roleMeta(p.role);
  const [st, stTone] = staffStatus(p);
  const manage = canManage(user?.role, p.role, p.self);
  const done = async (message: string) => {
    setDialog(null);
    flash(message);
    await load();
  };
  const run = (action: Parameters<typeof staffAction>[1], message: (delivered: boolean | null) => string, roleTo?: Role) => async (note: string) => {
    const r = await staffAction(p.id, action, note, roleTo);
    await done(message(r.delivered));
  };

  const actions: { label: string; icon: LucideIcon; tone?: "fail" | "ok"; open: () => void }[] = [];
  if (p.self) {
    actions.push({
      label: "Sign out other sessions",
      icon: LogOut,
      open: async () => {
        try {
          const n = await signOutOtherSessions();
          flash(n ? `${n} other session${n === 1 ? "" : "s"} signed out · logged` : "No other sessions · logged");
          await load();
        } catch (e) {
          flash(e instanceof Error ? e.message : "Could not sign out other sessions.", "fail");
        }
      },
    });
  } else if (manage) {
    const roles = assignableRoles(user?.role).filter((r) => r !== p.role);
    actions.push({
      label: "Change role",
      icon: UserCog,
      open: () =>
        setDialog({
          title: `Change ${p.name}'s role`,
          body: "They're signed out and get the new role's portal and permissions when they sign in again.",
          icon: UserCog,
          tone: "ok",
          confirmLabel: "Save role",
          reasons: roles.map((r) => `${STAFF_ROLES[r as keyof typeof STAFF_ROLES].label}: ${STAFF_ROLES[r as keyof typeof STAFF_ROLES].desc}`),
          noteRequired: true,
          notePlaceholder: "Why is the role changing?",
          onConfirm: async (note, picked) => {
            const to = roles.find((r) => picked?.startsWith(STAFF_ROLES[r as keyof typeof STAFF_ROLES].label + ":"));
            if (!to) throw new Error("Choose the new role.");
            await run("change_role", () => `${p.name} is now ${STAFF_ROLES[to as keyof typeof STAFF_ROLES].label} · logged`, to)(note);
          },
        }),
    });
    if (p.twoFactor) {
      actions.push({
        label: "Reset 2FA",
        icon: KeyRound,
        open: () =>
          setDialog({
            title: "Reset two-factor sign-in?",
            body: `${p.name}'s authenticator is removed and they're signed out. They set one up again on next sign-in.`,
            icon: KeyRound,
            tone: "fail",
            confirmLabel: "Reset 2FA",
            noteRequired: true,
            onConfirm: run("reset_2fa", () => `2FA reset for ${p.name} · logged`),
          }),
      });
    }
    if (p.status === "active") {
      actions.push({
        label: "Reset password",
        icon: KeyRound,
        open: () =>
          setDialog({
            title: `Reset ${p.name}'s password?`,
            body: "Their password stops working and they're signed out. A one-time password goes to their phone by WhatsApp or SMS.",
            icon: KeyRound,
            tone: "fail",
            confirmLabel: "Reset password",
            noteRequired: true,
            onConfirm: run("reset_password", (sent) => (sent ? `New password sent to ${p.name} · logged` : `Password reset, but it couldn't be sent · logged`)),
          }),
      });
      actions.push({
        label: "Suspend",
        icon: Ban,
        tone: "fail",
        open: () =>
          setDialog({
            title: `Suspend ${p.name}?`,
            body: "All their sessions end now and they cannot sign in.",
            icon: Ban,
            tone: "fail",
            confirmLabel: "Suspend",
            noteRequired: true,
            notePlaceholder: "Reason (required)",
            onConfirm: run("suspend", () => `${p.name} suspended · logged`),
          }),
      });
    } else {
      actions.push({
        label: "Reactivate",
        icon: RotateCcw,
        tone: "ok",
        open: () =>
          setDialog({
            title: `Reactivate ${p.name}?`,
            body: "They can sign in again.",
            icon: RotateCcw,
            tone: "ok",
            confirmLabel: "Reactivate",
            noteRequired: true,
            onConfirm: run("reactivate", () => `${p.name} reactivated · logged`),
          }),
      });
    }
  }

  return (
    <div className="flex max-w-[1480px] animate-fade-in flex-col gap-[18px] p-4 sm:p-7">
      <BackLink />

      <div className="flex flex-wrap items-center gap-[18px] rounded-card border border-line bg-panel p-[22px] shadow-card">
        <div className="flex h-[60px] w-[60px] flex-none items-center justify-center rounded-full bg-chip text-xl font-bold text-muted">{initials(p.name)}</div>
        <div className="min-w-[240px] flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-bold tracking-[-.02em]">{p.name}</h1>
            <span className={clsx("inline-flex rounded-md px-[9px] py-[3px] text-xs font-semibold", TONE_CLASSES[role.tone])}>{role.label}</span>
            <Pill tone={stTone}>{st}</Pill>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-[18px] gap-y-1 text-[13px] text-muted">
            <div className="flex items-center gap-1.5">
              <Mail size={14} aria-hidden="true" />
              {p.email}
            </div>
            {p.phone && (
              <div className="flex items-center gap-1.5">
                <Phone size={14} aria-hidden="true" />
                <span className="font-mono">{p.phone}</span>
              </div>
            )}
            {p.state && (
              <div className="flex items-center gap-1.5">
                <MapPin size={14} aria-hidden="true" />
                {p.state}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.open}
              className={clsx(
                "flex h-[38px] items-center gap-2 rounded-[10px] border border-line px-3.5 font-semibold",
                a.tone === "fail" ? "text-fail" : a.tone === "ok" ? "text-brand-text" : "text-fg",
              )}
            >
              <a.icon size={16} aria-hidden="true" />
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {p.self && (
        <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <ProfileDetailsCard onChanged={() => void load()} />
          <PasswordCard />
        </div>
      )}

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="flex flex-col gap-3.5">
          <Card title="Permissions">
            {PERMISSIONS.map(([label, roles]) => {
              const ok = roles.includes(p.role);
              return (
                <div key={label} className="flex items-center gap-2.5 border-t border-line2 px-[18px] py-[9px] text-[13px]">
                  <div className={clsx("flex-1", ok ? "text-fg" : "text-faint")}>{label}</div>
                  {ok ? (
                    <Check size={15} strokeWidth={2.5} className="text-brand-text" aria-label="Allowed" />
                  ) : (
                    <Minus size={15} strokeWidth={2.5} className="text-faint" aria-label="Not allowed" />
                  )}
                </div>
              );
            })}
            <div className="flex items-center gap-2.5 border-t border-line2 px-[18px] py-[9px] text-[13px]">
              <div className="flex-1 text-muted">Two-factor sign-in</div>
              <div className={p.twoFactor ? "font-semibold text-brand-text" : "font-semibold text-warn"}>{p.twoFactor ? "Set up" : "Not set up"}</div>
            </div>
          </Card>
          <Card title="Active sessions">
            {p.sessions.length === 0 && (
              <div className="flex items-center gap-2.5 border-t border-line2 px-[18px] py-2.5 text-[13px] text-muted">
                <Laptop size={16} aria-hidden="true" />
                No active sessions
              </div>
            )}
            {p.sessions.map((x) => {
              const Icon = isPhoneUa(x.userAgent) ? Smartphone : Laptop;
              return (
                <div key={x.id} className="flex items-center gap-2.5 border-t border-line2 px-[18px] py-2.5 text-[13px]">
                  <Icon size={16} className="text-muted" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{deviceLabel(x.userAgent)}</div>
                    <div className="text-xs text-muted">
                      <span className="font-mono">{x.ip ?? "—"}</span>
                      {x.aal === "aal2" ? " · 2FA passed" : ""}
                    </div>
                  </div>
                  <div className={clsx("text-xs", x.current ? "text-brand-text" : "text-muted")}>{x.current ? "This session" : timeAgo(x.lastActive)}</div>
                </div>
              );
            })}
          </Card>
        </div>
        <Card
          title="Activity"
          right={
            <Link to={ROUTES.audit} className="text-[13px] font-semibold text-brand-text">
              Full audit log
            </Link>
          }
        >
          {p.activity.length === 0 && <div className="border-t border-line2 p-6 text-center text-muted">No recorded actions yet.</div>}
          {p.activity.map((e) => (
            <div key={e.id} className="grid grid-cols-[110px_minmax(0,1fr)_100px] items-center gap-3 border-t border-line2 px-[18px] py-2.5 text-[13px]">
              <div className="font-mono text-xs text-muted">{stamp(e.at)}</div>
              <div className="min-w-0">
                <span className={e.result === "denied" ? "text-fail" : "text-muted"}>{e.action}</span> <span className="font-semibold">{e.target}</span>
              </div>
              <div>
                <span className="inline-flex rounded-md bg-chip px-[7px] py-0.5 text-[11px] font-semibold text-muted">{e.category}</span>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {dialog && <ReasonDialog open onClose={() => setDialog(null)} {...dialog} />}
    </div>
  );
}

function Card({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
      <div className="flex items-center px-[18px] pb-2.5 pt-4">
        <h2 className="flex-1 text-[15px] font-bold">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function BackLink() {
  return (
    <Link to={ROUTES.staff} className="flex w-max items-center gap-1.5 font-medium text-muted">
      <ArrowLeft size={15} aria-hidden="true" />
      Staff
    </Link>
  );
}
