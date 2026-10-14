/**
 * The marketing website's forms (design handoff, MiliPay Website): the
 * waitlist, a merchant's terminal application and an agent application.
 * Pure, with no imports, so the website, the `website` Edge Function and the
 * test suite all run exactly this.
 */

export const FORM_STATES = [
  "Lagos", "FCT (Abuja)", "Rivers", "Kano", "Oyo", "Ogun", "Enugu", "Kaduna", "Delta", "Edo", "Anambra", "Other state",
] as const;

export const BUSINESS_TYPES = ["Supermarket", "Restaurant or café", "Pharmacy", "Fuel station", "Fashion and retail", "Other"] as const;
export const TILLS = ["1", "2 to 5", "6 to 20", "More than 20"] as const;
export const BANKS = [
  "Access Bank", "Ecobank", "FCMB", "Fidelity Bank", "First Bank", "GTBank", "Kuda", "Moniepoint", "OPay", "PalmPay",
  "Stanbic IBTC", "Sterling Bank", "UBA", "Union Bank", "Wema Bank", "Zenith Bank",
] as const;
export const WORKPLACES = ["My own shop", "A kiosk", "An office", "I don't have a place yet"] as const;

/** Every state, for "Find an agent". */
export const ALL_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta",
  "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT (Abuja)", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi",
  "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto",
  "Taraba", "Yobe", "Zamfara",
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LOCAL_RE = /^0[789][01]\d{8}$/;

export const PHONE_ERROR = "Enter an 11-digit Nigerian number, e.g. 0803 123 4567.";
export const WAITLIST_ERROR = "Enter the 10 digits after +234.";

/** A form's phone field: 0803 123 4567 (or +234 …) → 08031234567, or null. */
export function formPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let d = value.replace(/\D/g, "");
  if (d.startsWith("234") && d.length === 13) d = "0" + d.slice(3);
  return LOCAL_RE.test(d) ? d : null;
}

/** The waitlist field sits after a fixed +234: "803 123 4567", with or without the 0. */
export function waitlistPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d = value.replace(/\D/g, "").replace(/^0/, "");
  return /^[789][01]\d{8}$/.test(d) ? "0" + d : null;
}

/** "+234 803 123 4567", for the waitlist's thank-you line. */
export function shownPhone(local: string): string {
  const d = local.replace(/^0/, "");
  return `+234 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

type Kind = "text" | "select" | "tel" | "email";
export interface FieldRule {
  key: string;
  kind: Kind;
  options?: readonly string[];
  max?: number;
}

export const MERCHANT_FIELDS: FieldRule[] = [
  { key: "biz", kind: "text", max: 120 },
  { key: "rc", kind: "text", max: 20 },
  { key: "type", kind: "select", options: BUSINESS_TYPES },
  { key: "contact", kind: "text", max: 80 },
  { key: "phone", kind: "tel" },
  { key: "email", kind: "email", max: 120 },
  { key: "state", kind: "select", options: FORM_STATES },
  { key: "tills", kind: "select", options: TILLS },
  { key: "bank", kind: "select", options: BANKS },
];

export const AGENT_FIELDS: FieldRule[] = [
  { key: "name", kind: "text", max: 80 },
  { key: "phone", kind: "tel" },
  { key: "email", kind: "email", max: 120 },
  { key: "state", kind: "select", options: FORM_STATES },
  { key: "area", kind: "text", max: 60 },
  { key: "place", kind: "select", options: WORKPLACES },
];

export type FormResult =
  | { ok: true; values: Record<string, string> }
  | { ok: false; errors: Record<string, string> };

/** The design's inline checks, in its words. Values come back trimmed, phones as 0803…. */
export function checkForm(rules: FieldRule[], input: Record<string, unknown>): FormResult {
  const errors: Record<string, string> = {};
  const values: Record<string, string> = {};
  for (const r of rules) {
    const raw = typeof input[r.key] === "string" ? (input[r.key] as string).replace(/\s+/g, " ").trim() : "";
    if (!raw) {
      errors[r.key] = r.kind === "select" ? "Choose one." : "Fill this in.";
    } else if (r.kind === "tel") {
      const p = formPhone(raw);
      if (p) values[r.key] = p;
      else errors[r.key] = PHONE_ERROR;
    } else if (r.kind === "email" && !EMAIL_RE.test(raw)) {
      errors[r.key] = "Enter a valid email address.";
    } else if (r.kind === "select" && r.options && !r.options.includes(raw)) {
      errors[r.key] = "Choose one.";
    } else {
      values[r.key] = r.max ? raw.slice(0, r.max) : raw;
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}
