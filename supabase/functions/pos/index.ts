import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ApiError, adminClient, corsHeaders, handler, json } from "../_shared/auth.ts";
import { loginPhone } from "../_shared/login-code.ts";
import { dispatchSms } from "../_shared/notify.ts";
import { palmCheckout } from "../_shared/palm-checkout.ts";
import {
  CASHIER_SESSION_HOURS,
  PIN_RE,
  SETUP_GRANT_MINUTES,
  afterWrongPin,
  daySummary,
  initials,
  pinLocked,
  posOutcome,
  posStatus,
  type PayMethod,
} from "../_shared/pos.ts";

/**
 * The POS terminal app's backend (merchant-portal/design_handoff_pos).
 *
 * A terminal signs in once with the merchant's phone and password and gets a
 * device token (X-Terminal-Token), stored hashed on pos_terminals. Cashiers
 * then unlock it with their 4-digit PIN and get a shift session
 * (X-Cashier-Session), signed, with no table behind it. Payments go through
 * the same palm checkout as process-payment.
 *
 *   POST /login           phone, password, serial  -> device token, setup grant
 *   POST /set-pin         setup grant, pin         -> owner's PIN; session
 *   GET  /me                                       -> terminal, merchant, cashiers
 *   POST /unlock          cashierId, pin           -> session
 *   POST /pay/palm        amount, features, pin?   -> approved, or an outcome
 *   POST /pay/qr, /pay/card                        -> not switched on yet
 *   GET  /transactions    ?method=                 -> this terminal's recent payments
 *   GET  /summary                                  -> today's end of day
 *   POST /refund          reference, supervisor    -> refund requested
 *   POST /receipt/sms     reference                -> text the customer a receipt
 *   POST /settings        smsReceipts
 */

const enc = new TextEncoder();

function secret(): string {
  const s = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  if (!s) throw new ApiError("The terminal service is unavailable right now.", 503, "UNAVAILABLE");
  return s;
}

async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A signed, expiring grant: "<kind>.<a>.<b>.<expiresMs>.<sig>". */
async function sign(kind: string, a: string, b: string, ttlMs: number): Promise<string> {
  const exp = String(Date.now() + ttlMs);
  return `${kind}.${a}.${b}.${exp}.${await hmac(`pos-${kind}:${a}:${b}:${exp}`)}`;
}

async function verifySigned(kind: string, token: unknown): Promise<{ a: string; b: string } | null> {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== kind) return null;
  const [, a, b, exp, sig] = parts;
  if (!(Number(exp) > Date.now())) return null;
  return sameHash(sig, await hmac(`pos-${kind}:${a}:${b}:${exp}`)) ? { a, b } : null;
}

const pinHash = (cashierId: string, pin: string) => hmac(`pos-cashier-pin:${cashierId}:${pin}`);

