import { useState, useEffect } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { 
  ArrowLeft, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Fingerprint, 
  Ban, 
  CheckCircle, 
  Smartphone, 
  ShieldCheck, 
  Clock, 
  Trash2, 
  AlertTriangle,
  XCircle,
  ShieldAlert,
  UserCheck,
  RotateCcw,
  FileText,
  Key
} from "lucide-react";
import { Card } from "@milipay/shared/components/ui/Card";
import { StatusBadge } from "@milipay/shared/components/ui/StatusBadge";
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
import { formatDate } from "@milipay/shared/lib/utils/format";
import { 
  DEFAULT_REJECTION_REASONS,
  type Customer 
} from "@milipay/shared/types";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";

export default function CustomerDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Approval state
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  // Rejection state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState<string>(DEFAULT_REJECTION_REASONS[0]);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isAgent = user?.role === 'agent';

  const backLink = location.pathname.startsWith('/dashboard') ? '/dashboard/customers' : '/customers';

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
      navigate(backLink, { replace: true });
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
      setCustomer({ 
        ...customer, 
        status: "active", 
        rejectionReason: undefined,
        verifiedByName: user?.fullName || "Administrator",
        verifiedAt: new Date().toISOString()
      });
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
      setCustomer({ 
        ...customer, 
        status: "rejected", 
        rejectionReason: rejectReason,
        verifiedByName: user?.fullName || "Administrator",
        verifiedAt: new Date().toISOString()
      });
    } catch (err: any) {
      setRejectError(err.message || "Failed to reject customer");
    } finally {
      setIsRejecting(false);
    }
  };

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
        <Button variant="secondary" onClick={() => navigate(backLink)}>Back to Customers</Button>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8 animate-rise-in pb-32">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link to={backLink} className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-signal-bright transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Customers
          </Link>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl md:text-3xl font-display font-bold text-ink">{customer.fullName}</h1>
            <StatusBadge status={customer.status} />
          </div>
          <p className="text-ink-muted mt-1 font-data text-sm">Customer ID: {customer.id}</p>
        </div>
        
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          {/* Admin Actions */}
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
                      setRejectReason(DEFAULT_REJECTION_REASONS[0]);
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

          {/* Field Agent Actions */}
          {isAgent && customer.status === "rejected" && (
            <Link to="/register">
              <Button variant="primary">
                <RotateCcw className="w-4 h-4 mr-2" />
                Re-Enroll / Correct Details
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* KYC Alert Banners */}
      {customer.status === "pending" && (
        <div className="p-4 bg-status-warning/10 border border-status-warning/30 rounded-xl flex items-start gap-3">
          <Clock className="w-5 h-5 text-status-warning shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed text-ink-muted">
            <p className="text-sm font-semibold text-white mb-0.5">Pending Administrator KYC Verification</p>
            This customer was enrolled by <strong className="text-white">{customer.registeredByName || "a field agent"}</strong>. 
            {isAdmin 
              ? ` Review their NIN and Palm Vein biometric records below. Once approved, their login password will be dispatched via SMS to ${customer.phone}.`
              : ` Your enrollment has been submitted and is in the verification queue. The customer will receive their login credentials once reviewed.`}
          </div>
        </div>
      )}

      {customer.status === "rejected" && (
        <div className="p-5 bg-status-fail/10 border border-status-fail/30 rounded-xl flex items-start gap-4">
          <ShieldAlert className="w-6 h-6 text-status-fail shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed space-y-1.5 flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-status-fail uppercase tracking-wider">Registration Declined by Administrator</p>
              {isAgent && (
                <Link to="/register">
                  <span className="text-xs font-semibold text-signal-bright hover:underline flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> Re-enroll customer →
                  </span>
                </Link>
              )}
            </div>
            <p className="text-sm text-white font-medium bg-status-fail/20 border border-status-fail/30 p-2.5 rounded-lg">
              Reason: {customer.rejectionReason || "Did not satisfy KYC vetting criteria."}
            </p>
            {customer.verifiedByName && (
              <p className="text-xs text-ink-muted">
                Reviewed by: <strong className="text-white">{customer.verifiedByName}</strong> {customer.verifiedAt ? `on ${formatDate(customer.verifiedAt)}` : ""}
              </p>
            )}
            <p className="text-xs text-ink-muted">
              An SMS notification with this explanation was dispatched to customer ({customer.phone}).
            </p>
          </div>
        </div>
      )}

      {/* KYC Lifecycle Stepper Card */}
      <Card raised className="p-6">
        <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-signal" /> KYC Lifecycle &amp; Verification Stepper
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Step 1 */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-1">
            <div className="flex items-center gap-2 text-status-ok font-semibold text-xs uppercase">
              <CheckCircle className="w-4 h-4" /> 1. Biometric Enrollment
            </div>
            <p className="text-sm font-medium text-white pt-1">
              Enrolled by {customer.registeredByName || "Field Agent"}
            </p>
            <p className="text-xs text-ink-muted">{formatDate(customer.createdAt)}</p>
          </div>

          {/* Step 2 */}
          <div className={`p-4 rounded-xl border space-y-1 ${
            customer.status === 'active'
              ? "bg-status-ok/10 border-status-ok/30"
              : customer.status === 'rejected'
              ? "bg-status-fail/10 border-status-fail/30"
              : "bg-status-warning/10 border-status-warning/30"
          }`}>
            <div className="flex items-center gap-2 text-xs uppercase font-semibold">
              {customer.status === 'active' && <><CheckCircle className="w-4 h-4 text-status-ok" /> <span className="text-status-ok">2. KYC Approved</span></>}
              {customer.status === 'rejected' && <><XCircle className="w-4 h-4 text-status-fail" /> <span className="text-status-fail">2. KYC Declined</span></>}
              {customer.status === 'pending' && <><Clock className="w-4 h-4 text-status-warning" /> <span className="text-status-warning">2. In Review</span></>}
            </div>
            <p className="text-sm font-medium text-white pt-1">
              {customer.status === 'active' ? `Approved by ${customer.verifiedByName || 'Administrator'}` :
               customer.status === 'rejected' ? `Declined by ${customer.verifiedByName || 'Administrator'}` :
               'Pending Admin KYC Verification'}
            </p>
            <p className="text-xs text-ink-muted">
              {customer.verifiedAt ? formatDate(customer.verifiedAt) : "Awaiting review"}
            </p>
          </div>

          {/* Step 3 */}
          <div className={`p-4 rounded-xl border space-y-1 ${
            customer.status === 'active'
              ? "bg-white/[0.02] border-white/[0.05]"
              : "bg-white/[0.01] border-white/[0.03] opacity-60"
          }`}>
            <div className="flex items-center gap-2 text-signal-bright font-semibold text-xs uppercase">
              <Key className="w-4 h-4" /> 3. App Login Access
            </div>
            <p className="text-sm font-medium text-white pt-1">
              {customer.status === 'active' ? 'Credentials Dispatched via SMS' : 'Awaiting KYC Approval'}
            </p>
            <p className="text-xs font-data text-ink-muted">{customer.phone}</p>
          </div>
        </div>
      </Card>

      {/* Top Row: Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Contact Info */}
        <Card raised className="p-6 space-y-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <User className="w-24 h-24" />
          </div>
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-2 relative z-10">
            <User className="w-4 h-4 text-signal" /> Contact Details
          </h2>
          <div className="space-y-4 relative z-10">
            <div>
              <p className="text-xs text-ink-faint">Phone Number (Login ID / SMS Recipient)</p>
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
              <p className="text-xs text-ink-faint mb-1.5">Captured Biometric Template</p>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-signal/5 border border-signal/20 text-xs w-full max-w-xs">
                {customer.palmVeinTemplate ? (
                  <>
                    <Fingerprint className="w-3.5 h-3.5 text-signal-bright shrink-0" />
                    <span className="font-medium text-status-ok capitalize truncate">Palm Vein Enrolled</span>
                  </>
                ) : (
                  <span className="text-xs text-status-warn">No palm vein template recorded</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Registration Date</p>
              <p className="text-xs text-ink-muted mt-0.5">{formatDate(customer.createdAt)}</p>
            </div>
          </div>
        </Card>

        {/* Enrollment & Audit Info */}
        <Card raised className="p-6 space-y-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <UserCheck className="w-24 h-24" />
          </div>
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-2 relative z-10">
            <UserCheck className="w-4 h-4 text-signal" /> Enrollment Audit
          </h2>
          <div className="space-y-3 relative z-10 text-xs">
            <div className="border-b border-ledger-line pb-2">
              <span className="text-ink-faint block">Enrolling Agent / Staff</span>
              <span className="text-sm font-semibold text-white mt-0.5 block">
                {customer.registeredByName || "Direct Admin Enrollment"}
              </span>
              {customer.registeredByEmail && (
                <span className="text-ink-muted text-[11px] font-data block">{customer.registeredByEmail}</span>
              )}
              {customer.registeredByState && (
                <span className="text-signal-bright text-[10px] uppercase font-semibold block mt-0.5">
                  Territory: {customer.registeredByState}
                </span>
              )}
            </div>

            {customer.verifiedByName && (
              <div className="border-b border-ledger-line pb-2">
                <span className="text-ink-faint block">Reviewed By</span>
                <span className="text-sm font-semibold text-white mt-0.5 block">{customer.verifiedByName}</span>
                {customer.verifiedAt && (
                  <span className="text-ink-muted text-[11px] block">{formatDate(customer.verifiedAt)}</span>
                )}
              </div>
            )}

            <div className="flex justify-between items-center pt-1">
              <span className="text-ink-faint">Account Status</span>
              <StatusBadge status={customer.status} />
            </div>
          </div>
        </Card>
      </div>

      {/* Approve Customer Modal (Admin Only) */}
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

            <div className="rounded-xl border border-white/[0.08] bg-ledger-line/50 p-4 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-ink-muted">Customer Name</span>
                <span className="text-white font-medium">{customer.fullName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-ink-muted">Enrolled By</span>
                <span className="text-signal-bright font-medium">{customer.registeredByName || "Direct Admin Enrollment"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-ink-muted">Phone Number (SMS Recipient)</span>
                <span className="text-signal-bright font-data">{customer.phone}</span>
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

      {/* Reject Customer Modal with Standard Default Reasons (Admin Only) */}
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
              Rejecting enrollment for <strong className="text-white">{customer.fullName}</strong>. Select a standard reason or specify additional details:
            </p>

            <div>
              <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-2">
                Standard Rejection Reason (Click to select)
              </label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {DEFAULT_REJECTION_REASONS.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setRejectReason(r === "Other Reason" ? "" : r)}
                    className={`w-full text-left p-2.5 rounded-lg text-xs transition-all border ${
                      rejectReason === r 
                        ? "bg-status-warn/20 border-status-warn text-white font-medium shadow-sm" 
                        : "bg-white/[0.02] border-white/[0.06] text-ink-muted hover:text-ink hover:bg-white/[0.06]"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label="Selected Reason / Explanation"
              placeholder="e.g. NIN mismatch, unclear fingerprint capture..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              required
            />

            <div className="p-3 bg-ledger-line rounded-lg border border-white/[0.08] flex items-center gap-2 text-xs text-ink-muted">
              <Smartphone className="w-4 h-4 text-signal-bright shrink-0" />
              <span>
                An SMS with this rejection explanation will be dispatched to <strong className="text-white">{customer.phone}</strong>.
              </span>
            </div>

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
                disabled={isRejecting || !rejectReason.trim()}
                className="px-4 py-2 bg-status-warn hover:bg-status-warn/90 text-ledger font-semibold text-sm rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                {isRejecting ? "Rejecting & Sending SMS..." : "Confirm Rejection & Send SMS"}
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
