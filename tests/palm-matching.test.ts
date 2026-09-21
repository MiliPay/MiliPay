import { describe, expect, it } from "vitest";
import {
  FALLBACK_THRESHOLD,
  decideMatch,
  featuresSatisfyMode,
  resolveMargin,
  resolveThreshold,
} from "../supabase/functions/_shared/match-math";
import {
  CAPTURE_RESULTS,
  PALM_LED_MODES,
  describeCaptureResult,
  isSecurityRelevantResult,
} from "../packages/shared/src/features/biometrics/palmScanner";

/**
 * match-math.ts has zero imports for exactly this reason: biometrics.ts pulls
 * in auth.ts, which imports over https and cannot be loaded by Node. The
 * arithmetic that decides whether a payment is authorised has to be testable,
 * so it lives on its own.
 */

describe("resolveThreshold", () => {
  it("uses the matcher's threshold, which comes from the SDK", () => {
    expect(resolveThreshold(0.71, null)).toBe(0.71);
  });

  it("lets the environment tighten the matcher's threshold", () => {
    expect(resolveThreshold(0.71, 0.9)).toBe(0.9);
  });

  it("never lets the environment LOOSEN it", () => {
    // A misconfigured deploy must not be able to make matching more
    // permissive than the algorithm vendor's own threshold.
    expect(resolveThreshold(0.71, 0.1)).toBe(0.71);
  });

  it("falls back to a deliberately high floor when the matcher reports nothing", () => {
    expect(resolveThreshold(null, null)).toBe(FALLBACK_THRESHOLD);
    expect(resolveThreshold(undefined, null)).toBe(FALLBACK_THRESHOLD);
    expect(resolveThreshold(0, null)).toBe(FALLBACK_THRESHOLD);
    expect(resolveThreshold(Number.NaN, null)).toBe(FALLBACK_THRESHOLD);
  });

  it("ignores a junk env value rather than treating it as zero", () => {
    expect(resolveThreshold(0.71, Number.NaN)).toBe(0.71);
    expect(resolveThreshold(0.71, -1)).toBe(0.71);
  });
});

describe("resolveMargin", () => {
  it("defaults to a non-zero margin", () => {
    expect(resolveMargin(null)).toBeGreaterThan(0);
    expect(resolveMargin(Number.NaN)).toBeGreaterThan(0);
  });

  it("honours an explicit zero, which disables the ambiguity guard", () => {
    expect(resolveMargin(0)).toBe(0);
  });
});

describe("featuresSatisfyMode", () => {
  it("requires both captures for bimodal", () => {
    expect(featuresSatisfyMode("kBiModal", "ir", "rgb")).toBe(true);
    expect(featuresSatisfyMode("kBiModal", "ir", null)).toBe(false);
    expect(featuresSatisfyMode("kBiModal", null, "rgb")).toBe(false);
  });

  it("accepts a single modality for the single-modality modes", () => {
    expect(featuresSatisfyMode("kRegIrVSIr", "ir", null)).toBe(true);
    expect(featuresSatisfyMode("kRegRgbVSRgb", null, "rgb")).toBe(true);
    expect(featuresSatisfyMode("kRegIrVSIr", null, "rgb")).toBe(false);
  });

  it("rejects an empty request outright", () => {
    expect(featuresSatisfyMode("kRegIrVSIr", null, null)).toBe(false);
    expect(featuresSatisfyMode("kBiModal", "", "")).toBe(false);
  });
});

