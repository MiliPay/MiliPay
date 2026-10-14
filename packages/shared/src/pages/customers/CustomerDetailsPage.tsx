import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Ban,
  Check,
  CircleDot,
  Clock,
  Fingerprint,
  Hand,
  Hash,
  KeyRound,
  Landmark,
  LifeBuoy,
  Lock,
  LogIn,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  RotateCcw,
  ScanFace,
  Send,
  Shield,
  ShieldAlert,
  Smartphone,
  Tv,
  Unlink,
  UserCheck,
  UserPlus,
  UserRoundPlus,
  UserX,
  Wifi,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import {
  connectedRecords,
  customerAction,
  editCustomerDetails,
  fetchCustomerDetail,
  kycRows,
  limitRows,
  profileBanner,
  securityEvents,
  type CustomerDetail,
  type SecurityEvent,
} from "@milipay/shared/features/customers/admin";
import { approveCustomer, rejectCustomer, resendCustomerCredentials } from "@milipay/shared/features/customers/api";
import { SERVICE, providerName } from "@milipay/shared/features/dashboard/view";
import { Pill, StatusBadge, TONE_CLASSES } from "@milipay/shared/components/ui/StatusBadge";
import { ReasonDialog, type ReasonDialogProps } from "@milipay/shared/components/ui/ReasonDialog";
import { Modal } from "@milipay/shared/components/ui/Modal";
import { Input } from "@milipay/shared/components/ui/Input";
import { Select } from "@milipay/shared/components/ui/Select";
import { Button } from "@milipay/shared/components/ui/Button";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { useToast } from "@milipay/shared/components/ui/Toast";
import { TransactionDrawer } from "@milipay/shared/components/transactions/TransactionDrawer";
import { presentTransactionStatus } from "@milipay/shared/lib/transactionStatus";
import { NIGERIAN_STATES, ROUTES } from "@milipay/shared/lib/constants";
import { DEFAULT_REJECTION_REASONS } from "@milipay/shared/types";
import { formatNairaWhole, initials, timeAgo } from "@milipay/shared/lib/utils/format";

/**
 * Customer profile (design handoff, admin "Customer detail"): who they are
 * and how they were checked, biometrics, limits, linked accounts, activity,
 * security and sign-in, connected records, and payments. The actions depend
 * on the status and on who is looking: admins approve, reject, suspend and
 * reactivate; admins and support can reset a password; agents only look.
 */

const SVC_ICON: Record<string, LucideIcon> = { palm: Hand, airtime: Smartphone, data: Wifi, power: Zap, cable: Tv, other: CircleDot };
const SEC_ICON: Record<SecurityEvent["icon"], LucideIcon> = { key: KeyRound, mail: Mail, phone: Phone, smartphone: Smartphone, fingerprint: Fingerprint };

type DialogConfig = Omit<ReasonDialogProps, "open" | "onClose">;

