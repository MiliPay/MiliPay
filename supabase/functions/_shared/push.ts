import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { TransactionStatus } from "./vtu-state.ts";

/**
 * Telling a customer what happened to their money.
 *
 * Rules this module exists to keep:
 *
 * 1. A notification is never the reason a transaction fails. Every path here
 *    swallows its errors — the money has already moved by the time we are
 *    called, and failing the transition because Expo was slow would be far
 *    worse than a missing banner.
 *
 * 2. It says exactly what the inbox says. The words are not written here: the
 *    database writes the customer's inbox entry from a trigger on the status
 *    change (migration 20260927120000_customer_notifications), and the banner
 *    sends that entry's title and body. One message, two channels — a banner
 *    that said "Payment successful" over an inbox that said "Airtime
 *    delivered" would be two stories about one purchase.
 *
 * 3. Silence is a valid outcome. A state with no inbox entry — initiated,
 *    paid, fulfilling, refund_pending — is not worth a buzz either: they last
 *    seconds and the app shows them live.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Expo will not accept more than 100 messages in one request. */
const MAX_BATCH = 100;

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  sound: "default" | null;
  channelId: string;
  priority: "default" | "high";
  data: Record<string, unknown>;
}

/**
 * Send a status change to every live device belonging to a customer.
 *
 * Returns quietly when there is nothing to say, nobody to say it to, or the
 * push service is unreachable.
 */
export async function notifyTransactionStatus(
  admin: SupabaseClient,
  args: {
    userId?: string | null;
    customerId?: string | null;
    status: TransactionStatus;
    reference: string;
  },
): Promise<void> {
  try {
    if (!args.userId && !args.customerId) return;

    const { data: note } = await admin
      .from("customer_notifications")
      .select("title, body")
      .eq("reference", args.reference)
      .eq("status", args.status)
      .maybeSingle();
    if (!note?.title || !note?.body) return;

    let query = admin
      .from("push_tokens")
      .select("id, token")
      .is("revoked_at", null);

    query = args.userId
      ? query.eq("user_id", args.userId)
      : query.eq("customer_id", args.customerId!);

    const { data: rows, error } = await query;
    if (error || !rows || rows.length === 0) return;

    const messages: ExpoMessage[] = rows.map((row: { token: string }) => ({
      to: row.token,
      title: String(note.title),
      body: String(note.body),
      sound: "default",
      channelId: "transactions",
      priority: "high",
      // The app reads this to open the right transaction when tapped.
      data: { reference: args.reference, status: args.status },
    }));

    for (let i = 0; i < messages.length; i += MAX_BATCH) {
      await deliver(admin, messages.slice(i, i + MAX_BATCH));
    }
  } catch (err) {
    // Never rethrow: see rule 1 at the top of this file.
    console.error("[push] notify failed", err);
  }
}

async function deliver(admin: SupabaseClient, batch: ExpoMessage[]): Promise<void> {
  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify(batch),
  });

  if (!response.ok) {
    console.error(`[push] expo returned ${response.status}`);
    return;
  }

  const payload = await response.json().catch(() => null);
  const tickets = payload?.data;
  if (!Array.isArray(tickets)) return;

  // A phone that has been wiped, reinstalled or had the app removed reports
  // DeviceNotRegistered. Expo asks that such tokens stop being used, and
  // retrying them forever is how a sending queue silently fills with corpses.
  const dead: string[] = [];
  tickets.forEach((ticket: { status?: string; details?: { error?: string } }, i: number) => {
    if (ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
      dead.push(batch[i].to);
    }
  });

  if (dead.length > 0) {
    await admin
      .from("push_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .in("token", dead);
  }
}
