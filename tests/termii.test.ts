import { describe, expect, it } from "vitest";
import { classifyTermii, termiiBaseUrl } from "../supabase/functions/_shared/notify";
import { termiiCard } from "../supabase/functions/platform-status/termii";

/**
 * Termii health on Settings › Integrations. The card used to say "Set up"
 * whenever a key existed; now it reports what Termii itself says: the key
 * is accepted, there is credit, and the sender ID is approved.
 */

const ok = { hasKey: true, balanceStatus: 200, balance: { balance: 5000, currency: "NGN" }, sender: "MiliPay" };
const senders = (status: string, id = "MiliPay") => ({ content: [{ sender_id: id, status }] });

describe("termiiBaseUrl", () => {
  it("uses the account's own host, tidied, and falls back to the shared one", () => {
    expect(termiiBaseUrl("https://v3.api.termii.com/")).toBe("https://v3.api.termii.com");
    expect(termiiBaseUrl("v3.api.termii.com")).toBe("https://v3.api.termii.com");
    expect(termiiBaseUrl("")).toBe("https://api.ng.termii.com");
  });
});

describe("classifyTermii", () => {
  it("is ok only with a key, credit and an approved sender ID", () => {
    expect(classifyTermii({ ...ok, senders: senders("active") })).toMatchObject({ state: "ok", balance: 5000, senderStatus: "active" });
  });

  it("says what is wrong, in the order it needs fixing", () => {
    expect(classifyTermii({ ...ok, hasKey: false, senders: null }).state).toBe("off");
    expect(classifyTermii({ ...ok, balanceStatus: 0, balance: null, senders: null }).state).toBe("unreachable");
    expect(classifyTermii({ ...ok, balanceStatus: 404, balance: null, senders: null }).state).toBe("unreachable");
    expect(classifyTermii({ ...ok, balanceStatus: 401, balance: { message: "Invalid API key" } as never, senders: null }).state).toBe("key_rejected");
    expect(classifyTermii({ ...ok, senders: { content: [] } }).state).toBe("sender_missing");
    expect(classifyTermii({ ...ok, senders: senders("pending") }).state).toBe("sender_pending");
    expect(classifyTermii({ ...ok, senders: senders("blocked") }).state).toBe("sender_blocked");
    expect(classifyTermii({ ...ok, balance: { balance: 0, currency: "NGN" }, senders: senders("active") }).state).toBe("no_balance");
  });

  it("matches the sender ID whatever its case", () => {
    expect(classifyTermii({ ...ok, senders: senders("active", "MILIPAY") }).state).toBe("ok");
  });
});

describe("termiiCard", () => {
  it("shows the balance and the next thing to fix", () => {
    expect(termiiCard({ state: "ok", balance: 12500, currency: "NGN", sender: "MiliPay", senderStatus: "active" })).toMatchObject({
      status: "Operational",
      tone: "ok",
      metric: 'Sender "MiliPay" approved · ₦12,500 balance',
    });
    expect(termiiCard({ state: "sender_pending", balance: 100, currency: "NGN", sender: "MiliPay", senderStatus: "pending" }).status).toBe("Sender ID pending");
    expect(termiiCard({ state: "key_rejected", balance: null, currency: null, sender: "MiliPay", senderStatus: null }).metric).toMatch(/refused TERMII_API_KEY/);
    expect(termiiCard({ state: "off", balance: null, currency: null, sender: "MiliPay", senderStatus: null }).mode).toBe("OFF");
  });
});
