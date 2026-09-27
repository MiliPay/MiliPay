import { describe, expect, it } from "vitest";
import {
  MIN_DEBIT,
  arrangePlans,
  canPay,
  detectTelco,
  feeLabel,
  formatPhone,
  normaliseLocalPhone,
  payHint,
  payLabel,
  planCategory,
  planSize,
  plansInTab,
  type PayState,
} from "../mobile-app/src/lib/purchaseForm";
import { mostPopular } from "../supabase/functions/_shared/popularity";

/**
 * The redesigned purchase screen's rules, run exactly as the app runs them.
 * The Pay button is where money starts moving, so what enables it, and what
 * the line above it tells the customer, are pinned here.
 */

const READY: PayState = {
  service: "airtime",
  accounts: "list",
  phone: "08031234567",
  amount: 1000,
  hasPlan: false,
  hasPackage: false,
  verified: false,
  verifying: false,
  settling: false,
  discoMinimum: 0,
  fee: 0,
};

describe("phone numbers", () => {
  it("detects the network from the prefix, as the design's detectTelco does", () => {
    expect(detectTelco("0803")).toBe("mtn");
    expect(detectTelco("08021234567")).toBe("airtel");
    expect(detectTelco("08051234567")).toBe("glo");
    expect(detectTelco("08091234567")).toBe("9mobile");
    expect(detectTelco("+2348031234567")).toBe("mtn");
    expect(detectTelco("080")).toBeNull();
    expect(detectTelco("07001234567")).toBeNull();
  });

  it("reduces +234 and 234 forms to the 11-digit local number", () => {
    expect(normaliseLocalPhone("+234 803 123 4567")).toBe("08031234567");
    expect(normaliseLocalPhone("2348031234567")).toBe("08031234567");
    expect(normaliseLocalPhone("0803-123-4567")).toBe("08031234567");
  });

  it("formats as the design shows it", () => {
    expect(formatPhone("08031234567")).toBe("0803 123 4567");
    expect(formatPhone("0803")).toBe("0803");
  });
});

describe("data plans and the design's tabs", () => {
  // Names in VTPass's own style ("<network> N<price> <size> - <validity>").
  const plans = [
    { variation_code: "mtn-100mb", name: "MTN N100 100MB - 24 hrs", validity: "24 hrs", price: 125 },
    { variation_code: "mtn-1gb-7", name: "MTN N800 1GB - 7 days", validity: "7 days", price: 825 },
    { variation_code: "mtn-1.5gb", name: "MTN N1000 1.5GB - 30 days", validity: "30 days", price: 1025 },
    { variation_code: "mtn-25gb", name: "MTN N11000 25GB - 60 days", validity: "60 days", price: 11025 },
    { variation_code: "mtn-400gb", name: "MTN 400GB Yearly Plan", validity: "", price: 120025 },
    { variation_code: "mtn-odd", name: "MTN Social Bundle", validity: "", price: 225 },
  ];

  it("reads the size and the period", () => {
    expect(planSize("MTN N1000 1.5GB - 30 days")).toBe("1.5GB");
    expect(planSize("GLO 1TB Mega")).toBe("1TB");
    expect(planCategory("24 hrs")).toBe("daily");
    expect(planCategory("2 days")).toBe("daily");
    expect(planCategory("7 days")).toBe("weekly");
    expect(planCategory("30 days")).toBe("monthly");
    expect(planCategory("60 days")).toBe("quarter");
    expect(planCategory("", "MTN 400GB Yearly Plan")).toBe("yearly");
  });

  it("puts a plan whose period cannot be read under Other — never guessed into a tab", () => {
    expect(planCategory("", "MTN Social Bundle")).toBe("other");
  });

  it("shows only tabs that have plans; Hot only when something is actually popular", () => {
    expect(arrangePlans(plans, []).tabs).toEqual(["daily", "weekly", "monthly", "quarter", "yearly", "other"]);
    const withPopular = arrangePlans(plans, ["mtn-1.5gb"]);
    expect(withPopular.tabs[0]).toBe("hot");
    expect(plansInTab(withPopular.views, "hot").map((v) => v.plan.variation_code)).toEqual(["mtn-1.5gb"]);
  });

  it("marks popular from what customers bought: the most delivered, at least twice", () => {
    expect(mostPopular(["a", "b", "a", "c", "a", "b", null, ""])).toEqual(["a", "b"]);
    expect(mostPopular(["only-once"])).toEqual([]);
    expect(mostPopular(Array.from({ length: 20 }, (_, i) => `p${i % 8}`), { limit: 6 })).toHaveLength(6);
  });
});