function Panel({ title, right, children, className }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={clsx("overflow-hidden rounded-card border border-line bg-panel shadow-card", className)}>
      {title && (
        <div className="flex items-center px-[18px] pb-2.5 pt-4">
          <h2 className="flex-1 text-[15px] font-bold">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export default function CustomerDetailsPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { flash } = useToast();
  const [c, setC] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogConfig | null>(null);
  const [txKey, setTxKey] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);

  const role = user?.role;
  const isAdmin = role === "admin" || role === "super_admin";
  const canReset = isAdmin || role === "support";
  const inAdmin = pathname.startsWith("/dashboard/");
  const listPath = inAdmin ? ROUTES.customers : "/customers";

  const load = useCallback(async () => {
    try {
      const d = await fetchCustomerDetail(id);
      setC(d);
      setError(d ? null : "That customer wasn't found, or isn't one you can see.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this customer.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !c) {
    return (
      <div className="p-4 sm:p-7">
        <BackLink to={listPath} />
        <div className="mt-4 rounded-xl bg-fail-soft p-3.5 text-[13px] text-fail">{error}</div>
      </div>
    );
  }
  if (!c) return <LoadingState title="Loading the customer" />;

  const done = async (message: string) => {
    setDialog(null);
    flash(message);
    await load();
  };

  const actions: { label: string; icon: LucideIcon; style: "primary" | "danger" | "plain"; open: () => void }[] = [];
  if (isAdmin && c.status === "pending") {
    actions.push(
      {
        label: "Reject",
        icon: X,
        style: "danger",
        open: () =>
          setDialog({
            title: `Reject ${c.name}?`,
            body: "They will get an SMS with the reason and can re-register with an agent.",
            icon: UserX,
            tone: "fail",
            confirmLabel: "Reject registration",
            reasons: [...DEFAULT_REJECTION_REASONS],
            notePlaceholder: "Optional note",
            onConfirm: async (note, reason) => {
              const why = reason === "Other reason" ? note : [reason, note].filter(Boolean).join(" ");
              if (!why || why.length < 3) throw new Error("Say why in the note.");
              await rejectCustomer(c.id, why);
              await done(`${c.name} rejected · logged`);
            },
          }),
      },
      {
        label: "Approve",
        icon: Check,
        style: "primary",
        open: () =>
          setDialog({
            title: `Approve ${c.name}?`,
            body: "This moves them to Tier 2 and lets them pay with their palm straight away.",
            icon: UserCheck,
            tone: "ok",
            confirmLabel: "Approve customer",
            notePlaceholder: "Optional note",
            onConfirm: async (note) => {
              const r = await approveCustomer(c.id, note);
              await done(r.delivered ? `${c.name} approved · logged` : `${c.name} approved · the message didn't send, so tell them another way`);
            },
          }),
      },
    );
  }
  if (c.status === "active" && canReset && c.hasLogin) {
    actions.push({
      label: "Reset password",
      icon: KeyRound,
      style: "plain",
      open: () =>
        setDialog({
          title: "Reset their password?",
          body: `Their password stops working and they're signed out everywhere. They log in with ${c.phone ?? "their phone"} and an SMS code, then set a new password with Forgot password.`,
          icon: KeyRound,
          tone: "ok",
          confirmLabel: "Reset password",
          noteRequired: true,
          notePlaceholder: "Why? How did you confirm it's really them? (required)",
          onConfirm: async (note) => {
            const r = await customerAction(c.id, "reset_password", note);
            await done(`Password reset${r.customerTold ? "" : " · the SMS didn't send"} · logged`);
          },
        }),
    });
  }
  if (isAdmin && c.status === "active") {
    actions.push({
      label: "Suspend",
      icon: Ban,
      style: "danger",
      open: () =>
        setDialog({
          title: `Suspend ${c.name}?`,
          body: "Palm payments and app access stop immediately, and they're signed out everywhere. Nothing is deleted.",
          icon: Ban,
          tone: "fail",
          confirmLabel: "Suspend account",
          noteRequired: true,
          notePlaceholder: "Reason (required)",
          onConfirm: async (note) => {
            await customerAction(c.id, "suspend", note);
            await done(`${c.name} suspended · logged`);
          },
        }),
    });
  }
  if (isAdmin && c.status === "suspended") {
    actions.push({
      label: "Reactivate",
      icon: RotateCcw,
      style: "primary",
      open: () =>
        setDialog({
          title: `Reactivate ${c.name}?`,
          body: "They can log in and pay again.",
          icon: RotateCcw,
          tone: "ok",
          confirmLabel: "Reactivate",
          noteRequired: true,
          notePlaceholder: "Reason (required)",
          onConfirm: async (note) => {
            await customerAction(c.id, "reactivate", note);
            await done(`${c.name} reactivated · logged`);
          },
        }),
    });
  }

  const resend = async () => {
    setMenu(false);
    try {
      const r = await resendCustomerCredentials(c.id);
      flash(r.delivered ? "Verified message sent again · logged" : "The message still couldn't be sent", r.delivered ? "ok" : "fail");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not resend.", "fail");
    }
  };

  const banner = profileBanner(c);
  const self = c.source === "self";
  const records = connectedRecords(c);
  const security = securityEvents(c);
  const ticketPath = (ticketId: string) => (inAdmin ? ROUTES.supportDetails.replace(":id", ticketId) : `/complaints/${ticketId}`);

  return (
    <div className="flex max-w-[1480px] animate-fade-in flex-col gap-[18px] p-4 sm:p-7">
      <BackLink to={listPath} />

      <Panel className="flex flex-wrap items-center gap-[18px] p-[22px]">
        <div className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-[linear-gradient(145deg,#0a7a5a,#022c22)] text-[22px] font-bold text-[#fff]">
          {initials(c.name)}
        </div>
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-bold tracking-[-.02em]">{c.name}</h1>
            <StatusBadge status={c.status} />
            <span className="rounded-md bg-chip px-[9px] py-[3px] text-xs font-semibold text-muted">Tier {c.tier ?? "—"}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-[18px] gap-y-1 text-[13px] text-muted">
            <Meta icon={Phone} mono>
              {c.phone || "—"}
            </Meta>
            {c.email && <Meta icon={Mail}>{c.email}</Meta>}
            {c.state && <Meta icon={MapPin}>{c.state}</Meta>}
            <Meta icon={Hash} mono>
              {c.id.slice(0, 8)}
            </Meta>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                type="button"
                onClick={a.open}
                className={clsx(
                  "flex h-[38px] items-center gap-2 rounded-[10px] border px-3.5 font-semibold",
                  a.style === "primary" && "border-brand bg-brand text-brand-ink",
                  a.style === "danger" && "border-line text-fail hover:bg-fail-soft",
                  a.style === "plain" && "border-line hover:bg-hover",
                )}
              >
                <Icon size={16} aria-hidden="true" />
                {a.label}
              </button>
            );
          })}
          {isAdmin && (
            <MoreMenu open={menu} setOpen={setMenu}>
              <MenuButton icon={Pencil} label="Edit details" onClick={() => { setMenu(false); setEditing(true); }} />
              {c.status === "active" && !self && c.hasLogin && <MenuButton icon={Send} label="Resend verified message" onClick={() => void resend()} />}
            </MoreMenu>
          )}
        </div>
      </Panel>

      {banner && (
        <div className={clsx("flex gap-2.5 rounded-[14px] px-4 py-3.5 text-[13px] leading-[1.45]", TONE_CLASSES[banner.tone])}>
          {banner.tone === "warn" ? <Clock size={16} className="mt-px flex-none" /> : banner.tone === "info" ? <UserRoundPlus size={16} className="mt-px flex-none" /> : <XCircle size={16} className="mt-px flex-none" />}
          <div>
            <b>{banner.title}</b> {banner.body}
          </div>
        </div>
      )}

      <div className="grid gap-3.5 xl:grid-cols-3">
        <Panel title="Identity & KYC">
          {kycRows(c).map((r) => (
            <div key={r.k} className="flex items-center gap-2.5 border-t border-line2 px-[18px] py-2.5 text-[13px]">
              <div className="flex-1 text-muted">{r.k}</div>
              <div className={clsx("text-right font-medium", r.mono && "font-mono")}>{r.v}</div>
              {r.badge && (
                <span className={clsx("inline-flex flex-none items-center gap-1 rounded-md px-[7px] py-0.5 text-[11px] font-semibold", TONE_CLASSES[r.badge.tone])}>
                  {r.badge.tone === "ok" ? <Check size={11} strokeWidth={2.5} /> : r.badge.tone === "warn" ? <Clock size={11} strokeWidth={2.5} /> : <X size={11} strokeWidth={2.5} />}
                  {r.badge.text}
                </span>
              )}
            </div>
          ))}
        </Panel>

        <div className="flex flex-col gap-3.5">
          <Panel className="px-[18px] py-4">
            <h2 className="text-[15px] font-bold">Biometrics</h2>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <BioTile
                icon={Hand}
                label="Palm vein"
                on={c.hasPalm}
                quality={c.palm?.quality ?? null}
                sub={
                  c.hasPalm
                    ? `${c.palm?.quality != null ? `Quality ${c.palm.quality}/100 · ` : ""}${c.palm?.captures ?? 0} capture${c.palm?.captures === 1 ? "" : "s"}${c.palmSimulated ? " · test" : ""}`
                    : self
                      ? "Not set up · visit an agent"
                      : "Not captured"
                }
              />
              <BioTile
                icon={ScanFace}
                label="Face"
                on={c.hasFace || Boolean(c.selfieVerifiedAt)}
                quality={c.hasFace || c.selfieVerifiedAt ? 100 : null}
                sub={self && c.selfieVerifiedAt ? "Selfie · Smile ID match" : c.hasFace ? `Captured${c.faceSimulated ? " · test" : ""}` : "Not captured"}
              />
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-xs text-faint">
              <Lock size={12} aria-hidden="true" />
              Templates are encrypted and never shown in the console.
            </div>
          </Panel>
          <Panel title="Limits">
            {limitRows(c).map((r) => (
              <div key={r.k} className="flex justify-between border-t border-line2 px-[18px] py-2.5 text-[13px]">
                <div className="text-muted">{r.k}</div>
                <div className="font-semibold tabular-nums">{r.v}</div>
              </div>
            ))}
          </Panel>
        </div>

        <div className="flex flex-col gap-3.5">
          <Panel title="Linked accounts">
            {c.accounts.length === 0 && (
              <div className="flex items-center gap-2.5 border-t border-line2 px-[18px] py-2.5">
                <IconTile icon={Landmark} />
                <div>
                  <div className="text-[13px] font-semibold">No linked accounts</div>
                  <div className="text-xs text-muted">{self ? "Customer links banks in the app through Mono" : "Linked in the app after approval"}</div>
                </div>
              </div>
            )}
            {c.accounts.map((a) => (
              <div key={a.id} className="flex items-center gap-2.5 border-t border-line2 px-[18px] py-2.5">
                <IconTile icon={Landmark} />
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">{a.bank ?? "Bank"}</div>
                  <div className="font-mono text-xs text-muted">••••{a.last4}</div>
                </div>
                {a.palmDefault && <span className="rounded-md bg-brand-soft px-[7px] py-0.5 text-[11px] font-semibold text-brand-text">Palm default</span>}
              </div>
            ))}
          </Panel>
          <Panel title="Activity" className="flex-1">
            {c.audit.map((e, i) => (
              <ActivityRow key={i} icon={Shield} text={`${e.actorName} ${e.action}${e.reason ? `: "${e.reason}"` : ""}`} at={e.at} />
            ))}
            {c.txs[0] && (
              <ActivityRow
                icon={c.txs[0].palm ? Hand : SVC_ICON[c.txs[0].serviceType ?? "other"] ?? CircleDot}
                text={`Last payment ${formatNairaWhole(c.txs[0].amount)} ${c.txs[0].palm ? `at ${c.txs[0].merchantName ?? "a merchant"}` : `for ${providerName(c.txs[0].provider)} ${(SERVICE[c.txs[0].serviceType ?? "other"] ?? SERVICE.other).label}`}`}
                at={c.txs[0].createdAt}
              />
            )}
            {c.security.lastCodeSignIn && <ActivityRow icon={LogIn} text="Signed in with an SMS code" at={c.security.lastCodeSignIn} />}
            <ActivityRow icon={UserPlus} text={self ? "Signed up in the app (Tier 1)" : `Registered by ${c.registeredBy?.name ?? "an agent"}`} at={c.createdAt} />
          </Panel>
        </div>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Panel title="Security & sign-in">
          {security.length === 0 && <div className="border-t border-line2 px-[18px] py-4 text-[13px] text-muted">Nothing recorded yet.</div>}
          {security.map((e, i) => {
            const Icon = SEC_ICON[e.icon];
            return (
              <div key={i} className="flex items-center gap-3 border-t border-line2 px-[18px] py-2.5 text-[13px]">
                <IconTile icon={Icon} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{e.text}</div>
                  <div className="text-xs text-muted">{e.sub}</div>
                </div>
                <div className="whitespace-nowrap text-xs text-faint">{e.at ? timeAgo(e.at) : ""}</div>
              </div>
            );
          })}
        </Panel>
        <Panel title="Connected records">
          {records.length === 0 && <div className="border-t border-line2 px-[18px] py-4 text-[13px] text-muted">Nothing connected yet.</div>}
          {records.map((r, i) => {
            const Icon = r.kind === "ticket" ? LifeBuoy : r.kind === "mismatch" ? Unlink : r.kind === "fraud" ? ShieldAlert : UserRoundPlus;
            const to =
              r.kind === "ticket" && r.id && role !== "agent"
                ? ticketPath(r.id)
                : r.kind !== "ticket" && inAdmin && isAdmin
                  ? `${ROUTES.signups}${r.kind === "signup" && r.id ? `?id=${r.id}` : ""}`
                  : null;
            const body = (
              <>
                <IconTile icon={Icon} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{r.label}</div>
                  <div className="text-xs text-muted">{r.sub}</div>
                </div>
                {to && <ArrowUpRight size={14} aria-hidden="true" />}
              </>
            );
            return to ? (
              <Link key={i} to={to} className="flex items-center gap-3 border-t border-line2 px-[18px] py-2.5 text-[13px] hover:bg-hover">
                {body}
              </Link>
            ) : (
              <div key={i} className="flex items-center gap-3 border-t border-line2 px-[18px] py-2.5 text-[13px]">
                {body}
              </div>
            );
          })}
          <div className="border-t border-line2 px-[18px] pb-3.5 pt-2.5 text-xs text-faint">Tickets, sign-up records and bank-linking problems for this customer.</div>
        </Panel>
      </div>

      <Panel
        title="Transactions"
        right={c.txCount > 0 ? <div className="text-[13px] text-muted">{c.txCount.toLocaleString("en-NG")} payments · {formatNairaWhole(c.txTotal)} delivered</div> : undefined}
      >
        {c.txs.length === 0 && <div className="border-t border-line2 p-6 text-center text-muted">No transactions yet.</div>}
        <div className="overflow-x-auto">
          {c.txs.map((t) => {
            const svc = t.palm ? "palm" : t.serviceType && SERVICE[t.serviceType] ? t.serviceType : "other";
            const s = SERVICE[svc];
            const Icon = SVC_ICON[svc] ?? CircleDot;
            const st = presentTransactionStatus(t.status);
            const row = (
              <>
                <div className="truncate font-mono text-[12.5px]">{t.reference}</div>
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px]" style={{ background: s.color + "24", color: s.color }}>
                    <Icon size={13} aria-hidden="true" />
                  </div>
                  <div className="truncate">
                    {t.palm ? t.merchantName : providerName(t.provider)} {!t.palm && <span className="text-muted">{s.label}</span>}
                  </div>
                </div>
                <div className="text-right font-semibold tabular-nums">{formatNairaWhole(t.amount)}</div>
                <div>
                  <Pill tone={st.tone}>{st.label}</Pill>
                </div>
                <div className="text-right text-[13px] text-muted">{timeAgo(t.createdAt)}</div>
              </>
            );
            const cls = "grid h-12 min-w-[700px] grid-cols-[150px_minmax(0,1.5fr)_120px_150px_100px] items-center gap-3.5 border-t border-line2 px-5 text-left";
            return isAdmin ? (
              <button key={t.id} type="button" onClick={() => setTxKey(t.id)} className={clsx(cls, "w-full hover:bg-hover")}>
                {row}
              </button>
            ) : (
              <div key={t.id} className={cls}>
                {row}
              </div>
            );
          })}
        </div>
      </Panel>

      {dialog && <ReasonDialog open onClose={() => setDialog(null)} {...dialog} />}
      {isAdmin && <TransactionDrawer txKey={txKey} onClose={() => setTxKey(null)} onChanged={() => void load()} />}
      {isAdmin && editing && (
        <EditDetails
          c={c}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            flash("Details saved · logged");
            await load();
          }}
        />
      )}
    </div>
  );
}

