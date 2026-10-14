import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  Cable,
  CornerUpLeft,
  Fingerprint,
  Hand,
  Info,
  KeyRound,
  Landmark,
  ListChecks,
  Mail,
  MapPin,
  Maximize2,
  MessageCircle,
  MessageSquare,
  Phone,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Store,
  Undo2,
  Unlink,
  UserPlus,
  UserRoundPlus,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { ReasonDialog } from "@milipay/shared/components/ui/ReasonDialog";
import { TONE_CLASSES, type Tone } from "@milipay/shared/components/ui/StatusBadge";
import { useToast } from "@milipay/shared/components/ui/Toast";
import { fetchCustomerDetail, securityEvents, type CustomerDetail } from "@milipay/shared/features/customers/admin";
import {
  accountHelp,
  ago,
  fetchApplicant,
  fetchPayments,
  firstNameOf,
  signupRef,
  type Applicant,
  type DeskPayment,
  type DeskTicket,
  type HelpAction,
} from "@milipay/shared/features/support/desk";
import { SUPPORT_ROUTES } from "@milipay/shared/lib/constants";
import { presentTransactionStatus } from "@milipay/shared/lib/transactionStatus";
import { formatNairaWhole, initials } from "@milipay/shared/lib/utils/format";

/**
 * The customer panel beside a conversation (design handoff, MiliPay Support:
 * the inbox's right column). Who they are, what they paid, their history with
 * us, and the account help support can give. Someone still signing up shows
 * their sign-up instead of an account.
 */

// ── Data ──────────────────────────────────────────────────────────────────
export interface PersonData {
  loading: boolean;
  detail: CustomerDetail | null;
  payments: DeskPayment[];
  spentToday: number;
  applicant: Applicant | null;
  reload: () => void;
}

/** Everything the panel needs for the person a ticket is about. */
export function usePerson(customerId: string | null | undefined, signupId: string | null | undefined): PersonData {
  const [state, setState] = useState<Omit<PersonData, "reload">>({ loading: true, detail: null, payments: [], spentToday: 0, applicant: null });
  const [n, setN] = useState(0);

  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      try {
        if (customerId) {
          const [detail, pay] = await Promise.all([fetchCustomerDetail(customerId), fetchPayments(customerId)]);
          if (live) setState({ loading: false, detail, payments: pay.payments, spentToday: pay.spentToday, applicant: null });
        } else if (signupId) {
          const applicant = await fetchApplicant(signupId);
          if (live) setState({ loading: false, detail: null, payments: [], spentToday: 0, applicant });
        } else if (live) {
          setState({ loading: false, detail: null, payments: [], spentToday: 0, applicant: null });
        }
      } catch {
        if (live) setState({ loading: false, detail: null, payments: [], spentToday: 0, applicant: null });
      }
    })();
    return () => {
      live = false;
    };
  }, [customerId, signupId, n]);

  const reload = useCallback(() => setN((x) => x + 1), []);
  return { ...state, reload };
}

// ── Presentation helpers (shared with the full customer page) ─────────────
export interface Chip {
  label: string;
  icon: LucideIcon;
  cls: string;
}

const GOLD = "bg-[color-mix(in_oklch,#E0A526_22%,transparent)] text-[#9A6A00]";

export function customerChips(c: CustomerDetail): Chip[] {
  const tier1 = c.tier === 1;
  const kyc = c.selfieVerifiedAt
    ? c.signup?.smileStatus
      ? `NIN + selfie (Smile ID ${c.signup.smileStatus === "approved" ? "match" : c.signup.smileStatus})`
      : "NIN + selfie"
    : c.ninVerified
      ? "NIN verified"
      : "NIN not verified";
  return [
    { label: tier1 ? "Tier 1 · Basic" : `Tier ${c.tier ?? 2}`, icon: ShieldCheck, cls: tier1 ? GOLD : TONE_CLASSES.muted },
    { label: kyc, icon: BadgeCheck, cls: c.ninVerified || c.selfieVerifiedAt ? TONE_CLASSES.ok : TONE_CLASSES.warn },
    ...(c.source === "self" ? [{ label: "Self sign-up", icon: Smartphone, cls: TONE_CLASSES.info }] : []),
    { label: c.hasPalm ? "Palm active" : "No palm", icon: Hand, cls: c.hasPalm ? TONE_CLASSES.ok : TONE_CLASSES.muted },
    ...(c.status !== "active" ? [{ label: c.status === "pending" ? "Pending review" : c.status[0].toUpperCase() + c.status.slice(1), icon: Info, cls: TONE_CLASSES[c.status === "pending" ? "warn" : "fail"] }] : []),
  ];
}

