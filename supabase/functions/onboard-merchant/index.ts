import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { z } from "https://esm.sh/zod@3.23.8";
import { recordAudit } from "../_shared/audit.ts";
import { ApiError, adminClient, handler, json, requireCaller, requireStaffRole } from "../_shared/auth.ts";
import { call as monoCall } from "../_shared/mono.ts";
import { dispatchCredential, generateTempPassword } from "../_shared/notify.ts";

/**
 * Register a merchant (design handoff, "Register merchant"): the business,
 * its director, where settlements go, and its first terminal.
 *
 *   { action: "resolve_account", bankCode, accountNumber }
 *       Asks the bank (through Mono) whose name the account is in, so the
 *       person registering can see it before going on.
 *
 *   { action: "create", ... }
 *       Creates the merchant-portal login, the merchant and its terminal.
 *       The merchant starts Pending: process-payment refuses any merchant
 *       that isn't active, so nothing is paid to it until an administrator
 *       approves it from the merchant's page.
 *
 * What changed from the old version, and why:
 *   - An email that already had a login was taken over: its password was
 *     reset and its role set to merchant. That email could belong to a
 *     customer or to staff. Now it is refused.
 *   - The settlement account name came from the browser whenever the bank
 *     check didn't answer. It is checked again here, and the merchant
 *     records whether the bank confirmed it.
 *   - A made-up Mono sub-account id was stored. Nothing creates one yet, so
 *     the column stays empty until something does.
 *   - A terminal that couldn't be saved (an ID or serial already in use) was
 *     a log line, and the merchant was left without one. Now nothing is
 *     created and the person is told which one clashes.
 *   - Two-factor, the audit log and proper error codes, as every other
 *     staff function has.
 */

const CATEGORIES = ["supermarket", "retail", "dining", "fuel", "pharmacy", "services", "other"] as const;
const PHONE = /^0[789][01]\d{8}$/;
const TERMINAL_ID = /^[A-Z0-9][A-Z0-9-]{2,39}$/;

const resolveSchema = z.object({
  action: z.literal("resolve_account"),
  bankCode: z.string().regex(/^\d{3,6}$/, "Choose the settlement bank."),
  accountNumber: z.string().regex(/^\d{10}$/, "Enter a 10-digit account number."),
});

const createSchema = z.object({
  action: z.literal("create").optional(),
  businessName: z.string().trim().min(2, "Enter the business name.").max(120),
  category: z.enum(CATEGORIES, { message: "Choose a category." }),
  address: z.string().trim().min(3, "Enter the business address.").max(240),
  state: z.string().trim().min(2, "Choose a state.").max(40),
  cacRcNumber: z.string().trim().max(20).optional().nullable(),
  directorName: z.string().trim().min(3, "Enter the director's name.").max(120),
  directorPhone: z.string().regex(PHONE, "Enter a valid director phone number."),
  directorBvn: z.string().regex(/^\d{11}$/, "BVN must be 11 digits."),
  email: z.string().trim().toLowerCase().email("Enter a valid login email.").max(160),
  settlementBankName: z.string().trim().min(2, "Choose the settlement bank.").max(80),
  settlementBankCode: z.string().regex(/^\d{3,6}$/, "Choose the settlement bank."),
  settlementAccountNumber: z.string().regex(/^\d{10}$/, "Enter a 10-digit account number."),
  /** Only used when the bank can't be asked; the merchant is then marked unchecked. */
  settlementAccountName: z.string().trim().max(120).optional().nullable(),
  platformFeePercent: z.number().gt(0, "Fee must be between 0 and 5%.").lte(5, "Fee must be between 0 and 5%."),
  settlementSchedule: z.enum(["instant", "daily_eod"]),
  terminalId: z.string().trim().toUpperCase().regex(TERMINAL_ID, "Enter the terminal ID printed on the device, like TRM-1234."),
  deviceSerialNumber: z.string().trim().min(3, "Enter the serial number.").max(60),
  deviceModel: z.string().trim().min(2).max(80),
});

