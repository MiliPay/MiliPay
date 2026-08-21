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
    amountKobo: row.amount,
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
    amountKobo: row.amount,
    status: row.status as TransactionStatus,
    timestamp: row.created_at,
  }));

  return { items, page: 1, pageSize: 8, totalCount: count || 0 };
}

export interface DashboardStats {
  totalCustomers: number;
  transactionsToday: number;
  volumeMTD: number; // kobo
  systemHealth: number; // 0–100
  dailyRegistrations: number[];
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
  const { data: mtdTransactions } = await supabase
    .from("transactions")
    .select("amount")
    .gte("created_at", startOfMonth.toISOString())
    .eq("status", "success");
    
  const volumeMTD = (mtdTransactions || []).reduce((acc, txn) => acc + (txn.amount || 0), 0);

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

  return {
    totalCustomers: totalCustomers || 0,
    transactionsToday: transactionsToday || 0,
    volumeMTD,
    systemHealth: 99.98,
    dailyRegistrations,
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
    amountKobo: row.amount,
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
    amountKobo: data.amount,
    status: data.status as TransactionStatus,
    timestamp: data.created_at,
  };
}