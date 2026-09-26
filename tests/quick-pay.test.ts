import { describe, expect, it } from "vitest";
import {
  QUICK_PAY_ALLOWANCES,
  choosePaymentRoute,
  committedUnderMandate,
  isMandateLifecycleEvent,
  isQuickPayAllowance,
  mandateAccountMatches,
  mandateChangeFor,
  mandateWindow,
  missingMandateDetails,
  quickPayState,
  type MandateStatus,
} from "../supabase/functions/_shared/quick-pay";
import { monoAppTag } from "../supabase/functions/_shared/mono-app-tag";

/**
 * Quick pay's rules, run exactly as the Edge Functions run them.
 *
 * These decide when a customer's bank is debited with nothing but a
 * fingerprint, so each one is pinned: which Mono events turn a mandate on,
 * which never can, and when a purchase must fall back to asking the bank.
 */

const ACTIVE = {
  mono_mandate_id: "mmc_66476972650cb58",
  status: "active",
  max_per_debit: null,
  max_total: 50_000,
};

describe("which way a purchase is paid", () => {
  it("quick pay only when switched on AND the account has an active mandate with room", () => {
    expect(choosePaymentRoute({ mandatesEnabled: true, mandate: ACTIVE, committed: 0, amount: 1_000 })).toEqual({
      route: "mandate",
      mandateId: "mmc_66476972650cb58",
    });
  });

  it("falls back to DirectPay — never refuses — in every other case", () => {
    const cases = [
      { mandatesEnabled: false, mandate: ACTIVE, committed: 0, amount: 1_000 },
      { mandatesEnabled: true, mandate: null, committed: 0, amount: 1_000 },
      { mandatesEnabled: true, mandate: { ...ACTIVE, status: "pending" }, committed: 0, amount: 1_000 },
      { mandatesEnabled: true, mandate: { ...ACTIVE, status: "suspended" }, committed: 0, amount: 1_000 },
      { mandatesEnabled: true, mandate: { ...ACTIVE, mono_mandate_id: null }, committed: 0, amount: 1_000 },
    ];
    for (const input of cases) {
      expect(choosePaymentRoute(input).route, JSON.stringify(input)).toBe("directpay");
    }
  });

  it("counts what is already taken or in flight against the allowance", () => {
    // ₦49,500 of ₦50,000 used: a ₦500 purchase fits, a ₦501 one does not.
    expect(choosePaymentRoute({ mandatesEnabled: true, mandate: ACTIVE, committed: 49_500, amount: 500 }).route)
      .toBe("mandate");
    expect(choosePaymentRoute({ mandatesEnabled: true, mandate: ACTIVE, committed: 49_500, amount: 501 }))
      .toEqual({ route: "directpay", reason: "allowance used up" });
  });

  it("respects a per-purchase cap when one is set", () => {
    const capped = { ...ACTIVE, max_per_debit: 5_000 };
    expect(choosePaymentRoute({ mandatesEnabled: true, mandate: capped, committed: 0, amount: 5_001 }).route)
      .toBe("directpay");
  });

  it("never uses a mandate past its end date", () => {
    const ended = { ...ACTIVE, expires_at: "2026-09-01T23:59:59+01:00" };
    expect(
      choosePaymentRoute({
        mandatesEnabled: true, mandate: ended, committed: 0, amount: 1_000, now: new Date("2026-09-26T10:00:00Z"),
      }),
    ).toEqual({ route: "directpay", reason: "mandate has ended" });
  });
});

describe("what counts as taken under a mandate", () => {
  it("everything except a payment that never happened — refunds included", () => {
    expect(
      committedUnderMandate([
        { status: "delivered", amount: 1_000 },
        { status: "initiated", amount: "200" }, // in flight: counts
        { status: "refunded", amount: 500 }, // the debit happened
        { status: "payment_failed", amount: 9_999 }, // it did not
      ]),
    ).toBe(1_700);
  });
});

