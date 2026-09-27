/**
 * Which data plans are "Popular" — the redesign's gold badge and Hot tab.
 *
 * Zero imports, so the test suite runs exactly this.
 *
 * Popular means what customers actually bought, not what anyone thinks they
 * should buy: the plans delivered most often on that network recently. VTPass
 * publishes no popularity of its own, and a hand-kept "hot" list would be an
 * opinion wearing a badge. Until there are real purchases, nothing is marked —
 * the app hides the Hot tab rather than showing an empty or invented one.
 */
export const POPULAR_WINDOW_DAYS = 30;
export const POPULAR_LIMIT = 6;
/** One purchase is an anecdote. */
export const POPULAR_MIN_COUNT = 2;

export function mostPopular(
  codes: (string | null | undefined)[],
  opts: { limit?: number; minCount?: number } = {},
): string[] {
  const limit = opts.limit ?? POPULAR_LIMIT;
  const minCount = opts.minCount ?? POPULAR_MIN_COUNT;

  const counts = new Map<string, number>();
  for (const raw of codes) {
    const code = String(raw ?? '').trim();
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, n]) => n >= minCount)
    // Most bought first; ties broken by code so the answer is stable.
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([code]) => code);
}
