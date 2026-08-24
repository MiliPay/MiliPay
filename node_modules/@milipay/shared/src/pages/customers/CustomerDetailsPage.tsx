import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Fingerprint, 
  Ban, 
  CheckCircle, 
  Activity, 
  Smartphone, 
  ShieldCheck, 
  Clock, 
  Trash2, 
  AlertTriangle,
  XCircle,
  ShieldAlert
} from "lucide-react";
import { Card } from "@milipay/shared/components/ui/Card";
import { StatusBadge } from "@milipay/shared/components/ui/StatusBadge";
import { DataTable, type Column } from "@milipay/shared/components/ui/DataTable";
import { Button } from "@milipay/shared/components/ui/Button";
import { Modal } from "@milipay/shared/components/ui/Modal";
import { Input } from "@milipay/shared/components/ui/Input";
import { 
  fetchCustomerById, 
  updateCustomerStatus, 
  deleteCustomer,
  approveCustomer,
  rejectCustomer
} from "@milipay/shared/features/customers/api";
import { fetchTransactionsByCustomerId } from "@milipay/shared/features/transactions/api";
import { ROUTES } from "@milipay/shared/lib/constants";
import { formatDate, formatNaira, formatTimestamp } from "@milipay/shared/lib/utils/format";
import type { Customer, Transaction } from "@milipay/shared/types";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";