function BackLink({ to }: { to: string }) {
  return (
    <Link to={to} className="flex w-max items-center gap-1.5 font-medium text-muted">
      <ArrowLeft size={15} aria-hidden="true" />
      Customers
    </Link>
  );
}

function Meta({ icon: Icon, mono, children }: { icon: LucideIcon; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={14} aria-hidden="true" />
      <span className={mono ? "font-mono" : undefined}>{children}</span>
    </div>
  );
}

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] bg-chip text-muted">
      <Icon size={15} aria-hidden="true" />
    </div>
  );
}

function BioTile({ icon: Icon, label, on, sub, quality }: { icon: LucideIcon; label: string; on: boolean; sub: string; quality: number | null }) {
  const low = on && quality !== null && quality < 78;
  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-line p-3.5">
      <div className={clsx("flex h-[34px] w-[34px] items-center justify-center rounded-[10px]", on ? "bg-brand-soft" : "bg-chip", on ? (low ? "text-warn" : "text-brand-text") : "text-faint")}>
        <Icon size={17} aria-hidden="true" />
      </div>
      <div className="font-semibold">{label}</div>
      <div className="text-xs text-muted">{sub}</div>
      <div className="h-[5px] overflow-hidden rounded-[3px] bg-chip">
        <div className={clsx("h-full", low ? "bg-warn" : "bg-brand-text")} style={{ width: `${on ? quality ?? 100 : 0}%` }} />
      </div>
    </div>
  );
}

