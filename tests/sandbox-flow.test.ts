import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  holdsCustomerFunds,
  isTerminal,
  statusForIndeterminateFulfilment,
  statusForMonoEvent,
  statusForVtpassResponse,
  type TransactionStatus,
} from "../supabase/functions/_shared/vtu-state";

/**
 * The sandbox MVP, walked end to end.
 *
 * Every scenario here is one the VTPass sandbox can actually be made to
 * produce on demand, keyed by the test number you send it:
 *
 *   08011111111   success        201000000000  pending
 *   300000000000  timeout        400000000000  no response
 *   500000000000  unexpected     anything else failed
 *
 * So these are not hypothetical branches — they are the exact runs you get
 * from Mono sandbox → MiliPay → VTPass sandbox, written as executable
 * documentation of what the state machine must do with each.
 *
 * The rule every one of them protects: irreversible value is never dispensed
 * before the money is confirmed, and "we do not know" is never recorded as
 * "it failed".
 */

/** Walk a path, asserting every hop is legal, and return where it ends. */
function walk(from: TransactionStatus, path: TransactionStatus[]): TransactionStatus {
  let current = from;
  for (const next of path) {
    const result = assertTransition(current, next);
    expect(result.ok, `${current} -> ${next}: ${result.reason ?? ""}`).toBe(true);
    current = next;
  }
  return current;
}

describe("the invariant, restated for the sandbox", () => {
  it("cannot fulfil until Mono has actually confirmed the debit", () => {
    // VTPass is only ever asked for value from `paid`. Not from `initiated`,
    // which is a debit that has been requested and not confirmed — in
    // DirectPay that is a customer who has not even opened their bank yet.
    expect(canTransition("initiated", "fulfilling")).toBe(false);
    expect(canTransition("paid", "fulfilling")).toBe(true);
  });

  it("has no path from initiated straight to delivered", () => {
    expect(canTransition("initiated", "delivered")).toBe(false);
  });
});

describe("scenario: success — VTPass test number 08011111111", () => {
  it("runs initiated -> paid -> fulfilling -> delivered", () => {
    // DirectPay is what the sandbox MVP runs on, and Mono names its success
    // event `direct_debit.payment_successful` even for a one-time payment.
    expect(statusForMonoEvent("direct_debit.payment_successful")).toBe("paid");
    expect(statusForMonoEvent("events.mandates.debit.successful")).toBe("paid");

    // VTPass answers 000 with status delivered. Both are needed: 000 alone is
    // only "processed".
    const outcome = statusForVtpassResponse("000", "delivered");
    expect(outcome).toBe("delivered");

    const end = walk("initiated", ["paid", "fulfilling", outcome]);
    expect(end).toBe("delivered");
    expect(isTerminal(end)).toBe(true);
    // Delivered means the money was earned, not still owed back.
    expect(holdsCustomerFunds(end)).toBe(false);
  });
});

describe("scenario: pending — VTPass test number 201000000000", () => {
  it("parks in fulfilment_pending rather than guessing, then requery delivers", () => {
    const first = statusForVtpassResponse("000", "pending");
    expect(first).toBe("fulfilment_pending");

    let state = walk("initiated", ["paid", "fulfilling", first]);
    expect(isTerminal(state)).toBe(false);
    // The customer's money is with us and nothing has been delivered.
    expect(holdsCustomerFunds(state)).toBe(true);

    const afterRequery = statusForVtpassResponse("000", "delivered");
    state = walk(state, [afterRequery]);
    expect(state).toBe("delivered");
  });

  it("allows requery to learn nothing and stay put", () => {
    // The sweep runs repeatedly; a requery that is still pending must not be
    // an illegal transition or the sweep would error every two minutes.
    expect(canTransition("fulfilment_pending", "fulfilment_pending")).toBe(true);
  });
});

describe("scenario: failed — any number outside the sandbox list", () => {
  it("refunds rather than keeping money for value never delivered", () => {
    const outcome = statusForVtpassResponse("016", undefined);
    expect(outcome).toBe("fulfilment_failed");

    const end = walk("initiated", ["paid", "fulfilling", outcome, "refund_pending", "refunded"]);
    expect(end).toBe("refunded");
    expect(isTerminal(end)).toBe(true);
    expect(holdsCustomerFunds(end)).toBe(false);
  });

  it("offers no exit from fulfilment_failed except giving the money back", () => {
    expect(canTransition("fulfilment_failed", "delivered")).toBe(false);
    expect(canTransition("fulfilment_failed", "refunded")).toBe(false);
    expect(canTransition("fulfilment_failed", "refund_pending")).toBe(true);
  });
});

