/**
 * Which environment are we actually in, and is it coherent?
 *
 * Zero imports on purpose, like tier-math.ts and match-math.ts: this decides
 * whether real value can be dispensed, so the test suite has to be able to run
 * it under Node.
 *
 * THE PROBLEM THIS EXISTS TO STOP is a half-configured deployment. The two
 * legs of a purchase are separate systems — Mono moves the customer's money,
 * the VTU gateway spends MiliPay's own — and each has a test face and a
 * production face. Mixing them does not fail loudly:
 *
 *   production Mono + sandbox VTU  -> real bank debits, nothing delivered
 *   sandbox Mono + production VTU  -> MiliPay's real wallet drained for free
 *
 * WHAT CHANGED, AND WHY. The previous version asked a narrower question — "is
 * VTU_FULFILMENT_MODE=live while a URL looks like a sandbox?" — and refused on
 * that alone. That made a fully-sandboxed deployment impossible to run, which
 * is exactly the configuration you want for building an MVP: both legs on test
 * credentials, no real money anywhere, but the whole flow genuinely executing
 * rather than being stubbed out.
 *
 * It also could not see Mono at all. Mono has no separate sandbox host — test
 * and live both go to api.withmono.com and the difference is the key prefix —
 * so the MONO_BASE_URL check could never fire, including in the money-burning
 * case above.
 *
 * So the question is now "which environment is this, and does every provider
 * agree?". `MILIPAY_ENVIRONMENT` states the intent; each provider's own
 * configuration is then checked against it. Declaring one thing and
 * configuring another is the error, in either direction.
 */

export type FulfilmentMode = "disabled" | "simulated" | "live";

/**
 * Sandbox and production are whole environments, not per-provider settings.
 * `unknown` means a provider's configuration does not say — an unrecognised
 * host, or a credential whose format we cannot classify. Unknown never
 * contradicts a declaration; only a definite disagreement does.
 */
export type Deployment = "sandbox" | "production" | "unknown";

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

/**
 * Which environment this deployment claims to be.
 *
 * Defaults to sandbox, on the same principle as the mode above: an unset or
 * misspelled value must land on the side that cannot move real money. Saying
 * "production" has to be a deliberate act.
 */
export function resolveDeployment(raw: string | undefined | null): "sandbox" | "production" {
  return String(raw ?? "").trim().toLowerCase() === "production" ? "production" : "sandbox";
}

/** Hosts that are definitely not production, per each provider's own docs. */
const SANDBOX_MARKERS = ["sandbox", "staging", "test.", "localhost", "127.0.0.1", "demo."];

export function isSandboxUrl(url: string | undefined | null): boolean {
  const value = String(url ?? "").toLowerCase();
  if (!value) return false;
  return SANDBOX_MARKERS.some((marker) => value.includes(marker));
}

/**
 * Classify a VTU gateway from its base URL.
 *
 * An unset URL is `unknown`, not `production`: the module falls back to a
 * default elsewhere and guessing here would let an empty variable pass as a
 * deliberate production choice.
 */
export function classifyGatewayUrl(url: string | undefined | null): Deployment {
  const value = String(url ?? "").trim();
  if (!value) return "unknown";
  return isSandboxUrl(value) ? "sandbox" : "production";
}

/**
 * Classify Mono from its secret key.
 *
 * Mono ships one host for both faces and distinguishes them by key prefix
 * (test_… / live_…), so the key is the only thing that can answer this. Only
 * the prefix is ever inspected and only the classification is ever returned —
 * nothing in this module may put a credential into a string a caller logs.
 */
export function classifyMonoKey(secretKey: string | undefined | null): Deployment {
  const value = String(secretKey ?? "").trim().toLowerCase();
  if (!value) return "unknown";
  if (value.startsWith("test_") || value.startsWith("sk_test")) return "sandbox";
  if (value.startsWith("live_") || value.startsWith("sk_live")) return "production";
  return "unknown";
}

export interface CoherenceInput {
  mode: FulfilmentMode;
  /** What this deployment says it is. */
  declared: "sandbox" | "production";
  /** The active VTU gateway's base URL, whichever gateway that is. */
  gatewayBaseUrl?: string | null;
  /** Named only so a refusal can say which variable to fix. */
  gatewayVariable?: string;
  /** Mono's secret key. Only its prefix is read; it is never echoed. */
  monoSecretKey?: string | null;
}

export interface CoherenceResult {
  ok: boolean;
  /** Present when ok is false. Safe to log; contains no credentials. */
  reason?: string;
  /** What each leg was judged to be, for diagnostics. */
  detail?: { declared: string; gateway: Deployment; mono: Deployment };
}

/**
 * Every provider must agree with the declared environment.
 *
 * All-sandbox and all-production are both coherent. A disagreement is not,
 * whichever way round it points, because both directions lose money — one
 * takes the customer's and delivers nothing, the other delivers for free.
 *
 * `disabled` and `simulated` make no provider calls, so nothing to check.
 */
export function checkEnvironmentCoherence(input: CoherenceInput): CoherenceResult {
  if (input.mode !== "live") return { ok: true };

  const gateway = classifyGatewayUrl(input.gatewayBaseUrl);
  const mono = classifyMonoKey(input.monoSecretKey);
  const detail = { declared: input.declared, gateway, mono };

  const disagreements: string[] = [];
  if (gateway !== "unknown" && gateway !== input.declared) {
    disagreements.push(
      `${input.gatewayVariable ?? "the VTU gateway URL"} looks like ${gateway}`,
    );
  }
  if (mono !== "unknown" && mono !== input.declared) {
    disagreements.push(`MONO_SECRET_KEY is a ${mono} key`);
  }

  if (disagreements.length > 0) {
    return {
      ok: false,
      detail,
      reason:
        `MILIPAY_ENVIRONMENT=${input.declared} but ${disagreements.join(" and ")}. ` +
        `Mixing the two is how money is taken and nothing delivered, or ` +
        `delivered and nothing taken. Refusing to vend.`,
    };
  }

  return { ok: true, detail };
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
 *
 * The gateway checked is VTPass and only VTPass, because it is the only
 * gateway anything calls. This used to fall back to BIGISUB_BASE_URL when
 * VTPASS_BASE_URL was unset, on the idea that a parked provider should still
 * be "honoured when configured" — but nothing honours it: vtu-service and
 * vtu-reconcile only ever call the VTPass adapter. So the fallback judged
 * the deployment by a URL no request goes to, and could refuse a sound
 * deployment, or pass an unsound one, on the strength of it.
 *
 * With VTPASS_BASE_URL unset, the gateway classifies as `unknown` and passes
 * here — which is correct, because vtu-service refuses every purchase on its
 * own when vtpass.isConfigured() is false. Nothing can be dispensed through a
 * gateway that has no address.
 */
export function readFulfilmentEnvironment(env: {
  get(key: string): string | undefined;
}): {
  mode: FulfilmentMode;
  declared: "sandbox" | "production";
  coherence: CoherenceResult;
} {
  const mode = resolveFulfilmentMode(env.get("VTU_FULFILMENT_MODE"));
  const declared = resolveDeployment(env.get("MILIPAY_ENVIRONMENT"));

  return {
    mode,
    declared,
    coherence: checkEnvironmentCoherence({
      mode,
      declared,
      gatewayBaseUrl: env.get("VTPASS_BASE_URL"),
      gatewayVariable: "VTPASS_BASE_URL",
      monoSecretKey: env.get("MONO_SECRET_KEY"),
    }),
  };
}
