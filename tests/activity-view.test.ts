import { describe, expect, it } from "vitest";
import {
  balanceCaption,
  bankLabel,
  dayGroup,
  groupByDay,
  matchesAccount,
  matchesFilter,
  moneyLeft,
  monthSummary,
  notifGroups,
  notifMatches,
  notifTimeLabel,
  notifVisual,
  recipientLabel,
  txService,
  unreadCount,
  whenLabel,
} from "../mobile-app/src/lib/activityView";
import { CUSTOMER_STATUS_COPY } from "../supabase/functions/_shared/vtu-state";

/**
 * The rules behind Home's Recent list, the Activity tab and Notifications.
 * The one that matters most: nothing counts as spent, or looks like a
 * success, unless the money really left and the thing was delivered.
 */

// Local time, so the day boundaries are the phone's own.
const NOW = new Date(2026, 8, 27, 14, 30); // 27 Sep 2026, 2:30 PM
const at = (d: number, h: number, m = 0, month = 8, year = 2026) => new Date(year, month, d, h, m).toISOString();

const tx = (over: Record<string, unknown> = {}) => ({
  status: "delivered",
  amount: 1000,
  created_at: at(27, 9, 12),
  merchant_name: "MTN Airtime",
  service_type: "airtime",
  beneficiary: "08031234567",
  merchant_id: null,
  terminal_id: null,
  account_used: "acct-1",
  ...over,
});

describe("what a transaction was", () => {
  it("reads service_type, and a merchant terminal as palm", () => {
    expect(txService(tx())).toBe("airtime");
    expect(txService(tx({ service_type: "power" }))).toBe("power");
    expect(txService(tx({ service_type: null, merchant_id: "m-1", merchant_name: "Lekki Fresh Mart" }))).toBe("palm");
    expect(txService(tx({ terminal_id: "T-1" }))).toBe("palm");
  });

  it("reads older rows by their names, and does not guess past that", () => {
    const legacy = (name: string) => txService(tx({ service_type: null, merchant_name: name }));
    expect(legacy("AIRTEL Airtime")).toBe("airtime");
    expect(legacy("AIRTEL Data")).toBe("data");
    expect(legacy("MTN 40GB")).toBe("data");
    expect(legacy("DStv Padi Monthly Renewal")).toBe("cable");
    expect(legacy("Ikeja Electric Prepaid Token")).toBe("power");
    expect(legacy("IKEDC Electricity (PREPAID)")).toBe("power");
    expect(legacy("Ebeano Supermarket Lekki")).toBe("other");
  });

  it("names the recipient the way the design does", () => {
    expect(recipientLabel(tx({ beneficiary: "2348031234567" }))).toBe("0803 123 4567");
    expect(recipientLabel(tx({ service_type: "power", beneficiary: "45012398761" }))).toBe("Meter 45012398761");
    expect(recipientLabel(tx({ service_type: "cable", beneficiary: "7023441190" }))).toBe("Smartcard 7023441190");
    expect(recipientLabel(tx({ beneficiary: null }))).toBeNull();
    expect(bankLabel("GTBank", "0123456789")).toBe("GTBank ••6789");
  });
});

describe("filters", () => {
  it("Bills, Palm and Needs attention", () => {
    const bill = tx();
    const palm = tx({ merchant_id: "m-1" });
    const stuck = tx({ status: "fulfilment_pending" });
    const refunded = tx({ status: "refunded" });
    expect([bill, palm].filter((t) => matchesFilter(t, "bills"))).toEqual([bill]);
    expect([bill, palm].filter((t) => matchesFilter(t, "palm"))).toEqual([palm]);
    // Anything wearing a chip needs the customer's eye; a delivered one does not.
    expect([bill, stuck, refunded].filter((t) => matchesFilter(t, "issues"))).toEqual([stuck, refunded]);
    expect([bill, palm, stuck].every((t) => matchesFilter(t, "all"))).toBe(true);
  });

  it("by linked account", () => {
    expect(matchesAccount(tx(), null)).toBe(true);
    expect(matchesAccount(tx(), "acct-1")).toBe(true);
    expect(matchesAccount(tx(), "acct-2")).toBe(false);
  });
});

