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
  statusForVtpassResponse,
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

describe("an unanswered purchase call (live, VTPass)", () => {
  it("is pending, never failed", () => {
    // A timeout, a no-response or an unreadable body means VTPass may well
    // have delivered and we did not hear. Calling it failure refunds the
    // customer AND leaves them credited. requery() resolves it instead.
    expect(statusForIndeterminateFulfilment()).toBe("fulfilment_pending");
  });
});

describe("purchase retries (live, VTPass)", () => {
  it("never permits one — the recovery is requery", () => {
    // VTPass does dedupe on request_id, so a replay is safe — but it returns
    // code 014 rather than the original result, so it tells us nothing. An
    // uncertain purchase is always resolved by requery(), never a second
    // pay(). (Under BigiSub the reason was worse: no idempotency key at all,
    // so a replay was a genuine second purchase.)
    expect(canRetryPurchase()).toBe(false);
  });
});

describe("Mono webhook events", () => {
  // Names taken from Mono's Direct Debit webhook reference, not invented:
  // https://docs.mono.co/docs/payments/direct-debit/webhook-events

  it("advances to paid on Mono's real success events", () => {
    expect(statusForMonoEvent("events.mandates.debit.successful")).toBe("paid");
    expect(statusForMonoEvent("events.mandates.debit_attempt.successful")).toBe("paid");
  });

  it("marks Mono's real failure events", () => {
    expect(statusForMonoEvent("events.mandates.debit.failed")).toBe("payment_failed");
    // Both of these fell through the old substring heuristic and were ignored:
    // "rejected" contains none of failed/declined/cancelled, and "cancel" is
    // not "cancelled".
    expect(statusForMonoEvent("events.mandates.rejected")).toBe("payment_failed");
    expect(statusForMonoEvent("events.mandate.action.cancel")).toBe("payment_failed");
    expect(statusForMonoEvent("events.mandates.expired")).toBe("payment_failed");
  });

  it("maps every DirectPay ending by name", () => {
    // https://docs.mono.co/docs/payments/onetime/webhook-events
    expect(statusForMonoEvent("direct_debit.payment_successful")).toBe("paid");
    expect(statusForMonoEvent("direct_debit.payment_failed")).toBe("payment_failed");
    expect(statusForMonoEvent("direct_debit.payment_cancelled")).toBe("payment_failed");
    // Matched nothing before, so the transaction sat at initiated.
    expect(statusForMonoEvent("direct_debit.payment_abandoned")).toBe("payment_failed");
    // A connection event carries no payment outcome.
    expect(statusForMonoEvent("mono.events.account_connected")).toBeNull();
  });

  it("does not treat a PARTIAL debit as payment", () => {
    // The old heuristic saw "successful" in the name and returned paid. The
    // amount check downstream would have caught it, but by luck.
    expect(statusForMonoEvent("events.mandates.debit.partial_debit_successful")).toBe(
      "quarantined",
    );
  });

  it("ignores the lifecycle events that carry no state change for us", () => {
    for (const event of [
      "events.mandates.debit.processing",
      "events.mandates.created",
      "events.mandates.approved",
      "events.mandates.ready",
      "events.mandate.action.pause",
      "events.mandate.action.reinstate",
    ]) {
      expect(statusForMonoEvent(event), event).toBeNull();
    }
  });

  it("ignores an event it does not understand rather than guessing", () => {
    // A webhook we cannot interpret must never advance a transaction.
    expect(statusForMonoEvent("account.updated")).toBeNull();
    expect(statusForMonoEvent("")).toBeNull();
    expect(statusForMonoEvent(undefined)).toBeNull();
  });
});

