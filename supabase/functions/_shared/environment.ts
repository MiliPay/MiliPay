/**
 * Which environment are we actually in, and is it coherent?
 *
 * Zero imports on purpose, like tier-math.ts and match-math.ts: this decides
 * whether real value can be dispensed, so the test suite has to be able to run
 * it under Node.
 *
 * The problem this exists to stop: VTU fulfilment spends MiliPay's own money at
 * VTPass and BigiSub. A build that is half-configured — live API keys pointed at
 * a sandbox URL, or a sandbox key pointed at production — does not fail loudly.
 * It either burns real money against test requests or silently vends nothing
 * while telling customers it worked. Both have happened to other people.
 *
 * So the mode is explicit, it defaults to OFF, and a mismatch between the mode
 * and the URL is a hard error rather than a warning.
 */

export type FulfilmentMode = "disabled" | "simulated" | "live";

/**
 * Default is "disabled". An unset variable must never mean "spend money" — a
 * fresh deploy, a dropped secret or a typo all land here, and the safe landing
 * is refusing to vend.
 */
export function resolveFulfilmentMode(raw: string | undefined | null): FulfilmentMode {
  switch (String(raw ?? "").trim().toLowerCase()) {
    case "live":
      return "live";
    case "simulated":
      return "simulated";
    default:
      return "disabled";
  }
}

/** Hosts that are definitely not production, per each provider's own docs. */
const SANDBOX_MARKERS = ["sandbox", "staging", "test.", "localhost", "127.0.0.1", "demo."];

export function isSandboxUrl(url: string | undefined | null): boolean {
  const value = String(url ?? "").toLowerCase();
  if (!value) return false;
  return SANDBOX_MARKERS.some((marker) => value.includes(marker));
}

export interface CoherenceInput {
  mode: FulfilmentMode;
  bigisubBaseUrl?: string | null;
  monoBaseUrl?: string | null;
}

export interface CoherenceResult {
  ok: boolean;
  /** Present when ok is false. Safe to log; contains no credentials. */
  reason?: string;
}

/**
 * A live fulfilment mode pointed at a sandbox endpoint is the dangerous case:
 * the customer's bank is debited for real by Mono while the operator call goes
 * to a test gateway that credits nobody. Refuse to start.
 *
 * The reverse — a simulated mode pointed at production — is harmless, because
 * simulated mode makes no provider calls at all.
 */
export function checkEnvironmentCoherence(input: CoherenceInput): CoherenceResult {
  if (input.mode !== "live") return { ok: true };

  const sandboxed: string[] = [];
  if (isSandboxUrl(input.bigisubBaseUrl)) sandboxed.push("BIGISUB_BASE_URL");
  if (isSandboxUrl(input.monoBaseUrl)) sandboxed.push("MONO_BASE_URL");

  if (sandboxed.length > 0) {
    return {
      ok: false,
      reason:
        `VTU_FULFILMENT_MODE=live but ${sandboxed.join(", ")} still points at a ` +
        `sandbox host. Real bank debits with test fulfilment would take money ` +
        `and deliver nothing.`,
    };
  }

  return { ok: true };
}

/** Human-readable refusal shown to a customer while vending is off. */
export function disabledMessage(mode: FulfilmentMode): string {
  return mode === "disabled"
    ? "Quick services are temporarily unavailable. No payment was taken."
    : "Quick services are running in test mode and cannot complete real purchases.";
}

/**
 * Reads the live environment. Separate from the pure functions above so the
 * tests never need a Deno global.
 */
export function readFulfilmentEnvironment(env: {
  get(key: string): string | undefined;
}): { mode: FulfilmentMode; coherence: CoherenceResult } {
  const mode = resolveFulfilmentMode(env.get("VTU_FULFILMENT_MODE"));
  return {
    mode,
    coherence: checkEnvironmentCoherence({
      mode,
      bigisubBaseUrl: env.get("BIGISUB_BASE_URL"),
      monoBaseUrl: env.get("MONO_BASE_URL"),
    }),
  };
}
