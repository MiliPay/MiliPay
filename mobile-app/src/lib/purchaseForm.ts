/**
 * The purchase screen's rules, apart from its pixels.
 *
 * No imports, so the test suite runs exactly this. Everything here is taken
 * from the redesign's logic script (design_handoff_milipay_redesign,
 * `detectTelco`, `canPay`, the pay hint, the plan tabs) and joined to what the
 * server actually enforces — the ₦200 bank minimum, a disco's own minimum,
 * the real fee.
 */

export type ServiceKey = 'airtime' | 'data' | 'power' | 'cable';

export const SERVICE_TITLES: Record<ServiceKey, string> = {
  airtime: 'Buy airtime',
  data: 'Buy data',
  power: 'Pay electricity',
  cable: 'Pay for TV',
};

export const SERVICE_LABELS: Record<ServiceKey, string> = {
  airtime: 'Airtime',
  data: 'Data',
  power: 'Electricity',
  cable: 'Cable TV',
};

/** Mono will not debit a bank account for less (enforced again server-side). */
export const MIN_DEBIT = 200;

export const AIRTIME_PRESETS = [200, 500, 1000, 2000, 5000, 10000];
export const POWER_PRESETS = [1000, 2000, 5000, 10000, 20000, 50000];

// ─────────────────────────────────────────────────────────────
// Phone numbers and networks
// ─────────────────────────────────────────────────────────────

export type TelcoId = 'mtn' | 'airtel' | 'glo' | '9mobile';

const PREFIXES: Record<TelcoId, string[]> = {
  mtn: ['0803', '0806', '0703', '0706', '0813', '0816', '0810', '0814', '0903', '0906', '0913', '0916'],
  airtel: ['0802', '0808', '0708', '0812', '0701', '0902', '0901', '0907', '0912'],
  glo: ['0805', '0807', '0705', '0815', '0811', '0905', '0915'],
  '9mobile': ['0809', '0817', '0818', '0909', '0908'],
};

/** The network a Nigerian number belongs to, from its prefix, or null. */
export function detectTelco(phone: string): TelcoId | null {
  const clean = phone.replace(/[^0-9]/g, '');
  if (clean.length < 4) return null;
  const prefix = clean.startsWith('234') ? '0' + clean.slice(3, 6) : clean.slice(0, 4);
  for (const [id, list] of Object.entries(PREFIXES) as [TelcoId, string[]][]) {
    if (list.includes(prefix)) return id;
  }
  return null;
}

/**
 * A phone number as the customer typed or picked it, reduced to the 11-digit
 * local form: +234 803… and 234803… both become 0803…
 */
export function normaliseLocalPhone(input: string): string {
  let digits = input.replace(/[^0-9]/g, '');
  if (digits.startsWith('234') && digits.length > 11) digits = '0' + digits.slice(3);
  return digits.slice(0, 11);
}

/** "08031234567" → "0803 123 4567" (the prototype's fmtPhone). */
export function formatPhone(value: string): string {
  const d = value.replace(/[^0-9]/g, '');
  const parts = [d.slice(0, 4), d.slice(4, 7), d.slice(7)].filter(Boolean);
  return parts.join(' ');
}

// ─────────────────────────────────────────────────────────────
// Data plans: size, validity, and the design's tabs
// ─────────────────────────────────────────────────────────────

export type PlanCategory = 'hot' | 'daily' | 'weekly' | 'monthly' | 'quarter' | 'yearly' | 'other';

export const PLAN_CATEGORY_LABELS: Record<PlanCategory, string> = {
  hot: 'Hot',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarter: '2–3 Months',
  yearly: 'Yearly',
  other: 'Other',
};

/** The plan size in a VTPass name: "MTN N1000 1.5GB - 30 days" → "1.5GB". */
export function planSize(name: string): string | null {
  const m = /(\d+(?:\.\d+)?)\s*(TB|GB|MB)\b/i.exec(name ?? '');
  return m ? `${m[1]}${m[2].toUpperCase()}` : null;
}

/** How many days a plan lasts, from its validity text or, failing that, its name. */
export function planDays(validity: string | null | undefined, name?: string | null): number | null {
  for (const text of [validity ?? '', name ?? '']) {
    const m = /(\d+)\s*(hours?|hrs?|days?|weeks?|months?|years?)/i.exec(text);
    if (m) {
      const n = Number(m[1]);
      const unit = m[2].toLowerCase();
      if (unit.startsWith('h')) return n / 24;
      if (unit.startsWith('d')) return n;
      if (unit.startsWith('w')) return n * 7;
      if (unit.startsWith('m')) return n * 30;
      return n * 365;
    }
    // Some plans only name their period.
    if (/\bdaily\b/i.test(text)) return 1;
    if (/\bweekly\b/i.test(text)) return 7;
    if (/\bmonthly\b/i.test(text)) return 30;
    if (/\b(yearly|annual)\b/i.test(text)) return 365;
  }
  return null;
}

/**
 * Which tab a plan sits under. Plans whose period cannot be read go under
 * "Other" rather than being guessed into a tab where they would mislead.
 */
export function planCategory(validity: string | null | undefined, name?: string | null): PlanCategory {
  const days = planDays(validity, name);
  if (days === null) return 'other';
  if (days <= 2) return 'daily';
  if (days <= 14) return 'weekly';
  if (days <= 45) return 'monthly';
  if (days <= 120) return 'quarter';
  return 'yearly';
}

export interface PlanView<T> {
  plan: T;
  size: string;
  validity: string;
  category: PlanCategory;
  popular: boolean;
}

