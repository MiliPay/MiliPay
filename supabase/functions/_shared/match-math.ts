/**
 * The arithmetic that decides whether a palm scan authorises a payment.
 *
 * Deliberately has ZERO imports, for the same reason tier-math.ts does: it is
 * the only way this logic can be run by the Node test suite, and this is code
 * whose failure mode is charging the wrong person's account.
 *
 * Everything about *talking* to the matcher lives in biometrics.ts. Everything
 * about deciding what its answer means lives here.
 */

export type RecognizeMode =
  | "kRegIrVSIr"
  | "kRegIrVSRgb"
  | "kRegRgbVSIr"
  | "kRegRgbVSRgb"
  | "kBiModal";

export type MatchMode = "1:1" | "1:N";

/**
 * Fallback only. The real number comes from the matcher, which reads it from
 * the SDK's GetRecognitionThreshold for the recognition mode in use. This
 * exists so a matcher that reports nothing still gets *a* floor, and it is
 * deliberately high.
 */
export const FALLBACK_THRESHOLD = 0.82;

/**
 * Minimum gap between the best and second-best candidate in a 1:N search. Two
 * people scoring 0.86 and 0.855 is not a match, it is a coin toss, and at a
 * payment terminal a coin toss debits the wrong person's account.
 */
export const DEFAULT_MIN_MARGIN = 0.05;

function finitePositive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The environment may raise the bar the matcher set, never lower it. A
 * misconfigured deploy should not be able to make matching more permissive
 * than the algorithm vendor's own threshold.
 */
export function resolveThreshold(
  matcherThreshold: number | null | undefined,
  envThreshold: number | null | undefined,
): number {
  const base = finitePositive(matcherThreshold) ?? FALLBACK_THRESHOLD;
  const override = finitePositive(envThreshold);
  return override === null ? base : Math.max(base, override);
}

export function resolveMargin(envMargin: number | null | undefined): number {
  return typeof envMargin === "number" && Number.isFinite(envMargin) && envMargin >= 0
    ? envMargin
    : DEFAULT_MIN_MARGIN;
}

export type MatchDecision = "matched" | "rejected" | "ambiguous";

export interface MatchVerdict {
  decision: MatchDecision;
  reason?: string;
}

export function decideMatch(input: {
  matched: boolean;
  score: number;
  runnerUpScore: number | null;
  threshold: number;
  margin: number;
  mode: MatchMode;
}): MatchVerdict {
  if (!input.matched) return { decision: "rejected", reason: "no candidate" };
  if (!Number.isFinite(input.score)) return { decision: "rejected", reason: "no score" };
  if (input.score < input.threshold) return { decision: "rejected", reason: "below threshold" };

  // Ambiguity only means anything when there was a field to be ambiguous
  // within. A 1:1 check has no runner-up by construction: the customer already
  // said who they are.
  if (
    input.mode === "1:N" &&
    input.runnerUpScore !== null &&
    Number.isFinite(input.runnerUpScore) &&
    input.score - input.runnerUpScore < input.margin
  ) {
    return { decision: "ambiguous", reason: "runner-up too close" };
  }

  return { decision: "matched" };
}

/**
 * kBiModal compares infrared AND colour, so a request claiming that mode with
 * only one of them can never match anything. Checked before the network call
 * rather than after.
 */
export function featuresSatisfyMode(
  mode: RecognizeMode,
  irFeatures: string | null | undefined,
  rgbFeatures: string | null | undefined,
): boolean {
  if (!irFeatures && !rgbFeatures) return false;
  if (mode === "kBiModal") return Boolean(irFeatures && rgbFeatures);
  if (mode === "kRegRgbVSRgb") return Boolean(rgbFeatures);
  if (mode === "kRegIrVSIr") return Boolean(irFeatures);
  // The cross modes read one of each.
  return Boolean(irFeatures && rgbFeatures);
}
