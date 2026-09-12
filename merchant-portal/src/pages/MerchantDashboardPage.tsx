import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  TrendingUp,
  Receipt,
  Cpu,
  ArrowDownRight,
  ShieldCheck,
  ShieldAlert,
  Building2,
  RefreshCw,
  UserCheck,
  Percent,
  ExternalLink,
} from "lucide-react";
import { Button } from "@milipay/shared/components/ui/Button";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import {
  fetchCurrentMerchantProfile,
  fetchMerchantTransactions,
} from "@milipay/shared/features/merchants/merchantService";
import type { Merchant, POSTerminal, MerchantTransaction } from "@milipay/shared/types";
import { TerminalDetailsModal } from "@milipay/shared/pages/merchants/TerminalDetailsModal";

export default function MerchantDashboardPage() {
  const navigate = useNavigate();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [terminals, setTerminals] = useState<POSTerminal[]>([]);
  const [transactions, setTransactions] = useState<MerchantTransaction[]>([]);
  const [selectedTerminal, setSelectedTerminal] = useState<POSTerminal | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const profile = await fetchCurrentMerchantProfile();
      setMerchant(profile.merchant);
      setTerminals(profile.terminals);

      const txs = await fetchMerchantTransactions(profile.merchant.id);
      setTransactions(txs);
    } catch (err) {
      console.error("Failed to load merchant dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="p-12">
        <LoadingState title="Loading Store Dashboard" description="Synchronizing sales ledger and hardware status..." />
      </div>
    );
  }

  if (!merchant) {
    return (
      <div className="p-12 text-center max-w-md mx-auto">
        <Building2 className="w-10 h-10 text-ink-faint mx-auto mb-3" />
        <h2 className="text-xl font-bold text-white mb-2">Merchant Record Not Found</h2>
        <p className="text-xs text-ink-muted mb-4">
          No store details are linked to your current login credentials. Please contact your MiliPay Field Agent or Support.
        </p>
        <Button variant="secondary" onClick={() => loadDashboardData()}>
          Try Again
        </Button>
      </div>
    );
  }

  const grossVolume = transactions.reduce((s, t) => s + (t.status === "success" ? t.amount : 0), 0);
  const platformFees = transactions.reduce((s, t) => s + (t.status === "success" ? t.platformFee : 0), 0);
  const netSettlement = grossVolume - platformFees;
  const activeTerminalsCount = terminals.filter((t) => t.isActive).length;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8 animate-rise-in">
      {/* Top Banner & Audit Trail */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-signal-bright font-mono">
              Store Dashboard
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                merchant.status === "active"
                  ? "bg-status-ok/10 text-status-ok border border-status-ok/20"
                  : merchant.status === "blacklisted"
                  ? "bg-status-fail/20 text-status-fail border border-status-fail/40"
                  : "bg-status-warn/10 text-status-warn border border-status-warn/20"
              }`}
            >
              {merchant.status === "active" ? (
                <>
                  <ShieldCheck className="w-3 h-3" /> Verified Merchant
                </>
              ) : merchant.status === "blacklisted" ? (
                <>
                  <ShieldAlert className="w-3 h-3 text-status-fail" /> Blacklisted
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3 h-3 text-status-warn" /> Suspended
                </>
              )}
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold text-white tracking-tight">
            {merchant.businessName}
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            {merchant.address}, {merchant.state} &bull; Category: <span className="uppercase text-ink font-semibold">{merchant.category}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={loadDashboardData}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button variant="primary" onClick={() => navigate("/transactions")}>
            <Receipt className="w-4 h-4 mr-2" /> View Transactions
          </Button>
        </div>
      </div>

      {/* Blacklist Alert Banner */}
      {merchant.status === "blacklisted" && (
        <div className="bg-status-fail/10 border border-status-fail/30 rounded-xl p-4 flex items-center gap-3 text-status-fail text-xs">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <div>
            <strong className="font-semibold block">Store Under Administrative Blacklist</strong>
            Your merchant processing account and linked POS scanners are currently locked down. Please contact MiliPay compliance support.
          </div>
        </div>
      )}

      {/* Audit Trail Row */}
      <div className="bg-ledger-raised border border-white/[0.06] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-signal/10 flex items-center justify-center shrink-0">
            <UserCheck className="w-4 h-4 text-signal-bright" />
          </div>
          <div>
            <span className="text-ink-muted text-[11px] uppercase tracking-wider block font-semibold">
              Onboarded Audit Trail
            </span>
            <span className="text-white font-medium">
              Registered by <strong className="text-signal-bright">{merchant.onboardedByName || "MiliPay Staff"}</strong>
              {merchant.onboardedByRole && (
                <span className="ml-2 px-1.5 py-0.2 rounded text-[10px] bg-signal/10 text-signal border border-signal/20 font-mono uppercase">
                  {merchant.onboardedByRole}
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="text-ink-muted text-xs font-mono">
          Settlement Rail: <span className="text-white font-semibold">{merchant.settlementBankName} ({merchant.settlementAccountNumber})</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Gross Sales Volume</span>
            <TrendingUp className="w-4 h-4 text-signal-bright" />
          </div>
          <div className="text-2xl font-bold font-data text-white">
            &#8358;{grossVolume.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-ink-muted mt-1 font-mono">{transactions.length} payments debited</p>
        </div>

        <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Net Settled to Bank</span>
            <ArrowDownRight className="w-4 h-4 text-status-ok" />
          </div>
          <div className="text-2xl font-bold font-data text-status-ok">
            &#8358;{netSettlement.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-status-ok mt-1 font-mono">98.5% DirectPay NIBSS payout</p>
        </div>

        <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Platform Take-Rate</span>
            <Percent className="w-4 h-4 text-ink-faint" />
          </div>
          <div className="text-2xl font-bold font-data text-ink-muted">
            &#8358;{platformFees.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-ink-muted mt-1 font-mono">{merchant.platformFeePercent}% MiliPay commission</p>
        </div>

        <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">POS Terminals</span>
            <Cpu className="w-4 h-4 text-signal-bright" />
          </div>
          <div className="text-2xl font-bold font-data text-white">
            {activeTerminalsCount} / {terminals.length}
          </div>
          <p className="text-xs text-ink-muted mt-1 font-mono">Active palm scanners deployed</p>
        </div>
      </div>

      {/* POS Terminals Strip */}
      <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.05]">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-4 h-4 text-signal-bright" />
            <h3 className="font-bold text-base text-white">Paired POS Hardware</h3>
          </div>
          <Link to="/terminals" className="text-xs text-signal hover:underline flex items-center gap-1 font-semibold">
            Manage All Terminals <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        {terminals.length === 0 ? (
          <p className="text-xs text-ink-muted text-center py-4">
            No POS terminals are paired to your store yet. Contact your Field Agent to pair an HFSecurity scanner.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {terminals.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedTerminal(t)}
                className="bg-white/[0.02] border border-white/[0.06] hover:border-signal/40 p-4 rounded-xl cursor-pointer transition-all group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold text-signal-bright text-sm group-hover:text-white transition-colors">
                    {t.terminalId}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      t.isActive
                        ? "bg-status-ok/10 text-status-ok border border-status-ok/20"
                        : "bg-status-fail/10 text-status-fail border border-status-fail/20"
                    }`}
                  >
                    {t.isActive ? "Online" : "Disabled"}
                  </span>
                </div>
                <p className="text-xs text-white font-medium">{t.deviceModel}</p>
                <div className="flex justify-between items-center text-[11px] text-ink-muted mt-2 pt-2 border-t border-white/[0.04] font-mono">
                  <span>S/N: {t.deviceSerialNumber}</span>
                  <span className="text-signal group-hover:underline">View History &rarr;</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Transactions Table */}
      <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl overflow-hidden shadow-xl space-y-4">
        <div className="p-6 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Receipt className="w-4 h-4 text-signal-bright" />
            <h3 className="font-bold text-base text-white">Recent Palm Biometric Payments</h3>
          </div>
          <Link to="/transactions" className="text-xs text-signal hover:underline flex items-center gap-1 font-semibold">
            View All ({transactions.length}) <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        {transactions.length === 0 ? (
          <div className="p-10 text-center">
            <Receipt className="w-8 h-8 text-ink-faint mx-auto mb-2" />
            <p className="text-sm text-white font-medium">No Sales Transactions Yet</p>
            <p className="text-xs text-ink-muted mt-1">
              Payments initiated on your POS terminals will automatically show here in real-time.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.02] border-b border-white/[0.06] font-mono text-[11px] text-ink-muted uppercase">
                <tr>
                  <th className="py-3 px-6">Reference</th>
                  <th className="py-3 px-6">Terminal</th>
                  <th className="py-3 px-6">Gross Sale</th>
                  <th className="py-3 px-6">Fee ({merchant.platformFeePercent}%)</th>
                  <th className="py-3 px-6">Net Payout</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {transactions.slice(0, 8).map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-6 font-mono text-signal-bright font-medium">
                      {tx.reference}
                    </td>
                    <td className="py-3 px-6 font-mono text-ink-muted">
                      {tx.terminalId || "Direct"}
                    </td>
                    <td className="py-3 px-6 font-bold font-data text-white">
                      &#8358;{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-6 font-data text-ink-muted">
                      &#8358;{tx.platformFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-6 font-bold font-data text-status-ok">
                      &#8358;{tx.netPayout.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-6">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          tx.status === "success"
                            ? "bg-status-ok/10 text-status-ok border border-status-ok/20"
                            : "bg-status-fail/10 text-status-fail border border-status-fail/20"
                        }`}
                      >
                        {tx.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right font-mono text-ink-muted text-[11px]">
                      {new Date(tx.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Terminal Details & Transactions Modal */}
      <TerminalDetailsModal
        terminal={selectedTerminal}
        isOpen={!!selectedTerminal}
        onClose={() => setSelectedTerminal(null)}
      />
    </div>
  );
}
