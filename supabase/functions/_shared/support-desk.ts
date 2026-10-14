/**
 * The support desk's account help (design handoff, MiliPay Support: the
 * customer panel's "Account help"): what each action says to the customer,
 * and the rules for who it applies to. Pure, with no imports, so the test
 * suite runs exactly this.
 */

export type DeskAction =
  | "reset_link"
  | "login_code"
  | "nearest_agents"
  | "signup_priority"
  | "nin_misuse"
  | "signup_code";

/** Actions on someone with an account, and on someone still signing up. */
export const CUSTOMER_ACTIONS: DeskAction[] = ["reset_link", "login_code", "nearest_agents"];
export const APPLICANT_ACTIONS: DeskAction[] = ["signup_priority", "nin_misuse", "signup_code", "nearest_agents"];

/** Every action needs a note on how the caller was confirmed, except sending agents. */
export function noteRequired(action: DeskAction): boolean {
  return action !== "nearest_agents";
}

export function resetLinkSms(): string {
  return (
    "MiliPay: to reset your password, open the MiliPay app, go to Me › Change password and tap " +
    "\"Forgot your current password?\". We'll text you a code to set a new one. " +
    "If you didn't ask for this, ignore this message."
  );
}

export interface AgentContact {
  name: string;
  phone: string | null;
}

/** The SMS with the nearest agents (agents have a state on file, not an address). */
export function nearestAgentsSms(state: string, agents: AgentContact[]): string {
  const list = agents
    .slice(0, 3)
    .map((a) => `${a.name.trim()}${a.phone ? ` (${a.phone})` : ""}`)
    .join("; ");
  return (
    `MiliPay agents in ${state}: ${list}. ` +
    "Bring your NIN slip or card. Adding your palm takes about 5 minutes and raises your limits."
  );
}

export function signupCodeSms(code: string): string {
  return `Your MiliPay sign-up code is ${code}. It expires in 10 minutes. MiliPay will never call or text to ask for it.`;
}

export function fraudCaseSms(caseNumber: string): string {
  return (
    `MiliPay: we've opened a fraud check (case ${caseNumber}) on the account that holds your NIN. ` +
    "We'll contact you on this number. You don't need to do anything now."
  );
}

/** The line written to the ticket, visible to staff only. */
export function deskLine(action: DeskAction, ctx: { phone: string; state?: string | null; staff: string; signup?: string | null; caseNumber?: string }): string {
  switch (action) {
    case "reset_link":
      return `Password reset sent to ${ctx.phone} by ${ctx.staff}`;
    case "login_code":
      return `Login code sent to ${ctx.phone} by ${ctx.staff}`;
    case "nearest_agents":
      return `Nearest agents in ${ctx.state ?? "their state"} sent by SMS by ${ctx.staff}`;
    case "signup_priority":
      return `Asked admin to prioritise sign-up ${ctx.signup ?? ""} by ${ctx.staff}`.replace("  ", " ");
    case "nin_misuse":
      return `Reported possible NIN misuse to the fraud team (${ctx.caseNumber ?? "case opened"}) by ${ctx.staff}`;
    case "signup_code":
      return `Sign-up code resent to ${ctx.phone} by ${ctx.staff}`;
  }
}

/** A short, readable reference for a sign-up session (its id is a uuid). */
export function signupRef(id: string): string {
  return `SUP-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}
