import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Copy, Receipt, User, Store, Network, Clock, AlertTriangle } from "lucide-react";
import { Card } from "@milipay/shared/components/ui/Card";
import { StatusBadge } from "@milipay/shared/components/ui/StatusBadge";
import { Button } from "@milipay/shared/components/ui/Button";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { fetchTransactionById } from "@milipay/shared/features/transactions/api";
import { ROUTES } from "@milipay/shared/lib/constants";
import { formatNaira, formatTimestamp } from "@milipay/shared/lib/utils/format";
import { presentTransactionStatus } from "@milipay/shared/lib/transactionStatus";
import type { Transaction } from "@milipay/shared/types";

const TONE_DOT = {
  ok: "bg-status-ok",
  warn: "bg-status-warn",
  fail: "bg-status-fail",
  info: "bg-status-info",
  muted: "bg-ink-faint",
} as const;

/** A recorded value, or nothing at all — never a placeholder standing in for one. */
function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-ink-faint">{label}</p>
      <p className={`text-ink text-sm mt-0.5 break-all ${mono ? "font-data" : ""}`}>{value}</p>
    </div>
  );
}

/** One lifecycle step. Steps that have not happened are not drawn. */
function Step({
  label,
  at,
  tone,
}: {
  label: string;
  at?: string | null;
  tone: "signal" | "ok" | "fail";
}) {
  if (!at) return null;
  const dot = tone === "ok" ? "bg-status-ok" : tone === "fail" ? "bg-status-fail" : "bg-signal";
  return (
    <div className="relative flex items-center justify-between gap-4">
      <div className={`flex items-center justify-center w-4 h-4 rounded-full border-2 border-ledger-raised shrink-0 z-10 shadow ${dot}`} />
      <div className="flex-1">
        <h3 className="font-semibold text-sm text-ink flex justify-between gap-3">
          <span>{label}</span>
          <span className="font-data text-xs text-ink-faint">{formatTimestamp(at)}</span>
        </h3>
      </div>
    </div>
  );
}

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

  /**
   * What the rail actually recorded.
   *
   * This replaces a block that derived an IP address, a pair of Lagos
   * coordinates, a payment method ("Card Ending in 4242"), a processor route
   * ("NIBSS Interswitch"), a device and a whole fee breakdown from the sum of
   * the character codes in the reference string — then presented all of it to
   * an administrator investigating a payment. An IP address invented from a
   * reference can belong to a real person.
   *
   * There is no IP, geolocation or risk score on this table. There is a real
   * fee, a real provider, real references and real timestamps, and they were
   * already being fetched and discarded.
   */
  const money = useMemo(() => {
    if (!transaction) return null;
    const base = transaction.baseAmountNgn ?? null;
    const fee = transaction.feeNgn ?? null;
    const serviceCharge = transaction.serviceChargeNgn ?? null;
    return { base, fee, serviceCharge, total: transaction.amountNgn };
  }, [transaction]);

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto bg-ledger min-h-screen flex items-center justify-center p-6">
        <LoadingState
          minHeight="min-h-[50vh]"
          title="Loading Transaction Details..."
          description="One moment."
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
              {formatNaira(transaction.amountNgn)}
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
              {money?.base !== null && money?.base !== undefined && (
                <div className="flex justify-between items-center border-b border-ledger-line pb-3">
                  <span className="text-sm text-ink-muted">Base amount</span>
                  <span className="font-data text-ink font-medium">{formatNaira(money.base)}</span>
                </div>
              )}
              {money?.fee !== null && money?.fee !== undefined && (
                <div className="flex justify-between items-center border-b border-ledger-line pb-3">
                  <span className="text-sm text-ink-muted">Fee</span>
                  <span className="font-data text-ink font-medium">{formatNaira(money.fee)}</span>
                </div>
              )}
              {money?.serviceCharge ? (
                <div className="flex justify-between items-center border-b border-ledger-line pb-3">
                  <span className="text-sm text-ink-muted">Service charge</span>
                  <span className="font-data text-ink font-medium">{formatNaira(money.serviceCharge)}</span>
                </div>
              ) : null}
              <div className="flex justify-between items-center bg-white/[0.02] p-3 rounded border border-ledger-line">
                <span className="text-sm font-semibold text-ink">Total charged</span>
                <span className="font-data text-signal-bright font-bold text-lg">{formatNaira(money?.total ?? 0)}</span>
              </div>
              {money?.base === null && money?.fee === null && (
                <p className="text-xs text-ink-faint">
                  This transaction predates the fee breakdown being recorded.
                </p>
              )}
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
                <Field label="Paid through" value={transaction.paymentProvider} />
                <Field label="Payment reference" value={transaction.paymentReference} mono />
                <Field label="Delivered by" value={transaction.fulfilmentProvider} />
                <Field label="Operator reference" value={transaction.operatorReference} mono />
                {transaction.terminalId && (
                  <Field label="Terminal" value={transaction.terminalId} mono />
                )}
              </div>
            </Card>

            <Card raised className="p-6 space-y-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Receipt className="w-24 h-24" />
              </div>
              <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-2 relative z-10">
                <Receipt className="w-4 h-4 text-signal" /> What was bought
              </h2>
              <div className="space-y-3 relative z-10">
                <Field label="Service" value={transaction.serviceType} />
                <Field label="Provider" value={transaction.provider} />
                <Field label="Beneficiary" value={transaction.beneficiary} mono />
                {transaction.token && <Field label="Meter token" value={transaction.token} mono />}
                {transaction.units && <Field label="Units" value={transaction.units} />}
                {transaction.failureReason && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-status-fail/10 border border-status-fail/20">
                    <AlertTriangle className="w-3.5 h-3.5 text-status-fail shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-ink-faint">Why it failed</p>
                      <p className="text-status-fail text-sm mt-0.5">{transaction.failureReason}</p>
                    </div>
                  </div>
                )}
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
              <Step label="Initiated" at={transaction.initiatedAt ?? transaction.timestamp} tone="signal" />
              <Step label="Bank confirmed payment" at={transaction.paidAt} tone="signal" />
              <Step label="Delivered" at={transaction.fulfilledAt} tone="ok" />
              <Step label="Refunded" at={transaction.refundedAt} tone="fail" />
              <div className="relative flex items-center gap-4">
                <div
                  className={`flex items-center justify-center w-4 h-4 rounded-full border-2 border-ledger-raised shrink-0 z-10 shadow ${
                    TONE_DOT[presentTransactionStatus(transaction.status).tone]
                  }`}
                />
                <p className="text-xs text-ink-muted">
                  Now: {presentTransactionStatus(transaction.status).label}
                </p>
              </div>
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
