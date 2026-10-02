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
}

const EMPTY: AdminNavCounts = {
  operations: null,
  pendingCustomers: null,
  signupReviews: null,
  offlineTerminals: null,
  openTickets: null,
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

export async function fetchAdminNavCounts(): Promise<AdminNavCounts> {
  const offlineSince = new Date(Date.now() - OFFLINE_AFTER_MS).toISOString();
  const [ops, pendingCustomers, reviews, offlineTerminals, openTickets] = await Promise.all([
    settle(supabase.rpc("vtu_operations_snapshot", { p_hours: 24 })),
    countOf(supabase.from("customers").select("id", { count: "exact", head: true }).eq("status", "pending")),
    settle(fetchSignupReviews()),
    countOf(
      supabase
        .from("pos_terminals")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .or(`last_heartbeat.is.null,last_heartbeat.lt.${offlineSince}`),
    ),
    countOf(supabase.from("support_tickets").select("id", { count: "exact", head: true }).neq("status", "resolved")),
  ]);
  const queues = (ops as { data?: { queues?: { pending?: number; quarantined?: number } } } | null)?.data?.queues;
  return {
    operations: queues ? (queues.pending ?? 0) + (queues.quarantined ?? 0) : null,
    pendingCustomers,
    signupReviews: reviews ? reviews.length : null,
    offlineTerminals,
    openTickets,
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