function callerAddress(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

async function rateLimit(admin: SupabaseClient, key: string, limit: number, windowSeconds: number) {
  const { data, error } = await admin.rpc("consume_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) {
    console.error("[pos] rate limit check failed", error);
    throw new ApiError("The terminal service is unavailable right now. Try again shortly.", 503, "UNAVAILABLE");
  }
  if (data === false) throw new ApiError("Too many attempts. Wait a while and try again.", 429, "RATE_LIMITED");
}

interface Terminal {
  id: string;
  terminal_id: string;
  merchant_id: string;
  device_serial_number: string | null;
  sms_receipts: boolean;
}

interface Merchant {
  id: string;
  business_name: string;
  address: string | null;
  status: string;
  platform_fee_percent: number | string | null;
  settlement_schedule: string | null;
  settlement_bank_name: string | null;
  settlement_account_number: string | null;
  director_name: string | null;
  email: string | null;
}

const MERCHANT_COLS =
  "id, business_name, address, status, platform_fee_percent, settlement_schedule, settlement_bank_name, settlement_account_number, director_name, email";

/** The terminal behind X-Terminal-Token, and its merchant, both still active. */
async function requireTerminal(admin: SupabaseClient, req: Request): Promise<{ terminal: Terminal; merchant: Merchant }> {
  const token = req.headers.get("x-terminal-token") ?? "";
  const [terminalUuid, raw] = token.split(":");
  if (!terminalUuid || !raw) throw new ApiError("This terminal isn't signed in.", 401, "TERMINAL_SIGNED_OUT");
  const { data: t } = await admin
    .from("pos_terminals")
    .select("id, terminal_id, merchant_id, device_serial_number, is_active, terminal_api_key_hash, sms_receipts")
    .eq("id", terminalUuid)
    .maybeSingle();
  if (!t || !t.terminal_api_key_hash || !sameHash(t.terminal_api_key_hash, await hmac(`pos-device:${t.id}:${raw}`))) {
    throw new ApiError("This terminal isn't signed in.", 401, "TERMINAL_SIGNED_OUT");
  }
  if (!t.is_active) throw new ApiError("This terminal has been switched off by MiliPay. Call 0700 MILIPAY.", 403, "TERMINAL_INACTIVE");
  const { data: m } = await admin.from("merchants").select(MERCHANT_COLS).eq("id", t.merchant_id).maybeSingle();
  if (!m) throw new ApiError("This terminal isn't signed in.", 401, "TERMINAL_SIGNED_OUT");
  if (m.status !== "active") throw new ApiError(`This merchant account is ${m.status}. Call 0700 MILIPAY.`, 403, "MERCHANT_NOT_ACTIVE");
  return { terminal: t as Terminal, merchant: m as Merchant };
}

/** The cashier on shift, from X-Cashier-Session, at this terminal. */
async function requireCashier(admin: SupabaseClient, req: Request, terminal: Terminal) {
  const s = await verifySigned("shift", req.headers.get("x-cashier-session"));
  if (!s || s.b !== terminal.id) throw new ApiError("Unlock the terminal with your PIN.", 401, "CASHIER_LOCKED");
  const { data: c } = await admin
    .from("pos_cashiers")
    .select("id, name, is_supervisor, active, merchant_id")
    .eq("id", s.a)
    .maybeSingle();
  if (!c || !c.active || c.merchant_id !== terminal.merchant_id) throw new ApiError("Unlock the terminal with your PIN.", 401, "CASHIER_LOCKED");
  return c as { id: string; name: string; is_supervisor: boolean };
}

/** Check a cashier's PIN, counting wrong tries and locking after too many. */
async function checkCashierPin(admin: SupabaseClient, cashierId: string, merchantId: string, pin: unknown) {
  if (typeof pin !== "string" || !PIN_RE.test(pin)) throw new ApiError("Enter your 4-digit PIN.", 400, "BAD_PIN");
  const { data: c } = await admin
    .from("pos_cashiers")
    .select("id, name, is_supervisor, active, merchant_id, pin_hash, failed_attempts, locked_until")
    .eq("id", cashierId)
    .maybeSingle();
  if (!c || !c.active || c.merchant_id !== merchantId) throw new ApiError("Pick who's on the till.", 404, "CASHIER_NOT_FOUND");
  const now = new Date();
  if (pinLocked(c.locked_until, now)) {
    throw new ApiError("Too many wrong PINs. Try again in 15 minutes, or log in with phone and password.", 423, "CASHIER_PIN_LOCKED");
  }
  if (!c.pin_hash) throw new ApiError("This cashier has no PIN yet.", 409, "CASHIER_NO_PIN");
  if (!sameHash(c.pin_hash, await pinHash(c.id, pin))) {
    const next = afterWrongPin(Number(c.failed_attempts) || 0, now);
    await admin.from("pos_cashiers").update({ failed_attempts: next.failedAttempts, locked_until: next.lockedUntil }).eq("id", c.id);
    throw new ApiError(next.lockedUntil ? "Too many wrong PINs. Try again in 15 minutes." : "Wrong PIN", 401, next.lockedUntil ? "CASHIER_PIN_LOCKED" : "CASHIER_PIN_WRONG");
  }
  if (c.failed_attempts || c.locked_until) {
    await admin.from("pos_cashiers").update({ failed_attempts: 0, locked_until: null }).eq("id", c.id);
  }
  return c as { id: string; name: string; is_supervisor: boolean };
}

async function shiftFor(cashier: { id: string; name: string; is_supervisor: boolean }, terminal: Terminal) {
  return {
    session: await sign("shift", cashier.id, terminal.id, CASHIER_SESSION_HOURS * 3600_000),
    cashier: { id: cashier.id, name: cashier.name, initials: initials(cashier.name), supervisor: cashier.is_supervisor },
  };
}

function bankLabel(m: Merchant): string {
  const last4 = (m.settlement_account_number ?? "").replace(/\D/g, "").slice(-4);
  return `${m.settlement_bank_name ?? "your bank"}${last4 ? ` ••${last4}` : ""}`;
}

/** 00:00 today in Lagos (UTC+1, no daylight saving), as an ISO instant. */
function lagosDayStart(now = new Date()): string {
  const lagos = new Date(now.getTime() + 3600_000);
  return new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate()) - 3600_000).toISOString();
}