describe("the Pay button", () => {
  it("is ready for a complete airtime purchase", () => {
    expect(canPay(READY)).toBe(true);
    expect(payHint(READY)).toEqual({ text: "No fee · paid straight from your bank", tone: "muted" });
    expect(payLabel(1000)).toBe("Pay ₦1,000");
    expect(payLabel(0)).toBe("Continue");
  });

  it("says the fee when there is one — never 'no fee' over a charge", () => {
    const withFee = { ...READY, service: "data" as const, hasPlan: true, fee: 25 };
    expect(canPay(withFee)).toBe(true);
    expect(payHint(withFee)?.text).toBe("₦25.00 fee · paid straight from your bank");
    expect(feeLabel(25)).toBe("₦25.00");
    expect(feeLabel(0)).toBe("₦0.00 · Free");
  });

  it("refuses under the bank's ₦200 floor, and says so in red", () => {
    const small = { ...READY, amount: 150 };
    expect(canPay(small)).toBe(false);
    expect(payHint(small)).toEqual({ text: `The smallest amount your bank can pay is ₦${MIN_DEBIT}`, tone: "fail" });
  });

  it("refuses an incomplete number, and a 12-digit one outside sandbox", () => {
    expect(canPay({ ...READY, phone: "0803123" })).toBe(false);
    expect(payHint({ ...READY, phone: "0803123" })?.text).toBe("Enter the full 11-digit number");
    expect(canPay({ ...READY, phone: "201000000000" })).toBe(false);
    expect(canPay({ ...READY, phone: "201000000000", testNumbers: true })).toBe(true);
  });

  it("needs a plan for data and a checked account holder for electricity and cable", () => {
    expect(canPay({ ...READY, service: "data" })).toBe(false);
    expect(payHint({ ...READY, service: "data" })?.text).toBe("Pick a plan to continue");
    expect(canPay({ ...READY, service: "power", amount: 5000 })).toBe(false);
    expect(canPay({ ...READY, service: "power", amount: 5000, verified: true })).toBe(true);
    expect(canPay({ ...READY, service: "cable", verified: true })).toBe(false);
    expect(payHint({ ...READY, service: "cable", verified: true })?.text).toBe("Pick a package to continue");
  });

  it("holds to the disco's own minimum, naming it", () => {
    const s = { ...READY, service: "power" as const, amount: 800, verified: true, discoMinimum: 1000 };
    expect(canPay(s)).toBe(false);
    expect(payHint(s, "IKEDC")).toEqual({ text: "IKEDC needs at least ₦1,000", tone: "fail" });
  });

  it("never enables while a price might still move, or with no account to pay from", () => {
    expect(canPay({ ...READY, settling: true })).toBe(false);
    expect(payHint({ ...READY, settling: true })?.text).toBe("Confirming the price…");
    for (const accounts of ["loading", "error", "none"] as const) {
      expect(canPay({ ...READY, accounts }), accounts).toBe(false);
    }
    // "No bank" only when a load has actually found none.
    expect(payHint({ ...READY, accounts: "loading" })?.text).toMatch(/loading/i);
    expect(payHint({ ...READY, accounts: "none" })?.text).toBe("Link a bank account to pay");
  });
});
