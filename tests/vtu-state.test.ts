import { describe, expect, it } from "vitest";
import {
  CUSTOMER_STATUS_COPY,
  MAX_REFUND_ATTEMPTS,
  TERMINAL_STATES,
  UNSETTLED_STATES,
  assertTransition,
  canTransition,
  holdsCustomerFunds,
  isStuck,
  isTerminal,
  needsRequery,
  paymentMatchesPricedAmount,
  refundBackoffSeconds,
  refundExhausted,
  canRetryPurchase,
  statusForIndeterminateFulfilment,
  statusForMonoEvent,
  statusForProviderStatus,
  type TransactionStatus,
} from "../supabase/functions/_shared/vtu-state";

describe("the invariant: money before value", () => {
  it("cannot reach fulfilling without passing through paid", () => {
    // This is the whole point of the state machine. Airtime cannot be
    // un-sold, so we never dispense it on an unconfirmed payment.
    expect(canTransition("initiated", "fulfilling")).toBe(false);
    expect(canTransition("paid", "fulfilling")).toBe(true);
  });

  it("has no path from initiated to delivered", () => {
    expect(canTransition("initiated", "delivered")).toBe(false);
  });

  it("only lets fulfilment_failed exit through a refund", () => {
    // We took the money and could not deliver. There is no honest exit that
    // is not giving it back.
    expect(canTransition("fulfilment_failed", "refund_pending")).toBe(true);
    expect(canTransition("fulfilment_failed", "delivered")).toBe(false);
    expect(canTransition("fulfilment_failed", "refunded")).toBe(false);
  });
});

describe("transitions", () => {
  it("refuses to move a terminal state, and says why", () => {
    for (const status of TERMINAL_STATES) {
      if (status === "refund_failed" || status === "quarantined") continue;
      const result = assertTransition(status, "fulfilling");
      expect(result.ok, status).toBe(false);
      expect(result.reason).toContain("terminal");
    }
  });

  it("lets a human re-queue a failed refund", () => {
    expect(canTransition("refund_failed", "refund_pending")).toBe(true);
  });

  it("lets a human resolve a quarantine either way", () => {
    expect(canTransition("quarantined", "refund_pending")).toBe(true);
    expect(canTransition("quarantined", "delivered")).toBe(true);
  });

  it("allows a requery that learns nothing to stay put", () => {
    expect(canTransition("fulfilment_pending", "fulfilment_pending")).toBe(true);
    expect(canTransition("refund_pending", "refund_pending")).toBe(true);
  });

  it("does not allow a self-transition where it would hide a bug", () => {
    expect(canTransition("paid", "paid")).toBe(false);
    expect(canTransition("fulfilling", "fulfilling")).toBe(false);
  });

  it("marks exactly the states that mean money is with us, undelivered", () => {
    expect(holdsCustomerFunds("initiated")).toBe(false); // nothing taken yet
    expect(holdsCustomerFunds("payment_failed")).toBe(false);
    expect(holdsCustomerFunds("delivered")).toBe(false); // delivered, so earned
    expect(holdsCustomerFunds("refunded")).toBe(false);
    for (const s of ["paid", "fulfilling", "fulfilment_pending", "fulfilment_failed", "refund_pending", "refund_failed", "quarantined"] as TransactionStatus[]) {
      expect(holdsCustomerFunds(s), s).toBe(true);
    }
  });

  it("agrees with itself about which states are unsettled", () => {
    for (const s of UNSETTLED_STATES) expect(isTerminal(s), s).toBe(false);
  });
});

describe("BigiSub provider statuses", () => {
  it("reads the three states BigiSub actually reports", () => {
    // Their OpenAPI spec enumerates exactly: successful | failed | processing.
    expect(statusForProviderStatus("successful")).toBe("delivered");
    expect(statusForProviderStatus("failed")).toBe("fulfilment_failed");
    expect(statusForProviderStatus("processing")).toBe("fulfilment_pending");
  });

  it("does not treat 'processing' as success", () => {
    // Treating an in-flight transaction as delivered is how a customer is
    // charged for airtime the operator later failed to send.
    expect(statusForProviderStatus("processing")).not.toBe("delivered");
    expect(statusForProviderStatus("pending")).not.toBe("delivered");
  });

  it("treats an unknown or empty status as PENDING, not failed", () => {
    // Not knowing is not failure. Declaring failure triggers a refund, and
    // refunding something that was in fact delivered costs us the value.
    for (const junk of ["", "  ", "weird", "ok", undefined, null]) {
      expect(statusForProviderStatus(junk as string), String(junk)).toBe("fulfilment_pending");
    }
  });

  it("is case and whitespace insensitive", () => {
    expect(statusForProviderStatus("  SUCCESSFUL ")).toBe("delivered");
    expect(statusForProviderStatus("Failed")).toBe("fulfilment_failed");
  });

  it("does not treat an indeterminate call as a failure", () => {
    // A timeout or 5xx means BigiSub may well have fulfilled and we did not
    // hear. Calling it failure refunds the customer AND leaves them credited.
    expect(statusForIndeterminateFulfilment()).toBe("fulfilment_pending");
  });
});

