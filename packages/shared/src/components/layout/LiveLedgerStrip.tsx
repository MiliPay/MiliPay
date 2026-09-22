import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Transaction } from "@milipay/shared/types";
import { formatNaira } from "@milipay/shared/lib/utils/format";
import { isFailed, isSettled } from "@milipay/shared/lib/transactionStatus";

interface LiveLedgerStripProps {
  transactions: Transaction[];
}

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
          <Link
            key={txn.id}
            to={`/dashboard/transactions/${txn.id}`}
            className="flex items-center justify-between px-4 py-3 animate-tick-in hover:bg-white/[0.02] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isSettled(txn.status)
                    ? "bg-status-ok"
                    : isFailed(txn.status)
                    ? "bg-status-fail"
                    : "bg-status-warn"
                }`}
              />
              <span className="text-sm text-ink truncate group-hover:text-signal-bright transition-colors">{txn.customerName}</span>
              <span className="text-xs text-ink-faint truncate hidden sm:inline">
                → {txn.merchantName}
              </span>
            </div>
            <span className="font-data text-sm text-ink-muted shrink-0 ml-3">
              {formatNaira(txn.amountNgn)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}