describe("dates", () => {
  it("groups Today / Yesterday / Earlier and drops empty groups", () => {
    expect(dayGroup(at(27, 0, 1), NOW)).toBe("Today");
    expect(dayGroup(at(26, 23, 59), NOW)).toBe("Yesterday");
    expect(dayGroup(at(25, 12), NOW)).toBe("Earlier");
    const groups = groupByDay([tx({ created_at: at(27, 9) }), tx({ created_at: at(20, 9) })], NOW);
    expect(groups.map((g) => g.title)).toEqual(["Today", "Earlier"]);
  });

  it("writes times the design's way", () => {
    expect(whenLabel(at(27, 9, 12), NOW)).toBe("Today, 9:12 AM");
    expect(whenLabel(at(26, 13, 22), NOW)).toBe("Yesterday, 1:22 PM");
    expect(whenLabel(at(23, 18, 48), NOW)).toBe("Sep 23, 6:48 PM");
    expect(whenLabel(at(23, 0, 5, 11, 2025), NOW)).toBe("Dec 23 2025, 12:05 AM");
    expect(notifTimeLabel(at(27, 7, 41), NOW)).toBe("7:41 AM");
    expect(notifTimeLabel(at(26, 7, 41), NOW)).toBe("Yesterday");
    expect(notifTimeLabel(at(21, 7, 41), NOW)).toBe("Sep 21");
  });
});

describe("the Activity summary counts only money that actually left", () => {
  it("covers every status the server has", () => {
    const counted = Object.keys(CUSTOMER_STATUS_COPY).filter(moneyLeft).sort();
    expect(counted).toEqual(
      ["delivered", "fulfilling", "fulfilment_failed", "fulfilment_pending", "paid", "quarantined", "refund_failed", "refund_pending"].sort(),
    );
    // Still asking the bank, never went through, or given back: not spent.
    for (const s of ["initiated", "payment_failed", "refunded", "", "weird"]) expect(moneyLeft(s), s).toBe(false);
  });

  it("this month, this account, palm on the side", () => {
    const rows = [
      tx({ amount: 1000 }),
      tx({ amount: 12450, merchant_id: "m-1" }),
      tx({ amount: 5800, status: "refunded" }),
      tx({ amount: 1800, status: "payment_failed" }),
      tx({ amount: 700, status: "initiated" }),
      tx({ amount: 999, created_at: at(30, 12, 0, 7) }), // August
      tx({ amount: 250.5, account_used: "acct-2" }),
    ];
    expect(monthSummary(rows, null, NOW)).toEqual({ monthName: "September", spent: 13700.5, palm: 12450 });
    expect(monthSummary(rows, "acct-2", NOW)).toEqual({ monthName: "September", spent: 250.5, palm: 0 });
  });
});

describe("a bank card's balance says how old it is", () => {
  it("calls it available only while it is fresh", () => {
    expect(balanceCaption(new Date(NOW.getTime() - 5 * 60 * 1000).toISOString(), NOW)).toBe("Available balance");
    expect(balanceCaption(at(27, 8, 5), NOW)).toBe("Balance at 8:05 AM today");
    expect(balanceCaption(at(12, 10), NOW)).toBe("Balance on Sep 12");
    expect(balanceCaption(at(12, 10, 0, 0, 2025), NOW)).toBe("Balance on Jan 12 2025");
    expect(balanceCaption(null, NOW)).toBe("Balance when linked");
  });
});

describe("notifications", () => {
  const n = (over: Record<string, unknown> = {}) => ({
    kind: "payment",
    status: "delivered",
    created_at: at(27, 9),
    read_at: null as string | null,
    ...over,
  });

  it("filters by kind", () => {
    expect(notifMatches(n(), "pay")).toBe(true);
    expect(notifMatches(n({ kind: "palm" }), "pay")).toBe(false);
    expect(notifMatches(n({ kind: "palm" }), "palm")).toBe(true);
    expect(notifMatches(n({ kind: "security", status: null }), "security")).toBe(true);
    expect(notifMatches(n({ kind: "security", status: null }), "all")).toBe(true);
  });

  it("only a delivered payment gets the green tick", () => {
    for (const status of Object.keys(CUSTOMER_STATUS_COPY)) {
      const v = notifVisual(n({ status }));
      expect(v.tone === "ok", status).toBe(status === "delivered");
    }
    expect(notifVisual(n({ kind: "palm" }))).toEqual({ icon: "hand", tone: "palm" });
    expect(notifVisual(n({ status: "payment_failed" }))).toEqual({ icon: "x", tone: "fail" });
    expect(notifVisual(n({ status: "refunded" }))).toEqual({ icon: "refresh", tone: "muted" });
    expect(notifVisual(n({ status: "fulfilment_pending" }))).toEqual({ icon: "clock", tone: "warn" });
    expect(notifVisual(n({ kind: "security", status: null }))).toEqual({ icon: "shield", tone: "blue" });
  });

  it("groups Today / Earlier and counts unread", () => {
    const list = [n(), n({ created_at: at(26, 9), read_at: at(26, 10) }), n({ created_at: at(1, 9) })];
    expect(notifGroups(list, NOW).map((g) => [g.title, g.items.length])).toEqual([["Today", 1], ["Earlier", 2]]);
    expect(unreadCount(list)).toBe(2);
  });
});
