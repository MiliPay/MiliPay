import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UserPlus, ArrowRight, TrendingUp } from "lucide-react";
import { LiveLedgerStrip } from "@biopay/shared/components/layout/LiveLedgerStrip";
import { Card } from "@biopay/shared/components/ui/Card";
import { ROUTES } from "@biopay/shared/lib/constants";
import { fetchDashboardStats, fetchRecentTransactions } from "@biopay/shared/features/transactions/api";
import { formatNaira } from "@biopay/shared/lib/utils/format";
import type { Transaction } from "@biopay/shared/types";

export default function Overview() {
  const [stats, setStats] = useState<{
    totalCustomers: number;
    transactionsToday: number;
    volumeMTD: number;
    systemHealth: number;
    dailyRegistrations: number[];
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

  const maxReg = stats ? Math.max(...stats.dailyRegistrations, 1) : 1;

  // Build the last 7 day labels dynamically (e.g. "Mon", "Tue", ...)
  const dayLabels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayLabels.push(d.toLocaleDateString("en-US", { weekday: "short" }));
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-8 animate-rise-in">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-ink">Overview</h1>
        <p className="text-ink-muted mt-1">Network status and recent activity.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          label="Total Customers" 
          value={isLoading ? "-" : new Intl.NumberFormat().format(stats!.totalCustomers)} 
          href={ROUTES.customers}
        />
        <StatCard 
          label="Transactions Today" 
          value={isLoading ? "-" : new Intl.NumberFormat().format(stats!.transactionsToday)} 
          href={ROUTES.transactions}
        />
        <StatCard 
          label="Volume (MTD)" 
          value={isLoading ? "-" : formatNaira(stats!.volumeMTD)} 
        />
        <StatCard 
          label="System Health" 
          value={isLoading ? "-" : `${stats!.systemHealth}%`} 
          highlight 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

          <Card raised className="p-6 h-[220px] flex flex-col">
            <h2 className="text-sm font-display font-semibold text-ink mb-6">Registrations this week</h2>
            <div className="flex-1 flex items-stretch gap-2 sm:gap-4 relative">
              {isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-signal border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                dayLabels.map((day, i) => {
                  const val = stats!.dailyRegistrations[i];
                  const pct = (val / maxReg) * 100;
                  // Ensure non-zero values always show at least 8% height
                  const height = val > 0 ? `${Math.max(pct, 8)}%` : "0%";
                  return (
                    <div key={day + i} className="flex-1 flex flex-col items-center gap-2 group">
                      <div className="w-full flex-1 relative rounded-t overflow-hidden bg-white/5">
                        <div 
                          className="absolute bottom-0 left-0 right-0 bg-signal group-hover:bg-signal-bright transition-all duration-300 rounded-t"
                          style={{ height, minHeight: val > 0 ? "6px" : undefined }}
                        >
                          <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-data text-signal-bright bg-ledger-raised border border-ledger-line rounded px-1.5 py-0.5 pointer-events-none shadow-xl z-10">
                            {val}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider">{day}</span>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-1">
          {isLoading ? (
            <Card raised className="h-full min-h-[400px] flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-signal border-t-transparent rounded-full animate-spin" />
            </Card>
          ) : (
            <LiveLedgerStrip transactions={recentTransactions} />
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight, href }: { label: string; value: string; highlight?: boolean; href?: string }) {
  const content = (
    <Card raised className={`p-5 h-full ${href ? "hover:border-signal/50 transition-colors" : ""}`}>
      <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">{label}</p>
      <p className={`text-2xl font-display font-bold ${highlight ? "text-status-ok" : "text-ink"}`}>
        <span className={highlight ? "" : "font-data tracking-tight"}>{value}</span>
      </p>
    </Card>
  );

  if (href) {
    return <Link to={href} className="block h-full">{content}</Link>;
  }
  return content;
}