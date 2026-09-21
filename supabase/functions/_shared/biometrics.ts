import { ApiError } from "./auth.ts";
import {
  decideMatch,
  featuresSatisfyMode,
  resolveMargin,
  resolveThreshold,
  type MatchMode,
  type RecognizeMode,
} from "./match-math.ts";

export type { MatchMode, RecognizeMode };
export { decideMatch, featuresSatisfyMode };

/**
 * Palm-vein matching.
 *
 * MiliPay does the actual matching in a sovereign service that holds templates
 * in RAM (CBN/NDPA: templates never leave our infrastructure, and never go to a
 * vendor demo cloud). This module is the only sanctioned way into it.
 *
 * It fails CLOSED. If no matching service is configured, a payment is declined
 * rather than approved: an unverified palm must never move money.
 *
 * Two modes, one interface:
 *
 *   1:1  the customer identified themselves first (phone, card, QR) and the
 *        palm confirms that one claim. One comparison.
 *   1:N  the palm alone identifies the customer. The matcher searches its
 *        whole gallery.
 *
 * The caller picks by passing customerHint or not. Everything downstream is
 * identical, so the product decision can change without touching callers.
 *
 * On 1:N specifically — the thing that makes it dangerous is not latency, it is
 * that the chance of *some* stranger scoring above the threshold grows with the
 * size of the gallery. A threshold that is safe against one customer is not
 * automatically safe against fifty million. Two defences live here:
 *
 *   - the threshold is the SDK's (GetRecognitionThreshold), not a number we
 *     invented, and the environment may only ever tighten it;
 *   - a top score that is not clearly ahead of the runner-up is refused as
 *     ambiguous rather than guessed at.
 *
 * Neither is sufficient on its own at national scale. See
 * docs/palm-scanner-integration.md for what else has to be true.
 */

export interface PalmMatchRequest {
  /** base64 packed little-endian float32, from ExtractPalmFeaturesFromImg. */
  irFeatures?: string | null;
  rgbFeatures?: string | null;
  recogMode?: RecognizeMode;
  /**
   * When present the search is 1:1 against this customer only. When absent the
   * matcher searches a gallery (1:N).
   */
  customerHint?: string | null;
  /**
   * Narrows the 1:N gallery without naming a customer — the last few digits of
   * the phone number is the intended use.
   *
   * This is not a convenience. The chance that SOME stranger scores above the
   * threshold grows in proportion to the size of the gallery searched, so the
   * gallery size is the dominant term in the false-accept rate. Four digits
   * divides it by ten thousand, which is worth more than any threshold tuning
   * available to us. See docs/palm-scanner-integration.md.
   */
  partitionKey?: string | null;
  merchantId?: string | null;
  terminalId?: string | null;
}

export interface PalmMatch {
  /** public.customers.id */
  customerId: string;
  /** auth.users.id backing that customer */
  authUserId: string;
  /** 0..1 similarity reported by CompareFeaturesScore */
  score: number;
  /** Best non-matching candidate, when the matcher reports one. */
  runnerUpScore: number | null;
  /** The threshold actually applied. */
  threshold: number;
  mode: MatchMode;
  gallerySize: number | null;
  candidatesCompared: number | null;
  algorithmVersion: string | null;
  latencyMs: number;
}

export function isMatchingConfigured(): boolean {
  return Boolean(Deno.env.get("PALM_MATCH_URL"));
}