describe("a mandate's life, from Mono's events", () => {
  const ALL: MandateStatus[] = ["pending", "active", "suspended", "revoked", "expired", "rejected"];

  it("ONLY events.mandates.ready turns quick pay on, and only from pending", () => {
    // Mono's documented ready payload carries ready_to_debit: true.
    expect(mandateChangeFor("pending", "events.mandates.ready", { ready_to_debit: true })).toEqual({
      to: "active",
      stamp: "ready_at",
    });
    for (const event of [
      "events.mandates.created",
      "events.mandates.approved",
      "events.mandates.rejected",
      "events.mandate.action.cancel",
      "events.mandates.expired",
      "events.mandates.something_new",
    ]) {
      for (const from of ALL) {
        expect(mandateChangeFor(from, event)?.to, `${event} from ${from}`).not.toBe("active");
      }
    }
  });

  it("approved is recorded but not acted on — the bank has not activated it yet", () => {
    // Mono's approved payload: approved true, ready_to_debit false.
    expect(mandateChangeFor("pending", "events.mandates.approved", { ready_to_debit: false })).toEqual({
      to: "pending",
      stamp: "authorised_at",
    });
  });

  it("a 'ready' that says it is not ready to debit is ignored", () => {
    expect(mandateChangeFor("pending", "events.mandates.ready", { ready_to_debit: false })).toBeNull();
  });

  it("can never bring a switched-off, rejected or ended mandate back", () => {
    for (const dead of ["revoked", "expired", "rejected"] as MandateStatus[]) {
      for (const event of [
        "events.mandates.ready",
        "events.mandates.approved",
        "events.mandate.action.reinstate",
        "events.mandate.action.cancel",
        "events.mandates.expired",
      ]) {
        expect(mandateChangeFor(dead, event, { ready_to_debit: true }), `${event} on ${dead}`).toBeNull();
      }
    }
  });

  it("a late or replayed ready does not re-activate an active one (no-op)", () => {
    expect(mandateChangeFor("active", "events.mandates.ready", { ready_to_debit: true })).toBeNull();
  });

  it("cancel switches off from any live state; pause and reinstate move between active and suspended", () => {
    for (const live of ["pending", "active", "suspended"] as MandateStatus[]) {
      expect(mandateChangeFor(live, "events.mandate.action.cancel")).toEqual({ to: "revoked", stamp: "revoked_at" });
    }
    expect(mandateChangeFor("active", "events.mandate.action.pause")).toEqual({ to: "suspended" });
    expect(mandateChangeFor("suspended", "events.mandate.action.reinstate")).toEqual({ to: "active" });
    expect(mandateChangeFor("pending", "events.mandate.action.reinstate")).toBeNull();
  });

  it("tells mandate events apart from money moving under one", () => {
    expect(isMandateLifecycleEvent("events.mandates.ready")).toBe(true);
    expect(isMandateLifecycleEvent("events.mandates.rejected")).toBe(true);
    expect(isMandateLifecycleEvent("events.mandate.action.cancel")).toBe(true);
    expect(isMandateLifecycleEvent("events.mandates.debit.successful")).toBe(false);
    expect(isMandateLifecycleEvent("events.mandates.debit.failed")).toBe(false);
    expect(isMandateLifecycleEvent("events.mandates.debit_attempt.successful")).toBe(false);
    expect(isMandateLifecycleEvent("direct_debit.payment_successful")).toBe(false);
  });
});

describe("the account a mandate lands on", () => {
  it("must be the one the customer chose, when Mono tells us", () => {
    expect(mandateAccountMatches("0100013078", "0100013078")).toBe(true);
    expect(mandateAccountMatches("0100013078", "0100013079")).toBe(false);
    // Nothing to compare is not a mismatch.
    expect(mandateAccountMatches("0100013078", undefined)).toBe(true);
  });
});

describe("what the customer sees", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

  it("on beats everything", () => {
    expect(
      quickPayState(
        [
          { status: "rejected", created_at: hoursAgo(1) },
          { status: "active", created_at: hoursAgo(100) },
        ],
        now,
      ).state,
    ).toBe("on");
  });

  it("a recent setup is setting up; an abandoned one is failed, so a retry is offered", () => {
    expect(quickPayState([{ status: "pending", created_at: hoursAgo(2) }], now).state).toBe("setting_up");
    expect(quickPayState([{ status: "pending", created_at: hoursAgo(80) }], now).state).toBe("failed");
  });

  it("rejected is failed; switched off or ended is simply off", () => {
    expect(quickPayState([{ status: "rejected", created_at: hoursAgo(1) }], now).state).toBe("failed");
    expect(quickPayState([{ status: "revoked", created_at: hoursAgo(1) }], now).state).toBe("off");
    expect(quickPayState([{ status: "expired", created_at: hoursAgo(1) }], now).state).toBe("off");
    expect(quickPayState([], now).state).toBe("off");
  });
});

describe("setting up", () => {
  it("offers fixed allowances only", () => {
    expect(QUICK_PAY_ALLOWANCES).toEqual([20_000, 50_000, 100_000]);
    expect(isQuickPayAllowance(50_000)).toBe(true);
    expect(isQuickPayAllowance(50_001)).toBe(false);
    expect(isQuickPayAllowance("50000")).toBe(false);
  });

  it("dates the mandate in Lagos, for a year", () => {
    // 23:30 UTC on the 25th is 00:30 on the 26th in Lagos.
    expect(mandateWindow(new Date("2026-09-25T23:30:00Z"))).toEqual({
      startDate: "2026-09-26",
      endDate: "2027-09-26",
    });
  });

  it("names every detail Mono needs that we lack — never the values", () => {
    expect(
      missingMandateDetails({
        first_name: "Ada", last_name: "Obi", email: "", phone: "08031234567", address: null, bvn: "1234",
      }),
    ).toEqual(["email address", "home address", "BVN"]);
    expect(
      missingMandateDetails({
        first_name: "Ada", last_name: "Obi", email: "a@b.co", phone: "08031234567", address: "Lagos",
        bvn: "22222222222", // secret-scan: allow — fake fixture, not a credential
      }),
    ).toEqual([]);
  });
});

describe("the Mono app tag", () => {
  it("is stable per key, differs between keys, and does not contain the key", async () => {
    const a = await monoAppTag("test_sk_connect_fixture"); // secret-scan: allow — fake fixture, not a credential
    const b = await monoAppTag("test_sk_payments_fixture"); // secret-scan: allow — fake fixture, not a credential
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(await monoAppTag("test_sk_connect_fixture")).toBe(a); // secret-scan: allow — fake fixture, not a credential
    expect(a).not.toBe(b);
    expect(await monoAppTag("")).toBeNull();
  });
});
