import { useEffect, useState } from "react";
import type { Transaction } from "@/types";
import { formatNaira } from "@/lib/utils/format";

interface LiveLedgerStripProps {
  transactions: Transaction[];
}

/**
 * A thin ticking strip of live transaction activity — the one bold
 * visual idea on the dashboard. Modeled on a payments-rail ledger feed
 * rather than a generic "recent activity" card: it conveys throughput,
 * which matters more than any single transaction at this scale.
 */
export function LiveLedgerStrip({ transactions }: LiveLedgerStripProps) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    setVisibleCount(0);
    const timers = transactions.map((_, i) =>
      setTimeout(() => setVisibleCount((c) => Math.max(c, i + 1)), i * 120)
    );
    return () => timers.forEach(clearTimeout);
  }, [transactions]);

  return (
    <div className="border border-ledger-line rounded-lg bg-ledger-raised overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-ledger-line">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-signal opacity-60 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-signal" />
        </span>
        <span className="text-xs font-display font-semibold text-ink-muted uppercase tracking-wide">
          Live ledger
        </span>
      </div>

      <div className="divide-y divide-ledger-line">
        {transactions.slice(0, visibleCount).map((txn) => (
          <div
            key={txn.id}
            className="flex items-center justify-between px-4 py-3 animate-tick-in"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  txn.status === "success"
                    ? "bg-status-ok"
                    : txn.status === "failed"
                    ? "bg-status-fail"
                    : "bg-status-warn"
                }`}
              />
              <span className="text-sm text-ink truncate">{txn.customerName}</span>
              <span className="text-xs text-ink-faint truncate hidden sm:inline">
                → {txn.merchantName}
              </span>
            </div>
            <span className="font-data text-sm text-ink-muted shrink-0 ml-3">
              {formatNaira(txn.amountKobo)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}