async function body(req: Request): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => null);
  return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
}

function amountOf(v: unknown): number {
  const amount = Number(v);
  if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
    throw new ApiError("Enter an amount.", 400, "INVALID_AMOUNT");
  }
  return amount;
}

// ── Routes ─────────────────────────────────────────────────────────────────

async function login(admin: SupabaseClient, req: Request) {
  const b = await body(req);
  const phone = loginPhone(b.phone);
  if (!phone) throw new ApiError("Enter the 10 digits after +234.", 400, "BAD_PHONE");
  const serial = typeof b.serial === "string" ? b.serial.trim().slice(0, 80) : "";
  if (!serial) throw new ApiError("This terminal's serial number couldn't be read. Restart it and try again.", 400, "NO_SERIAL");
  await rateLimit(admin, `pos:login:${callerAddress(req)}`, 20, 3600);
  await rateLimit(admin, `pos:login-phone:${phone}`, 10, 3600);

  const variants = [phone, `+234${phone.slice(1)}`, `234${phone.slice(1)}`];
  const { data: m } = await admin.from("merchants").select(MERCHANT_COLS).in("director_phone", variants).limit(1).maybeSingle();
  const wrong = new ApiError("That phone number and password don't match.", 401, "BAD_LOGIN");
  if (!m || !m.email || typeof b.password !== "string" || !b.password) throw wrong;

  // The merchant portal's own login, checked by Supabase Auth.
  const auth = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false } });
  const { data: signedIn, error: authError } = await auth.auth.signInWithPassword({ email: m.email, password: b.password });
  if (authError || !signedIn?.user) throw wrong;
  if (m.status !== "active") throw new ApiError(`This merchant account is ${m.status}. Call 0700 MILIPAY.`, 403, "MERCHANT_NOT_ACTIVE");

  const { data: t } = await admin
    .from("pos_terminals")
    .select("id, terminal_id, merchant_id, device_serial_number, is_active, sms_receipts")
    .eq("merchant_id", m.id)
    .eq("device_serial_number", serial)
    .maybeSingle();
  if (!t) {
    throw new ApiError(
      `This terminal (serial ${serial}) isn't registered to ${m.business_name}. Call 0700 MILIPAY to add it.`,
      403,
      "TERMINAL_NOT_REGISTERED",
    );
  }
  if (!t.is_active) throw new ApiError("This terminal has been switched off by MiliPay. Call 0700 MILIPAY.", 403, "TERMINAL_INACTIVE");

  // A new device token each login; the old one stops working.
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) => x.toString(16).padStart(2, "0")).join("");
  await admin
    .from("pos_terminals")
    .update({ terminal_api_key_hash: await hmac(`pos-device:${t.id}:${raw}`), paired_at: new Date().toISOString() })
    .eq("id", t.id);

  // The owner is the first supervisor. Created once, at the first login.
  let { data: owner } = await admin.from("pos_cashiers").select("id, name, is_supervisor").eq("merchant_id", m.id).eq("is_owner", true).maybeSingle();
  if (!owner) {
    const name = (m.director_name ?? "").trim().split(/\s+/)[0] || "Owner";
    const { data: created, error } = await admin
      .from("pos_cashiers")
      .insert({ merchant_id: m.id, name, is_owner: true, is_supervisor: true, active: true, failed_attempts: 0 })
      .select("id, name, is_supervisor")
      .single();
    if (error || !created) throw new ApiError("Couldn't finish setting up this terminal. Try again.", 503, "UNAVAILABLE");
    owner = created;
  }

  return json({
    success: true,
    token: `${t.id}:${raw}`,
    setupGrant: await sign("setup", owner.id, t.id, SETUP_GRANT_MINUTES * 60_000),
    owner: { id: owner.id, name: owner.name },
  });
}

