import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UserPlus, ArrowRight, TrendingUp } from "lucide-react";
import { LiveLedgerStrip } from "@milipay/shared/components/layout/LiveLedgerStrip";
import { Card } from "@milipay/shared/components/ui/Card";
import { Skeleton } from "@milipay/shared/components/ui/Skeleton";
import { LoadingSpinner } from "@milipay/shared/components/ui/LoadingSpinner";
import { WeeklyRegistrationsChart } from "@milipay/shared/components/dashboard/WeeklyRegistrationsChart";
import { ROUTES } from "@milipay/shared/lib/constants";
import { fetchDashboardStats, fetchRecentTransactions } from "@milipay/shared/features/transactions/api";
import { formatNaira } from "@milipay/shared/lib/utils/format";
import type { Transaction } from "@milipay/shared/types";

export default function Overview() {
  const [stats, setStats] = useState<{
    totalCustomers: number;
    transactionsToday: number;
    volumeMTD: number;
    dailyRegistrations: number[];
    pendingKYC: number;
    activeStaff: number;
    inFlight: number;
  } | null>(null);

  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [statsData, txnsData] = await Promise.all([
          fetchDashboardStats(),
          fetchRecentTransactions()
        ]);
        if (!cancelled) {
          setStats(statsData);
          setRecentTransactions(txnsData.items);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadData();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-8 animate-rise-in">
      <div>
        <h1 className="text-2xl font-display font-semibold text-ink tracking-tight">Dashboard</h1>
        <p className="text-sm text-ink-muted mt-1">
          {new Date().toLocaleDateString("en-NG", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Volume this month"
          value={isLoading ? "" : formatNaira(stats!.volumeMTD)}
          isLoading={isLoading}
        />
        <StatCard
          label="Transactions today"
          value={isLoading ? "" : new Intl.NumberFormat().format(stats!.transactionsToday)}
          isLoading={isLoading}
          href={ROUTES.transactions}
        />
        {/* Money taken, nothing delivered. Replaces a "System Health 99.98%"
            tile that was a hardcoded number nobody measured. */}
        <StatCard
          label="In flight"
          value={isLoading ? "" : new Intl.NumberFormat().format(stats!.inFlight)}
          hint={!isLoading && stats!.inFlight > 0 ? "awaiting delivery" : undefined}
          isLoading={isLoading}
          href={ROUTES.operations}
          highlightWarn={!isLoading && stats!.inFlight > 0}
        />
        <StatCard
          label="Awaiting approval"
          value={isLoading ? "" : new Intl.NumberFormat().format(stats!.pendingKYC)}
          isLoading={isLoading}
          href={ROUTES.customers}
          highlightWarn={!isLoading && stats!.pendingKYC > 0}
        />
        <StatCard
          label="Customers"
          value={isLoading ? "" : new Intl.NumberFormat().format(stats!.totalCustomers)}
          isLoading={isLoading}
          href={ROUTES.customers}
        />
        <StatCard
          label="Staff"
          value={isLoading ? "" : new Intl.NumberFormat().format(stats!.activeStaff)}
          isLoading={isLoading}
          href={ROUTES.staff}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <Link
              to={ROUTES.registerCustomer}
              className="group flex items-center justify-between p-5 rounded-lg border border-ledger-line bg-ledger-raised hover:border-signal/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-signal/10 text-signal-bright flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink group-hover:text-signal-bright transition-colors">Register customer</p>
                  <p className="text-xs text-ink-muted mt-0.5">Capture biometrics and submit for approval</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-ink-faint group-hover:text-signal-bright transition-colors" />
            </Link>

            <Link
              to={ROUTES.transactions}
              className="group flex items-center justify-between p-5 rounded-lg border border-ledger-line bg-ledger-raised hover:border-signal/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-white/[0.04] text-ink flex items-center justify-center">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink group-hover:text-signal-bright transition-colors">View transactions</p>
                  <p className="text-xs text-ink-muted mt-0.5">Every payment across the platform</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-ink-faint group-hover:text-signal-bright transition-colors" />
            </Link>
          </div>

          <WeeklyRegistrationsChart
            data={stats?.dailyRegistrations}
            isLoading={isLoading}
          />
        </div>

        <div className="lg:col-span-1">
          {isLoading ? (
            <Card raised className="h-full min-h-[400px] flex flex-col items-center justify-center gap-3 p-6 text-center">
              <LoadingSpinner size="lg" />
              <p className="text-xs text-ink-muted font-medium">Loading recent activity…</p>
            </Card>
          ) : (
            <LiveLedgerStrip transactions={recentTransactions} />
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  isLoading,
  highlightWarn,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  isLoading?: boolean;
  highlightWarn?: boolean;
  href?: string;
}) {
  const content = (
    <Card
      raised
      className={`p-5 h-full flex flex-col ${href ? "hover:border-signal/50 transition-colors" : ""}`}
    >
      <p className="text-xs font-medium text-ink-muted tracking-wide">{label}</p>
      {isLoading ? (
        <Skeleton className="h-8 w-24 mt-2" />
      ) : (
        <p
          className={`mt-2 text-2xl font-data font-semibold tabular-nums tracking-tight ${
            highlightWarn ? "text-status-warn" : "text-ink"
          }`}
        >
          {value}
        </p>
      )}
      {hint && !isLoading ? (
        <p className="text-[11px] text-ink-faint mt-1">{hint}</p>
      ) : null}
    </Card>
  );

  if (href) {
    return <Link to={href} className="block h-full">{content}</Link>;
  }
  return content;
}