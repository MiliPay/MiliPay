/**
 * NIN / BVN verification.
 *
 * Runs in one of two modes, chosen by IDENTITY_VERIFICATION_MODE:
 *
 *   simulated (default) — no provider is called. Deterministic so tests are
 *     reproducible: an ID ending in 0000 fails, 9999 reports the provider as
 *     unavailable, anything else verifies. Every result is written to
 *     public.identity_verifications with mode='simulated', so the cohort that
 *     was never really checked stays identifiable.
 *
 *   live — calls Mono's Lookup API with MONO_SECRET_KEY. Flipping the env var
 *     is the whole switch-over; no code change.
 *
 * Nothing here decides whether an enrolment proceeds. It reports, the caller
 * records, and an administrator still approves.
 */

export type IdType = "nin" | "bvn";
export type VerificationStatus = "verified" | "failed" | "unavailable";
export type VerificationMode = "simulated" | "live";

export interface VerificationOutcome {
  status: VerificationStatus;
  mode: VerificationMode;
  provider: string;
  matchedName: string | null;
  providerRef: string | null;
  failureReason: string | null;
}

export function verificationMode(): VerificationMode {
  return Deno.env.get("IDENTITY_VERIFICATION_MODE") === "live" ? "live" : "simulated";
}

export function isWellFormed(value: string): boolean {
  // NIN and BVN are both 11 digits.
  return /^\d{11}$/.test(value.trim());
}

function simulate(idType: IdType, idNumber: string, claimedName: string): VerificationOutcome {
  const base = {
    mode: "simulated" as const,
    provider: "simulation",
    providerRef: `SIM-${idType.toUpperCase()}-${idNumber.slice(-4)}`,
  };

  if (idNumber.endsWith("9999")) {
    return {
      ...base,
      status: "unavailable",
      matchedName: null,
      failureReason: "Simulated provider outage (test ID ending 9999).",
    };
  }

  if (idNumber.endsWith("0000")) {
    return {
      ...base,
      status: "failed",
      matchedName: null,
      failureReason: `Simulated mismatch: no ${idType.toUpperCase()} record found (test ID ending 0000).`,
    };
  }

  return {
    ...base,
    status: "verified",
    // A simulation cannot confirm a name, so it echoes what was claimed. The
    // mode column is what tells you this was not a real match.
    matchedName: claimedName || null,
    failureReason: null,
  };
}

async function lookupWithMono(
  idType: IdType,
  idNumber: string,
): Promise<VerificationOutcome> {
  const secret = Deno.env.get("MONO_SECRET_KEY");
  const base = { mode: "live" as const, provider: "mono" };

  if (!secret) {
    return {
      ...base,
      status: "unavailable",
      matchedName: null,
      providerRef: null,
      failureReason: "MONO_SECRET_KEY is not set, so no live lookup is possible.",
    };
  }

  // Mono's BVN product is a multi-step flow (initiate, deliver OTP, verify)
  // that needs UI on the agent device. Until that is built, a live deployment
  // must not silently pretend a BVN was checked.
  if (idType === "bvn") {
    return {
      ...base,
      status: "unavailable",
      matchedName: null,
      providerRef: null,
      failureReason: "Live BVN lookup requires Mono's OTP flow, which is not built yet.",
    };
  }

  try {
    const response = await fetch("https://api.withmono.com/v3/lookup/nin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "mono-sec-key": secret,
      },
      body: JSON.stringify({ nin: idNumber }),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ...base,
        status: response.status >= 500 ? "unavailable" : "failed",
        matchedName: null,
        providerRef: String(body?.id ?? ""),
        failureReason: String(body?.message ?? `Mono returned HTTP ${response.status}`),
      };
    }

    const record = body?.data ?? body;
    const matchedName = [record?.first_name, record?.middle_name, record?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      ...base,
      status: matchedName ? "verified" : "failed",
      matchedName: matchedName || null,
      providerRef: String(record?.id ?? body?.id ?? ""),
      failureReason: matchedName ? null : "Mono returned no name for this NIN.",
    };
  } catch (err) {
    return {
      ...base,
      status: "unavailable",
      matchedName: null,
      providerRef: null,
      failureReason: err instanceof Error ? err.message : "Network error contacting Mono.",
    };
  }
}

export async function verifyIdentity(
  idType: IdType,
  idNumber: string,
  claimedName: string,
): Promise<VerificationOutcome> {
  const trimmed = idNumber.trim();

  if (!isWellFormed(trimmed)) {
    return {
      status: "failed",
      mode: verificationMode(),
      provider: verificationMode() === "live" ? "mono" : "simulation",
      matchedName: null,
      providerRef: null,
      failureReason: `${idType.toUpperCase()} must be exactly 11 digits.`,
    };
  }

  return verificationMode() === "live"
    ? await lookupWithMono(idType, trimmed)
    : simulate(idType, trimmed, claimedName);
}