async function me(admin: SupabaseClient, terminal: Terminal, merchant: Merchant) {
  const { data: cashiers } = await admin
    .from("pos_cashiers")
    .select("id, name, is_supervisor, is_owner, pin_hash")
    .eq("merchant_id", merchant.id)
    .eq("active", true)
    .order("is_owner", { ascending: false })
    .order("name", { ascending: true });
  return json({
    success: true,
    terminal: { id: terminal.terminal_id, serial: terminal.device_serial_number, smsReceipts: terminal.sms_receipts !== false },
    merchant: { name: merchant.business_name, address: merchant.address, bank: bankLabel(merchant), settlement: merchant.settlement_schedule ?? "instant" },
    cashiers: (cashiers ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      initials: initials(c.name),
      supervisor: c.is_supervisor,
      hasPin: Boolean(c.pin_hash),
    })),
  });
}

async function setPin(admin: SupabaseClient, req: Request, terminal: Terminal) {
  const b = await body(req);
  const grant = await verifySigned("setup", b.setupGrant);
  if (!grant || grant.b !== terminal.id) throw new ApiError("Log in again to set your PIN.", 401, "SETUP_EXPIRED");
  if (typeof b.pin !== "string" || !PIN_RE.test(b.pin)) throw new ApiError("Enter 4 digits.", 400, "BAD_PIN");
  const { data: c } = await admin.from("pos_cashiers").select("id, name, is_supervisor, merchant_id").eq("id", grant.a).maybeSingle();
  if (!c || c.merchant_id !== terminal.merchant_id) throw new ApiError("Log in again to set your PIN.", 401, "SETUP_EXPIRED");
  await admin
    .from("pos_cashiers")
    .update({ pin_hash: await pinHash(c.id, b.pin), failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
    .eq("id", c.id);
  return json({ success: true, ...(await shiftFor(c, terminal)) });
}

async function unlock(admin: SupabaseClient, req: Request, terminal: Terminal) {
  const b = await body(req);
  if (typeof b.cashierId !== "string") throw new ApiError("Pick who's on the till.", 400, "CASHIER_NOT_FOUND");
  await rateLimit(admin, `pos:unlock:${terminal.id}`, 60, 3600);
  const c = await checkCashierPin(admin, b.cashierId, terminal.merchant_id, b.pin);
  return json({ success: true, ...(await shiftFor(c, terminal)) });
}

async function payPalm(admin: SupabaseClient, req: Request, terminal: Terminal, merchant: Merchant) {
  const cashier = await requireCashier(admin, req, terminal);
  const b = await body(req);
  const amount = amountOf(b.amount);
  const partition = typeof b.phoneLast4 === "string" && /^\d{4}$/.test(b.phoneLast4) ? b.phoneLast4 : null;
  try {
    return await palmCheckout(admin, {
      merchant,
      terminal,
      amount,
      irFeatures: typeof b.irFeatures === "string" ? b.irFeatures : null,
      rgbFeatures: typeof b.rgbFeatures === "string" ? b.rgbFeatures : null,
      partitionKey: partition,
      pin: typeof b.pin === "string" ? b.pin : undefined,
      reference: typeof b.reference === "string" ? b.reference.slice(0, 80) : undefined,
      cashierId: cashier.id,
      paymentMethod: "palm",
    });
  } catch (err) {
    // The terminal shows a result screen per outcome; tell it which.
    if (err instanceof ApiError) Object.assign(err.extra, { outcome: posOutcome(err.code) });
    throw err;
  }
}

async function transactions(admin: SupabaseClient, req: Request, terminal: Terminal) {
  await requireCashier(admin, req, terminal);
  const method = new URL(req.url).searchParams.get("method");
  let q = admin
    .from("transactions")
    .select("id, reference, amount, fee_amount, status, payment_method, cashier_id, customer_id, used_pin, created_at")
    .eq("terminal_id", terminal.terminal_id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (method === "palm" || method === "qr" || method === "card") q = q.eq("payment_method", method);
  const { data: rows, error } = await q;
  if (error) throw new ApiError("Couldn't load payments. Try again.", 503, "UNAVAILABLE");
  const list = rows ?? [];

  const ids = (k: "cashier_id" | "customer_id") => [...new Set(list.map((r) => r[k]).filter(Boolean))] as string[];
  const cashierIds = ids("cashier_id");
  const customerIds = ids("customer_id");
  const { data: cs } = cashierIds.length ? await admin.from("pos_cashiers").select("id, name").in("id", cashierIds) : { data: [] };
  const { data: cu } = customerIds.length ? await admin.from("customers").select("id, first_name, last_name").in("id", customerIds) : { data: [] };
  const cashierName = new Map((cs ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
  // A merchant sees the customer's first name and surname initial, nothing more.
  const customerName = new Map(
    (cu ?? []).map((c: { id: string; first_name: string | null; last_name: string | null }) => [
      c.id,
      `${(c.first_name ?? "").trim() || "Customer"}${c.last_name ? ` ${c.last_name.trim()[0]}.` : ""}`,
    ]),
  );

  return json({
    success: true,
    transactions: list.map((r) => ({
      reference: r.reference,
      amount: Number(r.amount),
      fee: Number(r.fee_amount ?? 0),
      method: (r.payment_method ?? "palm") as PayMethod,
      status: posStatus(r.status),
      refundable: r.status === "delivered" && (r.payment_method ?? "palm") !== "qr",
      usedPin: Boolean(r.used_pin),
      cashier: r.cashier_id ? cashierName.get(r.cashier_id) ?? null : null,
      customer: r.customer_id ? customerName.get(r.customer_id) ?? "Customer" : "Customer",
      at: r.created_at,
    })),
  });
}

async function summary(admin: SupabaseClient, req: Request, terminal: Terminal, merchant: Merchant) {
  await requireCashier(admin, req, terminal);
  const { data: rows, error } = await admin
    .from("transactions")
    .select("amount, fee_amount, payment_method, status, created_at")
    .eq("terminal_id", terminal.terminal_id)
    .gte("created_at", lagosDayStart())
    .order("created_at", { ascending: false });
  if (error) throw new ApiError("Couldn't load today's totals. Try again.", 503, "UNAVAILABLE");
  const list = rows ?? [];
  const day = daySummary(list.map((r) => ({
    amount: Number(r.amount),
    fee: Number(r.fee_amount ?? 0),
    method: (r.payment_method ?? "palm") as PayMethod,
    status: r.status,
  })));
  const lastPaid = list.find((r) => r.status === "delivered")?.created_at ?? null;
  return json({ success: true, ...day, bank: bankLabel(merchant), settlement: merchant.settlement_schedule ?? "instant", lastSettledAt: lastPaid });
}

async function refund(admin: SupabaseClient, req: Request, terminal: Terminal) {
  const cashier = await requireCashier(admin, req, terminal);
  const b = await body(req);
  if (typeof b.reference !== "string" || typeof b.supervisorId !== "string") throw new ApiError("Pick the payment to refund.", 400, "BAD_REQUEST");
  const supervisor = await checkCashierPin(admin, b.supervisorId, terminal.merchant_id, b.supervisorPin);
  if (!supervisor.is_supervisor) {
    throw new ApiError("Only a supervisor can approve refunds.", 403, "NOT_SUPERVISOR");
  }
  const { data: tx } = await admin
    .from("transactions")
    .select("id, amount, status, payment_method, merchant_id, terminal_id")
    .eq("reference", b.reference)
    .maybeSingle();
  if (!tx || tx.merchant_id !== terminal.merchant_id) throw new ApiError("That payment wasn't found.", 404, "NOT_FOUND");
  if (tx.status !== "delivered") throw new ApiError("Only a paid payment can be refunded.", 409, "NOT_REFUNDABLE");
  if (tx.payment_method === "qr") throw new ApiError("QR payments are refunded from the customer's app.", 409, "NOT_REFUNDABLE");

  const { error: refundError } = await admin.from("pos_refunds").insert({
    transaction_id: tx.id,
    merchant_id: tx.merchant_id,
    terminal_id: terminal.terminal_id,
    amount: tx.amount,
    requested_by: cashier.id,
    approved_by: supervisor.id,
  });
  if (refundError) throw new ApiError("Couldn't request the refund. Try again.", 503, "UNAVAILABLE");
  await admin.from("transactions").update({ status: "refund_pending", updated_at: new Date().toISOString() }).eq("id", tx.id);
  return json({ success: true, status: posStatus("refund_pending") });
}

async function receiptSms(admin: SupabaseClient, req: Request, terminal: Terminal, merchant: Merchant) {
  await requireCashier(admin, req, terminal);
  if (terminal.sms_receipts === false) throw new ApiError("Text receipts are off on this terminal.", 409, "SMS_OFF");
  const b = await body(req);
  if (typeof b.reference !== "string") throw new ApiError("Pick the payment.", 400, "BAD_REQUEST");
  await rateLimit(admin, `pos:sms:${b.reference}`, 3, 3600);
  const { data: tx } = await admin
    .from("transactions")
    .select("amount, status, merchant_id, customer_id, reference, created_at")
    .eq("reference", b.reference)
    .maybeSingle();
  if (!tx || tx.merchant_id !== merchant.id || tx.status !== "delivered" || !tx.customer_id) throw new ApiError("That payment wasn't found.", 404, "NOT_FOUND");
  const { data: c } = await admin.from("customers").select("phone").eq("id", tx.customer_id).maybeSingle();
  if (!c?.phone) throw new ApiError("This customer has no phone number on file.", 409, "NO_PHONE");
  const amount = `₦${Number(tx.amount).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const sent = await dispatchSms(
    c.phone,
    `MiliPay receipt: you paid ${amount} at ${merchant.business_name}. Ref ${tx.reference.slice(-11)}. See it in the MiliPay app.`,
  );
  if (!sent.delivered) throw new ApiError("The receipt couldn't be sent. Try again shortly.", 503, "NOT_SENT");
  return json({ success: true });
}

async function settings(admin: SupabaseClient, req: Request, terminal: Terminal) {
  await requireCashier(admin, req, terminal);
  const b = await body(req);
  if (typeof b.smsReceipts !== "boolean") throw new ApiError("Nothing to change.", 400, "BAD_REQUEST");
  await admin.from("pos_terminals").update({ sms_receipts: b.smsReceipts }).eq("id", terminal.id);
  return json({ success: true, smsReceipts: b.smsReceipts });
}

const routes = handler(async (req) => {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const route = path.slice(path.indexOf("/pos") + 4) || "/";
  const admin = adminClient();

  if (route === "/login" && req.method === "POST") return login(admin, req);

  const { terminal, merchant } = await requireTerminal(admin, req);
  switch (`${req.method} ${route}`) {
    case "GET /me":
      return me(admin, terminal, merchant);
    case "POST /set-pin":
      return setPin(admin, req, terminal);
    case "POST /unlock":
      return unlock(admin, req, terminal);
    case "POST /pay/palm":
      return payPalm(admin, req, terminal, merchant);
    case "POST /pay/qr":
      throw new ApiError("QR payments aren't switched on yet. Use palm.", 501, "QR_NOT_AVAILABLE");
    case "POST /pay/card":
      throw new ApiError("Card payments aren't switched on yet. Use palm.", 501, "CARD_NOT_AVAILABLE");
    case "GET /transactions":
      return transactions(admin, req, terminal);
    case "GET /summary":
      return summary(admin, req, terminal, merchant);
    case "POST /refund":
      return refund(admin, req, terminal);
    case "POST /receipt/sms":
      return receiptSms(admin, req, terminal, merchant);
    case "POST /settings":
      return settings(admin, req, terminal);
    default:
      throw new ApiError("Not found", 404, "NOT_FOUND");
  }
});

// The terminal's own headers have to be allowed for the browser preview; the
// Android app itself isn't subject to CORS.
serve((req) =>
  req.method === "OPTIONS"
    ? new Response("ok", {
        headers: {
          ...corsHeaders,
          "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"]}, x-terminal-token, x-cashier-session`,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        },
      })
    : routes(req)
);