export function applicantChips(a: Applicant): Chip[] {
  return [
    { label: "No account yet", icon: UserRoundPlus, cls: TONE_CLASSES.warn },
    { label: `Sign-up step ${a.stepNumber} of 5`, icon: ListChecks, cls: TONE_CLASSES.muted },
  ];
}

export function signupState(a: Applicant): { label: string; tone: Tone } {
  switch (a.status) {
    case "review":
      return { label: "Waiting for admin review", tone: "warn" };
    case "blocked":
      return { label: "Stopped: NIN already registered", tone: "fail" };
    case "abandoned":
      return { label: "Abandoned", tone: "muted" };
    case "rejected":
      return { label: "Rejected", tone: "fail" };
    case "agent":
      return { label: "Sent to an agent", tone: "muted" };
    case "approved":
    case "completed":
      return { label: "Account created", tone: "ok" };
    default:
      return { label: `In progress · step ${a.stepNumber} of 5`, tone: "info" };
  }
}

export function smileLine(a: Applicant): string {
  if (!a.smileStatus) return "Not run yet";
  const match = a.smileConfidence != null ? `Match ${Math.round(a.smileConfidence)}%` : a.smileStatus === "approved" ? "Matched" : "No match";
  return `${match} · ${a.attempts} of 3 attempts`;
}

export function signupReason(a: Applicant): string {
  if (a.status === "blocked") {
    const by = a.blockedCustomer?.registeredBy
      ? ` (registered by an agent${a.blockedCustomer.state ? ` in ${a.blockedCustomer.state}` : ""})`
      : "";
    return `The NIN entered is linked to another MiliPay account${by}. Possible identity misuse.${a.fraudCase ? ` Fraud case ${a.fraudCase} is open.` : ""}`;
  }
  if (a.reason === "three_failed_selfies") return `3 selfie attempts failed${a.selfieFailure ? `: ${a.selfieFailure}` : ""}`;
  if (a.reason) return a.reason.replace(/_/g, " ");
  if (a.status === "in_progress") return a.phoneVerified ? "Still filling in their details in the app." : "Hasn't confirmed their phone number yet.";
  return "";
}

const SECURITY_ICON: Record<string, LucideIcon> = { key: KeyRound, mail: Mail, phone: Smartphone, smartphone: Smartphone, fingerprint: Fingerprint };

export interface SecurityLine {
  icon: LucideIcon;
  text: string;
  sub: string;
  when: string;
}

export function securityLines(c: CustomerDetail): SecurityLine[] {
  const lines: (SecurityLine & { at: string | null })[] = securityEvents(c).map((e) => ({
    icon: SECURITY_ICON[e.icon] ?? Info,
    text: e.text,
    sub: e.sub,
    when: ago(e.at),
    at: e.at,
  }));
  for (const m of c.mismatches.slice(0, 2)) {
    lines.push({ icon: Unlink, text: "Bank link blocked: name mismatch", sub: `${m.bank ?? "Bank"} · ${m.accountName ?? "another name"}`, when: ago(m.createdAt), at: m.createdAt });
  }
  return lines.sort((a, b) => Date.parse(b.at ?? "0") - Date.parse(a.at ?? "0"));
}

/** Limits for the profile rows: the customer's own, else their tier's. */
export function limitsOf(c: CustomerDetail): [string, string] {
  const single = c.singleLimit ?? c.tierCaps?.maxSingle ?? null;
  const daily = c.dailyLimit ?? c.tierCaps?.maxDaily ?? null;
  return [single != null ? formatNairaWhole(single) : "—", daily != null ? formatNairaWhole(daily) : "—"];
}

