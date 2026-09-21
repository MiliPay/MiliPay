import { supabase } from "@milipay/shared/lib/supabase";
import type { PaginatedResult, Transaction, TransactionStatus } from "@milipay/shared/types";

type DateRange = "today" | "7d" | "30d" | "all";

interface FetchTransactionsOptions {
  page?: number;
  pageSize?: number;
  status?: TransactionStatus | "";
  dateRange?: DateRange;
}

function getDateThreshold(range: DateRange): string | null {
  const now = new Date();
  switch (range) {
    case "today": {
      now.setHours(0, 0, 0, 0);
      return now.toISOString();
    }
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    case "all":
    default:
      return null;
  }
}

export async function fetchTransactions(
  options: FetchTransactionsOptions = {}
): Promise<PaginatedResult<Transaction>> {
  const { page = 1, pageSize = 15, status = "", dateRange = "all" } = options;

  let query = supabase
    .from("transactions")
    .select(
      `
      id,
      reference,
      merchant_name,
      amount,
      status,
      created_at,
      customers ( id, first_name, last_name )
      `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const threshold = getDateThreshold(dateRange);
  if (threshold) {
    query = query.gte("created_at", threshold);
  }

  const start = (page - 1) * pageSize;
  const { data, error, count } = await query.range(start, start + pageSize - 1);

  if (error) {
    console.error("Error fetching transactions:", error);
    return { items: [], page, pageSize, totalCount: 0 };
  }

  const items: Transaction[] = (data || []).map((row: any) => ({
    id: row.id,
    reference: row.reference,
    customerName: row.customers ? `${row.customers.first_name} ${row.customers.last_name}` : "Unknown",
    customerId: row.customers?.id || "",
    merchantName: row.merchant_name,
    amountNgn: row.amount,
    status: row.status as TransactionStatus,
    timestamp: row.created_at,
  }));

  return { items, page, pageSize, totalCount: count || 0 };
}

export async function fetchRecentTransactions(): Promise<PaginatedResult<Transaction>> {
  const { data, error, count } = await supabase
    .from("transactions")
    .select(
      `
      id,
      reference,
      merchant_name,
      amount,
      status,
      created_at,
      customers ( id, first_name, last_name )
      `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    console.error("Error fetching recent transactions:", error);
    return { items: [], page: 1, pageSize: 8, totalCount: 0 };
  }

  const items: Transaction[] = (data || []).map((row: any) => ({
    id: row.id,
    reference: row.reference,
    customerName: row.customers ? `${row.customers.first_name} ${row.customers.last_name}` : "Unknown",
    customerId: row.customers?.id || "",
    merchantName: row.merchant_name,
    amountNgn: row.amount,
    status: row.status as TransactionStatus,
    timestamp: row.created_at,
  }));

  return { items, page: 1, pageSize: 8, totalCount: count || 0 };
}

export interface DashboardStats {
  totalCustomers: number;
  transactionsToday: number;
  /** Naira. The project stores Naira numeric(12,2) and never kobo. */
  volumeMTD: number;
  dailyRegistrations: number[];
  pendingKYC: number;
  activeStaff: number;
  /**
   * Transactions where the customer's money has been taken and nothing has
   * been delivered yet.
   *
   * This replaces a "system health" tile that returned a hardcoded 99.98 —
   * a number nobody measured, on a financial dashboard, which is worse than
   * showing nothing. This one is counted, and when it is not zero somebody
   * should look.
   */
  inFlight: number;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const now = new Date();

  // 1. Total Customers
  const { count: totalCustomers } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true });

  // 2. Transactions Today
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const { count: transactionsToday } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startOfToday.toISOString());

  // 3. Volume Month-to-Date
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  // 'delivered' is the settled state. This filtered on 'success', which was
  // the vocabulary before the payment-rail migration renamed it — so every
  // completed transaction was being excluded and the figure read zero.
  const { data: mtdTransactions } = await supabase
    .from("transactions")
    .select("amount")
    .gte("created_at", startOfMonth.toISOString())
    .eq("status", "delivered");

  const volumeMTD = (mtdTransactions || []).reduce((acc, txn) => acc + (Number(txn.amount) || 0), 0);

  // 4. Daily Registrations (Last 7 Days)
  const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const { data: recentCustomers, error: regError } = await supabase
    .from("customers")
    .select("created_at")
    .gte("created_at", sevenDaysAgo.toISOString());

  if (regError) {
    console.error("Error fetching recent registrations:", regError);
  }

  // Build a map of date-string -> bucket index for the last 7 days
  const dayBuckets: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dayBuckets[key] = i;
  }

  const dailyRegistrations = [0, 0, 0, 0, 0, 0, 0];
  if (recentCustomers) {
    recentCustomers.forEach((cust) => {
      const custDate = new Date(cust.created_at);
      const key = `${custDate.getFullYear()}-${String(custDate.getMonth() + 1).padStart(2, "0")}-${String(custDate.getDate()).padStart(2, "0")}`;
      if (key in dayBuckets) {
        dailyRegistrations[dayBuckets[key]]++;
      }
    });
  }

  // Pending KYC
  const { count: pendingKYC } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  // Active Staff
  const { count: activeStaff } = await supabase
    .from("staff_profiles")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  // Money taken, nothing delivered. Counted, not invented.
  const { count: inFlight } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .in("status", ["initiated", "paid", "fulfilling", "fulfilment_pending", "refund_pending"]);

  return {
    totalCustomers: totalCustomers || 0,
    transactionsToday: transactionsToday || 0,
    volumeMTD,
    dailyRegistrations,
    pendingKYC: pendingKYC || 0,
    activeStaff: activeStaff || 0,
    inFlight: inFlight || 0,
  };
}

export async function fetchTransactionsByCustomerId(
  customerId: string,
  options: FetchTransactionsOptions = {}
): Promise<PaginatedResult<Transaction>> {
  const { page = 1, pageSize = 15 } = options;

  let query = supabase
    .from("transactions")
    .select(
      `
      id,
      reference,
      merchant_name,
      amount,
      status,
      created_at,
      customers ( id, first_name, last_name )
      `,
      { count: "exact" }
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  const start = (page - 1) * pageSize;
  const { data, error, count } = await query.range(start, start + pageSize - 1);

  if (error) {
    console.error("Error fetching transactions by customer ID:", error);
    return { items: [], page, pageSize, totalCount: 0 };
  }

  const items: Transaction[] = (data || []).map((row: any) => ({
    id: row.id,
    reference: row.reference,
    customerName: row.customers ? `${row.customers.first_name} ${row.customers.last_name}` : "Unknown",
    customerId: row.customers?.id || "",
    merchantName: row.merchant_name,
    amountNgn: row.amount,
    status: row.status as TransactionStatus,
    timestamp: row.created_at,
  }));

  return { items, page, pageSize, totalCount: count || 0 };
}

export async function fetchTransactionById(id: string): Promise<Transaction | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      `
      id,
      reference,
      merchant_name,
      amount,
      status,
      created_at,
      customers ( id, first_name, last_name )
      `
    )
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching transaction by id:", error);
    return null;
  }

  const cust = Array.isArray(data.customers) ? data.customers[0] : data.customers;

  return {
    id: data.id,
    reference: data.reference,
    customerName: cust ? `${cust.first_name} ${cust.last_name}` : "Unknown",
    customerId: cust?.id || "",
    merchantName: data.merchant_name,
    amountNgn: data.amount,
    status: data.status as TransactionStatus,
    timestamp: data.created_at,
  };
}