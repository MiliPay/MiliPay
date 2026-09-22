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
 * 2. It never says delivered before the server does. The copy is keyed off the
 *    real status and nothing else, which is the same rule the app's progress
 *    sheet follows.
 *
 * 3. Silence is a valid outcome. Most intermediate states are noise — a
 *    customer who is watching the purchase screen does not need a banner
 *    saying "payment confirmed" two seconds before "delivered".
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Expo will not accept more than 100 messages in one request. */
const MAX_BATCH = 100;

interface Copy {
  title: string;
  body: (context: NotifyContext) => string;
}

export interface NotifyContext {
  reference: string;
  amountNgn: number;
  serviceLabel: string;
  beneficiary?: string | null;
}

function naira(amount: number): string {
  return `₦${Number(amount).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

/**
 * What is worth interrupting somebody for.
 *
 * `initiated`, `paid` and `fulfilling` are deliberately absent: they last
 * seconds and the app shows them live. A notification for each would mean four
 * buzzes for one airtime purchase.
 */
const COPY: Partial<Record<TransactionStatus, Copy>> = {
  delivered: {
    title: "Payment successful",
    body: (c) =>
      c.beneficiary
        ? `${naira(c.amountNgn)} ${c.serviceLabel} to ${c.beneficiary} was delivered.`
        : `${naira(c.amountNgn)} ${c.serviceLabel} was delivered.`,
  },
  payment_failed: {
    title: "Payment declined",
    body: (c) => `Your bank declined ${naira(c.amountNgn)} for ${c.serviceLabel}. Nothing was charged.`,
  },
  fulfilment_failed: {
    title: "We could not complete this",
    body: (c) => `${c.serviceLabel} could not be delivered. Your refund of ${naira(c.amountNgn)} is on its way.`,
  },
  fulfilment_pending: {
    title: "Still confirming",
    body: (c) => `${c.serviceLabel} is taking longer than usual. We are checking with the network.`,
  },
  refunded: {
    title: "Refunded",
    body: (c) => `${naira(c.amountNgn)} has been returned to your account.`,
  },
  refund_failed: {
    title: "Your refund is delayed",
    body: (c) => `We could not return ${naira(c.amountNgn)} automatically. Our team is on it.`,
  },
  quarantined: {
    title: "On hold for review",
    body: () => "One of your payments is being reviewed. Our team will contact you.",
  },
};

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
    context: NotifyContext;
  },
): Promise<void> {
  try {
    const copy = COPY[args.status];
    if (!copy) return;
    if (!args.userId && !args.customerId) return;

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
      title: copy.title,
      body: copy.body(args.context),
      sound: "default",
      channelId: "transactions",
      priority: "high",
      // The app reads this to open the right transaction when tapped.
      data: { reference: args.context.reference, status: args.status },
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