/** Whose name the account is in, from the bank, or null when we can't ask. */
export async function lookupAccountName(bankCode: string, accountNumber: string): Promise<string | null> {
  const key = (Deno.env.get("MONO_SECRET_KEY") ?? "").trim();
  if (!key || key.length < 12) return null;
  try {
    const res = await monoCall<{ data?: { name?: string; account_name?: string } }>("/v2/lookup/account", {
      body: { account_number: accountNumber, bank_code: bankCode },
      key,
      timeoutMs: 10_000,
    });
    const name = res?.data?.name ?? res?.data?.account_name ?? null;
    return typeof name === "string" && name.trim() ? name.trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

export function merchantLoginMessage(director: string, business: string, email: string, password: string): string {
  return (
    `Hello ${director}, ${business} has been registered on MiliPay. ` +
    `Log in to the merchant portal at merchant.milipayz.com with ${email} and this one-time password: ${password}. ` +
    `You'll set your own password when you first log in. Payments start once we approve the business.`
  );
}

function issue(err: z.ZodError): never {
  throw new ApiError(err.issues[0]?.message ?? "Check the details and try again.", 400, "VALIDATION_FAILED");
}

serve(handler(async (req) => {
  if (req.method !== "POST") throw new ApiError("Method not allowed", 405, "METHOD_NOT_ALLOWED");
  const caller = await requireCaller(req);
  const admin = adminClient();
  await requireStaffRole(admin, caller, ["agent", "admin", "super_admin"]);
  const body = await req.json().catch(() => ({}));

  if (body?.action === "resolve_account") {
    const parsed = resolveSchema.safeParse(body);
    if (!parsed.success) issue(parsed.error);
    const name = await lookupAccountName(parsed.data.bankCode, parsed.data.accountNumber);
    return json({ success: true, name, checked: name !== null });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) issue(parsed.error);
  const d = parsed.data;

  // Clashes first, before anything is created.
  const { data: tidTaken } = await admin.from("pos_terminals").select("id").eq("terminal_id", d.terminalId).maybeSingle();
  if (tidTaken) throw new ApiError(`Terminal ${d.terminalId} is already assigned to a merchant.`, 409, "TERMINAL_TAKEN");
  const { data: serialTaken } = await admin
    .from("pos_terminals")
    .select("id")
    .eq("device_serial_number", d.deviceSerialNumber)
    .maybeSingle();
  if (serialTaken) throw new ApiError("A terminal with that serial number is already registered.", 409, "SERIAL_TAKEN");

  const bankName = await lookupAccountName(d.settlementBankCode, d.settlementAccountNumber);
  const accountName = bankName ?? d.settlementAccountName?.trim().toUpperCase() ?? "";
  if (!accountName) {
    throw new ApiError("We couldn't check the account name with the bank. Type the name on the account.", 400, "ACCOUNT_NAME_NEEDED");
  }

  // The director's merchant-portal login. An email that already signs in to
  // MiliPay (customer, staff or another merchant) is refused, never reused.
  const password = generateTempPassword();
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: d.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: d.directorName, business_name: d.businessName, must_change_password: true },
    app_metadata: { role: "merchant" },
  });
  if (authError || !created?.user) {
    if (authError && /already|registered|exists/i.test(authError.message)) {
      throw new ApiError("That email already has a MiliPay login. Use a different email for the merchant portal.", 409, "EMAIL_TAKEN");
    }
    console.error("[onboard-merchant] login not created", authError?.message);
    throw new ApiError("Could not create the merchant's login. Please try again.", 503, "UNAVAILABLE");
  }
  const authUserId = created.user.id;

  const { data: merchant, error: merchantError } = await admin
    .from("merchants")
    .insert({
      business_name: d.businessName,
      category: d.category,
      address: d.address,
      state: d.state,
      cac_rc_number: d.cacRcNumber?.trim() || null,
      director_name: d.directorName,
      director_phone: d.directorPhone,
      director_bvn: d.directorBvn,
      email: d.email,
      auth_user_id: authUserId,
      settlement_bank_name: d.settlementBankName,
      settlement_bank_code: d.settlementBankCode,
      settlement_account_number: d.settlementAccountNumber,
      settlement_account_name: accountName,
      settlement_name_checked: bankName !== null,
      mono_subaccount_id: null,
      platform_fee_percent: d.platformFeePercent,
      settlement_schedule: d.settlementSchedule,
      status: "pending",
      onboarded_by: caller.id,
    })
    .select("id")
    .single();
  if (merchantError || !merchant) {
    console.error("[onboard-merchant] merchant not saved", merchantError?.message);
    await admin.auth.admin.deleteUser(authUserId);
    throw new ApiError("Could not save the merchant. Nothing was created; please try again.", 503, "UNAVAILABLE");
  }

  const { data: terminal, error: terminalError } = await admin
    .from("pos_terminals")
    .insert({
      terminal_id: d.terminalId,
      merchant_id: merchant.id,
      device_serial_number: d.deviceSerialNumber,
      device_model: d.deviceModel,
      is_active: true,
      assigned_by: caller.id,
    })
    .select("id, terminal_id")
    .single();
  if (terminalError || !terminal) {
    // Undo, so a retry starts clean rather than with a merchant and no till.
    await admin.from("merchants").delete().eq("id", merchant.id);
    await admin.auth.admin.deleteUser(authUserId);
    if (terminalError?.code === "23505") {
      throw new ApiError("That terminal ID or serial number was registered just now by someone else.", 409, "TERMINAL_TAKEN");
    }
    console.error("[onboard-merchant] terminal not saved", terminalError?.message);
    throw new ApiError("Could not save the terminal. Nothing was created; please try again.", 503, "UNAVAILABLE");
  }

  await recordAudit(admin, req, caller, {
    category: "Merchants",
    action: "registered merchant",
    target: d.businessName,
    targetId: merchant.id,
    after: {
      status: "pending",
      platformFeePercent: d.platformFeePercent,
      settlement: d.settlementSchedule,
      accountNameChecked: bankName !== null,
      terminal: d.terminalId,
    },
  });

  const sent = await dispatchCredential(
    d.directorPhone,
    merchantLoginMessage(d.directorName, d.businessName, d.email, password),
  );
  if (!sent.delivered) console.error("[onboard-merchant] login details not delivered", merchant.id, sent.attempts);

  return json({
    success: true,
    merchant: { id: merchant.id, status: "pending" },
    terminal: { id: terminal.id, terminal_id: terminal.terminal_id },
    accountName,
    accountNameChecked: bankName !== null,
    credentials: { email: d.email, portalUrl: "https://merchant.milipayz.com", delivered: sent.delivered, deliveryChannel: sent.channel },
  });
}));
