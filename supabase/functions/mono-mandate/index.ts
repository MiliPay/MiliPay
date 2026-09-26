import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { z } from "https://esm.sh/zod@3.23.8";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ApiError, adminClient, handler, json, requireCaller } from "../_shared/auth.ts";
import { readFulfilmentEnvironment } from "../_shared/environment.ts";
import {
  cancelMandate,
  createMonoCustomer,
  initiateMandate,
  isMonoConfigured,
  monoPaymentMode,
  paymentsAppTag,
  toApiError,
} from "../_shared/mono.ts";
import { linkedAccountBankCode } from "../_shared/mono-connect.ts";
import {
  QUICK_PAY_ALLOWANCES,
  committedUnderMandate,
  isQuickPayAllowance,
  mandateWindow,
  missingMandateDetails,
  quickPayState,
} from "../_shared/quick-pay.ts";

/**
 * Quick pay: turning a Mono Direct Debit mandate on, reading it, turning it off.
 *
 * The rules live in quick-pay.ts. This is the plumbing around them:
 *
 *   status  what the customer sees for each linked account
 *   setup   start a mandate on one account; returns Mono's page, where the
 *           customer approves it and is told where to send ₦50
 *   cancel  switch it off, at Mono and here
 *
 * NOTHING HERE MOVES MONEY. setup only asks Mono to begin an authorisation
 * the customer completes at their own bank; the mandate is usable only when
 * Mono's events.mandates.ready reaches mono-webhook. Purchases are still made
 * — and still charged — only through vtu-service.
 *
 * Every action is the caller's own: accounts and mandates are looked up by
 * the authenticated user, never by an id from the request alone.
 */

const setupSchema = z.object({
  linkedAccountId: z.string().uuid(),
  allowance: z.number(),
});

const cancelSchema = z.object({
  linkedAccountId: z.string().uuid(),
});

const SETUP_FAILED =
  "Quick pay couldn't be set up right now. Nothing was charged — please try again later.";

/** Quick pay is offered only where purchases themselves can run. */
function quickPayAvailable(): boolean {
  const { mode, coherence } = readFulfilmentEnvironment(Deno.env);
  return mode === "live" && coherence.ok && monoPaymentMode() === "mandate" && isMonoConfigured();
}

async function rateLimit(admin: SupabaseClient, key: string, limit: number, windowSeconds: number) {
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("[quick-pay] rate limit check failed", error);
    return;
  }
  if (data === false) {
    throw new ApiError("Too many attempts. Please wait a while and try again.", 429, "RATE_LIMITED");
  }
}

interface CustomerRow {
  id: string;
  status: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  bvn: string | null;
  mono_customer_id: string | null;
  mono_customer_app_tag: string | null;
}

async function loadCustomer(admin: SupabaseClient, authUserId: string): Promise<CustomerRow> {
  const { data } = await admin
    .from("customers")
    .select(
      "id, status, first_name, last_name, email, phone, address, bvn, mono_customer_id, mono_customer_app_tag",
    )
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (!data) {
    throw new ApiError("No MiliPay customer profile is linked to this login", 403, "PROFILE_MISSING");
  }
  if (data.status && data.status !== "active") {
    throw new ApiError(`Your account is currently ${data.status}.`, 403, "ACCOUNT_NOT_ACTIVE");
  }
  return data as CustomerRow;
}

type FailureKind = "bank_declined" | "wrong_account" | "not_finished";

function failureKind(mandate: { status: string; failure_reason?: string | null }): FailureKind {
  if (mandate.status === "pending") return "not_finished";
  if (/different account/i.test(String(mandate.failure_reason ?? ""))) return "wrong_account";
  return "bank_declined";
}

// ─────────────────────────────────────────────────────────────