export const monthYear = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "Africa/Lagos" }).format(new Date(iso)) : "—";

const SERVICE: Record<string, [LucideIcon, string]> = {
  palm: [Hand, "#00C896"],
  airtime: [Smartphone, "#10B981"],
  data: [Wifi, "#3B82F6"],
  power: [Zap, "#F97316"],
  electricity: [Zap, "#F97316"],
  cable: [Cable, "#A855F7"],
};

export function paymentLook(p: Pick<DeskPayment, "palm" | "serviceType" | "merchantName" | "provider">): { icon: LucideIcon; color: string; title: string } {
  const key = p.palm ? "palm" : (p.serviceType ?? "").toLowerCase();
  const [icon, color] = SERVICE[key] ?? [p.palm ? Store : Receipt, "#8A9C95"];
  const title = p.merchantName || [p.provider, p.serviceType].filter(Boolean).join(" ") || "Payment";
  return { icon, color, title };
}

const WHAT_HAPPENED: Record<string, string> = {
  initiated: "Waiting for the bank to confirm.",
  paid: "Bank paid; sending to the provider.",
  fulfilling: "Sending to the provider now.",
  fulfilment_pending: "Bank paid; provider has not confirmed yet.",
  delivered: "Completed normally.",
  payment_failed: "Bank declined. Nothing was charged.",
  fulfilment_failed: "The provider failed it; a refund follows.",
  refund_pending: "Refund is on its way to the bank.",
  refunded: "Money returned to the customer.",
  refund_failed: "The refund didn't go through; an admin has to retry it.",
  quarantined: "Held for review: the amounts didn't agree.",
};

export function whatHappened(p: DeskPayment): string {
  return p.failureReason && !["delivered", "refunded"].includes(p.status) ? p.failureReason : WHAT_HAPPENED[p.status] ?? "—";
}

// ── The panel ─────────────────────────────────────────────────────────────
type PanelTab = "profile" | "payments" | "history";

interface HelpModal {
  action: HelpAction;
  icon: LucideIcon;
  title: string;
  body: string;
  placeholder: string;
  confirm: string;
  done: string;
}