function ActivityRow({ icon: Icon, text, at }: { icon: LucideIcon; text: string; at: string }) {
  return (
    <div className="flex gap-2.5 border-t border-line2 px-[18px] py-[9px] text-[13px]">
      <div className="pt-px text-faint">
        <Icon size={14} aria-hidden="true" />
      </div>
      <div className="flex-1 leading-[1.4]">{text}</div>
      <div className="whitespace-nowrap text-xs text-faint">{timeAgo(at)}</div>
    </div>
  );
}

function MoreMenu({ open, setOpen, children }: { open: boolean; setOpen: (v: boolean) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open, setOpen]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-line text-muted hover:bg-hover"
      >
        <MoreHorizontal size={17} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-[230px] animate-rise-in rounded-[14px] border border-line bg-panel p-1.5 shadow-pop">
          {children}
        </div>
      )}
    </div>
  );
}

function MenuButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="flex h-[38px] w-full items-center gap-2.5 rounded-[9px] px-2.5 text-left hover:bg-hover">
      <Icon size={16} aria-hidden="true" />
      {label}
    </button>
  );
}

/** Edit name, phone, email, address and state; the change goes on the audit log. */
function EditDetails({ c, onClose, onSaved }: { c: CustomerDetail; onClose: () => void; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    address: c.address ?? "",
    state: c.state ?? "",
  });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const contactChanged = f.phone.replace(/\s/g, "") !== (c.phone ?? "") || f.email.trim().toLowerCase() !== (c.email ?? "").toLowerCase();

  const save = async () => {
    if (!f.firstName.trim() || !f.lastName.trim() || !/^0[789][01]\d{8}$/.test(f.phone.replace(/\s/g, ""))) {
      setErr("Enter a first and last name and an 11-digit Nigerian phone number.");
      return;
    }
    if (reason.trim().length < 3) {
      setErr("Give a reason. It goes on the audit log.");
      return;
    }
    setBusy(true);
    try {
      // customer-admin saves it, keeps the sign-in identity in step, and
      // writes the audit entry; nothing here touches the table directly.
      await editCustomerDetails(c.id, { ...f, phone: f.phone.replace(/\s/g, "") }, reason.trim());
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={() => !busy && onClose()} title="Edit customer details">
      <div className="flex flex-col gap-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="First name" value={f.firstName} onChange={set("firstName")} />
          <Input label="Last name" value={f.lastName} onChange={set("lastName")} />
          <Input label="Phone" value={f.phone} onChange={set("phone")} mono inputMode="tel" />
          <Input label="Email" value={f.email} onChange={set("email")} type="email" />
        </div>
        <Input label="Address" value={f.address} onChange={set("address")} />
        <Select label="State" options={NIGERIAN_STATES} value={f.state} onChange={set("state")} placeholder="Select a state" />
        {contactChanged && (
          <div className="rounded-[10px] bg-warn-soft px-3 py-2.5 text-[13px] text-warn">
            A new phone number or email becomes what they sign in with. They're signed out everywhere, and the old number is told.
          </div>
        )}
        <Input label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are the details changing?" />
        <div className="text-[13px] text-muted">This action is recorded in the audit log with your name.</div>
        {err &&<div className="rounded-[10px] bg-fail-soft px-3 py-2.5 text-[13px] text-fail">{err}</div>}
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} isLoading={busy}>
            Save details
          </Button>
        </div>
      </div>
    </Modal>
  );
}
