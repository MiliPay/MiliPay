import type { PaginatedResult, Transaction } from "@/types";

export async function fetchRecentTransactions(): Promise<PaginatedResult<Transaction>> {
  await delay(250);
  return { items: MOCK_TRANSACTIONS, page: 1, pageSize: 20, totalCount: MOCK_TRANSACTIONS.length };
  // Production: return api.get<PaginatedResult<Transaction>>("/transactions?recent=1", token);
}

const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: "txn_9001",
    reference: "FLW-8821AX",
    customerName: "Adeola Okafor",
    customerId: "cus_1001",
    merchantName: "Shoprite — Ikeja",
    amountKobo: 2_000_000,
    status: "success",
    timestamp: "2026-06-20T10:03:30Z",
  },
  {
    id: "txn_9002",
    reference: "FLW-7732BZ",
    customerName: "Musa Ibrahim",
    customerId: "cus_1003",
    merchantName: "Total Filling Station",
    amountKobo: 15_000_000,
    status: "success",
    timestamp: "2026-06-20T09:45:12Z",
  },
  {
    id: "txn_9003",
    reference: "FLW-4410CR",
    customerName: "Chidinma Eze",
    customerId: "cus_1002",
    merchantName: "Market Square Foods",
    amountKobo: 4_500_000,
    status: "failed",
    timestamp: "2026-06-20T09:12:05Z",
  },
  {
    id: "txn_9004",
    reference: "FLW-1129DT",
    customerName: "Lana Adesanya",
    customerId: "cus_1004",
    merchantName: "Jumia Express",
    amountKobo: 2_400_000,
    status: "success",
    timestamp: "2026-06-20T08:30:00Z",
  },
];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}