describe("scenario: timeout (300000000000) and no response (400000000000)", () => {
  it("treats an unanswered purchase as pending, NEVER as failed", () => {
    // This is the expensive distinction. VTPass may have delivered and we
    // simply did not hear. Calling it failure refunds a customer who was in
    // fact credited, and we lose the value.
    const outcome = statusForIndeterminateFulfilment();
    expect(outcome).toBe("fulfilment_pending");

    const state = walk("initiated", ["paid", "fulfilling", outcome]);
    expect(state).toBe("fulfilment_pending");
    expect(isTerminal(state)).toBe(false);
  });

  it("resolves by requery, in either direction", () => {
    // Recovery is requery — never a second pay(). Both endings are legal from
    // the pending state.
    expect(canTransition("fulfilment_pending", "delivered")).toBe(true);
    expect(canTransition("fulfilment_pending", "fulfilment_failed")).toBe(true);
  });

  it("does not let a replayed request_id read as a failure", () => {
    // Replaying a used request_id returns 014. The FIRST submission may well
    // have delivered, so 014 is pending and requery decides.
    expect(statusForVtpassResponse("014", undefined)).toBe("fulfilment_pending");
  });
});

describe("scenario: unexpected response — VTPass test number 500000000000", () => {
  it("is pending, because an unreadable answer is not a decline", () => {
    // An unparseable body tells us nothing about whether value moved.
    expect(statusForVtpassResponse("", undefined)).toBe("fulfilment_pending");
    expect(statusForVtpassResponse("this-is-not-a-code", "who knows")).toBe("fulfilment_pending");
  });
});

describe("scenario: requery resolves to failure", () => {
  it("goes pending -> failed -> refund_pending -> refunded", () => {
    const resolved = statusForVtpassResponse("016", "failed");
    expect(resolved).toBe("fulfilment_failed");

    const end = walk("fulfilment_pending", [resolved, "refund_pending", "refunded"]);
    expect(end).toBe("refunded");
  });

  it("keeps a failed refund recoverable by a human", () => {
    expect(canTransition("refund_pending", "refund_failed")).toBe(true);
    expect(canTransition("refund_failed", "refund_pending")).toBe(true);
  });
});

describe("scenario: Mono declines the debit", () => {
  it("ends at payment_failed with nothing owed and nothing dispensed", () => {
    expect(statusForMonoEvent("direct_debit.payment_failed")).toBe("payment_failed");
    const outcome = statusForMonoEvent("events.mandates.debit.failed");
    expect(outcome).toBe("payment_failed");

    const end = walk("initiated", [outcome!]);
    expect(isTerminal(end)).toBe(true);
    // Nothing was ever taken, so nothing is held.
    expect(holdsCustomerFunds(end)).toBe(false);
    // And VTPass was never asked.
    expect(canTransition(end, "fulfilling")).toBe(false);
  });
});

describe("scenario: Mono collects only PART of the debit", () => {
  it("quarantines instead of fulfilling on a partial collection", () => {
    // A partial sweep is not payment. Fulfilling here would dispense full
    // value against part of the money.
    const outcome = statusForMonoEvent("events.mandates.debit.partial_debit_successful");
    expect(outcome).toBe("quarantined");

    const end = walk("initiated", [outcome!]);
    expect(end).toBe("quarantined");
    // Money is with us, undelivered, until a human decides.
    expect(holdsCustomerFunds(end)).toBe(true);
  });

  it("lets a human resolve a quarantine either way", () => {
    expect(canTransition("quarantined", "delivered")).toBe(true);
    expect(canTransition("quarantined", "refund_pending")).toBe(true);
  });
});

describe("every status the Mono mapping can return has a home", () => {
  it("maps only to statuses reachable from initiated", () => {
    // mono-webhook applies its target from `initiated`. If statusForMonoEvent
    // ever returns something that is not reachable from there, the webhook
    // silently fails to advance and the transaction sits with the customer's
    // money gone. This caught `quarantined` being returned for a partial debit
    // while the handler only knew about paid and payment_failed.
    const events = [
      "direct_debit.payment_successful",
      "direct_debit.payment_failed",
      "events.mandates.debit.successful",
      "events.mandates.debit.failed",
      "events.mandates.debit.partial_debit_successful",
      "direct_debit.payment_cancelled",
      "direct_debit.payment_abandoned",
    ];

    for (const event of events) {
      const target = statusForMonoEvent(event);
      expect(target, event).not.toBeNull();
      expect(canTransition("initiated", target!), `${event} -> ${target}`).toBe(true);
    }
  });
});

describe("a fulfilment that cannot build a gateway reference", () => {
  it("exits through failure, because quarantine is not reachable from fulfilling", () => {
    // The recovery for "we have no stable request_id" runs while the row is
    // already in `fulfilling`. Quarantining from there is illegal and would
    // strand the transaction; failing is legal and routes to a refund, which
    // is correct because VTPass was never called.
    expect(canTransition("fulfilling", "quarantined")).toBe(false);
    expect(canTransition("fulfilling", "fulfilment_failed")).toBe(true);
    expect(canTransition("fulfilment_failed", "refund_pending")).toBe(true);
  });
});

describe("scenario: the webhook arrives twice", () => {
  it("cannot re-apply a state the transaction has already left", () => {
    // Mono retries by design, and the webhook is idempotent by event_id — but
    // the state machine is the second line of defence. A replayed
    // debit.successful must not move a delivered transaction.
    expect(canTransition("delivered", "paid")).toBe(false);
    expect(canTransition("refunded", "paid")).toBe(false);
    expect(canTransition("paid", "paid")).toBe(false);
  });
});