export default function CustomerDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [totalTxnCount, setTotalTxnCount] = useState(0);
  const [isTxnLoading, setIsTxnLoading] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Approval state
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  // Rejection state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const loadCustomer = async () => {
      setIsLoading(true);
      try {
        const data = await fetchCustomerById(id);
        if (!cancelled) setCustomer(data);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadCustomer();

    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    
    const loadTransactions = async () => {
      setIsTxnLoading(true);
      try {
        const data = await fetchTransactionsByCustomerId(id, { page, pageSize: 5 });
        if (!cancelled) {
          setTransactions(data.items);
          setTotalTxnCount(data.totalCount);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setIsTxnLoading(false);
      }
    };
    loadTransactions();

    return () => { cancelled = true; };
  }, [id, page]);

  const handleToggleStatus = async () => {
    if (!customer || !id) return;
    setIsUpdatingStatus(true);
    const newStatus = customer.status === "suspended" ? "active" : "suspended";
    const success = await updateCustomerStatus(id, newStatus);
    
    if (success) {
      setCustomer({ ...customer, status: newStatus });
    }
    setIsUpdatingStatus(false);
  };

  const handleConfirmDelete = async () => {
    if (!customer || !id) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteCustomer(id);
      setShowDeleteModal(false);
      navigate(ROUTES.customers, { replace: true });
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete customer record");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmApprove = async () => {
    if (!customer || !id) return;
    setIsApproving(true);
    setApprovalError(null);
    try {
      await approveCustomer(id);
      setShowApproveModal(false);
      setCustomer({ ...customer, status: "active", rejectionReason: undefined });
    } catch (err: any) {
      setApprovalError(err.message || "Failed to approve customer");
    } finally {
      setIsApproving(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!customer || !id) return;
    setIsRejecting(true);
    setRejectError(null);
    try {
      await rejectCustomer(id, rejectReason);
      setShowRejectModal(false);
      setCustomer({ ...customer, status: "rejected", rejectionReason: rejectReason });
    } catch (err: any) {
      setRejectError(err.message || "Failed to reject customer");
    } finally {
      setIsRejecting(false);
    }
  };

  // Simulated Analytics based on deterministic customer ID hashing
  const analytics = useMemo(() => {
    if (!customer) return null;
    const charCodeSum = customer.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const ltv = totalTxnCount > 0 ? (totalTxnCount * (25000 + (charCodeSum * 100))) * 100 : 0;
    const successRate = totalTxnCount > 0 ? Math.min(100, 85 + (charCodeSum % 15)) : 100;
    
    return {
      lifetimeValue: ltv,
      avgTransaction: totalTxnCount > 0 ? ltv / totalTxnCount : 0,
      successRate: successRate.toFixed(1),
      device: charCodeSum % 2 === 0 ? "iPhone 14 Pro" : "Samsung Galaxy S23",
      os: charCodeSum % 2 === 0 ? "iOS 17.1" : "Android 14",
      lastLogin: new Date(Date.now() - (charCodeSum * 60000)).toISOString()
    };
  }, [customer, totalTxnCount]);

  if (isLoading) {
    return (
      <div className="p-6 md:p-10 max-w-5xl mx-auto flex justify-center items-center h-64">
        <div className="w-8 h-8 border-2 border-signal border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6 md:p-10 max-w-5xl mx-auto text-center space-y-4">
        <h1 className="text-2xl font-display font-bold text-ink">Customer Not Found</h1>
        <Button variant="secondary" onClick={() => navigate(ROUTES.customers)}>Back to Customers</Button>
      </div>
    );
  }

  const columns: Column<Transaction>[] = [
    {
      key: "reference",
      header: "Ref",
      render: (row) => <span className="font-data text-xs text-signal-bright">{row.reference}</span>,
    },
    {
      key: "merchant",
      header: "Merchant",
      render: (row) => <span className="text-sm text-ink-muted">{row.merchantName}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      render: (row) => <span className="font-data text-sm text-ink">{formatNaira(row.amountKobo)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "date",
      header: "Date",
      render: (row) => (
        <div className="flex flex-col">
          <span className="text-sm text-ink-faint">{formatDate(row.timestamp)}</span>
          <span className="text-xs text-ink-muted">{formatTimestamp(row.timestamp)}</span>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8 animate-rise-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link to={ROUTES.customers} className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-signal-bright transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Customers
          </Link>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl md:text-3xl font-display font-bold text-ink">{customer.fullName}</h1>
            <StatusBadge status={customer.status} />
          </div>
          <p className="text-ink-muted mt-1 font-data text-sm">ID: {customer.id}</p>
        </div>
        
        <div className="flex flex-wrap gap-3">
          {isAdmin && (
            <>
              {customer.status === "pending" && (
                <>
                  <Button 
                    variant="primary"
                    onClick={() => {
                      setApprovalError(null);
                      setShowApproveModal(true);
                    }}
                    disabled={isApproving || isRejecting}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve KYC &amp; Send SMS
                  </Button>
                  <Button 
                    variant="secondary"
                    onClick={() => {
                      setRejectReason("");
                      setRejectError(null);
                      setShowRejectModal(true);
                    }}
                    disabled={isApproving || isRejecting}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                </>
              )}

              {customer.status !== "pending" && customer.status !== "rejected" && (
                <Button 
                  variant={customer.status === "suspended" ? "primary" : "secondary"} 
                  onClick={handleToggleStatus}
                  disabled={isUpdatingStatus || isDeleting}
                >
                  {customer.status === "suspended" ? (
                    <><CheckCircle className="w-4 h-4 mr-2" /> Activate Account</>
                  ) : (
                    <><Ban className="w-4 h-4 mr-2" /> Suspend Account</>
                  )}
                </Button>
              )}

              <Button 
                variant="danger"
                onClick={() => {
                  setDeleteError(null);
                  setShowDeleteModal(true);
                }}
                disabled={isUpdatingStatus || isDeleting}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Customer
              </Button>
            </>
          )}
        </div>
      </div>

      {/* KYC Alert Banners */}
      {customer.status === "pending" && (
        <div className="p-4 bg-status-warning/10 border border-status-warning/30 rounded-xl flex items-start gap-3">
          <Clock className="w-5 h-5 text-status-warning shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed text-ink-muted">
            <p className="text-sm font-semibold text-white mb-0.5">Pending Administrator KYC Verification</p>
            This customer was enrolled by a field agent. Review their NIN and 4-finger biometric records below. Once approved, their Supabase Auth account will be created and an SMS with their temporary password will be dispatched to <strong className="text-white">{customer.phone}</strong>.
          </div>
        </div>
      )}

      {customer.status === "rejected" && (
        <div className="p-4 bg-status-fail/10 border border-status-fail/30 rounded-xl flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-status-fail shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed text-ink-muted">
            <p className="text-sm font-semibold text-white mb-0.5">Enrollment Rejected</p>
            Reason: <span className="text-status-fail font-medium">{customer.rejectionReason || "Did not satisfy KYC vetting criteria."}</span>
          </div>
        </div>
      )}

      {/* Top Row: Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Contact Info */}
        <Card raised className="p-6 space-y-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <User className="w-24 h-24" />
          </div>
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-2 relative z-10">
            <User className="w-4 h-4 text-signal" /> Contact Info
          </h2>
          <div className="space-y-4 relative z-10">
            <div>
              <p className="text-xs text-ink-faint">Phone Number (SMS Recipient)</p>
              <p className="font-data text-ink flex items-center gap-2 mt-0.5"><Phone className="w-3 h-3 text-ink-muted" /> {customer.phone}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Email Address</p>
              <p className="text-ink flex items-center gap-2 mt-0.5"><Mail className="w-3 h-3 text-ink-muted" /> {customer.email || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">State / Territory</p>
              <p className="text-ink flex items-center gap-2 mt-0.5"><MapPin className="w-3 h-3 text-ink-muted" /> {customer.state}</p>
            </div>
          </div>
        </Card>

        {/* Identity & Biometrics */}
        <Card raised className="p-6 space-y-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Fingerprint className="w-24 h-24" />
          </div>
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-2 relative z-10">
            <Fingerprint className="w-4 h-4 text-signal" /> Biometric Identity
          </h2>
          <div className="space-y-4 relative z-10">
            <div>
              <p className="text-xs text-ink-faint">National Identification Number (NIN)</p>
              <p className="font-data text-ink flex items-center gap-2 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-status-ok" />
                ••••••••{customer.ninLast4}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Captured Biometric Templates</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {customer.capturedFingers && customer.capturedFingers.length > 0 ? (
                  customer.capturedFingers.map((finger, idx) => (
                    <span key={idx} className="text-[11px] font-medium bg-signal/10 border border-signal/25 text-signal-bright px-2 py-0.5 rounded capitalize">
                      {finger.replace("_", " ")}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-ink-faint">No fingers recorded</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Registration Date</p>
              <p className="text-xs text-ink-muted mt-0.5">{formatDate(customer.createdAt)}</p>
            </div>
          </div>
        </Card>

        {/* Analytics & Health */}
        <Card raised className="p-6 space-y-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Activity className="w-24 h-24" />
          </div>
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-2 relative z-10">
            <Activity className="w-4 h-4 text-signal" /> Account Analytics
          </h2>
          {analytics ? (
            <div className="space-y-3 relative z-10">
              <div className="flex justify-between items-center py-1 border-b border-ledger-line">
                <span className="text-xs text-ink-faint">Lifetime Volume</span>
                <span className="font-data text-sm font-semibold text-ink">{formatNaira(analytics.lifetimeValue)}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-ledger-line">
                <span className="text-xs text-ink-faint">Avg Transaction</span>
                <span className="font-data text-sm font-semibold text-ink">{formatNaira(analytics.avgTransaction)}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-xs text-ink-faint">Success Rate</span>
                <span className="font-data text-sm font-semibold text-status-ok">{analytics.successRate}%</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-ink-faint">No activity yet</p>
          )}
        </Card>
      </div>

      {/* Transactions Section */}
      <div className="pt-4 space-y-4">
        <h2 className="text-xl font-display font-semibold text-ink">Recent Transactions</h2>
        <DataTable
          columns={columns}
          data={transactions}
          isLoading={isTxnLoading}
          page={page}
          pageSize={5}
          totalCount={totalTxnCount}
          onPageChange={setPage}
          onRowClick={(row) => navigate(`/dashboard/transactions/${row.id}`)}
          rowKey={(row) => row.id}
          emptyMessage="No transactions found for this customer."
        />
      </div>

      {/* Approve Customer Modal */}
      {showApproveModal && (
        <Modal
          isOpen={showApproveModal}
          onClose={() => {
            if (!isApproving) setShowApproveModal(false);
          }}
          title="Approve Customer & Dispatch Login SMS"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-status-ok/10 border border-status-ok/25 rounded-xl">
              <ShieldCheck className="w-5 h-5 text-status-ok shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-white">Approve Customer Verification</p>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                  Approving <strong className="text-white">{customer.fullName}</strong> will create their login account and immediately dispatch a temporary password via SMS to <strong className="text-signal-bright">{customer.phone}</strong>.
                </p>
              </div>
            </div>

            {approvalError && (
              <div className="p-3 bg-status-fail/10 border border-status-fail/30 rounded-lg text-xs text-status-fail">
                {approvalError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-white/[0.05]">
              <Button
                variant="secondary"
                onClick={() => setShowApproveModal(false)}
                disabled={isApproving}
              >
                Cancel
              </Button>
              <button
                type="button"
                onClick={handleConfirmApprove}
                disabled={isApproving}
                className="px-4 py-2 bg-status-ok hover:bg-status-ok/90 text-ledger font-semibold text-sm rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Smartphone className="w-4 h-4" />
                {isApproving ? "Approving & Sending SMS..." : "Approve & Send SMS"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Customer Modal */}
      {showRejectModal && (
        <Modal
          isOpen={showRejectModal}
          onClose={() => {
            if (!isRejecting) setShowRejectModal(false);
          }}
          title="Reject Customer Enrollment"
        >
          <div className="space-y-4">
            <p className="text-xs text-ink-muted leading-relaxed">
              Rejecting enrollment for <strong className="text-white">{customer.fullName}</strong>. Please provide a reason:
            </p>

            <Input
              label="Rejection Reason"
              placeholder="e.g. NIN mismatch, unclear fingerprint capture..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              required
            />

            {rejectError && (
              <div className="p-3 bg-status-fail/10 border border-status-fail/30 rounded-lg text-xs text-status-fail">
                {rejectError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-white/[0.05]">
              <Button
                variant="secondary"
                onClick={() => setShowRejectModal(false)}
                disabled={isRejecting}
              >
                Cancel
              </Button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isRejecting}
                className="px-4 py-2 bg-status-warn hover:bg-status-warn/90 text-ledger font-semibold text-sm rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                {isRejecting ? "Rejecting..." : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Customer Confirmation Modal */}
      {showDeleteModal && (
        <Modal
          isOpen={showDeleteModal}
          onClose={() => {
            if (!isDeleting) setShowDeleteModal(false);
          }}
          title="Delete Customer Account"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-status-fail/10 border border-status-fail/25 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-status-fail shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-white">Permanent Deletion Warning</p>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                  Are you sure you want to delete <strong className="text-white">{customer.fullName}</strong> ({customer.phone})? 
                  This will permanently wipe their customer record, biometric templates, and linked bank accounts.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 bg-status-fail/10 border border-status-fail/30 rounded-lg text-xs text-status-fail">
                {deleteError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-white/[0.05]">
              <Button
                variant="secondary"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-status-fail hover:bg-status-fail/90 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {isDeleting ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
