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
    systemHealth: number;
    dailyRegistrations: number[];
    pendingKYC: number;
    activeStaff: number;
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
    <div className="p-4 sm:p-6 md:p-10 max-w-6xl mx-auto space-y-6 sm:space-y-8 animate-rise-in">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-display font-bold text-ink">Dashboard</h1>
        <p className="text-sm text-ink-muted mt-1">Network status and recent activity.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        <StatCard 
          label="Total Customers" 
          value={isLoading ? "" : new Intl.NumberFormat().format(stats!.totalCustomers)} 
          isLoading={isLoading}
          href={ROUTES.customers}
        />
        <StatCard 
          label="Pending KYC" 
          value={isLoading ? "" : new Intl.NumberFormat().format(stats!.pendingKYC)} 
          isLoading={isLoading}
          href={ROUTES.customers}
          highlightWarn={!isLoading && stats!.pendingKYC > 0}
        />
        <StatCard 
          label="Active Staff" 
          value={isLoading ? "" : new Intl.NumberFormat().format(stats!.activeStaff)} 
          isLoading={isLoading}
          href={ROUTES.staff}
        />
        <StatCard 
          label="Transactions Today" 
          value={isLoading ? "" : new Intl.NumberFormat().format(stats!.transactionsToday)} 
          isLoading={isLoading}
          href={ROUTES.transactions}
        />
        <StatCard 
          label="Volume (MTD)" 
          value={isLoading ? "" : formatNaira(stats!.volumeMTD)} 
          isLoading={isLoading}
        />
        <StatCard 
          label="System Health" 
          value={isLoading ? "" : `${stats!.systemHealth}%`} 
          isLoading={isLoading}
          highlight 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <Link 
              to={ROUTES.registerCustomer}
              className="group flex items-center justify-between p-4 sm:p-5 rounded-xl border border-ledger-line bg-ledger-raised hover:border-signal/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-signal/10 text-signal-bright flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink group-hover:text-signal-bright transition-colors">Register customer</p>
                  <p className="text-xs text-ink-muted mt-0.5">Enroll a new user</p>
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
                  <p className="text-xs text-ink-muted mt-0.5">Monitor network traffic</p>
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
              <p className="text-xs text-ink-muted font-medium">Streaming live ledger...</p>
            </Card>
          ) : (
            <LiveLedgerStrip transactions={recentTransactions} />
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, isLoading, highlight, highlightWarn, href }: { label: string; value: string; isLoading?: boolean; highlight?: boolean; highlightWarn?: boolean; href?: string }) {
  const content = (
    <Card raised className={`p-5 h-full ${href ? "hover:border-signal/50 transition-colors" : ""}`}>
      <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">{label}</p>
      {isLoading ? (
        <Skeleton className="h-7 w-20 my-0.5" />
      ) : (
        <p className={`text-2xl font-display font-bold ${highlight ? "text-status-ok" : highlightWarn ? "text-status-warning" : "text-ink"}`}>
          <span className={(highlight || highlightWarn) ? "" : "font-data tracking-tight"}>{value}</span>
        </p>
      )}
    </Card>
  );

  if (href) {
    return <Link to={href} className="block h-full">{content}</Link>;
  }
  return content;
}