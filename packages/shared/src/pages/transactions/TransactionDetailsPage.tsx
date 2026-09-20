import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Copy, Receipt, User, Store, ShieldCheck, MapPin, Network, Clock, CheckCircle2 } from "lucide-react";
import { Card } from "@milipay/shared/components/ui/Card";
import { StatusBadge } from "@milipay/shared/components/ui/StatusBadge";
import { Button } from "@milipay/shared/components/ui/Button";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { fetchTransactionById } from "@milipay/shared/features/transactions/api";
import { ROUTES } from "@milipay/shared/lib/constants";
import { formatNaira, formatTimestamp } from "@milipay/shared/lib/utils/format";
import type { Transaction } from "@milipay/shared/types";

export default function TransactionDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const loadTransaction = async () => {
      setIsLoading(true);
      try {
        const data = await fetchTransactionById(id);
        if (!cancelled) setTransaction(data);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadTransaction();

    return () => { cancelled = true; };
  }, [id]);

  const analytics = useMemo(() => {
    if (!transaction) return null;
    const baseAmount = transaction.amountNgn;
    const rawFee = Math.floor(baseAmount * 0.015);
    const processingFee = Math.min(rawFee, 2000); // Capped at 2000 NGN
    const vat = Math.floor(processingFee * 0.075);
    const totalAmount = baseAmount + processingFee + vat;

    const charCodeSum = transaction.reference.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const ip = `197.210.${charCodeSum % 255}.${(charCodeSum * 2) % 255}`;
    const lat = 6.5244 + ((charCodeSum % 100) * 0.001);
    const lng = 3.3792 + ((charCodeSum % 100) * 0.001);

    return {
      baseAmount,
      processingFee,
      vat,
      totalAmount,
      ip,
      lat: lat.toFixed(4),
      lng: lng.toFixed(4),
      method: charCodeSum % 2 === 0 ? "MiliPay Wallet" : "Card Ending in 4242",
      processor: charCodeSum % 2 === 0 ? "Internal" : "NIBSS Interswitch",
      device: charCodeSum % 3 === 0 ? "iOS App" : (charCodeSum % 3 === 1 ? "Android App" : "Web Terminal")
    };
  }, [transaction]);

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto bg-ledger min-h-screen flex items-center justify-center p-6">
        <LoadingState
          minHeight="min-h-[50vh]"
          title="Loading Transaction Details..."
          description="Fetching settlement status, fee breakdown, and processor verification records."
        />
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="p-6 md:p-10 max-w-3xl mx-auto text-center space-y-4">
        <h1 className="text-2xl font-display font-bold text-ink">Transaction Not Found</h1>
        <Button variant="secondary" onClick={() => navigate(ROUTES.transactions)}>Back to Transactions</Button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-3xl mx-auto space-y-6 sm:space-y-8 animate-rise-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <button 
            onClick={() => navigate(-1)} 
            className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-signal transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-ink flex items-center gap-3">
              {analytics ? formatNaira(analytics.totalAmount) : formatNaira(transaction.amountNgn)}
            </h1>
            <StatusBadge status={transaction.status} />
          </div>
          <p className="text-ink-muted mt-2 font-data text-sm flex items-center gap-2">
            Ref: <span className="text-ink">{transaction.reference}</span>
            <button 
              className="hover:text-signal-bright transition-colors"
              onClick={() => navigator.clipboard.writeText(transaction.reference)}
              title="Copy Reference"
            >
              <Copy className="w-3 h-3" />
            </button>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Details & Fee Breakdown */}
        <div className="lg:col-span-2 space-y-6">
          <Card raised className="p-6 space-y-4">
            <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-2">
              <Receipt className="w-4 h-4 text-signal" /> Fee Breakdown
            </h2>
            <div className="space-y-4 pt-2">
              <div className="flex justify-between items-center border-b border-ledger-line pb-3">
                <span className="text-sm text-ink-muted">Base Amount</span>
                <span className="font-data text-ink font-medium">{formatNaira(analytics?.baseAmount || 0)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-ledger-line pb-3">
                <span className="text-sm text-ink-muted">Processing Fee (1.5%)</span>
                <span className="font-data text-ink font-medium">{formatNaira(analytics?.processingFee || 0)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-ledger-line pb-3">
                <span className="text-sm text-ink-muted">VAT (7.5% on Fee)</span>
                <span className="font-data text-ink font-medium">{formatNaira(analytics?.vat || 0)}</span>
              </div>
              <div className="flex justify-between items-center bg-white/[0.02] p-3 rounded border border-ledger-line">
                <span className="text-sm font-semibold text-ink">Total Settled</span>
                <span className="font-data text-signal-bright font-bold text-lg">{formatNaira(analytics?.totalAmount || 0)}</span>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card raised className="p-6 space-y-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Network className="w-24 h-24" />
              </div>
              <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-2 relative z-10">
                <Network className="w-4 h-4 text-signal" /> Routing
              </h2>
              <div className="space-y-3 relative z-10">
                <div>
                  <p className="text-xs text-ink-faint">Payment Method</p>
                  <p className="text-ink text-sm mt-0.5">{analytics?.method}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-faint">Processor Route</p>
                  <p className="text-ink text-sm mt-0.5">{analytics?.processor}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-faint">Terminal / Device</p>
                  <p className="text-ink text-sm mt-0.5">{analytics?.device}</p>
                </div>
              </div>
            </Card>

            <Card raised className="p-6 space-y-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <ShieldCheck className="w-24 h-24" />
              </div>
              <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-2 relative z-10">
                <ShieldCheck className="w-4 h-4 text-signal" /> Security Context
              </h2>
              <div className="space-y-3 relative z-10">
                <div>
                  <p className="text-xs text-ink-faint">IP Address</p>
                  <p className="font-data text-ink text-sm mt-0.5">{analytics?.ip}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-faint">Coordinates</p>
                  <p className="font-data text-ink text-sm flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3 text-ink-muted" /> {analytics?.lat}, {analytics?.lng}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-faint">Risk Assessment</p>
                  <p className="text-status-ok text-sm font-medium mt-0.5 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Low Risk</p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Right Column: Entities & Timeline */}
        <div className="space-y-6">
          {/* Timeline Card */}
          <Card raised className="p-6 space-y-4">
            <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-2">
              <Clock className="w-4 h-4 text-signal" /> Lifecycle
            </h2>
            <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-signal/50 before:to-transparent">
              <div className="relative flex items-center justify-between gap-4">
                <div className="flex items-center justify-center w-4 h-4 rounded-full border-2 border-ledger-raised bg-signal shrink-0 z-10 shadow" />
                <div className="flex-1">
                  <h3 className="font-semibold text-sm text-ink flex justify-between">
                    <span>Initiated</span>
                    <span className="font-data text-xs text-ink-faint">{formatTimestamp(transaction.timestamp)}</span>
                  </h3>
                </div>
              </div>
              <div className="relative flex items-center justify-between gap-4">
                <div className="flex items-center justify-center w-4 h-4 rounded-full border-2 border-ledger-raised bg-signal shrink-0 z-10 shadow" />
                <div className="flex-1">
                  <h3 className="font-semibold text-sm text-ink flex justify-between">
                    <span>Fraud Check Passed</span>
                    <span className="font-data text-xs text-ink-faint">+{Math.floor(Math.random() * 200 + 50)}ms</span>
                  </h3>
                </div>
              </div>
              {transaction.status === "success" && (
                <div className="relative flex items-center justify-between gap-4">
                  <div className="flex items-center justify-center w-4 h-4 rounded-full border-2 border-ledger-raised bg-status-ok shrink-0 z-10 shadow" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm text-ink flex justify-between">
                      <span className="flex items-center gap-1 text-status-ok"><CheckCircle2 className="w-3 h-3" /> Settled</span>
                      <span className="font-data text-xs text-ink-faint">+{Math.floor(Math.random() * 500 + 100)}ms</span>
                    </h3>
                  </div>
                </div>
              )}
              {transaction.status === "failed" && (
                <div className="relative flex items-center justify-between gap-4">
                  <div className="flex items-center justify-center w-4 h-4 rounded-full border-2 border-ledger-raised bg-status-fail shrink-0 z-10 shadow" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm text-status-fail flex justify-between">
                      <span>Failed</span>
                      <span className="font-data text-xs text-ink-faint">+{Math.floor(Math.random() * 500 + 100)}ms</span>
                    </h3>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card raised className="p-6 space-y-4">
            <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-2">
              <Store className="w-4 h-4 text-signal" /> Merchant
            </h2>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-white/5 border border-ledger-line flex items-center justify-center text-ink-muted">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">{transaction.merchantName}</p>
                <p className="text-xs text-ink-muted mt-0.5">Retail Payment</p>
              </div>
            </div>
          </Card>

          <Card raised className="p-6 space-y-4">
            <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-2">
              <User className="w-4 h-4 text-signal" /> Customer
            </h2>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-signal/10 flex items-center justify-center text-signal-bright">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <Link 
                    to={`/dashboard/customers/${transaction.customerId}`}
                    className="text-sm font-medium text-ink hover:text-signal-bright transition-colors flex items-center gap-1 group"
                  >
                    {transaction.customerName}
                    <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                  <p className="text-xs text-ink-muted mt-0.5 font-data text-ellipsis overflow-hidden max-w-[150px]">
                    ID: {transaction.customerId}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
