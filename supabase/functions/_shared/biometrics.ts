import { ApiError } from "./auth.ts";

/**
 * Palm-vein 1:N matching.
 *
 * MiliPay does the actual matching in a sovereign C++ microservice that holds
 * BYTEA templates in RAM (CBN/NDPA: templates never leave our infrastructure,
 * and never go to a vendor demo cloud). This module is the only sanctioned way
 * into it.
 *
 * It fails CLOSED. If no matching service is configured, a payment is declined
 * rather than approved: an unverified palm must never move money.
 */

export interface PalmMatch {
  /** public.customers.id */
  customerId: string;
  /** auth.users.id backing that customer */
  authUserId: string;
  /** 0..1 similarity reported by CompareFeaturesScore */
  score: number;
}

/** Minimum similarity accepted for a payment authorisation. */
const DEFAULT_MATCH_THRESHOLD = 0.82;

export function isMatchingConfigured(): boolean {
  return Boolean(Deno.env.get("PALM_MATCH_URL"));
}

export async function matchPalm(
  palmFeature: string,
  opts: { timeoutMs?: number } = {},
): Promise<PalmMatch> {
  const endpoint = Deno.env.get("PALM_MATCH_URL");
  const serviceKey = Deno.env.get("PALM_MATCH_SERVICE_KEY") ?? "";
  const threshold = Number(Deno.env.get("PALM_MATCH_THRESHOLD")) || DEFAULT_MATCH_THRESHOLD;

  if (!endpoint) {
    // Fail closed. Previously this function approved every payment without
    // looking at the palm at all.
    throw new ApiError(
      "Biometric matching service is not configured. Payment declined.",
      503,
      "BIOMETRIC_SERVICE_UNAVAILABLE",
    );
  }

  if (!palmFeature || typeof palmFeature !== "string") {
    throw new ApiError("Palm biometric capture is required.", 400, "PALM_FEATURE_REQUIRED");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 3000);

  let payload: {
    matched?: boolean;
    customerId?: string;
    authUserId?: string;
    score?: number;
  };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(serviceKey ? { "x-service-key": serviceKey } : {}),
      },
      body: JSON.stringify({ irFeature: palmFeature, mode: "kRegIrVSIr" }),
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

  const score = Number(payload.score ?? 0);

  if (!payload.matched || !payload.customerId || !payload.authUserId) {
    throw new ApiError(
      "Palm not recognised. Please rescan or use an alternative payment method.",
      401,
      "PALM_NOT_RECOGNISED",
    );
  }

  if (score < threshold) {
    throw new ApiError(
      "Palm match confidence too low. Please rescan.",
      401,
      "PALM_MATCH_LOW_CONFIDENCE",
      { score, threshold },
    );
  }

  return {
    customerId: payload.customerId,
    authUserId: payload.authUserId,
    score,
  };
}
