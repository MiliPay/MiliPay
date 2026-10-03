import { supabase } from "@milipay/shared/lib/supabase";
import { formatNairaWhole, timeAgo } from "@milipay/shared/lib/utils/format";

/**
 * Customers, as the redesigned portals read and act on them:
 * staff_customers (the list), staff_customer_detail (the profile) and the
 * customer-admin Edge Function (suspend, reactivate, reset password). Admins
 * and support see everyone; agents see the people they registered.
 */

export type CustomerTab = "all" | "pending" | "active" | "tier1" | "suspended" | "rejected";

export interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  ninLast4: string | null;
  state: string | null;
  tier: number | null;
  status: "active" | "pending" | "suspended" | "rejected";
  source: "agent" | "self" | null;
  palm: boolean;
  face: boolean;
  banks: number;
  registeredBy: string | null;
  registeredState: string | null;
  createdAt: string;
}

export interface CustomerList {
  counts: Record<CustomerTab, number>;
  total: number;
  rows: CustomerRow[];
}

export async function fetchStaffCustomers(opts: { tab: CustomerTab; q: string; offset: number; limit: number }): Promise<CustomerList> {
  const { data, error } = await supabase.rpc("staff_customers", {
    p_tab: opts.tab,
    p_q: opts.q,
    p_offset: opts.offset,
    p_limit: opts.limit,
  });
  if (error) throw new Error(error.message);
  return data as CustomerList;
}

export interface CustomerDetail {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  landmark: string | null;
  state: string | null;
  lga: string | null;
  ninLast4: string | null;
  bvnLast4: string | null;
  ninVerified: boolean | null;
  bvnVerified: boolean | null;
  dob: string | null;
  gender: string | null;
  status: CustomerRow["status"];
  tier: number | null;
  source: "agent" | "self" | null;
  hasPalm: boolean;
  hasFace: boolean;
  palmSimulated: boolean | null;
  faceSimulated: boolean | null;
  selfieVerifiedAt: string | null;
  palmPaused: boolean | null;
  pinThreshold: number | null;
  singleLimit: number | null;
  dailyLimit: number | null;
  rejectionReason: string | null;
  createdAt: string;
  verifiedAt: string | null;
  passwordChangedAt: string | null;
  biometricEnrolledAt: string | null;
  onboardingCompletedAt: string | null;
  hasLogin: boolean;
  tierCaps: { maxSingle: number; maxDaily: number } | null;
  registeredBy: { name: string; state: string | null; role: string } | null;
  verifiedBy: string | null;
  palm: { captures: number; quality: number | null } | null;
  accounts: { id: string; bank: string | null; last4: string | null; palmDefault: boolean }[];
  signup: { id: string; decision: string | null; phoneVerifiedAt: string | null; createdAt: string; smileStatus: string | null } | null;
  security: {
    passwordResetAt: string | null;
    contactChanges: { email: boolean; phone: boolean; at: string }[];
    lastCodeSignIn: string | null;
    devices: { name: string | null; platform: string | null; lastSeen: string | null }[];
  };
  tickets: { id: string; ticketId: string | null; subject: string | null; status: string; createdAt: string }[];
  mismatches: { bank: string | null; accountName: string | null; createdAt: string }[];
  audit: { actorName: string; action: string; reason: string | null; at: string }[];
  txCount: number;
  txTotal: number;
  txs: {
    id: string;
    reference: string;
    amount: number;
    status: string;
    createdAt: string;
    palm: boolean;
    serviceType: string | null;
    provider: string | null;
    merchantName: string | null;
  }[];
}

export async function fetchCustomerDetail(id: string): Promise<CustomerDetail | null> {
  const { data, error } = await supabase.rpc("staff_customer_detail", { p_id: id });
  if (error) throw new Error(error.message);
  return (data as CustomerDetail | null) ?? null;
}

async function functionError(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.json();
      if (body?.error) return String(body.error);
    } catch {
      // not JSON
    }
  }
  return fallback;
}

export type CustomerAction = "suspend" | "reactivate" | "reset_password";