async function status(admin: SupabaseClient, userId: string) {
  const available = quickPayAvailable();

  const [{ data: accounts }, { data: mandates }, customer] = await Promise.all([
    admin.from("linked_accounts").select("id").eq("user_id", userId).eq("is_active", true),
    admin
      .from("mono_mandates")
      .select("linked_account_id, status, created_at, max_total, mono_mandate_id, failure_reason, authorised_at")
      .eq("user_id", userId),
    loadCustomer(admin, userId),
  ]);

  const now = new Date();
  const views = [];
  for (const account of accounts ?? []) {
    const own = (mandates ?? []).filter((m) => m.linked_account_id === account.id);
    const { state, mandate } = quickPayState(own, now);

    let remaining: number | null = null;
    if (state === "on" && mandate?.mono_mandate_id && mandate.max_total != null) {
      const { data: rows } = await admin
        .from("transactions")
        .select("status, amount")
        .eq("mono_mandate_id", mandate.mono_mandate_id);
      remaining = Math.max(0, Number(mandate.max_total) - committedUnderMandate(rows ?? []));
    }

    views.push({
      linkedAccountId: account.id,
      state,
      allowance: mandate?.max_total == null ? null : Number(mandate.max_total),
      remaining,
      // Set up and paid the ₦50; now it is the bank's turn.
      bankApproved: state === "setting_up" && Boolean(mandate?.authorised_at),
      failure: state === "failed" && mandate ? failureKind(mandate) : null,
    });
  }

  return json({
    success: true,
    available,
    allowances: QUICK_PAY_ALLOWANCES,
    // Named, so the app can say exactly what to add; never the values.
    missingDetails: missingMandateDetails(customer),
    accounts: views,
  });
}

// ─────────────────────────────────────────────────────────────

