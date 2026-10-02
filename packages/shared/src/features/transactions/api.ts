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
      base_amount,
      fee_amount,
      service_charge,
      service_type,
      provider,
      beneficiary,
      payment_provider,
      payment_reference,
      fulfilment_provider,
      operator_reference,
      operator_transaction_id,
      failure_reason,
      token,
      units,
      terminal_id,
      initiated_at,
      paid_at,
      fulfilled_at,
      refunded_at,
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
    amountNgn: Number(data.amount),
    status: data.status as TransactionStatus,
    timestamp: data.created_at,

    baseAmountNgn: data.base_amount === null ? null : Number(data.base_amount),
    feeNgn: data.fee_amount === null ? null : Number(data.fee_amount),
    serviceChargeNgn: data.service_charge === null ? null : Number(data.service_charge),
    serviceType: data.service_type,
    provider: data.provider,
    beneficiary: data.beneficiary,
    paymentProvider: data.payment_provider,
    paymentReference: data.payment_reference,
    fulfilmentProvider: data.fulfilment_provider,
    operatorReference: data.operator_reference ?? data.operator_transaction_id,
    failureReason: data.failure_reason,
    token: data.token,
    units: data.units,
    terminalId: data.terminal_id,
    initiatedAt: data.initiated_at ?? data.created_at,
    paidAt: data.paid_at,
    fulfilledAt: data.fulfilled_at,
    refundedAt: data.refunded_at,
  };
}