export function Customer360({
  ticket,
  person,
  openTickets,
  onQuote,
  onRefund,
  onHelped,
}: {
  ticket: DeskTicket;
  person: PersonData;
  /** Open tickets this person has (from the queue). */
  openTickets: number;
  onQuote: (text: string) => void;
  onRefund: (reference: string) => void;
  /** After an account-help action wrote to the ticket. */
  onHelped: () => void;
}) {
  const navigate = useNavigate();
  const { flash } = useToast();
  const [tab, setTab] = useState<PanelTab>("profile");
  const [openPay, setOpenPay] = useState<string | null>(null);
  const [modal, setModal] = useState<HelpModal | null>(null);
  const { detail: c, applicant: a, payments } = person;
  const first = firstNameOf(ticket.customer);
  const phone = c?.phone ?? a?.phone ?? ticket.phone ?? "";

  useEffect(() => {
    setTab("profile");
    setOpenPay(null);
  }, [ticket.id]);

  const fullPath = c
    ? SUPPORT_ROUTES.customerDetails.replace(":id", c.id)
    : a
      ? SUPPORT_ROUTES.applicant.replace(":id", a.id)
      : null;

  const chips = c ? customerChips(c) : a ? applicantChips(a) : [];
  const state = c?.state ?? a?.state ?? null;

  const help: (HelpModal & { label: string; hint: string })[] = [];
  if (c) {
    help.push({
      action: "reset_link",
      label: "Send password reset",
      hint: "SMS",
      icon: KeyRound,
      title: `Send ${first} a password reset?`,
      body: `An SMS goes to ${phone} telling them how to reset it in the app: Me › Change password › Forgot your current password? They confirm with a code there.`,
      placeholder: "How did you confirm it is really them? (required)",
      confirm: "Send reset",
      done: "Password reset sent · logged",
    });
    help.push({
      action: "login_code",
      label: "Resend login code",
      hint: "SMS + WhatsApp",
      icon: MessageSquare,
      title: `Resend login code to ${first}?`,
      body: `A new 6-digit code goes to ${phone} by SMS and WhatsApp, for the sign-in they started in the app. The old one stops working.`,
      placeholder: "How did you confirm it is really them? (required)",
      confirm: "Resend code",
      done: "Code resent · logged",
    });
    if (c.tier === 1) {
      help.push({
        action: "nearest_agents",
        label: "Send nearest agents",
        hint: "SMS",
        icon: MapPin,
        title: `Send ${first} the nearest agents?`,
        body: `An SMS with up to 3 MiliPay agents in ${state ?? "their state"} and what to bring (their NIN).`,
        placeholder: "Optional note",
        confirm: "Send SMS",
        done: "Agent list sent",
      });
    }
  } else if (a) {
    const ref = signupRef(a.id);
    if (a.status === "review") {
      help.push({
        action: "signup_priority",
        label: "Ask admin to prioritise review",
        hint: "Admin",
        icon: ShieldAlert,
        title: `Ask admin to prioritise ${ref}?`,
        body: `The admin team sees your note at the top of ${first}'s sign-up review. They still make the decision.`,
        placeholder: "What did the customer tell you? (required)",
        confirm: "Send to admin",
        done: "Sent to admin sign-up review",
      });
    }
    if (a.status === "blocked" && !a.fraudCase) {
      help.push({
        action: "nin_misuse",
        label: "Report possible NIN misuse",
        hint: "Fraud team",
        icon: ShieldAlert,
        title: "Report possible NIN misuse?",
        body: `The fraud team checks the account that holds this NIN and can lock it while they look. ${first} gets an SMS with a case number.`,
        placeholder: "How did you confirm who they are? (required)",
        confirm: "Report to fraud team",
        done: "Fraud case opened",
      });
    }
    if (!a.phoneVerified && a.step === "phone") {
      help.push({
        action: "signup_code",
        label: "Resend sign-up code",
        hint: "SMS",
        icon: MessageSquare,
        title: `Resend ${first}'s sign-up code?`,
        body: `A new 6-digit code goes to ${phone} by SMS. The old one stops working.`,
        placeholder: "Why are you resending it? (required)",
        confirm: "Resend code",
        done: "Code resent · logged",
      });
    }
    help.push({
      action: "nearest_agents",
      label: "Send nearest agents",
      hint: "SMS",
      icon: MapPin,
      title: `Send ${first} the nearest agents?`,
      body: `An SMS with up to 3 MiliPay agents in ${state ?? "their state"} and what to bring (their NIN).`,
      placeholder: "Optional note",
      confirm: "Send SMS",
      done: "Agent list sent",
    });
  }

  const rows: [string, string][] = c
    ? [
        ["Customer since", monthYear(c.createdAt)],
        ["Registered", c.source === "self" ? "Self sign-up · app" : "By an agent"],
        ["State", c.state ?? "—"],
        ["Per payment", limitsOf(c)[0]],
        ["Daily limit", limitsOf(c)[1]],
        ["Spent today", formatNairaWhole(person.spentToday)],
        [
          "Last login",
          c.security.devices[0]?.lastSeen
            ? `${c.security.devices[0].name || "Phone"} · ${ago(c.security.devices[0].lastSeen)} ago`
            : c.security.lastCodeSignIn
              ? `${ago(c.security.lastCodeSignIn)} ago`
              : "—",
        ],
        ["Open tickets", String(openTickets)],
      ]
    : a
      ? [
          ["Started", `${ago(a.createdAt)} ago`],
          ["Phone", a.phoneVerified ? "Verified" : "Not verified yet"],
          ["State", a.state ?? "—"],
          ["Per payment", "—"],
          ["Daily limit", "—"],
          ["Open tickets", String(openTickets)],
        ]
      : [
          ["Phone", ticket.phone ?? "—"],
          ["Open tickets", String(openTickets)],
        ];

  const security = c ? securityLines(c) : [];
  const mismatch = c?.mismatches[0];
  const history = c
    ? [
        ...c.tickets
          .filter((t) => t.id !== ticket.id)
          .map((t) => ({
            icon: MessageCircle,
            title: [t.ticketId, t.subject].filter(Boolean).join(" · "),
            sub: t.status === "resolved" ? "Solved" : "Open",
            when: ago(t.createdAt),
          })),
        {
          icon: UserPlus,
          title: "Registered",
          sub: c.source === "self" ? "Self sign-up in the app · Tier 1" : `By agent ${c.registeredBy?.name ?? "—"}${c.registeredBy?.state ? ` · ${c.registeredBy.state}` : ""}`,
          when: monthYear(c.createdAt),
        },
      ]
    : a
      ? [
          ...a.tickets
            .filter((t) => t.id !== ticket.id)
            .map((t) => ({ icon: t.channel === "call" ? Phone : MessageCircle, title: [t.ticketId, t.subject].filter(Boolean).join(" · "), sub: t.status === "resolved" ? "Solved" : "Open", when: ago(t.createdAt) })),
          { icon: UserRoundPlus, title: `Sign-up ${signupRef(a.id)}`, sub: signupState(a).label, when: ago(a.createdAt) },
        ]
      : [];

  const tabs: [PanelTab, string][] = [
    ["profile", "Profile"],
    ["payments", `Payments · ${payments.length}`],
    ["history", "History"],
  ];

  return (
    <div className="flex min-h-0 flex-col border-l border-line bg-panel">
      <div className="flex flex-col gap-3 border-b border-line px-[18px] py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-full bg-brand-soft font-bold text-brand-text">
            {initials(ticket.customer)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold">{ticket.customer}</div>
            <div className="font-mono text-xs text-muted">{phone}</div>
          </div>
          {fullPath && (
            <button
              type="button"
              onClick={() => navigate(fullPath)}
              title="Open full profile"
              aria-label="Open full profile"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted hover:bg-hover"
            >
              <Maximize2 size={14} />
            </button>
          )}
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((ch) => (
              <span key={ch.label} className={clsx("inline-flex items-center gap-[5px] rounded-md px-2 py-[3px] text-[11.5px] font-semibold", ch.cls)}>
                <ch.icon size={11} aria-hidden="true" />
                {ch.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-0.5 border-b border-line px-3" role="tablist">
        {tabs.map(([id, label]) => {
          const on = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(id)}
              className={clsx(
                "-mb-px border-b-2 px-2 py-2.5 text-[13px]",
                on ? "border-brand font-bold text-fg" : "border-transparent font-medium text-muted",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        {person.loading && !c && !a ? (
          <div className="p-[18px] text-[13px] text-muted">Loading…</div>
        ) : tab === "profile" ? (
          <>
            {a && (
              <div className="mx-[18px] mb-1 mt-3.5 flex flex-col gap-2 rounded-xl border border-line px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-[13px] font-bold">
                    Sign-up <span className="font-mono font-medium text-muted">{signupRef(a.id)}</span>
                  </div>
                  <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE_CLASSES[signupState(a).tone])}>{signupState(a).label}</span>
                </div>
                <div className="grid grid-cols-5 gap-[3px]">
                  {[1, 2, 3, 4, 5].map((k) => (
                    <div
                      key={k}
                      className={clsx(
                        "h-1 rounded-sm",
                        k < a.stepNumber ? "bg-brand" : k === a.stepNumber ? (signupState(a).tone === "fail" ? "bg-fail" : signupState(a).tone === "warn" ? "bg-warn" : "bg-info") : "bg-line",
                      )}
                    />
                  ))}
                </div>
                <div className="text-xs text-muted">Smile ID: {smileLine(a)}</div>
                {signupReason(a) && <div className="text-xs leading-[1.45]">{signupReason(a)}</div>}
              </div>
            )}
            {c && c.tier === 1 && c.status === "active" && (
              <div className="mx-[18px] mb-1 mt-3.5 rounded-[10px] bg-info-soft px-3 py-2.5 text-xs leading-[1.45] text-info">
                Tier 1 · no palm. To pay with their palm and get higher limits, they visit an agent with their NIN.
              </div>
            )}
            {mismatch && (
              <div className="mx-[18px] mb-1 mt-2 flex gap-2 rounded-[10px] bg-fail-soft px-3 py-2.5 text-xs leading-[1.45] text-fail">
                <Unlink size={14} className="mt-px flex-none" aria-hidden="true" />
                <div>
                  <b>Bank link blocked:</b> {mismatch.bank ?? "Bank"} · account name {mismatch.accountName ?? "—"} · {ago(mismatch.createdAt)} ago
                </div>
              </div>
            )}
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2.5 border-b border-line2 px-[18px] py-[9px] text-[13px]">
                <div className="text-muted">{k}</div>
                <div className="text-right font-medium">{v}</div>
              </div>
            ))}

            {c && (
              <>
                <SectionLabel>Linked banks</SectionLabel>
                {c.accounts.length === 0 && <div className="px-[18px] pb-2 pt-1 text-[13px] text-muted">No linked banks</div>}
                {c.accounts.map((b) => (
                  <div key={b.id} className="flex items-center gap-2.5 px-[18px] py-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-chip text-muted">
                      <Landmark size={14} aria-hidden="true" />
                    </div>
                    <div className="flex-1 text-[13px]">
                      <div className="font-semibold">{b.bank ?? "Bank"}</div>
                      <div className="font-mono text-xs text-muted">••••{b.last4}</div>
                    </div>
                    {b.palmDefault && <span className="rounded-md bg-brand-soft px-[7px] py-0.5 text-[11px] font-semibold text-brand-text">Palm</span>}
                  </div>
                ))}
                <SectionLabel>Security</SectionLabel>
                {security.length === 0 && <div className="px-[18px] pb-2 pt-1 text-[13px] text-muted">Nothing recorded</div>}
                {security.map((e, i) => (
                  <div key={i} className="flex gap-2.5 px-[18px] py-[7px] text-[13px]">
                    <div className="pt-px text-faint">
                      <e.icon size={14} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{e.text}</div>
                      <div className="text-xs text-muted">{e.sub}</div>
                    </div>
                    <div className="text-xs text-faint">{e.when}</div>
                  </div>
                ))}
              </>
            )}

            {help.length > 0 && (
              <>
                <SectionLabel>Account help</SectionLabel>
                <div className="flex flex-col gap-2 px-[18px] pb-[18px]">
                  {help.map((h) => (
                    <button
                      key={h.action}
                      type="button"
                      onClick={() => setModal(h)}
                      className="flex h-9 items-center gap-2 rounded-[9px] border border-line px-3 text-left text-[13px] font-semibold hover:bg-hover"
                    >
                      <h.icon size={14} aria-hidden="true" />
                      <span className="flex-1">{h.label}</span>
                      <span className="text-[11px] font-medium text-faint">{h.hint}</span>
                    </button>
                  ))}
                  <div className="text-[11.5px] leading-[1.4] text-faint">
                    {c ? "Freezing an account or changing limits goes to an admin." : "Support cannot approve or reject sign-ups. Admins decide in Sign-ups."}
                  </div>
                </div>
              </>
            )}
          </>
        ) : tab === "payments" ? (
          payments.length === 0 ? (
            <div className="p-[18px] text-[13px] text-muted">No payments yet.</div>
          ) : (
            payments.map((p) => {
              const look = paymentLook(p);
              const st = presentTransactionStatus(p.status);
              const open = openPay === p.id;
              return (
                <div key={p.id} className="border-b border-line2">
                  <button
                    type="button"
                    onClick={() => setOpenPay(open ? null : p.id)}
                    aria-expanded={open}
                    className={clsx("flex w-full items-center gap-2.5 px-[18px] py-2.5 text-left hover:bg-hover", open && "bg-hover")}
                  >
                    <span
                      className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px]"
                      style={{ background: `${look.color}24`, color: look.color }}
                    >
                      <look.icon size={14} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{look.title}</span>
                      <span className="block text-[11.5px] text-muted">{ago(p.createdAt)} ago</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[13px] font-bold tabular-nums">{formatNairaWhole(p.amount)}</span>
                      <span className={clsx("block text-[11px] font-semibold", toneText(st.tone))}>{st.label}</span>
                    </span>
                  </button>
                  {open && (
                    <div className="flex animate-fade-in flex-col gap-1.5 pb-3.5 pl-[58px] pr-[18px] pt-1 text-xs">
                      <div className="flex justify-between gap-2">
                        <div className="text-muted">Reference</div>
                        <div className="font-mono">{p.reference}</div>
                      </div>
                      <div className="flex justify-between gap-2">
                        <div className="text-muted">From</div>
                        <div>{p.bank ? `${p.bank} ${p.bankLast4 ?? ""}` : p.palm ? "Palm" : "—"}</div>
                      </div>
                      <div className="flex justify-between gap-2">
                        <div className="text-muted">What happened</div>
                        <div className="max-w-[170px] text-right">{whatHappened(p)}</div>
                      </div>
                      <div className="mt-1 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => onQuote(`${look.title} · ${formatNairaWhole(p.amount)} · ${p.reference} · ${st.label}`)}
                          className="flex h-[30px] flex-1 items-center justify-center gap-[5px] rounded-lg border border-line font-semibold hover:bg-hover"
                        >
                          <CornerUpLeft size={12} aria-hidden="true" />
                          Quote in reply
                        </button>
                        {p.refundable && !p.refundRequested && ticket.customerId && (
                          <button
                            type="button"
                            onClick={() => onRefund(p.reference)}
                            className="flex h-[30px] flex-1 items-center justify-center gap-[5px] rounded-lg bg-brand font-bold text-brand-ink"
                          >
                            <Undo2 size={12} aria-hidden="true" />
                            Refund
                          </button>
                        )}
                        {p.refundRequested && (
                          <span className="flex h-[30px] flex-1 items-center justify-center rounded-lg bg-warn-soft font-semibold text-warn">Refund requested</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )
        ) : history.length === 0 ? (
          <div className="p-[18px] text-[13px] text-muted">No history yet.</div>
        ) : (
          history.map((h, i) => (
            <div key={i} className="flex gap-2.5 border-b border-line2 px-[18px] py-2.5 text-[13px]">
              <div className="pt-px text-faint">
                <h.icon size={14} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{h.title}</div>
                <div className="mt-px text-xs text-muted">{h.sub}</div>
              </div>
              <div className="whitespace-nowrap text-[11.5px] text-faint">{h.when}</div>
            </div>
          ))
        )}
      </div>

      <ReasonDialog
        open={modal !== null}
        tone="ok"
        icon={modal?.icon ?? Info}
        title={modal?.title ?? ""}
        body={modal?.body ?? ""}
        confirmLabel={modal?.confirm ?? ""}
        noteRequired={modal?.action !== "nearest_agents"}
        notePlaceholder={modal?.placeholder}
        foot="Recorded on the audit log with your name."
        onClose={() => setModal(null)}
        onConfirm={async (note) => {
          if (!modal) return;
          const res = await accountHelp({ action: modal.action, ticketId: ticket.id, customerId: c?.id, signupId: c ? null : a?.id, note });
          setModal(null);
          flash(res.caseNumber ? `${modal.done} · ${res.caseNumber}` : modal.done);
          person.reload();
          onHelped();
        }}
      />
    </div>
  );
}

export function toneText(t: Tone): string {
  return { ok: "text-brand-text", warn: "text-warn", fail: "text-fail", info: "text-info", muted: "text-muted" }[t];
}

function SectionLabel({ children }: { children: string }) {
  return <div className="px-[18px] pb-1.5 pt-3.5 text-[11px] font-semibold uppercase tracking-[.06em] text-faint">{children}</div>;
}
