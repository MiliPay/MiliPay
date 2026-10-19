import type { PayMethod } from "./core";

/**
 * The terminal's calls to the `pos` Edge Function (supabase/functions/pos),
 * and a demo with the prototype's shop for when there's no backend to talk to
 * (EXPO_PUBLIC_POS_DEMO=1). Both behave the same to the screens.
 */

export interface Cashier { id: string; name: string; initials: string; supervisor: boolean; hasPin?: boolean }
export interface Shift { session: string; cashier: Cashier }
export interface Me {
  terminal: { id: string; serial: string | null; smsReceipts: boolean };
  merchant: { name: string; address: string | null; bank: string; settlement: string };
  cashiers: Cashier[];
}
export interface Tx {
  reference: string; amount: number; fee: number; method: PayMethod;
  status: "Paid" | "Refund requested" | "Refunded" | "Not paid";
  refundable: boolean; usedPin: boolean; cashier: string | null; customer: string; at: string;
}
export interface Summary {
  count: number; gross: number; refunds: number; fees: number; net: number; palmShare: number;
  mix: { method: PayMethod; count: number; amount: number; share: number }[];
  bank: string; settlement: string; lastSettledAt: string | null;
}
export interface Approved {
  reference: string; authCode: string; amount: number; platformFee: number; netMerchantPayout: number;
  customerFirstName: string | null; usedPin: boolean;
}
export interface PalmRequest { amount: number; irFeatures: string; rgbFeatures: string | null; phoneLast4?: string; pin?: string; reference: string }

export class PosError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly extra: Record<string, any> = {}) {
    super(message);
  }
}

export type Signed = { token: string; setupGrant: string; owner: { id: string; name: string } };
/** A terminal not yet paired with this merchant: a code went to the merchant's phone. */
export type NeedsCode = { step: "code"; pairingId: string; sentTo: string };

export interface PosApi {
  demo: boolean;
  login(phone: string, password: string, serial: string): Promise<Signed | NeedsCode>;
  verifyPairing(pairingId: string, code: string, serial: string): Promise<Signed>;
  resendPairing(pairingId: string, serial: string, channel: "sms" | "call"): Promise<{ sentTo: string }>;
  setPin(token: string, setupGrant: string, pin: string): Promise<Shift>;
  me(token: string): Promise<Me>;
  unlock(token: string, cashierId: string, pin: string): Promise<Shift>;
  payPalm(token: string, session: string, req: PalmRequest): Promise<Approved>;
  transactions(token: string, session: string, method?: PayMethod): Promise<Tx[]>;
  summary(token: string, session: string): Promise<Summary>;
  refund(token: string, session: string, reference: string, supervisorId: string, supervisorPin: string): Promise<void>;
  receiptSms(token: string, session: string, reference: string): Promise<void>;
  setSmsReceipts(token: string, session: string, on: boolean): Promise<void>;
}

// ── Live ───────────────────────────────────────────────────────────────────

