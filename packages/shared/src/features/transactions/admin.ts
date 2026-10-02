import { supabase } from "@milipay/shared/lib/supabase";
import { SERVICE, providerName } from "@milipay/shared/features/dashboard/view";
import { formatNairaWhole } from "@milipay/shared/lib/utils/format";

/**
 * Admin › Transactions: the table (admin_transactions), the drawer
 * (admin_transaction_detail) and manual resolution
 * (admin_resolve_transaction, which also writes the audit log). The pure
 * helpers below decide what the drawer shows; they are tested directly.
 */

export type TxTab = "all" | "delivered" | "flight" | "failed" | "refunds" | "held";
export type TxService = "all" | "palm" | "airtime" | "data" | "power" | "cable";

export interface TxRow {
  id: string;
  reference: string;
  amount: number;
  fee: number;
  status: string;
  createdAt: string;
  palm: boolean;
  serviceType: string | null;
  provider: string | null;
  merchantName: string | null;
  customer: string;
  customerId: string | null;
}

export interface TxPage {
  counts: Record<TxTab, number>;
  total: number;
  amount: number;
  rows: TxRow[];
}

export async function fetchAdminTransactions(opts: {
  tab: TxTab;
  service: TxService;
  q: string;
  offset: number;
  limit: number;
}): Promise<TxPage> {
  const { data, error } = await supabase.rpc("admin_transactions", {
    p_tab: opts.tab,
    p_service: opts.service,
    p_q: opts.q,
    p_offset: opts.offset,
    p_limit: opts.limit,
  });
  if (error) throw new Error(error.message);
  return data as TxPage;
}

export interface TxDetail {
  id: string;
  reference: string;
  amount: number;
  baseAmount: number | null;
  fee: number | null;
  serviceCharge: number | null;
  status: string;
  palm: boolean;
  serviceType: string | null;
  provider: string | null;
  via: string | null;
  beneficiary: string | null;
  merchantName: string | null;
  terminalId: string | null;
  operatorReference: string | null;
  paymentProvider: string | null;
  paymentReference: string | null;
  failureReason: string | null;
  createdAt: string;
  initiatedAt: string | null;
  paidAt: string | null;
  fulfilledAt: string | null;
  refundedAt: string | null;
  updatedAt: string | null;
  customer: { id: string; name: string; tier: number | null; phone: string | null } | null;
  merchant: { id: string; name: string } | null;
  account: { bank: string | null; last4: string | null } | null;
  refund: { attempts: number; lastError: string | null; resolvedAt: string | null } | null;
  events: { from: string | null; to: string; reason: string | null; actor: string | null; at: string }[];
  audit: { actorName: string; action: string; reason: string | null; at: string }[];
  tickets: { id: string; ticketId: string | null; subject: string | null }[];
}

export async function fetchTransactionDetail(key: string): Promise<TxDetail | null> {
  const { data, error } = await supabase.rpc("admin_transaction_detail", { p_key: key });
  if (error) throw new Error(error.message);
  return (data as TxDetail | null) ?? null;
}

export type ResolveAction = "mark_delivered" | "refund";

export async function resolveTransaction(reference: string, action: ResolveAction, note: string): Promise<string> {
  const { data, error } = await supabase.rpc("admin_resolve_transaction", {
    p_reference: reference,
    p_action: action,
    p_note: note,
  });
  if (error) throw new Error(error.message);
  return (data as { status: string }).status;
}

// ── What the drawer shows ─────────────────────────────────────────────────

/** "palm", "airtime", … for icons and colours. */
export function serviceOf(t: { palm: boolean; serviceType: string | null }): string {
  return t.palm ? "palm" : t.serviceType && SERVICE[t.serviceType] ? t.serviceType : "other";
}

/** "MTN Airtime", "Lekki Fresh Mart" (palm). */
export function txHeadline(t: { palm: boolean; serviceType: string | null; provider: string | null; merchantName: string | null }): string {
  if (t.palm) return t.merchantName || "Palm payment";
  return `${providerName(t.provider)} ${(SERVICE[t.serviceType || "other"] ?? SERVICE.other).label}`.trim();
}

/**
 * How far each status got: the number of steps finished, and whether the
 * next one is in progress, failed, or there is no next one. Payments that
 * end in a refund swap the last two steps for "Refund started" / "Refunded".
 */
const PROGRESS: Record<string, { done: number; next: "current" | "failed" | "complete" }> = {
  initiated: { done: 1, next: "current" },
  payment_failed: { done: 1, next: "failed" },
  quarantined: { done: 1, next: "failed" },
  paid: { done: 2, next: "current" },
  fulfilling: { done: 2, next: "current" },
  fulfilment_failed: { done: 2, next: "failed" },
  fulfilment_pending: { done: 3, next: "current" },
  refund_pending: { done: 3, next: "current" },
  refund_failed: { done: 3, next: "failed" },
  delivered: { done: 4, next: "complete" },
  refunded: { done: 4, next: "complete" },
};
const REFUNDY = new Set(["refund_pending", "refunded", "refund_failed"]);

export type StepState = "done" | "current" | "failed" | "todo";
export interface LifecycleStep {
  label: string;
  sub: string;
  at: string | null;
  state: StepState;
}

