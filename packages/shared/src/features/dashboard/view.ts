import { formatNairaCompact } from "@milipay/shared/lib/utils/format";

/**
 * The admin Dashboard's data (public.admin_dashboard) and the rules for
 * showing it. Pure, so the arithmetic is tested without a browser.
 */

export type DashboardRange = "today" | "7d" | "30d";

export interface DashboardData {
  range: DashboardRange;
  generatedAt: string;
  attention: {
    stuck: number;
    oldestStuckMinutes: number | null;
    refunds: number;
    refundsFailed: number;
    held: number;
    offline: number;
    tickets: number;
    ticketsCritical: number;
    ticketsHigh: number;
    pending: number;
    signups: number;
    mismatch: number;
  };
  kpis: {
    volume: number;
    volumePrev: number;
    revenue: number;
    revenuePrev: number;
    count: number;
    countPrev: number;
    successRate: number | null;
    successRatePrev: number | null;
  };
  sparks: { volume: number[]; revenue: number[]; count: number[]; successRate: (number | null)[] };
  hourly: { hour: number; delivered: number; failed: number }[];
  nowHour: number;
  health: { service: string; provider: string; via: string; total: number; failed: number; ok: number }[];
  ledger: {
    id: string;
    reference: string;
    amount: number;
    status: string;
    createdAt: string;
    merchantName: string | null;
    provider: string | null;
    serviceType: string | null;
    palm: boolean;
    customer: string;
  }[];
  /** Started, phone verified, NIN entered, selfie matched, address added, account created. */
  funnel: number[];
  /** Active customers by KYC tier. */
  tiers: Record<string, number>;
  recentAudit: {
    id: number;
    occurredAt: string;
    actorName: string;
    actorRole: string;
    category: string;
    action: string;
    target: string | null;
    result: string;
  }[];
}

export const RANGES: { id: DashboardRange; label: string; versus: string }[] = [
  { id: "today", label: "Today", versus: "vs yesterday" },
  { id: "7d", label: "7 days", versus: "vs previous 7 days" },
  { id: "30d", label: "30 days", versus: "vs previous 30 days" },
];

/** "Good morning" by the hour in Lagos. */
export function greeting(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(now),
  );
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export interface Delta {
  text: string;
  up: boolean;
}

/** Change against the previous period: a percentage, or points for a rate. */
export function delta(cur: number | null, prev: number | null, kind: "percent" | "points" = "percent"): Delta | null {
  if (cur === null || prev === null) return null;
  if (kind === "points") {
    const d = Math.round((cur - prev) * 10) / 10;
    return { text: `${Math.abs(d).toFixed(1)} pts`, up: d >= 0 };
  }
  if (prev === 0) return cur === 0 ? { text: "0%", up: true } : null;
  const d = ((cur - prev) / prev) * 100;
  return { text: `${Math.abs(d).toFixed(1)}%`, up: d >= 0 };
}

/** Bar heights for a sparkline, 20–100% of the tallest. */
export function sparkHeights(values: (number | null)[]): number[] {
  const nums = values.map((v) => (v === null ? 0 : v));
  const max = Math.max(0, ...nums);
  return nums.map((v) => (max > 0 ? 20 + (v / max) * 80 : 20));
}

export const FUNNEL_LABELS = ["Started", "Phone verified", "NIN entered", "Selfie matched", "Address added", "Account created"];

export interface FunnelRow {
  label: string;
  count: number;
  /** Share of everyone who started, 0–100. */
  share: number;
  /** Lost since the step before, 0–100; null for the first step. */
  drop: number | null;
  /** 15% or more lost at one step is worth a look. */
  bad: boolean;
}

export function funnelRows(counts: number[]): FunnelRow[] {
  const first = counts[0] ?? 0;
  return FUNNEL_LABELS.map((label, i) => {
    const count = counts[i] ?? 0;
    const prev = i ? counts[i - 1] ?? 0 : 0;
    const drop = i === 0 ? null : prev > 0 ? 100 - Math.round((count / prev) * 100) : 0;
    return { label, count, share: first > 0 ? (count / first) * 100 : 0, drop, bad: drop !== null && drop >= 15 };
  });
}

