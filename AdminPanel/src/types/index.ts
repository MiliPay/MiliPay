export type Role = "agent" | "admin" | "super_admin" | "support";

export interface StaffUser {
  id: string;
  fullName: string;
  phone: string;
  role: Role;
}

export type CustomerStatus = "pending" | "active" | "suspended";

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  bvnLast4: string;
  ninLast4: string;
  state: string;
  status: CustomerStatus;
  fingerprintCapturedAt: string | null;
  linkedAccountCount: number;
  createdAt: string;
}

export type TransactionStatus = "success" | "failed" | "pending";

export interface Transaction {
  id: string;
  reference: string;
  customerName: string;
  customerId: string;
  merchantName: string;
  amountKobo: number; // integer minor units — never a float
  status: TransactionStatus;
  timestamp: string;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface CustomerDraft {
  fullName: string;
  dateOfBirth: string;
  gender: "male" | "female" | "";
  bvn: string;
  nin: string;
  phone: string;
  email: string;
  address: string;
  state: string;
  fingerprintCaptured: boolean;
}

export const EMPTY_CUSTOMER_DRAFT: CustomerDraft = {
  fullName: "",
  dateOfBirth: "",
  gender: "",
  bvn: "",
  nin: "",
  phone: "",
  email: "",
  address: "",
  state: "",
  fingerprintCaptured: false,
};