describe("VTPass responses", () => {
  // Codes from https://vtpass.com/documentation/response-codes/

  it("does NOT read code 000 as delivered on its own", () => {
    // 000 is "TRANSACTION PROCESSED" — the request was accepted. The outcome
    // lives in content.transactions.status. Reading 000 as success is how a
    // customer is told they have airtime VTPass later failed to send.
    expect(statusForVtpassResponse("000", "pending")).toBe("fulfilment_pending");
    expect(statusForVtpassResponse("000", "initiated")).toBe("fulfilment_pending");
    expect(statusForVtpassResponse("000", undefined)).toBe("fulfilment_pending");
    expect(statusForVtpassResponse("000", "delivered")).toBe("delivered");
  });

  it("treats the processing codes as pending", () => {
    expect(statusForVtpassResponse("099", undefined)).toBe("fulfilment_pending");
    expect(statusForVtpassResponse("089", "delivered")).toBe("fulfilment_pending");
    expect(statusForVtpassResponse("001", undefined)).toBe("fulfilment_pending");
  });

  it("reads the status on 001 (TRANSACTION QUERY), which reports the current state", () => {
    // Forcing 001 to pending would leave a requery that says "delivered"
    // waiting for a person to resolve by hand.
    expect(statusForVtpassResponse("001", "delivered")).toBe("delivered");
    expect(statusForVtpassResponse("001", "failed")).toBe("fulfilment_failed");
    expect(statusForVtpassResponse("001", "pending")).toBe("fulfilment_pending");
  });

  it("does not refund on 015 or 085 — 'not found' and 'bad id' are not 'failed'", () => {
    // Even when a status is attached: neither code vouches for it.
    for (const code of ["015", "085"]) {
      expect(statusForVtpassResponse(code, undefined), code).toBe("fulfilment_pending");
      expect(statusForVtpassResponse(code, "failed"), code).toBe("fulfilment_pending");
    }
  });

  it("treats a duplicate request_id as pending, never failed", () => {
    // 014 means this id was already submitted — so the FIRST submission may
    // well have delivered. Calling it failed would refund a credited customer.
    expect(statusForVtpassResponse("014", undefined)).toBe("fulfilment_pending");
    expect(statusForVtpassResponse("019", undefined)).toBe("fulfilment_pending");
  });

  it("treats an unreachable biller as pending rather than failed", () => {
    expect(statusForVtpassResponse("030", undefined)).toBe("fulfilment_pending");
    expect(statusForVtpassResponse("083", undefined)).toBe("fulfilment_pending");
  });

  it("fails on the codes that are definite declines", () => {
    for (const code of ["016", "040", "091", "010", "013", "017", "018", "087"]) {
      expect(statusForVtpassResponse(code, undefined), code).toBe("fulfilment_failed");
    }
  });

  it("lets the status override a resolved code", () => {
    expect(statusForVtpassResponse("044", "delivered")).toBe("delivered");
    expect(statusForVtpassResponse("000", "failed")).toBe("fulfilment_failed");
    expect(statusForVtpassResponse("000", "reversed")).toBe("fulfilment_failed");
  });

  it("calls an unrecognised code pending, because guessing costs money", () => {
    for (const code of ["", "zzz", "12345", undefined, null]) {
      expect(statusForVtpassResponse(code as string, undefined), String(code)).toBe(
        "fulfilment_pending",
      );
    }
  });

  it("calls an accepted request with an unknown or empty status pending, not failed", () => {
    // Not knowing is not failure. Declaring failure triggers a refund, and
    // refunding something that was in fact delivered costs us the value.
    for (const status of ["", "  ", "weird", "ok", undefined, null]) {
      expect(statusForVtpassResponse("000", status as string), String(status)).toBe(
        "fulfilment_pending",
      );
    }
  });

  it("does not treat an in-flight status as delivered", () => {
    for (const status of ["initiated", "pending", "processing"]) {
      expect(statusForVtpassResponse("000", status), status).toBe("fulfilment_pending");
    }
  });

  it("reads the code and the status regardless of case and whitespace", () => {
    expect(statusForVtpassResponse(" 000 ", "  DELIVERED ")).toBe("delivered");
    expect(statusForVtpassResponse("000", "Failed")).toBe("fulfilment_failed");
    expect(statusForVtpassResponse(" 016", undefined)).toBe("fulfilment_failed");
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

  it("tells a customer whose payment failed that nothing was charged — without blaming the bank", () => {
    expect(CUSTOMER_STATUS_COPY.payment_failed).toMatch(/nothing was charged/i);
    // payment_failed also covers abandoning or cancelling, and Mono refusing
    // to start the payment. None of those is the bank.
    expect(CUSTOMER_STATUS_COPY.payment_failed).not.toMatch(/bank (declined|rejected)/i);
  });
});
