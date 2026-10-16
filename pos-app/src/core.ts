/**
 * Design tokens, money formatting and copy for the POS terminal
 * (merchant-portal/design_handoff_pos, "Design tokens (same as the customer app)").
 */

export type ThemeName = "light" | "dark";

export const THEMES = {
  light: {
    bg: "#F2F5F4", card: "#FFFFFF", line: "#E3EAE7", chip: "#EDF2F0", key: "#FFFFFF",
    text: "#0B1A15", muted: "#56695F", faint: "#8A9C95",
    brand: "#00C896", brandText: "#0A6650", brandSoft: "rgba(0,200,150,.12)",
    warn: "#A86400", warnSoft: "rgba(255,180,84,.2)", fail: "#D2383E", failSoft: "rgba(255,92,92,.12)",
    onBrand: "#04120E", shadow: true,
  },
  dark: {
    bg: "#080C0A", card: "#0F1714", line: "#1E2D27", chip: "#16211D", key: "#16211D",
    text: "#E8FFF6", muted: "#86B3A4", faint: "#5E8577",
    brand: "#00C896", brandText: "#33E0B5", brandSoft: "rgba(0,200,150,.16)",
    warn: "#FFB454", warnSoft: "rgba(255,180,84,.14)", fail: "#FF5C5C", failSoft: "rgba(255,92,92,.14)",
    onBrand: "#04120E", shadow: false,
  },
} as const;

export type Theme = (typeof THEMES)[ThemeName];

export const HERO = ["#0a7a5a", "#065f46", "#022c22"] as const;
export const QR_BLUE = "#3B82F6";
export const CARD_PURPLE = "#A855F7";

/** Whole naira, e.g. ₦12,450. */
export const N = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");
/** Naira and kobo, e.g. ₦12,450.00. */
export const K = (n: number) => "₦" + n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Above Tier 2's per-payment cap the design warns before charging. */
export const TIER2_CAP = 150000;

export type PayMethod = "palm" | "qr" | "card";
export const METHOD_LABEL: Record<PayMethod, string> = { palm: "Palm", qr: "QR code", card: "Card" };

export type Outcome = "not-recognised" | "paused" | "limit" | "unavailable" | "pin-locked";

/** The decline screens, word for word (OUTCOMES in the prototype). */
export const OUTCOMES: Record<Outcome, { tag: string; title: string; sub: string; warn: boolean; retry: boolean }> = {
  paused: {
    tag: "Declined", title: "Palm payments are paused", warn: false, retry: false,
    sub: "This customer paused palm payments in the MiliPay app. They can turn them back on, or pay another way.",
  },
  "not-recognised": {
    tag: "Not recognised", title: "We couldn't match this palm", warn: true, retry: true,
    sub: "Ask them to hold their open hand flat, 5–10 cm above the scanner, and try again. Or add the last 4 digits of their phone.",
  },
  limit: {
    tag: "Declined", title: "Over their daily limit", warn: false, retry: false,
    sub: "This payment would go past the customer's daily limit. They can pay a smaller amount or use another method.",
  },
  unavailable: {
    tag: "Not completed", title: "Payment couldn't be checked", warn: false, retry: true,
    sub: "MiliPay could not reach the bank. No money was moved. Try again in a moment.",
  },
  "pin-locked": {
    tag: "Declined", title: "Their PIN is locked", warn: false, retry: false,
    sub: "Too many wrong PINs on the customer's account. It unlocks in 15 minutes, or they can pay another way.",
  },
};

export function timeOf(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

/** "+234 803 …" only accepts the 10 digits after the country code. */
export function localPhone(input: string): string | null {
  const d = input.replace(/\D/g, "").replace(/^0/, "");
  return /^[789][01]\d{8}$/.test(d) ? d : null;
}