/** The lifecycle timeline: four steps for a quick service, three for palm. */
export function lifecycle(t: TxDetail): LifecycleStep[] {
  const st = t.status;
  const progress = PROGRESS[st] ?? { done: 0, next: "current" as const };
  const refundy = REFUNDY.has(st);
  const firstEventTo = (...to: string[]) => t.events.find((e) => to.includes(e.to))?.at ?? null;
  const bank = t.account?.bank ? `${t.account.bank} via Mono` : "Linked bank via Mono";

  const steps: Omit<LifecycleStep, "state">[] = t.palm
    ? [
        { label: "Palm matched at terminal", sub: t.terminalId ?? "Terminal", at: t.initiatedAt ?? t.createdAt },
        { label: "Bank debited", sub: bank, at: t.paidAt ?? t.createdAt },
        { label: refundy ? "Refunded" : "Paid to merchant", sub: t.merchantName ?? "Merchant", at: refundy ? t.refundedAt : t.fulfilledAt ?? t.createdAt },
      ]
    : [
        { label: "Initiated", sub: "Customer app", at: t.initiatedAt ?? t.createdAt },
        { label: "Bank debited", sub: bank, at: t.paidAt },
        {
          label: refundy ? "Refund started" : "Sent to provider",
          sub: refundy ? "Back to the customer's bank" : [providerName(t.provider), providerName(t.via)].filter(Boolean).join(" · ") || "Provider",
          at: refundy ? firstEventTo("refund_pending") : firstEventTo("fulfilling", "fulfilment_pending", "delivered", "fulfilment_failed"),
        },
        {
          label: refundy ? "Refunded" : "Delivered",
          sub: refundy ? "Customer's bank" : t.serviceType === "power" ? "Token issued" : "Operator confirmed",
          at: refundy ? t.refundedAt : t.fulfilledAt,
        },
      ];

  // Palm has three steps, not four: the last one stands for both.
  const done = progress.next === "complete" ? steps.length : Math.min(progress.done, steps.length - 1);
  return steps.map((step, i) => {
    const state: StepState = i < done ? "done" : i === done ? (progress.next === "failed" ? "failed" : "current") : "todo";
    return { ...step, at: state === "todo" ? null : step.at, state };
  });
}

/** What went wrong, in words, for the red box under the amount. */
export function failureText(t: TxDetail): string | null {
  switch (t.status) {
    case "payment_failed":
      return `The bank declined the debit${t.failureReason ? ` (${t.failureReason})` : ""}. Nothing was charged.`;
    case "fulfilment_failed":
      return `The provider returned an error${t.failureReason ? ` (${t.failureReason})` : ""}. The refund starts automatically.`;
    case "refund_failed":
      return `The refund to the customer failed${t.refund?.attempts ? ` ${t.refund.attempts === 1 ? "once" : `${t.refund.attempts} times`}` : ""}${
        t.refund?.lastError ? ` (${t.refund.lastError})` : ""
      }. It needs a manual refund.`;
    case "quarantined": {
      const why = [...t.events].reverse().find((e) => e.to === "quarantined")?.reason || t.failureReason;
      return `Held for review${why ? `: ${why}` : ": the bank's confirmation didn't agree with what was charged"}. Nothing is delivered until someone decides.`;
    }
    case "fulfilment_pending":
      return "The provider still says pending. The sweep won't guess; decide below if you've confirmed it with the provider.";
    default:
      return null;
  }
}

/** Which manual decisions the database will accept from this status. */
export function resolutions(status: string): ResolveAction[] {
  if (status === "fulfilment_pending" || status === "quarantined") return ["mark_delivered", "refund"];
  if (status === "refund_failed" || status === "fulfilment_failed") return ["refund"];
  return [];
}

export function detailRows(t: TxDetail): { k: string; v: string; mono?: boolean }[] {
  const when = new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  }).format(new Date(t.initiatedAt ?? t.createdAt));
  const rows: { k: string; v: string; mono?: boolean }[] = [
    { k: "Customer", v: t.customer?.name || "—" },
    { k: "Service", v: t.palm ? "Palm payment" : `${(SERVICE[t.serviceType || "other"] ?? SERVICE.other).label} · ${providerName(t.provider)}` },
  ];
  if (t.palm) {
    rows.push({ k: "Merchant", v: t.merchantName || "—" }, { k: "Terminal", v: t.terminalId || "—", mono: true });
  } else {
    rows.push(
      { k: t.serviceType === "power" ? "Meter" : t.serviceType === "cable" ? "Smartcard" : "Beneficiary", v: t.beneficiary || "—", mono: true },
      { k: "Provider", v: providerName(t.via) || "—" },
    );
  }
  if (t.baseAmount !== null && t.baseAmount !== undefined) rows.push({ k: "Base amount", v: formatNairaWhole(t.baseAmount) });
  rows.push({ k: "Fee", v: t.fee !== null && t.fee !== undefined ? formatNairaWhole(t.fee) : "—" });
  if (t.serviceCharge) rows.push({ k: "Provider charge", v: formatNairaWhole(t.serviceCharge) });
  rows.push({ k: "Pay-from account", v: t.account?.bank ? `${t.account.bank} ••${t.account.last4 ?? ""}` : "—" });
  if (t.paymentReference) rows.push({ k: "Payment ref", v: t.paymentReference, mono: true });
  if (t.operatorReference) rows.push({ k: "Operator ref", v: t.operatorReference, mono: true });
  rows.push({ k: "Initiated", v: `${when} WAT` });
  return rows;
}
