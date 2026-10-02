import { supabase } from "@milipay/shared/lib/supabase";

/**
 * Self sign-ups waiting for an administrator (the signup-review Edge
 * Function). Read and decided on the server; the portal only shows them.
 */

export interface SignupReviewSmile {
  status: string | null;
  reason: string | null;
  fullName: string | null;
  dateOfBirth: string | null;
  ninMatches: boolean;
  dobMatches: boolean;
  photoUrl: string | null;
  selfieUrl: string | null;
  riskLevel: string | null;
}

export interface SignupReview {
  id: string;
  phone: string;
  ninLast4: string | null;
  dateOfBirth: string | null;
  reason: string | null;
  selfieAttempts: number;
  createdAt: string;
  updatedAt: string;
  smile: SignupReviewSmile | null;
}

export type ReviewDecision = "approve" | "retry" | "reject";

async function readError(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.json();
      if (body?.error) return String(body.error);
    } catch {
      // fall through
    }
  }
  return fallback;
}

export async function fetchSignupReviews(): Promise<SignupReview[]> {
  const { data, error } = await supabase.functions.invoke("signup-review", { body: { action: "list" } });
  if (error) throw new Error(await readError(error, "Could not load sign-up reviews."));
  if (!data?.success) throw new Error(data?.error || "Could not load sign-up reviews.");
  return data.items as SignupReview[];
}

export async function decideSignupReview(
  sessionId: string,
  decision: ReviewDecision,
  reason?: string,
): Promise<{ customerTold: boolean }> {
  const { data, error } = await supabase.functions.invoke("signup-review", {
    body: { action: "decide", sessionId, decision, reason },
  });
  if (error) throw new Error(await readError(error, "Could not save the decision."));
  if (!data?.success) throw new Error(data?.error || "Could not save the decision.");
  return { customerTold: Boolean(data.customerTold) };
}

/** Why it is in review, in words. */
export function reviewReasonText(reason: string | null): string {
  if (!reason) return "Needs a look";
  if (reason === "three_failed_selfies") return "Three selfies failed";
  if (reason === "flagged") return "Flagged by Smile ID";
  if (reason === "no_name_on_record") return "NIMC record has no name";
  return `Flagged by Smile ID (${reason.replace(/_/g, " ")})`;
}
