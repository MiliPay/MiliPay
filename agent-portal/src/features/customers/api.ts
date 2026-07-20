import type { Customer, CustomerDraft, CustomerStatus, PaginatedResult } from "@biopay/shared/types";

interface FetchCustomersOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: CustomerStatus | "";
}

export async function fetchCustomers(
  options: FetchCustomersOptions = {}
): Promise<PaginatedResult<Customer>> {
  const { page = 1, pageSize = 10, search = "", status = "" } = options;
  return mockFetchCustomers(page, pageSize, search, status);
  // Production: return api.get<PaginatedResult<Customer>>(
  //   `/customers?page=${page}&pageSize=${pageSize}&search=${search}&status=${status}`, token
  // );
}

export async function registerCustomer(
  draft: CustomerDraft
): Promise<{ customerId: string }> {
  return mockRegisterCustomer(draft);
  // Production: return api.post<{ customerId: string }>("/customers", draft, token);
}

// ───────────────────────── Mock implementation ─────────────────────────

const DEFAULT_FINGERS = ["Left Thumb", "Left Index", "Right Thumb", "Right Index"];

const MOCK_CUSTOMERS: Customer[] = [
  {
    id: "cus_1001",
    fullName: "Adeola Okafor",
    phone: "08012345678",
    email: "adeola@example.com",
    ninLast4: "1190",
    state: "Lagos",
    status: "active",
    capturedFingers: DEFAULT_FINGERS,
    linkedAccountCount: 2,
    createdAt: "2026-06-18T09:00:00Z",
  },
  {
    id: "cus_1002",
    fullName: "Chidinma Eze",
    phone: "08134567890",
    ninLast4: "0098",
    state: "Rivers",
    status: "pending",
    capturedFingers: DEFAULT_FINGERS,
    linkedAccountCount: 0,
    createdAt: "2026-06-19T14:25:00Z",
  },
  {
    id: "cus_1003",
    fullName: "Musa Ibrahim",
    phone: "07098765432",
    email: "musa.i@example.com",
    ninLast4: "3387",
    state: "Kano",
    status: "active",
    capturedFingers: DEFAULT_FINGERS,
    linkedAccountCount: 1,
    createdAt: "2026-06-15T11:00:00Z",
  },
  {
    id: "cus_1004",
    fullName: "Lana Adesanya",
    phone: "08023456789",
    ninLast4: "4412",
    state: "Oyo",
    status: "active",
    capturedFingers: DEFAULT_FINGERS,
    linkedAccountCount: 3,
    createdAt: "2026-06-10T08:15:00Z",
  },
  {
    id: "cus_1005",
    fullName: "Emeka Obi",
    phone: "09067890123",
    email: "emeka.obi@example.com",
    ninLast4: "7781",
    state: "Anambra",
    status: "suspended",
    capturedFingers: DEFAULT_FINGERS,
    linkedAccountCount: 1,
    createdAt: "2026-05-28T16:30:00Z",
  },
  {
    id: "cus_1006",
    fullName: "Fatima Bello",
    phone: "08145678901",
    ninLast4: "5540",
    state: "Kaduna",
    status: "active",
    capturedFingers: DEFAULT_FINGERS,
    linkedAccountCount: 2,
    createdAt: "2026-06-22T13:00:00Z",
  },
  {
    id: "cus_1007",
    fullName: "Tunde Bakare",
    phone: "07034567890",
    ninLast4: "6632",
    state: "Lagos",
    status: "pending",
    capturedFingers: [],
    linkedAccountCount: 0,
    createdAt: "2026-07-01T10:20:00Z",
  },
  {
    id: "cus_1008",
    fullName: "Ngozi Anya",
    phone: "08156789012",
    email: "ngozi.a@example.com",
    ninLast4: "9923",
    state: "Enugu",
    status: "active",
    capturedFingers: DEFAULT_FINGERS,
    linkedAccountCount: 1,
    createdAt: "2026-06-25T07:45:00Z",
  },
  {
    id: "cus_1009",
    fullName: "Yakubu Danladi",
    phone: "09078901234",
    ninLast4: "2218",
    state: "Plateau",
    status: "active",
    capturedFingers: DEFAULT_FINGERS,
    linkedAccountCount: 2,
    createdAt: "2026-07-05T15:20:00Z",
  },
  {
    id: "cus_1010",
    fullName: "Blessing Effiong",
    phone: "08167890123",
    ninLast4: "3345",
    state: "Akwa Ibom",
    status: "pending",
    capturedFingers: [],
    linkedAccountCount: 0,
    createdAt: "2026-07-10T11:00:00Z",
  },
  {
    id: "cus_1011",
    fullName: "Adamu Sule",
    phone: "07045678901",
    ninLast4: "1104",
    state: "Borno",
    status: "active",
    capturedFingers: DEFAULT_FINGERS,
    linkedAccountCount: 1,
    createdAt: "2026-07-02T09:30:00Z",
  },
  {
    id: "cus_1012",
    fullName: "Oluwaseun Adeleke",
    phone: "08178901234",
    email: "seun.a@example.com",
    ninLast4: "8867",
    state: "Osun",
    status: "active",
    capturedFingers: DEFAULT_FINGERS,
    linkedAccountCount: 4,
    createdAt: "2026-06-30T14:00:00Z",
  },
];

async function mockFetchCustomers(
  page: number,
  pageSize: number,
  search: string,
  status: CustomerStatus | ""
): Promise<PaginatedResult<Customer>> {
  await delay(300);

  let filtered = MOCK_CUSTOMERS;

  if (status) {
    filtered = filtered.filter((c) => c.status === status);
  }

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.state.toLowerCase().includes(q)
    );
  }

  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return { items, page, pageSize, totalCount: filtered.length };
}

async function mockRegisterCustomer(
  draft: CustomerDraft
): Promise<{ customerId: string }> {
  await delay(900);
  if (draft.capturedFingers.length !== 4) {
    throw new Error("Exactly 4 fingers must be captured before registration.");
  }
  return { customerId: `cus_${Math.floor(Math.random() * 100000)}` };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}