function envNumber(key: string): number | null {
  const raw = Deno.env.get(key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Env may only ever tighten what the matcher (and so the SDK) reported. */
export function effectiveThreshold(matcherThreshold: number | null | undefined): number {
  return resolveThreshold(matcherThreshold, envNumber("PALM_MATCH_THRESHOLD"));
}

export function minMargin(): number {
  return resolveMargin(envNumber("PALM_MATCH_MIN_MARGIN"));
}

interface MatcherPayload {
  matched?: boolean;
  customerId?: string;
  authUserId?: string;
  score?: number;
  runnerUpScore?: number | null;
  /** The SDK's GetRecognitionThreshold for this mode. */
  threshold?: number;
  gallerySize?: number;
  candidatesCompared?: number;
  algorithmVersion?: string;
}

/**
 * Best-effort audit. A match event that fails to record must never fail the
 * payment it describes, so this swallows its own errors — but it is the only
 * place the score distribution is observable, and without it a gallery that has
 * outgrown its threshold is invisible until a customer is charged for someone
 * else's shopping.
 */
export async function recordMatchEvent(
  admin: { from: (t: string) => { insert: (r: unknown) => Promise<{ error: unknown }> } },
  row: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await admin.from("palm_match_events").insert(row);
    if (error) console.error("[biometrics] match event not recorded", error);
  } catch (err) {
    console.error("[biometrics] match event not recorded", err);
  }
}

export async function matchPalm(
  request: PalmMatchRequest,
  opts: { timeoutMs?: number } = {},
): Promise<PalmMatch> {
  const endpoint = Deno.env.get("PALM_MATCH_URL");
  const serviceKey = Deno.env.get("PALM_MATCH_SERVICE_KEY") ?? "";

  if (!endpoint) {
    // Fail closed. Previously this function approved every payment without
    // looking at the palm at all.
    throw new ApiError(
      "Biometric matching service is not configured. Payment declined.",
      503,
      "BIOMETRIC_SERVICE_UNAVAILABLE",
    );
  }

  if (!request.irFeatures && !request.rgbFeatures) {
    throw new ApiError("Palm biometric capture is required.", 400, "PALM_FEATURE_REQUIRED");
  }

  const recogMode: RecognizeMode = request.recogMode ?? "kBiModal";
  if (!featuresSatisfyMode(recogMode, request.irFeatures, request.rgbFeatures)) {
    throw new ApiError(
      `${recogMode} matching needs captures this request did not carry.`,
      400,
      "PALM_FEATURE_INCOMPLETE",
    );
  }

  const mode: MatchMode = request.customerHint ? "1:1" : "1:N";
  const startedAt = Date.now();

  const controller = new AbortController();
  // 1:N searches a gallery; 1:1 does one comparison. Giving both the same
  // three seconds would either starve the search or make a failed 1:1 hang a
  // customer at the counter.
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? (mode === "1:N" ? 8_000 : 3_000),
  );

  let payload: MatcherPayload;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(serviceKey ? { "x-service-key": serviceKey } : {}),
      },
      body: JSON.stringify({
        irFeatures: request.irFeatures ?? null,
        rgbFeatures: request.rgbFeatures ?? null,
        mode: recogMode,
        customerId: request.customerHint ?? null,
        partitionKey: request.partitionKey ?? null,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`matcher responded ${res.status}`);
    }
    payload = await res.json();
  } catch (err) {
    console.error("[biometrics] match call failed", err);
    throw new ApiError(
      "Biometric matching is temporarily unavailable. Payment declined.",
      503,
      "BIOMETRIC_SERVICE_UNAVAILABLE",
    );
  } finally {
    clearTimeout(timeout);
  }

  const latencyMs = Date.now() - startedAt;
  const score = Number(payload.score ?? 0);
  const runnerUpScore =
    typeof payload.runnerUpScore === "number" && Number.isFinite(payload.runnerUpScore)
      ? payload.runnerUpScore
      : null;
  const threshold = effectiveThreshold(payload.threshold);

  const outcome = decideMatch({
    matched: Boolean(payload.matched && payload.customerId && payload.authUserId),
    score,
    runnerUpScore,
    threshold,
    margin: minMargin(),
    mode,
  });

  if (outcome.decision === "ambiguous") {
    throw new ApiError(
      "Could not identify you confidently. Please rescan, or pay with your phone number.",
      401,
      "PALM_MATCH_AMBIGUOUS",
      { score, runnerUpScore, threshold },
    );
  }

  if (outcome.decision === "rejected") {
    if (outcome.reason === "below threshold") {
      throw new ApiError(
        "Palm match confidence too low. Please rescan.",
        401,
        "PALM_MATCH_LOW_CONFIDENCE",
        { score, threshold },
      );
    }
    throw new ApiError(
      "Palm not recognised. Please rescan or use an alternative payment method.",
      401,
      "PALM_NOT_RECOGNISED",
    );
  }

  return {
    customerId: payload.customerId as string,
    authUserId: payload.authUserId as string,
    score,
    runnerUpScore,
    threshold,
    mode,
    gallerySize: payload.gallerySize ?? null,
    candidatesCompared: payload.candidatesCompared ?? null,
    algorithmVersion: payload.algorithmVersion ?? null,
    latencyMs,
  };
}
