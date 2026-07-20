import type { CustomerStatus, TransactionStatus } from "@biopay/shared/types";

type Status = CustomerStatus | TransactionStatus;

const STATUS_CONFIG: Record<Status, { label: string; dot: string; text: string }> = {
  active: { label: "Active", dot: "bg-status-ok", text: "text-status-ok" },
  success: { label: "Success", dot: "bg-status-ok", text: "text-status-ok" },
  pending: { label: "Pending", dot: "bg-status-warn", text: "text-status-warn" },
  suspended: { label: "Suspended", dot: "bg-status-fail", text: "text-status-fail" },
  failed: { label: "Failed", dot: "bg-status-fail", text: "text-status-fail" },
};

export function StatusBadge({ status }: { status: Status }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} aria-hidden="true" />
      {config.label}
    </span>
  );
}