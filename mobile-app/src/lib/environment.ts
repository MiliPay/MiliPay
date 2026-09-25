/**
 * Which environment this BUILD talks to.
 *
 * DEFAULTS TO PRODUCTION. An unset, misspelled or empty value must land on the
 * side with no test affordances, because the failure that matters is a test
 * shortcut reaching a real customer, never the reverse. Saying "sandbox" has
 * to be a deliberate act, exactly as MILIPAY_ENVIRONMENT works on the server.
 *
 * ─── WHY THIS FILE IS SHAPED SO AWKWARDLY ───
 *
 * Every test value below sits INSIDE a function, behind a bare comparison
 * against `process.env.EXPO_PUBLIC_MILIPAY_ENVIRONMENT`, repeated rather than
 * factored into a shared constant. That is deliberate and it is load-bearing.
 *
 * Metro inlines EXPO_PUBLIC_* as a string literal at bundle time, so in a
 * production build that comparison reads `"production" === "sandbox"` and the
 * minifier folds it to false, makes the rest of the function unreachable, and
 * drops the literals entirely. The values are then not in the shipped bundle
 * at all — not merely unreachable at runtime.
 *
 * The obvious version of this file did NOT achieve that. Exporting
 * `const IS_SANDBOX = ...` and a shared `SANDBOX_TEST_VALUES` object put every
 * test number into the production bundle, because the minifier works a module
 * at a time and cannot fold a constant imported from elsewhere. Checked by
 * grepping the built .hbc, which is the only way to know.
 *
 * So: if you tidy this into a shared constant, re-run that grep.
 */

/**
 * True only in a build explicitly declared sandbox.
 *
 * Use it for cheap UI decisions. Do NOT use it to guard a literal you want
 * kept out of the production bundle — for that the literal has to live inside
 * one of the functions below, where the comparison can be folded locally.
 */
export const IS_SANDBOX = process.env.EXPO_PUBLIC_MILIPAY_ENVIRONMENT === 'sandbox';

export interface SandboxCase {
  label: string;
  value: string;
}

/**
 * The VTPass sandbox's phone-number test cases.
 *
 * Not arbitrary: in the VTPass sandbox ANY number outside its fixed list
 * produces a failed transaction, so testing with a real number does not
 * "mostly work" — it fails, for reasons that look like our bug.
 *
 * https://www.vtpass.com/documentation/mtn-airtime-vtu-api/
 */
export function sandboxPhoneCases(): SandboxCase[] {
  if (process.env.EXPO_PUBLIC_MILIPAY_ENVIRONMENT !== 'sandbox') return [];
  return [
    { label: 'Success', value: '08011111111' },
    { label: 'Pending', value: '201000000000' },
    { label: 'Timeout', value: '300000000000' },
    { label: 'No reply', value: '400000000000' },
  ];
}

/** Prepaid and postpaid meters the sandbox will verify. */
export function sandboxMeterCases(): SandboxCase[] {
  if (process.env.EXPO_PUBLIC_MILIPAY_ENVIRONMENT !== 'sandbox') return [];
  return [
    { label: 'Prepaid', value: '1111111111111' },
    { label: 'Postpaid', value: '1010101010101' },
  ];
}

/** The one smartcard the sandbox recognises. */
export function sandboxSmartcardCases(): SandboxCase[] {
  if (process.env.EXPO_PUBLIC_MILIPAY_ENVIRONMENT !== 'sandbox') return [];
  return [{ label: 'Valid card', value: '1212121212' }];
}
