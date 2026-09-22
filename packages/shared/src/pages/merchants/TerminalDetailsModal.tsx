import { useEffect, useState } from "react";
import {
  Cpu,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  Building2,
  Calendar,
  Receipt,
  RefreshCw,
  ArrowDownRight,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { Modal } from "@milipay/shared/components/ui/Modal";
import { Button } from "@milipay/shared/components/ui/Button";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { fetchTerminalTransactions } from "@milipay/shared/features/merchants/merchantService";
import type { POSTerminal, MerchantTransaction } from "@milipay/shared/types";

interface TerminalDetailsModalProps {
  terminal: POSTerminal | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleActive?: (terminal: POSTerminal) => Promise<void>;
}

export function TerminalDetailsModal({
  terminal,
  isOpen,
  onClose,
  onToggleActive,
}: TerminalDetailsModalProps) {
  const { user } = useAuth();
  const isAgent = user?.role === "agent";

  const [transactions, setTransactions] = useState<MerchantTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);

  const loadTransactions = async (termId: string) => {
    // Agents are strictly forbidden from viewing transaction history
    if (isAgent) {
      setTransactions([]);
      return;
    }
    try {
      setLoading(true);
      const data = await fetchTerminalTransactions(termId);
      setTransactions(data);
    } catch (err) {
      console.error("Failed to load terminal transactions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && terminal) {
      if (!isAgent) {
        loadTransactions(terminal.terminalId);
      } else {
        setTransactions([]);
      }
    } else {
      setTransactions([]);
    }
  }, [isOpen, terminal?.terminalId, isAgent]);

  if (!terminal) return null;

  const totalVolume = transactions.reduce((sum, t) => sum + (t.status === "success" ? t.amount : 0), 0);
  const totalFees = transactions.reduce((sum, t) => sum + (t.status === "success" ? t.platformFee : 0), 0);
  const netSettled = totalVolume - totalFees;

  const handleToggle = async () => {
    if (!onToggleActive) return;
    try {
      setToggling(true);
      await onToggleActive(terminal);
    } finally {
      setToggling(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isAgent ? `Terminal Specifications: ${terminal.terminalId}` : `Terminal Audit & Transactions: ${terminal.terminalId}`}
      size="2xl"
    >
      <div className="space-y-6 pb-2">
        {/* Top Info Banner & Audit Trail */}
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-white/[0.06]">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Cpu className="w-4 h-4 text-signal-bright" />
                <span className="font-mono text-base font-bold text-white tracking-wider">
                  {terminal.terminalId}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                    terminal.isActive
                      ? "bg-status-ok/10 text-status-ok border border-status-ok/20"
                      : "bg-status-fail/10 text-status-fail border border-status-fail/20"
                  }`}
                >
                  {terminal.isActive ? (
                    <>
                      <ShieldCheck className="w-3 h-3 mr-1" /> Authorized Online
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="w-3 h-3 mr-1" /> Blacklisted / Locked
                    </>
                  )}
                </span>
              </div>
              <p className="text-xs text-ink-muted">
                {terminal.deviceModel} &bull; S/N: <span className="font-mono text-ink">{terminal.deviceSerialNumber}</span>
              </p>
            </div>

            {onToggleActive && !isAgent && (
              <Button
                variant={terminal.isActive ? "secondary" : "primary"}
                onClick={handleToggle}
                disabled={toggling}
                className="text-xs py-1.5 px-3 self-start md:self-auto"
              >
                {terminal.isActive ? "Lockdown / Blacklist" : "Reauthorize Terminal"}
              </Button>
            )}
          </div>

          {/* Audit Trail Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div className="flex items-start gap-2.5">
              <UserCheck className="w-4 h-4 text-signal shrink-0 mt-0.5" />
              <div>
                <span className="text-ink-muted block text-[11px] uppercase tracking-wider font-semibold">
                  Assigned & Registered By
                </span>
                <span className="font-semibold text-white block">
                  {terminal.assignedByName || "MiliPay Staff"}
                </span>
                {terminal.assignedByEmail && (
                  <span className="text-ink-muted text-[11px] font-mono block">
                    {terminal.assignedByEmail}
                  </span>
                )}
                {terminal.assignedByRole && (
                  <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] bg-signal/10 text-signal border border-signal/20 font-mono capitalize">
                    Role: {terminal.assignedByRole}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Building2 className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" />
              <div>
                <span className="text-ink-muted block text-[11px] uppercase tracking-wider font-semibold">
                  Merchant Store
                </span>
                <span className="font-semibold text-white block">
                  {terminal.merchantName || "Unassigned"}
                </span>
                <span className="text-ink-muted text-[11px] block font-mono">
                  ID: {terminal.merchantId?.slice(0, 13)}...
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Calendar className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" />
              <div>
                <span className="text-ink-muted block text-[11px] uppercase tracking-wider font-semibold">
                  Deployment Date
                </span>
                <span className="text-white block font-mono">
                  {new Date(terminal.createdAt).toLocaleDateString("en-NG", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="text-ink-muted text-[11px] block">
                  Heartbeat: {terminal.lastHeartbeat ? new Date(terminal.lastHeartbeat).toLocaleTimeString() : "Recent"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* AGENT VIEW: Hardware Specifications & Compliance Notice (No financial data) */}
        {isAgent ? (
          <div className="bg-ledger-raised border border-white/[0.06] rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-signal/10 flex items-center justify-center shrink-0">
                <Cpu className="w-4 h-4 text-signal-bright" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white">Scanner Specifications & Compliance</h4>
                <p className="text-xs text-ink-muted">Certified local matching & hardware security status</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-white/[0.02] border border-white/[0.04] p-3 rounded-lg">
                <span className="text-ink-muted block mb-1">Hardware Tier & Model</span>
                <span className="font-semibold text-white">{terminal.deviceModel}</span>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.04] p-3 rounded-lg">
                <span className="text-ink-muted block mb-1">Serial Number (S/N)</span>
                <span className="font-mono text-signal-bright">{terminal.deviceSerialNumber}</span>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.04] p-3 rounded-lg">
                <span className="text-ink-muted block mb-1">Operational State</span>
                <span className={terminal.isActive ? "text-status-ok font-semibold" : "text-status-fail font-semibold"}>
                  {terminal.isActive ? "Active" : "Deactivated"}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05] text-[11px] text-ink-muted flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-signal shrink-0 mt-0.5" />
              <span>
                Financial transaction auditing and revenue settlement records for this scanner are restricted to Central Administrators.
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* Terminal Financial KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-ledger-raised border border-white/[0.06] rounded-xl p-4">
                <div className="flex items-center justify-between text-ink-muted mb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Terminal Volume</span>
                  <TrendingUp className="w-3.5 h-3.5 text-signal" />
                </div>
                <div className="text-lg font-bold font-data text-white">
                  &#8358;{totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <p className="text-[10px] text-ink-muted mt-0.5 font-mono">Gross processed via this scanner</p>
              </div>

              <div className="bg-ledger-raised border border-white/[0.06] rounded-xl p-4">
                <div className="flex items-center justify-between text-ink-muted mb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Platform Fee (1.5%)</span>
                  <Receipt className="w-3.5 h-3.5 text-ink-faint" />
                </div>
                <div className="text-lg font-bold font-data text-ink-muted">
                  &#8358;{totalFees.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <p className="text-[10px] text-ink-muted mt-0.5 font-mono">MiliPay platform commission</p>
              </div>

              <div className="bg-ledger-raised border border-white/[0.06] rounded-xl p-4">
                <div className="flex items-center justify-between text-ink-muted mb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Net Payout (98.5%)</span>
                  <ArrowDownRight className="w-3.5 h-3.5 text-status-ok" />
                </div>
                <div className="text-lg font-bold font-data text-status-ok">
                  &#8358;{netSettled.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <p className="text-[10px] text-status-ok mt-0.5 font-mono">Disbursed to merchant</p>
              </div>
            </div>

            {/* Transactions Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-signal-bright" />
                  <h3 className="text-sm font-bold text-white">
                    Terminal Transaction History ({transactions.length})
                  </h3>
                </div>
                <button
                  onClick={() => loadTransactions(terminal.terminalId)}
                  disabled={loading}
                  className="text-xs text-ink-muted hover:text-white flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              <div className="bg-ledger-raised border border-white/[0.06] rounded-xl overflow-hidden">
                {loading ? (
                  <div className="p-8">
                    <LoadingState title="Loading Transactions" description="Fetching payments from this terminal..." />
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="p-8 text-center">
                    <Receipt className="w-8 h-8 text-ink-faint mx-auto mb-2" />
                    <p className="text-sm font-medium text-white">No Transactions Recorded</p>
                    <p className="text-xs text-ink-muted mt-1">
                      No palm biometric payments have been processed through terminal{" "}
                      <span className="font-mono text-ink">{terminal.terminalId}</span> yet.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-72 custom-scrollbar">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-white/[0.02] border-b border-white/[0.06] font-mono text-[11px] text-ink-muted uppercase sticky top-0 backdrop-blur-md">
                        <tr>
                          <th className="py-2.5 px-4">Reference</th>
                          <th className="py-2.5 px-4">Gross Amount</th>
                          <th className="py-2.5 px-4">Fee (1.5%)</th>
                          <th className="py-2.5 px-4">Net Payout</th>
                          <th className="py-2.5 px-4">Status</th>
                          <th className="py-2.5 px-4 text-right">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {transactions.map((tx) => (
                          <tr key={tx.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-3 px-4 font-mono text-signal-bright font-medium">
                              {tx.reference}
                            </td>
                            <td className="py-3 px-4 font-bold font-data text-white">
                              &#8358;{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-4 font-data text-ink-muted">
                              &#8358;{tx.platformFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-4 font-bold font-data text-status-ok">
                              &#8358;{tx.netPayout.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-4">
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
                            <td className="py-3 px-4 text-right font-mono text-ink-muted text-[11px]">
                              {new Date(tx.timestamp).toLocaleString("en-NG", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