describe("purchase retries", () => {
  it("never permits one", () => {
    // BigiSub accepts no idempotency key and no client reference on any
    // purchase endpoint, and has no transaction-list endpoint. A second call
    // is a second purchase: charged once, credited twice, at our cost.
    expect(canRetryPurchase()).toBe(false);
  });
});

describe("Mono webhook events", () => {
  it("advances to paid only on an explicit success", () => {
    expect(statusForMonoEvent("directpay.payment_successful")).toBe("paid");
    expect(statusForMonoEvent("direct_debit.payment_succeeded")).toBe("paid");
  });

  it("marks explicit failures", () => {
    expect(statusForMonoEvent("directpay.payment_failed")).toBe("payment_failed");
    expect(statusForMonoEvent("mandate.cancelled")).toBe("payment_failed");
  });

  it("ignores an event it does not understand rather than guessing", () => {
    // A webhook we cannot interpret must never advance a transaction.
    expect(statusForMonoEvent("account.updated")).toBeNull();
    expect(statusForMonoEvent("")).toBeNull();
    expect(statusForMonoEvent(undefined)).toBeNull();
  });
});

describe("paymentMatchesPricedAmount", () => {
  it("accepts an exact match", () => {
    expect(paymentMatchesPricedAmount(1000, 1000)).toBe(true);
    expect(paymentMatchesPricedAmount(1025.5, 1025.5)).toBe(true);
  });

  it("survives float representation noise", () => {
    expect(paymentMatchesPricedAmount(0.1 + 0.2, 0.3)).toBe(true);
  });

  it("rejects any real difference, however small", () => {
    // A mismatch is not rounding — it means the request we think we made is
    // not the one that was paid.
    expect(paymentMatchesPricedAmount(1000, 999.99)).toBe(false);
    expect(paymentMatchesPricedAmount(1000, 1000.01)).toBe(false);
  });

  it("rejects a missing or non-numeric paid amount", () => {
    expect(paymentMatchesPricedAmount(1000, null)).toBe(false);
    expect(paymentMatchesPricedAmount(1000, undefined)).toBe(false);
    expect(paymentMatchesPricedAmount(1000, Number.NaN)).toBe(false);
  });
});

describe("refund scheduling", () => {
  it("retries quickly at first, then backs off", () => {
    expect(refundBackoffSeconds(0)).toBeLessThanOrEqual(60);
    expect(refundBackoffSeconds(3)).toBeGreaterThan(refundBackoffSeconds(1));
    expect(refundBackoffSeconds(7)).toBeGreaterThan(refundBackoffSeconds(5));
  });

  it("never returns a zero or negative delay, however odd the input", () => {
    for (const n of [-5, 0, 3, 99, 1e6]) {
      expect(refundBackoffSeconds(n), String(n)).toBeGreaterThan(0);
    }
  });

  it("gives up to a human rather than retrying forever", () => {
    expect(refundExhausted(MAX_REFUND_ATTEMPTS - 1)).toBe(false);
    expect(refundExhausted(MAX_REFUND_ATTEMPTS)).toBe(true);
  });
});

describe("reconciliation timing", () => {
  it("does not chase a transaction that is seconds old", () => {
    expect(needsRequery("fulfilment_pending", 5)).toBe(false);
    expect(needsRequery("fulfilment_pending", 300)).toBe(true);
  });

  it("only requeries the state that needs it", () => {
    expect(needsRequery("paid", 999_999)).toBe(false);
    expect(needsRequery("delivered", 999_999)).toBe(false);
  });

  it("flags anything non-terminal that has been sitting for an hour", () => {
    expect(isStuck("paid", 60)).toBe(false);
    expect(isStuck("paid", 7_200)).toBe(true);
    // A delivered transaction is not stuck, it is finished.
    expect(isStuck("delivered", 7_200)).toBe(false);
  });
});

describe("what the customer is told", () => {
  it("has copy for every state", () => {
    const states = Object.keys(CUSTOMER_STATUS_COPY) as TransactionStatus[];
    expect(states.length).toBeGreaterThanOrEqual(11);
    for (const s of states) expect(CUSTOMER_STATUS_COPY[s].length).toBeGreaterThan(0);
  });

  it("never claims delivery for a state that has not delivered", () => {
    // Telling someone they have airtime they have not got is the commonest
    // complaint in this business.
    for (const [status, copy] of Object.entries(CUSTOMER_STATUS_COPY)) {
      if (status === "delivered") continue;
      expect(copy.toLowerCase(), status).not.toContain("delivered");
    }
  });

  it("tells a customer whose bank declined that nothing was charged", () => {
    expect(CUSTOMER_STATUS_COPY.payment_failed).toMatch(/nothing was charged/i);
  });
});