describe("decideMatch", () => {
  const base = {
    matched: true,
    score: 0.95,
    runnerUpScore: null as number | null,
    threshold: 0.82,
    margin: 0.05,
    mode: "1:N" as const,
  };

  it("accepts a clear winner", () => {
    expect(decideMatch({ ...base, runnerUpScore: 0.4 }).decision).toBe("matched");
  });

  it("rejects when the matcher found nobody", () => {
    expect(decideMatch({ ...base, matched: false }).decision).toBe("rejected");
  });

  it("rejects a score below the threshold", () => {
    expect(decideMatch({ ...base, score: 0.81 }).decision).toBe("rejected");
  });

  it("accepts a score exactly at the threshold", () => {
    expect(decideMatch({ ...base, score: 0.82, runnerUpScore: 0.2 }).decision).toBe("matched");
  });

  it("refuses a 1:N result whose runner-up is too close", () => {
    // Two people at 0.86 and 0.855 is not a match, it is a coin toss, and at a
    // payment terminal a coin toss debits the wrong person's account.
    const out = decideMatch({ ...base, score: 0.86, runnerUpScore: 0.855 });
    expect(out.decision).toBe("ambiguous");
  });

  it("accepts when the runner-up is exactly one margin behind", () => {
    const out = decideMatch({ ...base, score: 0.9, runnerUpScore: 0.85, margin: 0.05 });
    expect(out.decision).toBe("matched");
  });

  it("does not apply the ambiguity guard to a 1:1 check", () => {
    // A 1:1 comparison has no field to be ambiguous within: the customer
    // already said who they are.
    const out = decideMatch({
      ...base,
      mode: "1:1",
      score: 0.86,
      runnerUpScore: 0.855,
    });
    expect(out.decision).toBe("matched");
  });

  it("rejects a non-finite score rather than treating it as passing", () => {
    expect(decideMatch({ ...base, score: Number.NaN }).decision).toBe("rejected");
  });

  it("ignores a non-finite runner-up instead of failing open or closed on it", () => {
    const out = decideMatch({ ...base, score: 0.95, runnerUpScore: Number.NaN });
    expect(out.decision).toBe("matched");
  });
});

describe("capture results", () => {
  it("covers every code the SDK can return, not just the friendly ones", () => {
    // The previous table had seven entries and everything else fell through to
    // "please try again", which told an agent nothing.
    for (const code of [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 23, 24, 25]) {
      expect(describeCaptureResult(code), `code ${code}`).toBeDefined();
    }
    expect(describeCaptureResult(0x4000)).toBeDefined();
    expect(describeCaptureResult(0x8000)).toBeDefined();
    expect(describeCaptureResult(0x8888)).toBeDefined();
  });

  it("looks up by enum name as well as by code", () => {
    expect(describeCaptureResult("PALM_IS_MOVING")?.code).toBe(25);
    expect(describeCaptureResult(25)?.enum).toBe("PALM_IS_MOVING");
  });

  it("has no duplicate codes", () => {
    const codes = CAPTURE_RESULTS.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("flags liveness and reliability failures as security-relevant", () => {
    // These are anti-spoof signals. Swallowing them as generic retry noise is
    // how a presentation attack looks like a bad scan.
    for (const code of [4, 14, 15, 16, 17, 18]) {
      expect(isSecurityRelevantResult(code), `code ${code}`).toBe(true);
    }
    expect(isSecurityRelevantResult(25)).toBe(false);
    expect(isSecurityRelevantResult(0)).toBe(false);
  });

  it("marks the register-only codes, which carry the stricter thresholds", () => {
    for (const code of [3, 10, 11, 12, 13, 17, 18]) {
      expect(describeCaptureResult(code)?.register, `code ${code}`).toBe(true);
    }
    expect(describeCaptureResult(2)?.register).toBe(false);
  });

  it("returns nothing for an unknown code rather than inventing a message", () => {
    expect(describeCaptureResult(9999)).toBeUndefined();
    expect(describeCaptureResult(null)).toBeUndefined();
    expect(describeCaptureResult(undefined)).toBeUndefined();
  });
});

describe("LED modes", () => {
  it("uses the vendor's own values from the light effect table", () => {
    expect(PALM_LED_MODES.standby).toBe(3);
    expect(PALM_LED_MODES.working).toBe(15);
    expect(PALM_LED_MODES.recognising).toBe(20);
    expect(PALM_LED_MODES.deviceError).toBe(1);
    expect(PALM_LED_MODES.failed).toBe(4);
    expect(PALM_LED_MODES.tooClose).toBe(10);
    expect(PALM_LED_MODES.inProgress).toBe(11);
    expect(PALM_LED_MODES.success).toBe(5);
    expect(PALM_LED_MODES.off).toBe(0);
  });
});
