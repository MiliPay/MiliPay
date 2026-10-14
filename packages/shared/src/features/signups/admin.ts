import { supabase } from "@milipay/shared/lib/supabase";
import type { DashboardRange } from "@milipay/shared/features/dashboard/view";
import type { Tone } from "@milipay/shared/components/ui/StatusBadge";

/**
 * Admin › Sign-ups: the funnel, bank-name mismatches and the tabbed list
 * (admin_signups), one sign-up for the review drawer (admin_signup_detail),
 * and the rules for showing them.
 */

export type SignupTab = "review" | "in_progress" | "abandoned" | "completed" | "rejected";
export type SignupStatus = "review" | "in_progress" | "abandoned" | "completed" | "approved" | "rejected" | "agent";

export interface SignupRow {
  id: string;
  phone: string;
  name: string | null;
  step: string;
  status: SignupStatus;
  attempts: number;
  smileStatus: string | null;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  customerId: string | null;
  /** Support asked the admins to look at this review first. */
  priorityAt?: string | null;
}

export interface SignupsData {
  funnel: number[];
  counts: Record<SignupTab, number>;
  mismatches: { id: string; customerId: string; customer: string | null; bank: string | null; accountName: string | null; createdAt: string }[];
  rows: SignupRow[];
}

export async function fetchSignups(range: DashboardRange, tab: SignupTab, q: string): Promise<SignupsData> {
  const { data, error } = await supabase.rpc("admin_signups", { p_range: range, p_tab: tab, p_q: q });
  if (error) throw new Error(error.message);
  return data as SignupsData;
}

export interface SignupDetail {
  id: string;
  phone: string;
  name: string | null;
  step: string;
  status: SignupStatus;
  decision: string | null;
  reason: string | null;
  attempts: number;
  selfieFailure: string | null;
  ninLast4: string | null;
  dob: string | null;
  state: string | null;
  lga: string | null;
  createdAt: string;
  updatedAt: string;
  phoneVerifiedAt: string | null;
  consentAt: string | null;
  confirmedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  remindedAt: string | null;
  customerId: string | null;
  /** Support asked for this review to go first, and why. */
  priority?: { at: string; note: string | null; by: string | null } | null;
  /** The NIN entered belongs to another account (the sign-up was stopped). */
  ninBlockedAt?: string | null;
  fraudReports?: { caseNumber: string; status: string; note: string; createdAt: string; customerId: string | null; by: string | null }[];
  smile: {
    jobId: string | null;
    status: string | null;
    reason: string | null;
    risk: string | null;
    confidence: number | null;
    selfieUrl: string | null;
    photoUrl: string | null;
    nimcName: string | null;
    ninMatches: boolean | null;
    dobMatches: boolean | null;
  } | null;
}

export async function fetchSignupDetail(id: string): Promise<SignupDetail | null> {
  const { data, error } = await supabase.rpc("admin_signup_detail", { p_id: id });
  if (error) throw new Error(error.message);
  return (data as SignupDetail | null) ?? null;
}

export const SIGNUP_STEPS = ["Phone", "NIN", "Selfie", "Address", "Secure"];

/** Which of the five steps a sign-up is on (1–5), or 5 when it is finished. */
export function stepNumber(step: string, status: SignupStatus): number {
  if (status === "completed" || status === "approved") return 5;
  return ({ phone: 1, nin: 2, selfie: 3, review: 3, confirm: 4, addr: 4, done: 5 } as Record<string, number>)[step] ?? 1;
}

export const STATUS_LABEL: Record<SignupStatus, [string, Tone]> = {
  review: ["Needs review", "warn"],
  in_progress: ["In progress", "info"],
  abandoned: ["Abandoned", "muted"],
  completed: ["Account created", "ok"],
  approved: ["Approved by admin", "ok"],
  rejected: ["Rejected", "fail"],
  agent: ["Sent to an agent", "info"],
};

/** The Smile ID chip in the list. */
export function smileChip(r: { status: SignupStatus; smileStatus: string | null; step: string; attempts: number }): [string, Tone] {
  if (r.smileStatus === "clear") return ["Matched", "ok"];
  if (r.smileStatus === "attention" || r.smileStatus === "block") return ["Flagged", "fail"];
  if (r.status === "review" || r.attempts > 0) return ["Selfie failed", "warn"];
  return ["Not run yet", "muted"];
}

/** Bars for the five-step progress: filled, current-in-trouble, or empty. */
export function progressBars(r: { status: SignupStatus; step: string }): ("done" | "warn" | "stalled" | "todo")[] {
  const n = stepNumber(r.step, r.status);
  return [1, 2, 3, 4, 5].map((k) =>
    k > n ? "todo" : r.status === "review" && k === n ? "warn" : r.status === "abandoned" && k === n ? "stalled" : "done",
  );
}

/** Why a sign-up is waiting for a person, in words. */
export function whyHere(d: Pick<SignupDetail, "reason" | "attempts" | "smile">): string | null {
  const r = d.reason ?? "";
  if (r === "three_failed_selfies") return `${d.attempts || 3} selfie attempts failed.`;
  if (r.startsWith("rejected:")) return null;
  if (d.smile?.status === "attention" || d.smile?.status === "block" || r === "flagged") {
    return `Flagged by Smile ID${d.smile?.reason ? `: ${d.smile.reason.replace(/_/g, " ")}` : ""}${d.smile?.risk ? ` (risk ${d.smile.risk})` : ""}.`;
  }
  if (r === "no_name_on_record") return "The NIMC record for this NIN has no name.";
  return r ? `${r.replace(/_/g, " ")}.` : null;
}

export const SIGNUP_REJECT_REASONS = [
  "Selfie does not match NIN photo.",
  "Signs of spoofing (photo, screen or mask).",
  "NIN belongs to someone else.",
  "Duplicate account: this person already has MiliPay.",
  "Other reason",
];

/** Approve is only possible against NIMC's own record for what they typed. */
export function canApprove(d: SignupDetail): boolean {
  return d.status === "review" && Boolean(d.smile?.ninMatches && d.smile?.dobMatches && d.smile?.nimcName);
}