/** Suspend, reactivate or reset a password. Returns whether the customer was texted. */
export async function customerAction(customerId: string, action: CustomerAction, reason: string): Promise<{ customerTold: boolean }> {
  const { data, error } = await supabase.functions.invoke("customer-admin", { body: { customerId, action, reason } });
  if (error) throw new Error(await functionError(error, "That didn't work. Try again."));
  if (!data?.success) throw new Error(data?.error || "That didn't work. Try again.");
  return { customerTold: Boolean(data.customerTold) };
}

/**
 * Edit a customer's details (customer-admin edit_details): a reason is
 * required, a new phone or email changes their sign-in too and signs them
 * out, and the change goes on the audit log from the server.
 */
export async function editCustomerDetails(
  customerId: string,
  details: { firstName: string; lastName: string; phone: string; email: string; address: string; state: string },
  reason: string,
): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke("customer-admin", { body: { customerId, action: "edit_details", reason, details } });
  if (error) throw new Error(await functionError(error, "That didn't work. Try again."));
  if (!data?.success) throw new Error(data?.error || "That didn't work. Try again.");
  return (data.changed as string[]) ?? [];
}

// ── What the profile shows ────────────────────────────────────────────────

export interface KycRow {
  k: string;
  v: string;
  mono?: boolean;
  badge?: { text: string; tone: "ok" | "warn" | "fail" };
}

const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "—";

export function kycRows(c: CustomerDetail): KycRow[] {
  const self = c.source === "self";
  const rows: KycRow[] = [
    {
      k: "NIN",
      v: c.ninLast4 ? `•••• •••• ${c.ninLast4}` : "—",
      mono: true,
      badge: self && c.selfieVerifiedAt
        ? { text: "NIMC + selfie", tone: "ok" }
        : c.ninVerified
          ? { text: "Verified", tone: "ok" }
          : { text: "Not verified", tone: "warn" },
    },
    {
      k: "BVN",
      v: c.bvnLast4 ? `•••••••${c.bvnLast4}` : "Not provided",
      mono: Boolean(c.bvnLast4),
      badge: c.bvnLast4 ? (c.bvnVerified ? { text: "Verified", tone: "ok" } : { text: "Not verified", tone: "warn" }) : undefined,
    },
    { k: "Date of birth", v: fmtDate(c.dob) },
    { k: "Gender", v: c.gender ? c.gender[0].toUpperCase() + c.gender.slice(1) : "—" },
    { k: "Address", v: [c.address, c.lga, c.state].filter(Boolean).join(", ") || "—" },
    {
      k: "Phone",
      v: c.phone || "—",
      mono: true,
      badge: c.security.lastCodeSignIn || c.signup?.phoneVerifiedAt ? { text: "SMS code confirmed", tone: "ok" } : undefined,
    },
  ];
  if (self) {
    rows.push({
      k: "Registered by",
      v: "Self sign-up · app",
      badge: c.selfieVerifiedAt ? { text: "Smile ID verified", tone: "ok" } : undefined,
    });
  } else {
    rows.push({ k: "Registered by", v: c.registeredBy ? [c.registeredBy.name, c.registeredBy.state].filter(Boolean).join(" · ") : "—" });
  }
  return rows;
}

/** Effective limits: the tier's ceiling, or the customer's own lower one. */
export function limitRows(c: CustomerDetail): { k: string; v: string }[] {
  const cap = c.tierCaps;
  const own = (mine: number | null, tier: number | undefined) =>
    tier === undefined ? "—" : mine !== null && mine < tier ? `${formatNairaWhole(mine)} (their own limit)` : formatNairaWhole(tier);
  return [
    { k: "Per payment", v: own(c.singleLimit, cap?.maxSingle) },
    { k: "Daily", v: own(c.dailyLimit, cap?.maxDaily) },
    { k: "PIN required over", v: c.pinThreshold !== null ? formatNairaWhole(c.pinThreshold) : "—" },
  ];
}

