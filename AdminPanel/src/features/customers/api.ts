import type { Customer, CustomerDraft, PaginatedResult } from "@/types";

export async function fetchCustomers(page = 1): Promise<PaginatedResult<Customer>> {
  return mockFetchCustomers(page);
  // Production: return api.get<PaginatedResult<Customer>>(`/customers?page=${page}`, token);
}

export async function registerCustomer(
  draft: CustomerDraft
): Promise<{ customerId: string }> {
  return mockRegisterCustomer(draft);
  // Production: return api.post<{ customerId: string }>("/customers", draft, token);
}

// ───────────────────────── Mock implementation ─────────────────────────

const MOCK_CUSTOMERS: Customer[] = [
  {
    id: "cus_1001",
    fullName: "Adeola Okafor",
    phone: "08012345678",
    email: "adeola@example.com",
    bvnLast4: "4821",
    ninLast4: "1190",
    state: "Lagos",
    status: "active",
    fingerprintCapturedAt: "2026-06-18T09:12:00Z",
    linkedAccountCount: 2,
    createdAt: "2026-06-18T09:00:00Z",
  },
  {
    id: "cus_1002",
    fullName: "Chidinma Eze",
    phone: "08134567890",
    bvnLast4: "7732",
    ninLast4: "0098",
    state: "Rivers",
    status: "pending",
    fingerprintCapturedAt: "2026-06-19T14:30:00Z",
    linkedAccountCount: 0,
    createdAt: "2026-06-19T14:25:00Z",
  },
  {
    id: "cus_1003",
    fullName: "Musa Ibrahim",
    phone: "07098765432",
    email: "musa.i@example.com",
    bvnLast4: "5510",
    ninLast4: "3387",
    state: "Kano",
    status: "active",
    fingerprintCapturedAt: "2026-06-15T11:05:00Z",
    linkedAccountCount: 1,
    createdAt: "2026-06-15T11:00:00Z",
  },
];

async function mockFetchCustomers(page: number): Promise<PaginatedResult<Customer>> {
  await delay(300);
  return { items: MOCK_CUSTOMERS, page, pageSize: 20, totalCount: MOCK_CUSTOMERS.length };
}

async function mockRegisterCustomer(
  draft: CustomerDraft
): Promise<{ customerId: string }> {
  await delay(900);
  if (!draft.fingerprintCaptured) {
    throw new Error("Fingerprint capture is required before registration.");
  }
  return { customerId: `cus_${Math.floor(Math.random() * 100000)}` };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}