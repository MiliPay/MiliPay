import { describe, expect, it } from "vitest";
import { isReturned, progressIndex, rowStatus, statusHeadline } from "../mobile-app/src/lib/statusView";
import { CUSTOMER_STATUS_COPY } from "../supabase/functions/_shared/vtu-state";

/**
 * How the redesign draws a purchase's state — list chips, receipt headlines,
 * progress steps. The one rule: nothing but a delivered purchase looks like a
 * success, and nothing is ticked that did not happen.
 */

const EVERY_STATUS = Object.keys(CUSTOMER_STATUS_COPY);

describe("statusHeadline", () => {
  it("only a delivered purchase gets the green tick", () => {
    for (const s of EVERY_STATUS) {
      const h = statusHeadline(s);
      expect(h.tone === "ok", s).toBe(s === "delivered");
      if (s === "delivered") expect(h).toEqual({ title: "Delivered", icon: "check", tone: "ok" });
    }
  });

  it("uses the design's words for every ending", () => {
    expect(statusHeadline("payment_failed")).toMatchObject({ title: "Payment failed", icon: "x", tone: "fail" });
    expect(statusHeadline("fulfilment_failed")).toMatchObject({ title: "Failed", icon: "alert" });
    expect(statusHeadline("refund_failed")).toMatchObject({ title: "Refund delayed", icon: "alert" });
    expect(statusHeadline("quarantined")).toMatchObject({ title: "On hold", icon: "alert" });
    expect(statusHeadline("refunded")).toMatchObject({ title: "Refunded", icon: "refresh", tone: "muted" });
    expect(statusHeadline("fulfilment_pending")).toMatchObject({ title: "In progress", icon: "clock", tone: "warn" });
  });

  it("never guesses success for a status it does not know", () => {
    for (const s of ["", "weird", null, undefined]) {
      expect(statusHeadline(s as string).tone, String(s)).not.toBe("ok");
    }
  });
});

describe("rowStatus", () => {
  it("draws no chip on a delivered row and a chip on everything else", () => {
    expect(rowStatus("delivered")).toBeNull();
    for (const s of EVERY_STATUS.filter((x) => x !== "delivered")) {
      expect(rowStatus(s), s).not.toBeNull();
    }
    expect(rowStatus("refund_pending")).toEqual({ label: "Refunding", tone: "warn" });
    expect(rowStatus("initiated")).toEqual({ label: "In progress", tone: "warn" });
  });

  it("strikes through only money that never left or came back", () => {
    expect(isReturned("payment_failed")).toBe(true);
    expect(isReturned("refunded")).toBe(true);
    expect(isReturned("refund_pending")).toBe(false);
    expect(isReturned("delivered")).toBe(false);
  });
});

describe("progressIndex", () => {
  it("follows the four steps", () => {
    expect(progressIndex("initiated")).toBe(0);
    expect(progressIndex("paid")).toBe(1);
    expect(progressIndex("fulfilling")).toBe(2);
    expect(progressIndex("fulfilment_pending")).toBe(2);
    expect(progressIndex("delivered")).toBe(3);
  });

  it("never ticks a step that did not happen", () => {
    // A payment that failed never got past the bank.
    expect(progressIndex("payment_failed")).toBe(0);
    // A delivery that failed or was refunded never reached "Delivered".
    for (const s of ["fulfilment_failed", "refund_pending", "refunded", "refund_failed", "quarantined"]) {
      expect(progressIndex(s), s).toBeLessThan(3);
    }
  });
});
