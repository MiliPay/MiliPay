import { useEffect, useState } from "react";
import { supabase } from "@milipay/shared/lib/supabase";
import { fetchSignupReviews } from "@milipay/shared/features/signupReviews/api";

/**
 * The small counts on the admin sidebar: things waiting for a person.
 * Each one is read on its own, so one failing (a function down, a policy
 * missing) leaves that badge blank instead of taking the others with it.
 * Refreshed every minute while the console is open.
 */
export interface AdminNavCounts {
  operations: number | null;
  pendingCustomers: number | null;
  signupReviews: number | null;
  offlineTerminals: number | null;
  openTickets: number | null;
  /** Website applications nobody has followed up yet (merchant and agent). */
  newLeads: number | null;
  /** Denied sign-ins and actions today: the dot on the top-bar bell. */
  deniedToday: number | null;
}

const EMPTY: AdminNavCounts = {
  operations: null,
  pendingCustomers: null,
  signupReviews: null,
  offlineTerminals: null,
  openTickets: null,
  newLeads: null,
  deniedToday: null,
};

/** A terminal with no heartbeat for this long is offline. */
export const OFFLINE_AFTER_MS = 15 * 60 * 1000;

async function settle<T>(p: PromiseLike<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

async function countOf(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  const r = await settle(query);
  return r && !r.error ? r.count ?? 0 : null;
}

/** The Leads badge from admin_website_summary; blank when the function is missing or failed. */
export function newLeadsOf(r: { data?: unknown; error?: unknown } | null): number | null {
  const d = r && !r.error ? (r.data as { newMerchantLeads?: number; newAgentApplications?: number } | null) : null;
  if (!d || typeof d.newMerchantLeads !== "number" || typeof d.newAgentApplications !== "number") return null;
  return d.newMerchantLeads + d.newAgentApplications;
}

export async function fetchAdminNavCounts(): Promise<AdminNavCounts> {
  const offlineSince = new Date(Date.now() - OFFLINE_AFTER_MS).toISOString();
  // Midnight in Lagos (UTC+1 all year) as an instant.
  const lagos = new Date(Date.now() + 3_600_000);
  const lagosMidnight = new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate()) - 3_600_000).toISOString();
  const [ops, pendingCustomers, reviews, offlineTerminals, openTickets, deniedToday, website] = await Promise.all([
    settle(supabase.rpc("vtu_operations_snapshot", { p_hours: 24 })),
    countOf(supabase.from("customers").select("id", { count: "exact", head: true }).eq("status", "pending")),
    settle(fetchSignupReviews()),
    countOf(
      supabase
        .from("pos_terminals")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .not("merchant_id", "is", null)
        .or(`last_heartbeat.is.null,last_heartbeat.lt.${offlineSince}`),
    ),
    countOf(supabase.from("support_tickets").select("id", { count: "exact", head: true }).neq("status", "resolved")),
    countOf(
      supabase.from("audit_events").select("id", { count: "exact", head: true }).eq("result", "denied").gte("occurred_at", lagosMidnight),
    ),
    settle(supabase.rpc("admin_website_summary")),
  ]);
  const queues = (ops as { data?: { queues?: { pending?: number; quarantined?: number } } } | null)?.data?.queues;
  return {
    operations: queues ? (queues.pending ?? 0) + (queues.quarantined ?? 0) : null,
    pendingCustomers,
    signupReviews: reviews ? reviews.length : null,
    offlineTerminals,
    openTickets,
    newLeads: newLeadsOf(website),
    deniedToday,
  };
}

export function useAdminNavCounts(): AdminNavCounts {
  const [counts, setCounts] = useState<AdminNavCounts>(EMPTY);
  useEffect(() => {
    let live = true;
    const load = () => fetchAdminNavCounts().then((c) => live && setCounts(c));
    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  return counts;
}