async function setup(admin: SupabaseClient, userId: string, body: unknown) {
  if (!quickPayAvailable()) {
    throw new ApiError("Quick pay isn't available yet.", 503, "QUICK_PAY_UNAVAILABLE");
  }

  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) throw new ApiError("Choose an account and an allowance.", 400, "VALIDATION_FAILED");
  const { linkedAccountId, allowance } = parsed.data;
  if (!isQuickPayAllowance(allowance)) {
    throw new ApiError("Choose one of the allowances offered.", 400, "VALIDATION_FAILED");
  }

  await rateLimit(admin, `quickpay:setup:${userId}`, 5, 3600);

  const customer = await loadCustomer(admin, userId);
  const missing = missingMandateDetails(customer);
  if (missing.length > 0) {
    throw new ApiError(
      `Your bank needs your ${missing.join(", ")} on file before quick pay can be set up.`,
      400,
      "DETAILS_MISSING",
      { missing },
    );
  }

  const { data: account } = await admin
    .from("linked_accounts")
    .select("id, account_number, mono_account_id, bank_code")
    .eq("id", linkedAccountId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (!account) {
    throw new ApiError("That bank account is not linked to your profile.", 403, "ACCOUNT_NOT_FOUND");
  }

  // One mandate per account at a time.
  const { data: existing } = await admin
    .from("mono_mandates")
    .select("id, status, mono_mandate_id, authorised_at")
    .eq("linked_account_id", account.id)
    .in("status", ["pending", "active", "suspended"]);

  for (const m of existing ?? []) {
    if (m.status === "active" || m.status === "suspended") {
      throw new ApiError("Quick pay is already on for this account.", 409, "QUICK_PAY_EXISTS");
    }
    if (m.authorised_at) {
      // The ₦50 arrived and the bank approved; activation is on its way.
      // Starting over now would only put a second mandate on the account.
      throw new ApiError(
        "Your bank is already switching quick pay on for this account. This can take up to a day.",
        409,
        "QUICK_PAY_ACTIVATING",
      );
    }
  }

  // A setup that was started and never approved is replaced, not stacked:
  // Mono lapses an unfunded mandate after an hour anyway.
  for (const m of existing ?? []) {
    await admin
      .from("mono_mandates")
      .update({ status: "expired", failure_reason: "replaced by a new setup", updated_at: new Date().toISOString() })
      .eq("id", m.id)
      .eq("status", "pending");
    if (m.mono_mandate_id) {
      await cancelMandate(m.mono_mandate_id).catch((err) =>
        console.error(`[quick-pay] could not cancel superseded mandate ${m.mono_mandate_id}`, err)
      );
    }
  }

  // The Mono customer the mandate is signed by — reused when it belongs to
  // the app we are calling, created otherwise. (mono-app-tag.ts)
  const appTag = await paymentsAppTag();
  let monoCustomerId =
    customer.mono_customer_id && customer.mono_customer_app_tag === appTag ? customer.mono_customer_id : null;

  // Mono needs the bank's code alongside the account number. Kept once read.
  let bankCode = typeof account.bank_code === "string" && account.bank_code ? account.bank_code : null;

  try {
    if (!monoCustomerId) {
      monoCustomerId = await createMonoCustomer({
        firstName: customer.first_name!.trim(),
        lastName: customer.last_name!.trim(),
        email: customer.email!.trim(),
        phone: customer.phone!.trim(),
        address: customer.address!.trim(),
        bvn: customer.bvn!.trim(),
      });
      await admin
        .from("customers")
        .update({ mono_customer_id: monoCustomerId, mono_customer_app_tag: appTag })
        .eq("id", customer.id);
    }

    if (!bankCode && account.mono_account_id) {
      bankCode = await linkedAccountBankCode(String(account.mono_account_id));
      if (bankCode) {
        await admin.from("linked_accounts").update({ bank_code: bankCode }).eq("id", account.id);
      }
    }
  } catch (err) {
    // The provider code only, never Mono's message: a create-customer
    // refusal can quote back what it was sent, and that includes the BVN.
    const code = (err as { providerCode?: string })?.providerCode ?? "unknown";
    console.error(`[quick-pay] could not prepare the mandate (Mono ${code})`);
    throw toApiError(err, SETUP_FAILED);
  }

  if (!bankCode) {
    // Guessing a bank code risks a mandate on someone else's account.
    throw new ApiError(SETUP_FAILED, 502, "BANK_CODE_UNAVAILABLE");
  }

  const now = new Date();
  const { startDate, endDate } = mandateWindow(now);
  const reference = `MP-QP-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  // Written BEFORE Mono is asked, so the webhook always has a row to find.
  const { data: row, error: insertError } = await admin
    .from("mono_mandates")
    .insert({
      user_id: userId,
      customer_id: customer.id,
      linked_account_id: account.id,
      status: "pending",
      reference,
      max_total: allowance,
      max_per_debit: null,
      expires_at: `${endDate}T23:59:59+01:00`,
      updated_at: now.toISOString(),
    })
    .select("id")
    .single();
  if (insertError || !row) {
    console.error("[quick-pay] could not record the mandate", insertError);
    throw new ApiError(SETUP_FAILED, 503, "QUICK_PAY_NOT_STARTED");
  }

  try {
    const mandate = await initiateMandate({
      reference,
      monoCustomerId,
      allowance,
      accountNumber: String(account.account_number),
      bankCode,
      description: "MiliPay quick pay",
      startDate,
      endDate,
    });

    if (mandate.mandateId) {
      await admin.from("mono_mandates").update({ mono_mandate_id: mandate.mandateId }).eq("id", row.id);
    }

    return json({ success: true, reference, authorisationUrl: mandate.authorisationUrl });
  } catch (err) {
    // Nothing started at the bank; the row is closed so the customer can retry.
    await admin
      .from("mono_mandates")
      .update({
        status: "expired",
        failure_reason: `setup did not start: ${err instanceof Error ? err.message : "error"}`.slice(0, 300),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    throw toApiError(err, SETUP_FAILED);
  }
}

// ─────────────────────────────────────────────────────────────

async function cancel(admin: SupabaseClient, userId: string, body: unknown) {
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) throw new ApiError("Choose an account.", 400, "VALIDATION_FAILED");

  const { data: mandates } = await admin
    .from("mono_mandates")
    .select("id, status, mono_mandate_id")
    .eq("user_id", userId)
    .eq("linked_account_id", parsed.data.linkedAccountId)
    .in("status", ["pending", "active", "suspended"]);

  for (const m of mandates ?? []) {
    // Off HERE first and unconditionally: whatever Mono says, MiliPay never
    // debits this mandate again. Always available — switching quick pay off
    // must never depend on quick pay being switched on for the business.
    await admin
      .from("mono_mandates")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        failure_reason: "turned off by the customer",
        updated_at: new Date().toISOString(),
      })
      .eq("id", m.id)
      .eq("status", m.status);

    if (m.mono_mandate_id) {
      // Then at the bank. A failure is for staff to chase; the customer's
      // protection above does not depend on it.
      await cancelMandate(m.mono_mandate_id).catch((err) =>
        console.error(`[quick-pay] CANCEL AT MONO FAILED for ${m.mono_mandate_id}`, err)
      );
    }
  }

  return json({ success: true });
}

// ─────────────────────────────────────────────────────────────

serve(handler(async (req) => {
  if (req.method !== "POST") throw new ApiError("Method not allowed", 405, "METHOD_NOT_ALLOWED");

  const caller = await requireCaller(req);
  const admin = adminClient();
  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "status") return status(admin, caller.id);
  if (action === "setup") return setup(admin, caller.id, body);
  if (action === "cancel") return cancel(admin, caller.id, body);
  throw new ApiError(`Unknown action: ${action}`, 400, "UNKNOWN_ACTION");
}));
