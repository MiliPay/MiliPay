import { useEffect, useState } from "react";
import {
  Receipt,
  Search,
  RefreshCw,
  TrendingUp,
  ArrowDownRight,
  Percent,
  Download,
  CheckCircle2,
  XCircle,
  Printer,
} from "lucide-react";
import { Button } from "@milipay/shared/components/ui/Button";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { Modal } from "@milipay/shared/components/ui/Modal";
import {
  fetchCurrentMerchantProfile,
  fetchMerchantTransactions,
} from "@milipay/shared/features/merchants/merchantService";
import type { Merchant, MerchantTransaction } from "@milipay/shared/types";

export default function MerchantTransactionsPage() {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [transactions, setTransactions] = useState<MerchantTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTx, setSelectedTx] = useState<MerchantTransaction | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const profile = await fetchCurrentMerchantProfile();
      setMerchant(profile.merchant);
      const txs = await fetchMerchantTransactions(profile.merchant.id);
      setTransactions(txs);
    } catch (err) {
      console.error("Failed to load transactions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = transactions.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      t.reference.toLowerCase().includes(s) ||
      (t.terminalId && t.terminalId.toLowerCase().includes(s))
    );
  });

  const totalVolume = filtered.reduce((s, t) => s + (t.status === "success" ? t.amount : 0), 0);
  const totalFees = filtered.reduce((s, t) => s + (t.status === "success" ? t.platformFee : 0), 0);
  const netSettlement = totalVolume - totalFees;

  const handleExportCSV = () => {
    if (filtered.length === 0) return;
    const headers = "Reference,Terminal ID,Gross Amount (NGN),Platform Fee (NGN),Net Payout (NGN),Status,Timestamp\n";
    const rows = filtered
      .map(
        (t) =>
          `"${t.reference}","${t.terminalId || "Direct"}","${t.amount}","${t.platformFee}","${t.netPayout}","${t.status}","${t.timestamp}"`
      )
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `milipay-sales-${merchant?.businessName || "store"}-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8 animate-rise-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Receipt className="w-5 h-5 text-signal-bright" />
            <span className="text-xs font-semibold uppercase tracking-wider text-signal-bright">
              Settlements Ledger
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold text-white tracking-tight">
            Sales & Transactions
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Real-time biometric payment audit trail and automated split settlements for {merchant?.businessName}.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={handleExportCSV} disabled={filtered.length === 0}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button variant="primary" onClick={loadData}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Filtered Sales Volume</span>
            <TrendingUp className="w-4 h-4 text-signal-bright" />
          </div>
          <div className="text-2xl font-bold font-data text-white">
            &#8358;{totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-ink-muted mt-1 font-mono">Gross debits processed</p>
        </div>

        <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Net Payout to NUBAN</span>
            <ArrowDownRight className="w-4 h-4 text-status-ok" />
          </div>
          <div className="text-2xl font-bold font-data text-status-ok">
            &#8358;{netSettlement.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-status-ok mt-1 font-mono">DirectPay 98.5% split settlement</p>
        </div>

        <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Platform Take-Rate ({merchant?.platformFeePercent || 1.5}%)</span>
            <Percent className="w-4 h-4 text-ink-faint" />
          </div>
          <div className="text-2xl font-bold font-data text-ink-muted">
            &#8358;{totalFees.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-ink-muted mt-1 font-mono">MiliPay platform fee</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-ink-faint absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search by reference or terminal ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/[0.03] border border-ledger-line2 rounded-lg text-sm text-ink outline-none focus:border-signal/60"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-muted font-semibold uppercase tracking-wide">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white/[0.03] border border-ledger-line2 text-xs rounded-lg px-3 py-2 text-ink outline-none"
          >
            <option value="all" className="bg-ledger">All Statuses</option>
            <option value="success" className="bg-ledger">Success</option>
            <option value="pending" className="bg-ledger">Pending</option>
            <option value="failed" className="bg-ledger">Failed</option>
          </select>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12">
            <LoadingState title="Loading Transactions" description="Querying sales records..." />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="w-10 h-10 text-ink-faint mx-auto mb-3" />
            <h3 className="text-base font-bold text-white mb-1">No Transactions Found</h3>
            <p className="text-xs text-ink-muted">
              {search || statusFilter !== "all"
                ? "No transactions match your search or filter."
                : "No customer palm payments recorded yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.02] border-b border-white/[0.06] text-xs font-semibold text-ink-muted uppercase tracking-wider font-mono">
                <tr>
                  <th className="py-4 px-6">Reference</th>
                  <th className="py-4 px-6">Terminal ID</th>
                  <th className="py-4 px-6">Gross Sale</th>
                  <th className="py-4 px-6">Platform Fee</th>
                  <th className="py-4 px-6">Net Payout</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6">Date & Time</th>
                  <th className="py-4 px-6 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 px-6 font-mono font-bold text-signal-bright">
                      {tx.reference}
                    </td>

                    <td className="py-4 px-6 font-mono text-xs text-ink">
                      {tx.terminalId || "Direct"}
                    </td>

                    <td className="py-4 px-6 font-bold font-data text-white">
                      &#8358;{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>

                    <td className="py-4 px-6 font-data text-ink-muted text-xs">
                      &#8358;{tx.platformFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>

                    <td className="py-4 px-6 font-bold font-data text-status-ok">
                      &#8358;{tx.netPayout.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>

                    <td className="py-4 px-6">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          tx.status === "success"
                            ? "bg-status-ok/10 text-status-ok border border-status-ok/20"
                            : "bg-status-fail/10 text-status-fail border border-status-fail/20"
                        }`}
                      >
                        {tx.status === "success" ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Approved
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 mr-1" /> {tx.status.toUpperCase()}
                          </>
                        )}
                      </span>
                    </td>

                    <td className="py-4 px-6 font-mono text-xs text-ink-muted">
                      {new Date(tx.timestamp).toLocaleString("en-NG", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>

                    <td className="py-4 px-6 text-right">
                      <Button
                        variant="ghost"
                        onClick={() => setSelectedTx(tx)}
                        className="text-xs py-1 px-2.5 text-signal hover:bg-signal/10"
                      >
                        <Printer className="w-3.5 h-3.5 mr-1" /> Receipt
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* POS Receipt Modal */}
      <Modal
        isOpen={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        title="Payment Receipt"
        size="md"
      >
        {selectedTx && (
          <div className="space-y-4 font-mono text-xs">
            <div className="bg-black/50 border border-white/[0.08] rounded-xl p-5 space-y-3">
              <div className="text-center pb-3 border-b border-dashed border-white/20">
                <h3 className="font-display font-bold text-base text-white">{merchant?.businessName}</h3>
                <p className="text-[11px] text-ink-muted">{merchant?.address}</p>
                <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold bg-status-ok/20 text-status-ok rounded">
                  TRANSACTION APPROVED
                </span>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Reference:</span>
                  <span className="text-white font-bold">{selectedTx.reference}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Terminal ID:</span>
                  <span className="text-signal-bright">{selectedTx.terminalId || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Date & Time:</span>
                  <span className="text-white">{new Date(selectedTx.timestamp).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Payment Rail:</span>
                  <span className="text-white">Mono DirectPay (Biometric)</span>
                </div>
              </div>

              <div className="border-t border-dashed border-white/20 pt-3 space-y-1.5">
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-white">Gross Total:</span>
                  <span className="text-white">&#8358;{selectedTx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-ink-muted text-[11px]">
                  <span>Platform Fee (1.5%):</span>
                  <span>-&#8358;{selectedTx.platformFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-status-ok font-bold border-t border-white/10 pt-1.5">
                  <span>Merchant Net Settled:</span>
                  <span>&#8358;{selectedTx.netPayout.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="text-center pt-3 border-t border-dashed border-white/20 text-[10px] text-ink-muted">
                Thank you for choosing MiliPay Palm Biometrics
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setSelectedTx(null)}>
                Close
              </Button>
              <Button variant="primary" onClick={() => window.print()}>
                <Printer className="w-3.5 h-3.5 mr-1.5" /> Print Receipt
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
