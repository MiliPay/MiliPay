import type { PalmEnrolment } from "../features/biometrics/palmScanner";

export type { PalmEnrolment };

export type Role = "agent" | "admin" | "super_admin" | "support" | "merchant";

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
  portalUrl: string;
  portalName: string;
  /** Whether the one-time password reached the staff member's phone. */
  delivered: boolean;
  deliveryChannel: "whatsapp" | "sms" | "console" | null;
  message: string;
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
  kycTier?: 1 | 2 | 3;
  pinThreshold?: number;
  /** Customer's own caps. undefined means the tier default applies. */
  singleLimit?: number;
  dailyLimit?: number;
  dateOfBirth?: string;
  gender?: "male" | "female";
  bvnLast4?: string;
  /**
   * Presence flags, not the templates. The raw palm-vein and facial templates
   * are withheld from portal sessions at the column level.
   */
  hasPalmTemplate?: boolean;
  hasFaceTemplate?: boolean;
  palmSimulated?: boolean;
  faceSimulated?: boolean;
  ninVerified?: boolean;
  bvnVerified?: boolean;
  mustChangePassword?: boolean;
  passwordDeliveryChannel?: string;
  passwordDeliveryStatus?: string;
  passwordDeliveredAt?: string;
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

export interface TierLimitConfig {
  tier: 1 | 2 | 3;
  name: string;
  badge: string;
  maxSingleTxn: number;
  defaultPinThreshold: number;
  maxDailyVolume: number;
  isAvailable: boolean;
  qualification: string;
}

export const TIER_LIMITS: Record<number, TierLimitConfig> = {
  1: {
    tier: 1,
    name: "Tier 1",
    badge: "Basic",
    maxSingleTxn: 50_000,
    defaultPinThreshold: 10_000,
    maxDailyVolume: 200_000,
    isAvailable: true,
    qualification: "Phone & basic profile",
  },
  2: {
    tier: 2,
    name: "Tier 2",
    badge: "Enrolled",
    maxSingleTxn: 150_000,
    defaultPinThreshold: 10_000,
    maxDailyVolume: 500_000,
    isAvailable: true,
    qualification: "NIN + Palm Scan Confirmed",
  },
  3: {
    tier: 3,
    name: "Tier 3",
    badge: "Enterprise",
    maxSingleTxn: 250_000,
    defaultPinThreshold: 10_000,
    maxDailyVolume: 1_000_000,
    isAvailable: false,
    qualification: "BVN Verification & Verified Address (Coming Soon)",
  },
};

export interface CustomerRegistrationResult {
  customerId: string;
  status: CustomerStatus;
  requiresAdminVerification: boolean;
  kycTier: 1 | 2 | 3;
  ninVerified: boolean;
  /** "simulated" until a live NIMC/Mono lookup is configured. */
  ninVerificationMode: "simulated" | "live";
  bvnVerified: boolean;
}

export type IdentityVerificationStatus = "verified" | "failed" | "unavailable";

export interface IdentityVerificationResult {
  verificationId: string;
  status: IdentityVerificationStatus;
  mode: "simulated" | "live";
  simulated: boolean;
  matchedName: string | null;
  failureReason: string | null;
}

export type TransactionStatus = "success" | "failed" | "pending";

export interface Transaction {
  id: string;
  reference: string;
  customerName: string;
  customerId: string;
  merchantName: string;
  amountNgn: number; // NAIRA, numeric(12,2). Never kobo — see the currency invariant in GEMINI.md.
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
  /** Optional at enrolment. Required for Tier 3 once that opens. */
  bvn: string;
  phone: string;
  email: string;
  address: string;
  state: string;
  palmVeinTemplate: string;
  /**
   * Everything RegisterPalm returned. palmVeinTemplate above is the legacy
   * single string, kept until customers.palm_vein_template is retired.
   */
  palmEnrolment?: PalmEnrolment;
  faceTemplate: string;
  /** Result of the pre-submit NIN check, for display only. The server re-checks. */
  ninVerification?: IdentityVerificationResult;
}

export const EMPTY_CUSTOMER_DRAFT: CustomerDraft = {
  fullName: "",
  dateOfBirth: "",
  gender: "",
  nin: "",
  bvn: "",
  phone: "",
  email: "",
  address: "",
  state: "",
  palmVeinTemplate: "",
  palmEnrolment: undefined,
  faceTemplate: "",
  ninVerification: undefined,
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

// --- Merchant & POS Hardware Types ---

export type MerchantCategory =
  | "supermarket"
  | "retail"
  | "dining"
  | "fuel"
  | "pharmacy"
  | "services"
  | "other";

export type MerchantStatus = "pending" | "active" | "suspended" | "blacklisted";
export type SettlementSchedule = "instant" | "daily_eod";

export interface Merchant {
  id: string;
  businessName: string;
  category: MerchantCategory;
  address: string;
  state: string;
  cacRcNumber?: string;
  directorName: string;
  directorPhone: string;
  directorBvn?: string;
  settlementBankName: string;
  settlementBankCode: string;
  settlementAccountNumber: string;
  settlementAccountName: string;
  monoSubaccountId?: string;
  platformFeePercent: number;
  settlementSchedule: SettlementSchedule;
  status: MerchantStatus;
  email?: string;
  authUserId?: string;
  onboardedBy?: string;
  onboardedByName?: string;
  onboardedByEmail?: string;
  onboardedByRole?: string;
  createdAt: string;
  updatedAt: string;
  terminalCount?: number;
  activeTerminalCount?: number;
  totalVolumeNgn?: number;
}

export interface POSTerminal {
  id: string;
  terminalId: string;
  merchantId: string;
  merchantName?: string;
  deviceSerialNumber: string;
  deviceModel: string;
  isActive: boolean;
  lastHeartbeat?: string;
  assignedBy?: string;
  assignedByName?: string;
  assignedByEmail?: string;
  assignedByRole?: string;
  createdAt: string;
  transactionCount?: number;
  totalVolumeNgn?: number;
}

export interface MerchantDraft {
  businessName: string;
  category: MerchantCategory;
  address: string;
  state: string;
  cacRcNumber: string;
  directorName: string;
  directorPhone: string;
  directorBvn: string;
  email: string;
  password?: string;
  settlementBankName: string;
  settlementBankCode: string;
  settlementAccountNumber: string;
  settlementAccountName: string;
  platformFeePercent: number;
  settlementSchedule: SettlementSchedule;
  terminalId?: string;
  deviceSerialNumber?: string;
  deviceModel?: string;
}

export interface MerchantCredentials {
  email: string;
  portalUrl: string;
  /** Whether the one-time password reached the director's phone. */
  delivered: boolean;
  deliveryChannel: "whatsapp" | "sms" | "console" | null;
}

export interface MerchantTransaction {
  id: string;
  reference: string;
  amount: number;
  platformFee: number;
  netPayout: number;
  terminalId?: string;
  merchantId: string;
  merchantName: string;
  status: TransactionStatus;
  timestamp: string;
}
