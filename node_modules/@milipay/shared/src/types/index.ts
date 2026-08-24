export type Role = "agent" | "admin" | "super_admin" | "support";

export interface StaffUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: Role;
  nin?: string;
  ninLast4?: string;
}

export type StaffStatus = "active" | "suspended";

export interface StaffProfile extends StaffUser {
  status: StaffStatus;
  createdAt: string;
  state?: string; // e.g. Lagos, for agents
  registrationsCount?: number;
}

export interface CreatedStaffResult {
  profile: StaffProfile;
  tempPassword: string;
  portalUrl: string;
  portalName: string;
}

export type CustomerStatus = "pending" | "active" | "suspended" | "rejected";

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  ninLast4: string;
  state: string;
  status: CustomerStatus;
  capturedFingers: string[];
  linkedAccountCount: number;
  createdAt: string;
  authUserId?: string;
  registeredBy?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  rejectionReason?: string;
}

export interface CustomerRegistrationResult {
  customerId: string;
  status: CustomerStatus;
  tempPassword?: string;
  smsDispatched: boolean;
  requiresAdminVerification: boolean;
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
  nin: string;
  phone: string;
  email: string;
  address: string;
  state: string;
  capturedFingers: string[];
}

export const EMPTY_CUSTOMER_DRAFT: CustomerDraft = {
  fullName: "",
  dateOfBirth: "",
  gender: "",
  nin: "",
  phone: "",
  email: "",
  address: "",
  state: "",
  capturedFingers: [],
};