export interface SecurityEvent {
  icon: "key" | "mail" | "phone" | "smartphone" | "fingerprint";
  text: string;
  sub: string;
  at: string | null;
}

/** "Security & sign-in": what we actually record, newest first. */
export function securityEvents(c: CustomerDetail): SecurityEvent[] {
  const out: SecurityEvent[] = [];
  if (c.security.passwordResetAt) out.push({ icon: "key", text: "Password reset with an SMS code", sub: "Forgot password in the app", at: c.security.passwordResetAt });
  else if (c.passwordChangedAt) out.push({ icon: "key", text: "Password set or changed", sub: "In the app", at: c.passwordChangedAt });
  for (const x of c.security.contactChanges) {
    if (x.email) out.push({ icon: "mail", text: "Email changed", sub: "New address confirmed with a code", at: x.at });
    if (x.phone) out.push({ icon: "phone", text: "Phone number changed", sub: "New number confirmed with a code", at: x.at });
  }
  if (c.security.lastCodeSignIn) out.push({ icon: "smartphone", text: "Signed in with an SMS code", sub: "Most recent", at: c.security.lastCodeSignIn });
  for (const d of c.security.devices.slice(0, 2)) {
    out.push({ icon: "smartphone", text: d.name || (d.platform === "ios" ? "iPhone" : d.platform === "android" ? "Android phone" : "Phone"), sub: "App installed · notifications on", at: d.lastSeen });
  }
  const verified = c.signup?.phoneVerifiedAt ?? (c.source === "self" ? null : c.verifiedAt);
  if (verified) out.push({ icon: "phone", text: "Phone number verified", sub: c.source === "self" ? "At sign-up" : "At approval", at: verified });
  return out.sort((a, b) => Date.parse(b.at ?? "0") - Date.parse(a.at ?? "0"));
}

export interface ConnectedRecord {
  kind: "ticket" | "mismatch" | "signup";
  label: string;
  sub: string;
  id?: string;
}

export function connectedRecords(c: CustomerDetail): ConnectedRecord[] {
  return [
    ...c.tickets.map((t) => ({
      kind: "ticket" as const,
      id: t.id,
      label: [t.ticketId, t.subject].filter(Boolean).join(" · ") || "Ticket",
      sub: t.status === "resolved" ? "Solved ticket" : "Open ticket",
    })),
    ...c.mismatches.map((m) => ({
      kind: "mismatch" as const,
      label: `Bank name mismatch · ${m.bank ?? "bank"}`,
      sub: `Account name ${m.accountName ?? "—"} · ${timeAgo(m.createdAt)}`,
    })),
    ...(c.signup
      ? [
          {
            kind: "signup" as const,
            id: c.signup.id,
            label: "Sign-up record",
            sub: c.signup.decision === "approved" ? "Approved after review" : "Signed up in the app",
          },
        ]
      : []),
  ];
}

/** The pending / Tier 1 / rejected banner under the header, if any. */
export function profileBanner(c: CustomerDetail): { tone: "warn" | "info" | "fail"; title: string; body: string } | null {
  if (c.status === "pending") {
    const by = c.registeredBy ? `${c.registeredBy.name}${c.registeredBy.state ? ` (${c.registeredBy.state})` : ""}` : "an agent";
    return {
      tone: "warn",
      title: "Waiting for KYC review.",
      body: `Registered by ${by} ${timeAgo(c.createdAt)}. Check the NIN match and biometric quality below, then approve or reject.`,
    };
  }
  if (c.status === "rejected") return { tone: "fail", title: "Rejected.", body: c.rejectionReason || "" };
  if (c.source === "self" && c.tier === 1 && c.status === "active") {
    const caps = c.tierCaps;
    return {
      tone: "info",
      title: "Self sign-up · Tier 1.",
      body: `Phone, NIN and selfie verified in the app. Palm not set up, so limits are ${caps ? formatNairaWhole(caps.maxSingle) : "lower"} per payment and ${
        caps ? formatNairaWhole(caps.maxDaily) : "lower"
      } a day. They move to Tier 2 when an agent captures their palm.`,
    };
  }
  return null;
}
