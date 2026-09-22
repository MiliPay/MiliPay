import type { CustomerStatus, TransactionStatus } from "@milipay/shared/types";
import { presentTransactionStatus } from "@milipay/shared/lib/transactionStatus";

type Status = CustomerStatus | TransactionStatus;

const TONE_CLASSES = {
  ok: { dot: "bg-status-ok", text: "text-status-ok" },
  warn: { dot: "bg-status-warn", text: "text-status-warn" },
  fail: { dot: "bg-status-fail", text: "text-status-fail" },
  info: { dot: "bg-status-info", text: "text-status-info" },
  muted: { dot: "bg-ink-faint", text: "text-ink-muted" },
} as const;

const CUSTOMER_CONFIG: Record<CustomerStatus, { label: string; tone: keyof typeof TONE_CLASSES }> = {
  active: { label: "Active", tone: "ok" },
  pending: { label: "Pending", tone: "warn" },
  suspended: { label: "Suspended", tone: "fail" },
  rejected: { label: "Rejected", tone: "fail" },
};

/**
 * This used to hold one flat map of six labels — active, success, pending,
 * suspended, failed, rejected — and fall back to "Pending" on a miss. Three of
 * those six are values the transactions table cannot contain, and none of the
 * eleven it can contain were in the map, so every transaction in every portal
 * rendered as "Pending": delivered ones, failed ones and quarantined ones
 * alike. A failed payment shown as merely slow is the worst of those.
 */
export function StatusBadge({ status }: { status: Status }) {
  const config =
    status in CUSTOMER_CONFIG
      ? CUSTOMER_CONFIG[status as CustomerStatus]
      : presentTransactionStatus(status);

  const tone = TONE_CLASSES[config.tone];

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${tone.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
      {config.label}
    </span>
  );
}
