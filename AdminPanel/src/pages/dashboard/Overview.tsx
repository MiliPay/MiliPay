import { useEffect, useState } from "react";
import { Activity, CreditCard, TrendingUp, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { LiveLedgerStrip } from "@/components/layout/LiveLedgerStrip";
import { fetchRecentTransactions } from "@/features/transactions/api";
import type { Transaction } from "@/types";

export default function Overview() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchRecentTransactions().then((result) => {
      if (!cancelled) {
        setTransactions(result.items);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto animate-rise-in">
      <header className="mb-8">
        <h1 className="text-2xl font-display font-bold text-ink mb-1">Overview</h1>
        <p className="text-ink-muted text-sm">Registrations, transactions, and system status today.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Registered customers" value="21,489" delta="+6.2%" icon={<Users className="w-[18px] h-[18px]" />} />
        <StatCard label="Transactions today" value="14,912" delta="+12.5%" icon={<CreditCard className="w-[18px] h-[18px]" />} />
        <StatCard label="Volume (MTD)" value="₦289.4M" delta="+15%" icon={<TrendingUp className="w-[18px] h-[18px]" />} />
        <StatCard label="System health" value="99.98%" delta="Operational" icon={<Activity className="w-[18px] h-[18px]" />} good />
      </div>

      <h2 className="text-sm font-display font-semibold text-ink-muted uppercase tracking-wide mb-3">
        Recent activity
      </h2>
      {isLoading ? (
        <Card className="h-48 animate-pulse"><div /></Card>
      ) : (
        <LiveLedgerStrip transactions={transactions} />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  delta,
  icon,
  good,
}: {
  label: string;
  value: string;
  delta: string;
  icon: React.ReactNode;
  good?: boolean;
}) {
  return (
    <Card raised className="p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="w-9 h-9 rounded bg-white/[0.03] flex items-center justify-center text-signal-bright">
          {icon}
        </span>
        <span className={`text-xs font-semibold ${good ? "text-status-ok" : "text-ink-muted"}`}>
          {delta}
        </span>
      </div>
      <p className="text-2xl font-display font-bold text-ink font-data mb-0.5">{value}</p>
      <p className="text-xs text-ink-muted">{label}</p>
    </Card>
  );
}