/**
 * Plans laid out for the design's tabs: each with its size, validity text and
 * tab, plus which tabs actually have plans. "Hot" (the plans customers bought
 * most) exists only when something is popular, and "Other" only when a plan's
 * period could not be read — no empty tabs.
 */
export function arrangePlans<T extends { variation_code: string; name: string; validity?: string | null }>(
  plans: T[],
  popularCodes: string[],
): { views: PlanView<T>[]; tabs: PlanCategory[] } {
  const popular = new Set(popularCodes);
  const views = plans.map((plan) => ({
    plan,
    size: planSize(plan.name) ?? plan.name,
    validity: plan.validity || '',
    category: planCategory(plan.validity, plan.name),
    popular: popular.has(plan.variation_code),
  }));
  const order: PlanCategory[] = ['hot', 'daily', 'weekly', 'monthly', 'quarter', 'yearly', 'other'];
  const tabs = order.filter((c) => (c === 'hot' ? views.some((v) => v.popular) : views.some((v) => v.category === c)));
  return { views, tabs };
}

export function plansInTab<T>(views: PlanView<T>[], tab: PlanCategory): PlanView<T>[] {
  return tab === 'hot' ? views.filter((v) => v.popular) : views.filter((v) => v.category === tab);
}

// ─────────────────────────────────────────────────────────────
// Money
// ─────────────────────────────────────────────────────────────

/** "₦1,000" — whole naira, the way presets and buttons show it. */
export function naira0(n: number): string {
  return '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });
}

/** "₦1,000.00" — the way totals and receipts show it. */
export function naira2(n: number): string {
  return '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * The fee as the customer sees it. The design hardcoded "₦0.00 · Free"; it is
 * only free when the server charges nothing — data and cable carry a service
 * charge set by admin.
 */
export function feeLabel(fee: number): string {
  return fee > 0 ? naira2(fee) : '₦0.00 · Free';
}

// ─────────────────────────────────────────────────────────────
// The Pay button: can it be pressed, and what the line above it says
// ─────────────────────────────────────────────────────────────

export interface PayState {
  service: ServiceKey;
  /** 'list' | 'loading' | 'error' | 'none' — from paymentAccountView(). */
  accounts: 'list' | 'loading' | 'error' | 'none';
  phone: string;
  /** Base amount for open-value services (airtime, electricity). */
  amount: number;
  hasPlan: boolean;
  hasPackage: boolean;
  verified: boolean;
  verifying: boolean;
  /** A figure on screen might still move (catalogue or charges loading). */
  settling: boolean;
  /** The disco's own minimum for electricity, 0 when unknown. */
  discoMinimum: number;
  /** What the server will add on top of the base (fees and charges). */
  fee: number;
  /**
   * Sandbox builds only: VTPass's "pending" and "timeout" test numbers are 12
   * digits, so those must be accepted there. Never set in production.
   */
  testNumbers?: boolean;
}

function phoneComplete(s: PayState): boolean {
  return s.phone.length === 11 || (!!s.testNumbers && s.phone.length === 12);
}

export interface PayHint {
  text: string;
  tone: 'muted' | 'fail';
}

export function canPay(s: PayState): boolean {
  if (s.accounts !== 'list' || s.settling) return false;
  switch (s.service) {
    case 'airtime':
      return phoneComplete(s) && s.amount >= MIN_DEBIT;
    case 'data':
      return phoneComplete(s) && s.hasPlan;
    case 'power':
      return s.verified && s.amount >= Math.max(MIN_DEBIT, s.discoMinimum);
    case 'cable':
      return s.verified && s.hasPackage;
  }
}

/** The line above the Pay button. Null when there is nothing to say. */
export function payHint(s: PayState, discoShortName?: string): PayHint | null {
  const phoneService = s.service === 'airtime' || s.service === 'data';
  const amountService = s.service === 'airtime' || s.service === 'power';

  if (phoneService && s.phone.length > 0 && !phoneComplete(s)) {
    return { text: 'Enter the full 11-digit number', tone: 'muted' };
  }
  if (amountService && s.amount > 0 && s.amount < MIN_DEBIT) {
    return { text: `The smallest amount your bank can pay is ${naira0(MIN_DEBIT)}`, tone: 'fail' };
  }
  if (s.service === 'power' && s.discoMinimum > MIN_DEBIT && s.amount > 0 && s.amount < s.discoMinimum) {
    return { text: `${discoShortName ?? 'This provider'} needs at least ${naira0(s.discoMinimum)}`, tone: 'fail' };
  }
  if (s.service === 'data' && phoneComplete(s) && !s.hasPlan) {
    return { text: 'Pick a plan to continue', tone: 'muted' };
  }
  if (s.service === 'cable' && s.verified && !s.hasPackage) {
    return { text: 'Pick a package to continue', tone: 'muted' };
  }
  if (s.accounts === 'loading') return { text: 'Loading your bank accounts…', tone: 'muted' };
  if (s.accounts === 'error') return { text: "Couldn't load your bank accounts. Check your connection.", tone: 'fail' };
  if (s.accounts === 'none') return { text: 'Link a bank account to pay', tone: 'muted' };
  if (s.settling) return { text: 'Confirming the price…', tone: 'muted' };
  if (canPay(s)) {
    return {
      text: s.fee > 0 ? `${naira2(s.fee)} fee · paid straight from your bank` : 'No fee · paid straight from your bank',
      tone: 'muted',
    };
  }
  return null;
}

/** "Pay ₦1,000" once there is an amount, "Continue" before. */
export function payLabel(total: number): string {
  return total > 0 ? `Pay ${naira0(total)}` : 'Continue';
}