function live(base: string): PosApi {
  async function call<T>(path: string, init: { token?: string; session?: string; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (init.token) headers["x-terminal-token"] = init.token;
    if (init.session) headers["x-cashier-session"] = init.session;
    let res: Response;
    try {
      res = await fetch(`${base}/functions/v1/pos${path}`, {
        method: init.body === undefined ? "GET" : "POST",
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch {
      throw new PosError("No internet. Palm payments need a connection.", 0, "OFFLINE");
    }
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.success !== false) return body as T;
    const { error, code, success, ...extra } = body ?? {};
    void success;
    throw new PosError(typeof error === "string" ? error : "Something went wrong. Try again.", res.status, code ?? "UNKNOWN", extra);
  }
  return {
    demo: false,
    login: (phone, password, serial) => call("/login", { body: { phone, password, serial } }),
    verifyPairing: (pairingId, code, serial) => call("/login/verify", { body: { pairingId, code, serial } }),
    resendPairing: (pairingId, serial, channel) => call("/login/resend", { body: { pairingId, serial, channel } }),
    setPin: (token, setupGrant, pin) => call("/set-pin", { token, body: { setupGrant, pin } }),
    me: (token) => call("/me", { token }),
    unlock: (token, cashierId, pin) => call("/unlock", { token, body: { cashierId, pin } }),
    payPalm: (token, session, req) => call("/pay/palm", { token, session, body: req }),
    transactions: async (token, session, method) =>
      (await call<{ transactions: Tx[] }>(`/transactions${method ? `?method=${method}` : ""}`, { token, session })).transactions,
    summary: (token, session) => call("/summary", { token, session }),
    refund: async (token, session, reference, supervisorId, supervisorPin) => {
      await call("/refund", { token, session, body: { reference, supervisorId, supervisorPin } });
    },
    receiptSms: async (token, session, reference) => {
      await call("/receipt/sms", { token, session, body: { reference } });
    },
    setSmsReceipts: async (token, session, on) => {
      await call("/settings", { token, session, body: { smsReceipts: on } });
    },
  };
}

// ── Demo (the prototype's shop) ───────────────────────────────────────────

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CUSTS = ["Adaeze O.", "Chinedu E.", "Bisi A.", "Kemi B.", "Ifeanyi N.", "Halima S.", "Femi O."];

function demo(): PosApi {
  const cashiers = [
    { id: "c1", name: "Tunde", initials: "TA", supervisor: true, pin: "1234" },
    { id: "c2", name: "Grace", initials: "GO", supervisor: false, pin: "2580" },
    { id: "c3", name: "Musa", initials: "MB", supervisor: false, pin: "1111" },
  ];
  const fee = (a: number) => Math.round(a * 0.015 * 100) / 100;
  const now = new Date();
  const at = (hh: number, mm: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm).toISOString();
  const seed: [number, PayMethod, number, number, number, string, string?][] = [
    [4500, "palm", 0, 13, 42, "Tunde"], [12800, "palm", 1, 13, 20, "Grace"], [2300, "qr", 2, 12, 58, "Tunde"],
    [7650, "palm", 3, 12, 31, "Grace"], [31000, "palm", 4, 11, 47, "Tunde", "Refund requested"], [1800, "card", 5, 11, 5, "Musa"],
    [9200, "palm", 6, 10, 22, "Tunde"], [5600, "qr", 1, 9, 48, "Grace"], [15400, "palm", 2, 9, 12, "Musa"],
  ];
  let txs: Tx[] = seed.map(([amount, method, ci, hh, mm, cashier, st], i) => ({
    reference: `MILI-TX-${17604 + i * 13}-${["A4F2", "K9D1", "P2X7", "B8Q3", "Z1M6", "R5T2", "H7C9", "J3W4", "N6V8"][i]}`,
    amount, fee: fee(amount), method, status: (st ?? "Paid") as Tx["status"], refundable: !st && method !== "qr",
    usedPin: false, cashier, customer: method === "card" ? `Card ••${4021 + ci * 37}` : CUSTS[ci], at: at(hh, mm),
  }));
  let sms = true;
  const threshold = 10000;
  const shift = (c: (typeof cashiers)[number]): Shift => ({ session: `demo-${c.id}`, cashier: { id: c.id, name: c.name, initials: c.initials, supervisor: c.supervisor } });
  const who = (session: string) => cashiers.find((c) => `demo-${c.id}` === session) ?? cashiers[0];

  return {
    demo: true,
    async login(phone, password) {
      await wait(1100);
      if (!/^[789][01]\d{8}$/.test(phone.replace(/\D/g, "").replace(/^0/, ""))) throw new PosError("Enter the 10 digits after +234.", 400, "BAD_PHONE");
      if (password === "wrong") throw new PosError("That phone number and password don't match.", 401, "BAD_LOGIN");
      return { token: "demo-terminal", setupGrant: "demo-grant", owner: { id: "c1", name: "Tunde" } };
    },
    async verifyPairing() {
      return { token: "demo-terminal", setupGrant: "demo-grant", owner: { id: "c1", name: "Tunde" } };
    },
    async resendPairing() {
      return { sentTo: "+234 803 123 4567" };
    },
    async setPin(_t, _g, pin) {
      await wait(1000);
      cashiers[0].pin = pin;
      return shift(cashiers[0]);
    },
    async me() {
      return {
        terminal: { id: "TRM-2041", serial: "MP-P5-00921", smsReceipts: sms },
        merchant: { name: "Lekki Fresh Mart", address: "Lekki Phase 1, Lagos", bank: "GTBank ••4410", settlement: "instant" },
        cashiers: cashiers.map(({ pin: _pin, ...c }) => ({ ...c, hasPin: true })),
      };
    },
    async unlock(_t, cashierId, pin) {
      await wait(500);
      const c = cashiers.find((x) => x.id === cashierId);
      if (!c || c.pin !== pin) throw new PosError("Wrong PIN", 401, "CASHIER_PIN_WRONG");
      await wait(400);
      return shift(c);
    },
    async payPalm(_t, session, req) {
      await wait(1300);
      if (req.amount > threshold && !req.pin) {
        throw new PosError("PIN required", 401, "PIN_REQUIRED", { outcome: "pin", firstName: "Adaeze", threshold });
      }
      if (req.pin === "0000") {
        throw new PosError("Incorrect PIN. 2 attempt(s) remaining.", 401, "PIN_INCORRECT", { outcome: "pin-wrong", attemptsRemaining: 2 });
      }
      const tx: Tx = {
        reference: req.reference, amount: req.amount, fee: fee(req.amount), method: "palm", status: "Paid", refundable: true,
        usedPin: Boolean(req.pin), cashier: who(session).name, customer: "Adaeze O.", at: new Date().toISOString(),
      };
      txs = [tx, ...txs];
      return {
        reference: tx.reference, authCode: `APPR-${100000 + Math.floor(Math.random() * 900000)}`, amount: tx.amount,
        platformFee: tx.fee, netMerchantPayout: Math.round((tx.amount - tx.fee) * 100) / 100, customerFirstName: "Adaeze", usedPin: tx.usedPin,
      };
    },
    async transactions(_t, _s, method) {
      return txs.filter((t) => !method || t.method === method);
    },
    async summary() {
      const paid = txs.filter((t) => t.status === "Paid");
      const gross = paid.reduce((a, t) => a + t.amount, 0);
      const fees = Math.round(paid.reduce((a, t) => a + t.fee, 0) * 100) / 100;
      const mix = (["palm", "qr", "card"] as PayMethod[]).map((m) => {
        const l = paid.filter((t) => t.method === m);
        const amount = l.reduce((a, t) => a + t.amount, 0);
        return { method: m, count: l.length, amount, share: gross ? amount / gross : 0 };
      });
      return {
        count: paid.length, gross, fees, net: Math.round((gross - fees) * 100) / 100,
        refunds: txs.filter((t) => t.status !== "Paid").reduce((a, t) => a + t.amount, 0),
        palmShare: paid.length ? mix[0].count / paid.length : 0, mix, bank: "GTBank ••4410", settlement: "instant",
        lastSettledAt: paid[0]?.at ?? null,
      };
    },
    async refund(_t, _s, reference, supervisorId, supervisorPin) {
      await wait(900);
      const sup = cashiers.find((c) => c.id === supervisorId);
      if (!sup || sup.pin !== supervisorPin) throw new PosError("Wrong PIN", 401, "CASHIER_PIN_WRONG");
      if (!sup.supervisor) throw new PosError("Only a supervisor can approve refunds.", 403, "NOT_SUPERVISOR");
      txs = txs.map((t) => (t.reference === reference ? { ...t, status: "Refund requested", refundable: false } : t));
    },
    async receiptSms() {
      await wait(900);
    },
    async setSmsReceipts(_t, _s, on) {
      sms = on;
    },
  };
}

export const api: PosApi =
  process.env.EXPO_PUBLIC_POS_DEMO === "1" || !process.env.EXPO_PUBLIC_SUPABASE_URL
    ? demo()
    : live(process.env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/+$/, ""));
