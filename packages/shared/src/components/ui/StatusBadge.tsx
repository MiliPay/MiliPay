import type { ReactNode } from "react";
import type { CustomerStatus, TransactionStatus } from "@milipay/shared/types";
import { presentTransactionStatus } from "@milipay/shared/lib/transactionStatus";

type Status = CustomerStatus | TransactionStatus;
export type Tone = "ok" | "warn" | "fail" | "info" | "muted";

/** Background and text for each tone (design handoff TONE). */
export const TONE_CLASSES: Record<Tone, string> = {
  ok: "bg-brand-soft text-brand-text",
  warn: "bg-warn-soft text-warn",
  fail: "bg-fail-soft text-fail",
  info: "bg-info-soft text-info",
  muted: "bg-chip text-muted",
};

const CUSTOMER_CONFIG: Record<CustomerStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "ok" },
  pending: { label: "Pending review", tone: "warn" },
  suspended: { label: "Suspended", tone: "fail" },
  rejected: { label: "Rejected", tone: "muted" },
};

/**
 * A status pill: a dot and a word on a soft tint, never colour alone.
 * `size="lg"` is the larger pill in drawer and page headers; `pulse` makes
 * the dot beat, for something live (an online terminal).
 */
export function Pill({ tone, children, size = "md", pulse }: { tone: Tone; children: ReactNode; size?: "md" | "lg"; pulse?: boolean }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full font-semibold ${TONE_CLASSES[tone]} ${
        size === "lg" ? "gap-1.5 px-[11px] py-[5px] text-[13px]" : "gap-1.5 px-[9px] py-[3px] text-xs"
      }`}
    >
      <span className={`rounded-full bg-current ${size === "lg" ? "h-[7px] w-[7px]" : "h-1.5 w-1.5"}${pulse ? " animate-pulse-dot" : ""}`} aria-hidden="true" />
      {children}
    </span>
  );
}

/**
 * This used to hold one flat map of six labels — active, success, pending,
 * suspended, failed, rejected — and fall back to "Pending" on a miss. Three of
 * those six are values the transactions table cannot contain, and none of the
 * eleven it can contain were in the map, so every transaction in every portal
 * rendered as "Pending": delivered ones, failed ones and quarantined ones
 * alike. A failed payment shown as merely slow is the worst of those.
 */
export function StatusBadge({ status, size }: { status: Status; size?: "md" | "lg" }) {
  const config =
    status in CUSTOMER_CONFIG
      ? CUSTOMER_CONFIG[status as CustomerStatus]
      : presentTransactionStatus(status);

  return (
    <Pill tone={config.tone} size={size}>
      {config.label}
    </Pill>
  );
}
