import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  hmacSha256Hex,
  verifyWebhookSignature,
  webhookEventId,
} from "../supabase/functions/_shared/webhook-auth";

/**
 * The webhook is what authorises spending. If this module is wrong, anyone who
 * finds the URL can POST "payment successful" and mint free airtime.
 */

const SECRET = "whsec_live_9f3a2b7c1d4e5f60";
const BODY = JSON.stringify({ event: "directpay.payment_successful", data: { id: "PAY_1", amount: 100000 } });

describe("constantTimeEqual", () => {
  it("matches identical strings and rejects different ones", () => {
    expect(constantTimeEqual("abc123", "abc123")).toBe(true);
    expect(constantTimeEqual("abc123", "abc124")).toBe(false);
  });

  it("rejects on a length difference without comparing content", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "a")).toBe(false);
  });

  it("does not short-circuit on the first differing byte", () => {
    // Same length, differing at position 0 vs the last position. Both must
    // walk the whole string — we assert behaviour, not timing, but a
    // short-circuiting implementation would still return the right answer, so
    // this guards the contract rather than proving it.
    expect(constantTimeEqual("Xbcdef", "abcdef")).toBe(false);
    expect(constantTimeEqual("abcdeX", "abcdef")).toBe(false);
  });

  it("rejects non-strings rather than coercing them", () => {
    expect(constantTimeEqual(undefined as unknown as string, "a")).toBe(false);
    expect(constantTimeEqual(null as unknown as string, null as unknown as string)).toBe(false);
  });
});

describe("verifyWebhookSignature", () => {
  it("REFUSES EVERYTHING when no secret is configured", async () => {
    // The single most important case. A missing secret is a deployment
    // mistake; treating it as "no verification needed" turns that mistake
    // into an open door to free airtime.
    const valid = await hmacSha256Hex("anything", BODY);
    for (const secret of [undefined, null, "", "   "]) {
      const result = await verifyWebhookSignature({
        rawBody: BODY,
        signatureHeader: valid,
        secret,
      });
      expect(result.valid, String(secret)).toBe(false);
      expect(result.method).toBe("none");
      expect(result.reason).toMatch(/no webhook secret/i);
    }
  });

  it("accepts a correct HMAC", async () => {
    const signature = await hmacSha256Hex(SECRET, BODY);
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      signatureHeader: signature,
      secret: SECRET,
    });
    expect(result.valid).toBe(true);
    expect(result.method).toBe("hmac-sha256");
  });

  it("accepts a scheme-prefixed HMAC", async () => {
    const signature = await hmacSha256Hex(SECRET, BODY);
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      signatureHeader: `sha256=${signature}`,
      secret: SECRET,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects an HMAC computed over a DIFFERENT body", async () => {
    // The replay-with-edits attack: take a real ₦100 webhook, change the
    // amount to ₦100,000, keep the signature.
    const signature = await hmacSha256Hex(SECRET, BODY);
    const tampered = BODY.replace("100000", "10000000");
    const result = await verifyWebhookSignature({
      rawBody: tampered,
      signatureHeader: signature,
      secret: SECRET,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects an HMAC computed with the wrong secret", async () => {
    const signature = await hmacSha256Hex("whsec_attacker_guess", BODY);
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      signatureHeader: signature,
      secret: SECRET,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/did not match/i);
  });

  it("accepts the older shared-secret header when no HMAC is offered", async () => {
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      secretHeader: SECRET,
      secret: SECRET,
    });
    expect(result.valid).toBe(true);
    expect(result.method).toBe("shared-secret");
  });

  it("rejects a wrong shared secret", async () => {
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      secretHeader: "not-the-secret-at-all",
      secret: SECRET,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a request carrying no signature and no secret header", async () => {
    // An unsigned POST is exactly the attack, so this is the default outcome.
    const result = await verifyWebhookSignature({ rawBody: BODY, secret: SECRET });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/no signature or secret/i);
  });

  it("prefers HMAC over the shared secret when both are present", async () => {
    // A shared secret in a header is replayable by anyone who has seen one
    // request, so a valid HMAC must not be bypassable by also sending a
    // secret header, and a bad HMAC must not be rescued by one.
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      signatureHeader: await hmacSha256Hex("wrong", BODY),
      secretHeader: SECRET,
      secret: SECRET,
    });
    expect(result.valid).toBe(false);
    expect(result.method).toBe("hmac-sha256");
  });

  it("never echoes the secret in the reason", async () => {
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      secretHeader: "wrong",
      secret: SECRET,
    });
    expect(result.reason ?? "").not.toContain(SECRET);
  });
});

describe("webhookEventId", () => {
  it("prefers an explicit id so a replay is recognisable", async () => {
    expect(await webhookEventId({ id: "evt_123" }, "{}")).toBe("evt_123");
    expect(await webhookEventId({ event_id: "evt_456" }, "{}")).toBe("evt_456");
  });

  it("NEVER uses a reference or a resource id as the event id", async () => {
    // Both identify the TRANSACTION, so they are identical on every event
    // about it. Using one as the idempotency key means the second event —
    // the one that says the money arrived — is rejected as a duplicate, the
    // transaction never leaves `initiated`, and the provider is told 200.
    // DirectPay sends processing-then-successful, so this was reachable on
    // the first real purchase.
    const processing = JSON.stringify({
      event: "direct_debit.payment_processing",
      data: { id: "PAY_1", reference: "MP-BIL-XYZ", status: "processing" },
    });
    const successful = JSON.stringify({
      event: "direct_debit.payment_successful",
      data: { id: "PAY_1", reference: "MP-BIL-XYZ", status: "successful" },
    });

    const a = await webhookEventId(JSON.parse(processing), processing);
    const b = await webhookEventId(JSON.parse(successful), successful);

    expect(a).not.toBe("MP-BIL-XYZ");
    expect(a).not.toBe("PAY_1");
    // Two different events about one transaction must get two different ids.
    expect(a).not.toBe(b);
  });

  it("uses the envelope's own per-event id when the provider sends one", async () => {
    const body = JSON.stringify({
      event_id: "evt_abc",
      event: "direct_debit.payment_successful",
      data: { id: "PAY_1", reference: "MP-BIL-XYZ" },
    });
    expect(await webhookEventId(JSON.parse(body), body)).toBe("evt_abc");
  });

  it("falls back to a body hash so an id-less provider is still not replayable", async () => {
    const id = await webhookEventId({ foo: "bar" }, BODY);
    expect(id).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("gives the same fallback id for the same body, and a different one otherwise", async () => {
    const a = await webhookEventId({}, BODY);
    const b = await webhookEventId({}, BODY);
    const c = await webhookEventId({}, BODY.replace("100000", "200000"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("ignores a blank id rather than returning an empty string", async () => {
    const id = await webhookEventId({ id: "   " }, BODY);
    expect(id).toMatch(/^sha256:/);
  });
});
