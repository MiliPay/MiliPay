import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  credentialMessage,
  generateTempPassword,
  termiiMsisdn,
} from "../supabase/functions/_shared/notify";
import { verifyIdentity } from "../supabase/functions/_shared/identity";

/**
 * These modules are written for Deno and read Deno.env inside their functions.
 * Nothing touches it at module scope, so importing works under Node; the
 * identity tests stub it to pick a verification mode.
 */
declare global {
  // eslint-disable-next-line no-var
  var Deno: { env: { get(key: string): string | undefined } } | undefined;
}

describe("termiiMsisdn", () => {
  it("normalises every Nigerian form to a bare MSISDN", () => {
    expect(termiiMsisdn("08012345678")).toBe("2348012345678");
    expect(termiiMsisdn("+2348012345678")).toBe("2348012345678");
    expect(termiiMsisdn("2348012345678")).toBe("2348012345678");
    expect(termiiMsisdn("0801 234 5678")).toBe("2348012345678");
    expect(termiiMsisdn("+234 801-234-5678")).toBe("2348012345678");
  });

  it("is idempotent", () => {
    const once = termiiMsisdn("08012345678");
    expect(termiiMsisdn(once)).toBe(once);
  });
});

describe("generateTempPassword", () => {
  it("avoids characters that are misread off a phone screen", () => {
    // Someone reads this from a WhatsApp message and types it in, so 0/O and
    // 1/l/I must not appear.
    for (let i = 0; i < 200; i++) {
      expect(generateTempPassword()).not.toMatch(/[0OIl1]/);
    }
  });

  it("includes a symbol and a digit, for password policies", () => {
    for (let i = 0; i < 50; i++) {
      const password = generateTempPassword();
      expect(password).toMatch(/#/);
      expect(password).toMatch(/\d/);
      expect(password.length).toBeGreaterThanOrEqual(12);
    }
  });

  it("does not repeat", () => {
    // Math.random() was the previous implementation. Collisions here would
    // mean two customers sharing a password.
    const seen = new Set<string>();
    for (let i = 0; i < 1_000; i++) seen.add(generateTempPassword());
    expect(seen.size).toBe(1_000);
  });
});

describe("credentialMessage", () => {
  it("carries the password and warns against sharing it", () => {
    const message = credentialMessage("Adeola Okafor", "AbcDef23#4");
    expect(message).toContain("Adeola Okafor");
    expect(message).toContain("AbcDef23#4");
    expect(message).toMatch(/never ask you for this password/i);
  });
});

describe("verifyIdentity in simulated mode", () => {
  beforeEach(() => {
    globalThis.Deno = { env: { get: (k: string) => (k === "IDENTITY_VERIFICATION_MODE" ? "simulated" : undefined) } };
  });

  afterEach(() => {
    globalThis.Deno = undefined;
  });

  it("verifies an ordinary NIN and marks the result simulated", async () => {
    const result = await verifyIdentity("nin", "12345678901", "Adeola Okafor");
    expect(result.status).toBe("verified");
    expect(result.mode).toBe("simulated");
    expect(result.provider).toBe("simulation");
  });

  it("fails deterministically for an ID ending 0000", async () => {
    const result = await verifyIdentity("nin", "12345670000", "Adeola Okafor");
    expect(result.status).toBe("failed");
    expect(result.failureReason).toMatch(/0000/);
  });

  it("reports the provider unavailable for an ID ending 9999", async () => {
    // Distinct from a failure: unavailable must not block an enrolment, it
    // just leaves the customer unverified for an administrator to review.
    const result = await verifyIdentity("nin", "12345679999", "Adeola Okafor");
    expect(result.status).toBe("unavailable");
  });

  it("rejects an ID that is not 11 digits without calling any provider", async () => {
    for (const bad of ["123", "123456789012", "abcdefghijk"]) {
      const result = await verifyIdentity("nin", bad, "Adeola Okafor");
      expect(result.status).toBe("failed");
      expect(result.failureReason).toMatch(/11 digits/);
    }
  });

  it("never claims a real match: a simulated pass only echoes the claimed name", async () => {
    // The mode field is what tells you this was not a real check. If this ever
    // starts returning a name the caller did not supply, something is
    // pretending to be a government lookup.
    const result = await verifyIdentity("nin", "12345678901", "Claimed Name");
    expect(result.matchedName).toBe("Claimed Name");
    expect(result.mode).toBe("simulated");
  });
});
