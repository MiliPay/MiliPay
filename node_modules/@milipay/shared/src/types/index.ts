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

export const DEFAULT_REJECTION_REASONS = [
  "NIN Identity Mismatch: Name or Date of Birth does not match National Identity Database.",
  "Unclear Biometric Capture: Fingerprint scan quality is below standard threshold.",
  "Invalid Phone Number: Unable to reach customer via phone/SMS.",
  "Incomplete Residential Address: Street number or local government area missing.",
  "Duplicate Registration: Customer identity already exists in system.",
  "Other Reason",
] as const;

export interface Customer {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  phone: string;
  email?: string;
  address?: string;
  ninLast4: string;
  state: string;
  status: CustomerStatus;
  palmVeinTemplate?: string;
  linkedAccountCount: number;
  createdAt: string;
  authUserId?: string;
  registeredBy?: string;
  registeredByName?: string;
  registeredByEmail?: string;
  registeredByRole?: string;
  registeredByState?: string;
  verifiedBy?: string;
  verifiedByName?: string;
  verifiedByEmail?: string;
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
  palmVeinTemplate: string;
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
  palmVeinTemplate: "",
};

export type TicketStatus = "open" | "in_progress" | "resolved";
export type TicketUrgency = "low" | "medium" | "high" | "critical";

export interface SupportTicket {
  id: string;
  ticketId?: string;
  subject?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  issueDescription: string;
  status: TicketStatus;
  urgency: TicketUrgency;
  assignedTo?: string;
  assignedToName?: string;
  createdBy?: string;
  solvedBy?: string;
  isEscalated?: boolean;
  startedAt?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type MessageSenderType = "customer" | "staff" | "system";

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderId?: string;
  senderName?: string;
  senderType: MessageSenderType;
  content: string;
  createdAt: string;
}