/** Of everyone who started, the share who finished. */
export function conversion(counts: number[]): number | null {
  const first = counts[0] ?? 0;
  return first > 0 ? Math.round(((counts[5] ?? 0) / first) * 100) : null;
}

export const SERVICE: Record<string, { label: string; color: string }> = {
  palm: { label: "Palm payment", color: "#00C896" },
  airtime: { label: "Airtime", color: "#10B981" },
  data: { label: "Data", color: "#3B82F6" },
  power: { label: "Electricity", color: "#F97316" },
  cable: { label: "Cable TV", color: "#A855F7" },
  other: { label: "Other", color: "#64748B" },
};

const PROVIDER_NAMES: Record<string, string> = {
  mtn: "MTN",
  airtel: "Airtel",
  glo: "Glo",
  "9mobile": "9mobile",
  etisalat: "9mobile",
  dstv: "DSTV",
  gotv: "GOtv",
  startimes: "StarTimes",
  showmax: "Showmax",
  vtpass: "VTPass",
};

/** "ikedc" → "IKEDC", "mtn" → "MTN", "gotv" → "GOtv". */
export function providerName(raw: string | null | undefined): string {
  const p = (raw || "").trim();
  if (!p) return "";
  const key = p.toLowerCase().replace(/-(data|airtime)$/, "");
  if (PROVIDER_NAMES[key]) return PROVIDER_NAMES[key];
  if (/^[a-z]{2,6}$/.test(key) && /(edc|dc)$/.test(key)) return key.toUpperCase();
  return p.charAt(0).toUpperCase() + p.slice(1);
}

export interface HealthRow {
  service: string;
  label: string;
  provider: string;
  color: string;
  total: number;
  failed: number;
  /** Delivered of those that reached the provider, 0–100. */
  rate: number;
  low: boolean;
}

export function healthRows(rows: DashboardData["health"]): HealthRow[] {
  return rows.map((r) => {
    const s = SERVICE[r.service] ?? SERVICE.other;
    const provider =
      r.service === "palm" ? "MiliPay terminals" : [providerName(r.provider), providerName(r.via)].filter(Boolean).join(" · ");
    const decided = r.ok + r.failed;
    const rate = decided > 0 ? (r.ok / decided) * 100 : 100;
    return { service: r.service, label: s.label, provider, color: s.color, total: r.total, failed: r.failed, rate, low: rate < 95 };
  });
}

/** Ledger and chart titles: "Adaeze Okafor → Lekki Fresh Mart", "MTN Airtime · Adaeze Okafor". */
export function ledgerTitle(t: DashboardData["ledger"][number]): string {
  if (t.palm) return [t.customer || "Customer", t.merchantName || "merchant"].join(" → ");
  const s = SERVICE[t.serviceType || "other"] ?? SERVICE.other;
  const what = `${providerName(t.provider)} ${s.label}`.trim();
  return t.customer ? `${what} · ${t.customer}` : what;
}

/** Four round y-axis ticks for the hourly chart, top first. */
export function yTicks(max: number): { top: number; labels: string[] } {
  if (max <= 0) return { top: 1, labels: ["", "", "", "₦0"] };
  const raw = max / 3;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const top = step * 3;
  return { top, labels: [3, 2, 1, 0].map((k) => (k === 0 ? "₦0" : formatNairaCompact(step * k).replace(".0", ""))) };
}

export interface TierRow {
  label: string;
  count: number;
  share: number;
  color: string;
}

export function tierRows(tiers: Record<string, number>): TierRow[] {
  const t1 = tiers["1"] ?? 0;
  const t2 = tiers["2"] ?? 0;
  const t3 = tiers["3"] ?? 0;
  const total = t1 + t2 + t3 || 1;
  const rows: TierRow[] = [
    { label: "Tier 2 · palm enrolled", count: t2, share: (t2 / total) * 100, color: "#00C896" },
    { label: "Tier 1 · self sign-up, no palm", count: t1, share: (t1 / total) * 100, color: "#E0A526" },
  ];
  if (t3) rows.push({ label: "Tier 3 · BVN and address", count: t3, share: (t3 / total) * 100, color: "#3B82F6" });
  return rows;
}
