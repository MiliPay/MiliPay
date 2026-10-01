import { useState, useEffect } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { 
  ArrowLeft, User, Mail, Phone, MapPin, Ban, CheckCircle, 
  ShieldCheck, Clock, Trash2, AlertTriangle, XCircle, 
  ShieldAlert, UserCheck, RotateCcw, FileText, Building2, 
  Activity, Ticket, Scan, Pencil, Lock, Home, ChevronRight,
  Copy, Check, Receipt, Send, ScanFace
} from "lucide-react";
import { Card } from "@milipay/shared/components/ui/Card";
import { StatusBadge } from "@milipay/shared/components/ui/StatusBadge";
import { Button } from "@milipay/shared/components/ui/Button";
import { Modal } from "@milipay/shared/components/ui/Modal";
import { Input } from "@milipay/shared/components/ui/Input";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { LoadingSpinner } from "@milipay/shared/components/ui/LoadingSpinner";
import { supabase } from "@milipay/shared/lib/supabase";
import { 
  fetchCustomerById, 
  updateCustomerStatus, 
  deleteCustomer,
  approveCustomer,
  resendCustomerCredentials,
  rejectCustomer,
  updateCustomerProfile
} from "@milipay/shared/features/customers/api";
import { formatDate, formatNaira } from "@milipay/shared/lib/utils/format";
import { 
  DEFAULT_REJECTION_REASONS,
  type Customer,
  TIER_LIMITS
} from "@milipay/shared/types";
import { NIGERIAN_STATES } from "@milipay/shared/lib/constants";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";

export default function CustomerDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Approval state
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [dispatchNotice, setDispatchNotice] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  // Rejection state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState<string>(DEFAULT_REJECTION_REASONS[0]);
  const [customRejectReason, setCustomRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Admin and edit customer state
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || (user?.role as string) === 'superAdmin';
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editState, setEditState] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Selected bank for modal & isolated transactions
  const [selectedBank, setSelectedBank] = useState<any | null>(null);
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankTransactions, setBankTransactions] = useState<any[]>([]);
  const [isLoadingBankTx, setIsLoadingBankTx] = useState(false);
  const [copiedBankField, setCopiedBankField] = useState<string | null>(null);

  const backLink = location.pathname.startsWith('/dashboard') ? '/dashboard/customers' : '/customers';

  const loadData = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const custData = await fetchCustomerById(id);
      setCustomer(custData);
      
      if (custData && custData.authUserId) {
        // Fetch extra data in parallel
        const [accRes, txRes, tktRes] = await Promise.all([
          supabase.from('linked_accounts').select('*').eq('user_id', custData.authUserId),
          supabase.from('transactions').select('*').or(`customer_id.eq.${custData.id},user_id.eq.${custData.authUserId}`).order('created_at', { ascending: false }).limit(5),
          supabase.from('support_tickets').select('*').eq('customer_id', custData.id).order('created_at', { ascending: false }).limit(5)
        ]);
        
        if (accRes.data) setLinkedAccounts(accRes.data);
        if (txRes.data) setTransactions(txRes.data);
        if (tktRes.data) setTickets(tktRes.data);
      } else if (custData) {
        // Fetch transactions and tickets via customer_id
        const [txRes, tktRes] = await Promise.all([
          supabase.from('transactions').select('*').eq('customer_id', custData.id).order('created_at', { ascending: false }).limit(5),
          supabase.from('support_tickets').select('*').eq('customer_id', custData.id).order('created_at', { ascending: false }).limit(5)
        ]);
        if (txRes.data) setTransactions(txRes.data);
        if (tktRes.data) setTickets(tktRes.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleStatusChange = async (newStatus: 'active' | 'suspended') => {
    if (!isAdmin || !customer || !id) return;
    setIsUpdatingStatus(true);
    const success = await updateCustomerStatus(id, newStatus);
    if (success) {
      setCustomer({ ...customer, status: newStatus });
    }
    setIsUpdatingStatus(false);
  };

  const handleDelete = async () => {
    if (!isAdmin) {
      setDeleteError("Access denied: Only administrators have permission to delete customer records.");
      return;
    }
    if (!customer || !id) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const success = await deleteCustomer(id);
      if (success) {
        navigate(backLink);
      } else {
        setDeleteError("Failed to delete customer. They might have active transactions or tickets.");
        setIsDeleting(false);
      }
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete customer");
      setIsDeleting(false);
    }
  };

  /**
   * Approve.
   *
   * The second argument used to be user.id, which the API treated as
   * customPassword — so the administrator's own UUID became the login password
   * of every customer they approved, and that UUID is visible to any staff
   * member as customers.verified_by. approveCustomer now takes the id alone
   * and no password exists at all: the customer is told they are verified
   * and logs in with their phone number and an SMS code.
   */
  const handleApprove = async () => {
    if (!isAdmin || !customer || !id || !user) return;
    setIsApproving(true);
    setApprovalError(null);
    try {
      const result = await approveCustomer(id);
      setCustomer({
        ...customer,
        status: 'active',
        verifiedAt: new Date().toISOString(),
        verifiedBy: user.id,
        passwordDeliveryStatus: result.delivered ? 'delivered' : 'failed',
        passwordDeliveryChannel: result.deliveryChannel ?? undefined,
      });
      setShowApproveModal(false);
      setDispatchNotice(result.message);
    } catch (err: any) {
      setApprovalError(err?.message || "Failed to approve customer. Please try again.");
    } finally {
      setIsApproving(false);
    }
  };

  const handleResendCredentials = async () => {
    if (!isAdmin || !customer || !id) return;
    setIsResending(true);
    setDispatchNotice(null);
    try {
      const result = await resendCustomerCredentials(id);
      setCustomer({
        ...customer,
        passwordDeliveryStatus: result.delivered ? 'delivered' : 'failed',
        passwordDeliveryChannel: result.deliveryChannel ?? undefined,
      });
      setDispatchNotice(result.message);
    } catch (err: any) {
      setDispatchNotice(err?.message || "Could not resend the message.");
    } finally {
      setIsResending(false);
    }
  };

  const handleReject = async () => {
    if (!isAdmin || !customer || !id || !user) return;
    const finalReason = rejectReason === "Other" ? customRejectReason : rejectReason;
    if (!finalReason.trim()) {
      setRejectError("Please provide a rejection reason.");
      return;
    }
    
    setIsRejecting(true);
    setRejectError(null);
    
    const success = await rejectCustomer(id, finalReason);
    if (success) {
      setCustomer({ ...customer, status: 'rejected', rejectionReason: finalReason });
      setShowRejectModal(false);
    } else {
      setRejectError("Failed to reject customer. Please try again.");
    }
    setIsRejecting(false);
  };

  const handleOpenEditModal = () => {
    if (!customer) return;
    const nameParts = (customer.fullName || "").trim().split(/\s+/);
    setEditFirstName(customer.firstName || nameParts[0] || "");
    setEditLastName(customer.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(" ") : ""));
    setEditPhone(customer.phone || "");
    setEditEmail(customer.email || "");
    setEditAddress(customer.address || "");
    setEditState(customer.state || "Lagos");
    setEditError(null);
    setShowEditModal(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !id) return;
    if (!editFirstName.trim() || !editLastName.trim()) {
      setEditError("First name and last name are required.");
      return;
    }
    if (!editPhone.trim()) {
      setEditError("Phone number is required.");
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);
    try {
      await updateCustomerProfile({
        id,
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
        phone: editPhone.trim(),
        email: editEmail.trim() || undefined,
        address: editAddress.trim(),
        state: editState.trim(),
      });

      setCustomer({
        ...customer,
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
        fullName: `${editFirstName.trim()} ${editLastName.trim()}`.trim(),
        phone: editPhone.trim(),
        email: editEmail.trim(),
        address: editAddress.trim(),
        state: editState.trim(),
      });
      setShowEditModal(false);
    } catch (err: any) {
      console.error(err);
      setEditError(err.message || "Failed to update customer details.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleSelectBank = async (bank: any) => {
    setSelectedBank(bank);
    setShowBankModal(true);
    setIsLoadingBankTx(true);
    setCopiedBankField(null);
    try {
      const { data: txs, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('account_used', bank.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBankTransactions(txs || []);
    } catch (err) {
      console.error("Error fetching bank transactions:", err);
      setBankTransactions([]);
    } finally {
      setIsLoadingBankTx(false);
    }
  };

  const handleCopyBankText = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedBankField(field);
    setTimeout(() => setCopiedBankField(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto bg-ledger min-h-screen flex items-center justify-center">
        <LoadingState
          minHeight="min-h-[60vh]"
          title="Loading Customer Profile..."
          description="Retrieving biometric enrollment status, linked accounts, and KYC verification records."
        />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-8">
        <Link to={backLink} className="flex items-center gap-2 text-ink-muted hover:text-signal transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Customers
        </Link>
        <div className="text-status-fail">Customer not found</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-ledger min-h-screen">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 pb-32">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.05] pb-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <Link to={backLink} className="p-2 -ml-2 rounded-xl hover:bg-white/[0.05] text-ink-muted transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-display text-white tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="truncate">{customer.fullName}</span>
                <StatusBadge status={customer.status} />
              </h1>
              <p className="text-ink-muted mt-1 font-mono text-xs sm:text-sm break-all">ID: {customer.id}</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {isAdmin && customer.status === 'pending' && (
              <>
                <Button 
                  onClick={() => setShowApproveModal(true)} 
                  className="bg-status-ok hover:bg-status-ok/90 text-ledger gap-1.5 sm:gap-2 text-xs sm:text-sm"
                >
                  <CheckCircle className="w-4 h-4" /> Approve
                </Button>
                <Button 
                  onClick={() => setShowRejectModal(true)} 
                  variant="danger" 
                  className="gap-1.5 sm:gap-2 text-xs sm:text-sm"
                >
                  <XCircle className="w-4 h-4" /> Reject
                </Button>
              </>
            )}
            {isAdmin && customer.status === 'active' && (
              <Button
                onClick={handleResendCredentials}
                variant="secondary"
                disabled={isResending}
                className="gap-1.5 sm:gap-2 text-xs sm:text-sm"
                title="Tell the customer again, by SMS, WhatsApp and email, that they are verified and can log in"
              >
                <Send className="w-4 h-4" />
                {isResending ? "Sending…" : "Resend message"}
              </Button>
            )}

            {isAdmin && customer.status === 'active' && (
              <Button 
                onClick={() => handleStatusChange('suspended')} 
                variant="secondary" 
                className="border-status-warn/30 text-status-warn hover:bg-status-warn/10 gap-1.5 sm:gap-2 text-xs sm:text-sm"
                disabled={isUpdatingStatus}
              >
                <Ban className="w-4 h-4" /> Suspend Account
              </Button>
            )}

            {isAdmin && customer.status === 'suspended' && (
              <Button 
                onClick={() => handleStatusChange('active')} 
                variant="secondary" 
                className="border-status-ok/30 text-status-ok hover:bg-status-ok/10 gap-1.5 sm:gap-2 text-xs sm:text-sm"
                disabled={isUpdatingStatus}
              >
                <RotateCcw className="w-4 h-4" /> Reactivate
              </Button>
            )}
            
            {isAdmin && (
              <Button 
                onClick={handleOpenEditModal} 
                variant="secondary" 
                className="border-signal/30 text-signal hover:bg-signal/10 gap-1.5 sm:gap-2 text-xs sm:text-sm"
              >
                <Pencil className="w-4 h-4" /> Edit Details
              </Button>
            )}
            
            {isAdmin && (
              <Button 
                onClick={() => setShowDeleteModal(true)}
                variant="danger" 
                className="p-2.5 sm:p-3"
                title="Delete Customer"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {dispatchNotice && (
          <div className="bg-signal/10 border border-signal/30 rounded-2xl p-4 flex gap-3 items-start">
            <Send className="w-5 h-5 text-signal-bright shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-ink text-sm">{dispatchNotice}</p>
            </div>
            <button
              type="button"
              onClick={() => setDispatchNotice(null)}
              className="text-ink-faint hover:text-ink text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        {customer.status === 'rejected' && customer.rejectionReason && (
          <div className="bg-status-fail/10 border border-status-fail/30 rounded-2xl p-4 sm:p-6 flex gap-3 sm:gap-4 items-start">
            <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-status-fail shrink-0 mt-0.5" />
            <div>
              <h3 className="text-status-fail font-medium text-sm sm:text-base">Application Rejected</h3>
              <p className="text-status-fail/80 mt-1 text-xs sm:text-sm">{customer.rejectionReason}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          
          {/* Profile Details Card */}
          <Card className="lg:col-span-1 p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-white flex items-center gap-2">
                <User className="w-5 h-5 text-signal" /> Profile Details
              </h2>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleOpenEditModal}
                  className="text-xs text-signal hover:text-signal/80 flex items-center gap-1 font-medium transition-colors cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              )}
            </div>
            
            <div className="space-y-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-ink-faint uppercase tracking-wider font-semibold">Phone Number</span>
                <div className="flex items-center gap-2 text-ink">
                  <Phone className="w-4 h-4 text-ink-muted" />
                  {customer.phone}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-ink-faint uppercase tracking-wider font-semibold">Email</span>
                <div className="flex items-center gap-2 text-ink">
                  <Mail className="w-4 h-4 text-ink-muted" />
                  {customer.email || <span className="text-ink-faint italic">Not provided</span>}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-ink-faint uppercase tracking-wider font-semibold">Location (State)</span>
                <div className="flex items-center gap-2 text-ink">
                  <MapPin className="w-4 h-4 text-ink-muted" />
                  {customer.state}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-ink-faint uppercase tracking-wider font-semibold">Residential Address</span>
                <div className="flex items-start gap-2 text-ink">
                  <Home className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" />
                  <span className="text-sm leading-relaxed">{customer.address || <span className="text-ink-faint italic">Not provided</span>}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1 pt-2 border-t border-white/[0.05]">
                <span className="text-xs text-ink-faint uppercase tracking-wider font-semibold">National ID (NIN)</span>
                <div className="flex items-center gap-2 text-ink font-mono">
                  <ShieldCheck className="w-4 h-4 text-status-ok" />
                  **** {customer.ninLast4}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-ink-faint uppercase tracking-wider font-semibold">Biometrics (Palm Vein)</span>
                <div className="flex items-center gap-2 text-ink">
                  <Scan className="w-4 h-4 text-signal" />
                  {customer.hasPalmTemplate ? (
                    <div className="flex items-center gap-2">
                      <span className="text-status-ok text-sm font-medium">Palm Vein Enrolled</span>
                      <span className="text-[10px] text-ink-muted uppercase tracking-wider font-mono bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded">
                        {customer.palmSimulated ? "SIMULATED" : "VP930Pro"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-status-warn text-sm">No Biometrics Enrolled</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-ink-faint uppercase tracking-wider font-semibold">Biometrics (Face)</span>
                <div className="flex items-center gap-2 text-ink">
                  <ScanFace className="w-4 h-4 text-signal" />
                  {customer.hasFaceTemplate ? (
                    <div className="flex items-center gap-2">
                      <span className="text-status-ok text-sm font-medium">Face Enrolled</span>
                      {customer.faceSimulated && (
                        <span className="text-[10px] text-status-warn uppercase tracking-wider font-mono bg-status-warn/10 border border-status-warn/25 px-1.5 py-0.5 rounded">SIMULATED</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-status-warn text-sm">No Facial Capture</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-ink-faint uppercase tracking-wider font-semibold">Identity check</span>
                <div className="flex items-center gap-2 text-ink">
                  <ShieldCheck className={customer.ninVerified ? "w-4 h-4 text-status-ok" : "w-4 h-4 text-status-warn"} />
                  <span className="text-sm">
                    {customer.ninVerified ? "NIN verified" : "NIN not verified"}
                    {customer.bvnLast4 && (customer.bvnVerified ? " · BVN verified" : " · BVN not verified")}
                  </span>
                </div>
              </div>

              {customer.passwordDeliveryStatus && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-ink-faint uppercase tracking-wider font-semibold">Verified message</span>
                  <div className="flex items-center gap-2 text-ink">
                    <Send className={customer.passwordDeliveryStatus === "delivered" ? "w-4 h-4 text-status-ok" : "w-4 h-4 text-status-fail"} />
                    <span className="text-sm">
                      {customer.passwordDeliveryStatus === "delivered"
                        ? "Sent by " + (customer.passwordDeliveryChannel ?? "unknown channel")
                        : "Delivery failed — use Resend message"}
                    </span>
                  </div>
                </div>
              )}
              
              <div className="flex flex-col gap-1 pt-2 border-t border-white/[0.05]">
                <span className="text-xs text-ink-faint uppercase tracking-wider font-semibold">Registration Date</span>
                <div className="flex items-center gap-2 text-ink">
                  <Clock className="w-4 h-4 text-ink-muted" />
                  {formatDate(customer.createdAt)}
                </div>
              </div>
            </div>
          </Card>

          {/* KYC Tier & Transaction Limits Card */}
          <Card className="lg:col-span-1 p-4 sm:p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-signal" /> KYC Tier & Limits
              </h2>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                customer.kycTier === 1 
                  ? 'bg-status-info/10 text-status-info border-status-info/20' 
                  : customer.kycTier === 3 
                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                  : 'bg-signal/10 text-signal border-signal/20'
              }`}>
                {TIER_LIMITS[customer.kycTier || 2]?.name || 'Tier 2'}
              </span>
            </div>

            <div className="space-y-3">
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 flex justify-between items-center">
                <div>
                  <span className="text-[11px] text-ink-faint uppercase tracking-wider font-semibold block">Max Single Transaction</span>
                  <span className="text-sm font-semibold text-white">
                    {formatNaira(TIER_LIMITS[customer.kycTier || 2]?.maxSingleTxn || 150000)}
                  </span>
                </div>
                <span className="text-xs text-ink-muted font-mono">Per Checkout</span>
              </div>

              <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 flex justify-between items-center">
                <div>
                  <span className="text-[11px] text-ink-faint uppercase tracking-wider font-semibold block">Max Daily Cumulative</span>
                  <span className="text-sm font-semibold text-white">
                    {formatNaira(TIER_LIMITS[customer.kycTier || 2]?.maxDailyVolume || 500000)}
                  </span>
                </div>
                <span className="text-xs text-ink-muted font-mono">00:00 WAT Reset</span>
              </div>

              <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 flex justify-between items-center">
                <div>
                  <span className="text-[11px] text-ink-faint uppercase tracking-wider font-semibold block">PIN Security Threshold</span>
                  <span className="text-sm font-semibold text-signal">
                    &gt; {formatNaira(customer.pinThreshold ?? 10000)}
                  </span>
                </div>
                <span className="text-[10px] text-ink-muted bg-white/[0.05] px-2 py-0.5 rounded font-mono">
                  {customer.pinThreshold && customer.pinThreshold !== 10000 ? 'Custom' : 'Default'}
                </span>
              </div>
            </div>

            <p className="text-xs text-ink-muted leading-relaxed">
              Transactions exceeding <strong className="text-white">{formatNaira(customer.pinThreshold ?? 10000)}</strong> prompt for 4-digit PIN verification on the terminal. Transactions below this threshold are approved instantly via palm vein scan alone.
            </p>
          </Card>

          {/* Linked Banks & Transactions */}
          <div className="lg:col-span-2 space-y-6 sm:space-y-8">
            
            {/* Linked Accounts */}
            <Card className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-base sm:text-lg font-medium text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-signal" /> Linked Bank Accounts
                </h2>
                {linkedAccounts.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-status-ok bg-status-ok/10 border border-status-ok/20 px-2 py-0.5 rounded-full font-medium">
                      {linkedAccounts.filter(a => a.is_active !== false).length} Active
                    </span>
                    {linkedAccounts.some(a => a.is_active === false) && (
                      <span className="text-xs text-status-fail bg-status-fail/10 border border-status-fail/20 px-2 py-0.5 rounded-full font-medium">
                        {linkedAccounts.filter(a => a.is_active === false).length} Removed
                      </span>
                    )}
                  </div>
                )}
              </div>

              {linkedAccounts.length === 0 ? (
                <div className="text-center py-6 text-ink-muted border border-dashed border-white/10 rounded-xl">
                  No linked bank accounts found.
                </div>
              ) : (
                <>
                  <p className="text-xs text-ink-muted mb-4">
                    Click any bank account below to view its complete account profile and isolated transaction history.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[...linkedAccounts]
                      .sort((a, b) => (b.is_active !== false ? 1 : 0) - (a.is_active !== false ? 1 : 0))
                      .map(acc => {
                        const isActive = acc.is_active !== false;
                        return (
                          <div 
                            key={acc.id} 
                            onClick={() => handleSelectBank(acc)}
                            className={`p-4 rounded-xl flex items-center justify-between border transition-all cursor-pointer group hover:scale-[1.01] ${
                              isActive 
                                ? 'bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.06] hover:border-signal/40 shadow-sm' 
                                : 'bg-white/[0.01] hover:bg-white/[0.03] border-white/[0.03] hover:border-white/10 opacity-70 hover:opacity-90'
                            }`}
                          >
                            <div className="flex items-center gap-3.5">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                                isActive ? 'bg-signal/10 text-signal group-hover:bg-signal group-hover:text-ledger' : 'bg-white/[0.05] text-ink-muted'
                              }`}>
                                <Building2 className="w-5 h-5" />
                              </div>
                              <div>
                                <div className={`font-medium flex items-center gap-2 ${isActive ? 'text-white group-hover:text-signal transition-colors' : 'text-ink-muted line-through'}`}>
                                  {acc.bank_name}
                                </div>
                                <div className="text-ink-muted text-xs font-mono">
                                  **** {acc.account_number ? acc.account_number.slice(-4) : '••••'}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0 ml-2">
                              {isActive ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-status-ok/10 text-status-ok border border-status-ok/20">
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-status-fail/10 text-status-fail border border-status-fail/20">
                                  Removed
                                </span>
                              )}
                              <ChevronRight className="w-4 h-4 text-ink-faint group-hover:text-signal group-hover:translate-x-0.5 transition-all" />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </>
              )}
            </Card>

            {/* Recent Transactions */}
            <Card className="p-6">
              <h2 className="text-lg font-medium text-white mb-6 flex items-center gap-2">
                <Activity className="w-5 h-5 text-signal" /> Recent Transactions
              </h2>
              {transactions.length === 0 ? (
                <div className="text-center py-6 text-ink-muted border border-dashed border-white/10 rounded-xl">
                  No transactions yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {transactions.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                      <div className="flex flex-col">
                        <span className="text-white font-medium">{tx.reference}</span>
                        <span className="text-xs text-ink-muted">{formatDate(tx.created_at)}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-signal font-display">{formatNaira(tx.amount)}</span>
                        <span className="text-xs text-status-ok uppercase font-bold tracking-wider">{tx.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Support History */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-medium text-white flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-signal" /> Support Tickets
                </h2>
                <Link to="/complaints" className="text-sm text-signal hover:underline">View All</Link>
              </div>
              
              {tickets.length === 0 ? (
                <div className="text-center py-6 text-ink-muted border border-dashed border-white/10 rounded-xl">
                  No support tickets found.
                </div>
              ) : (
                <div className="space-y-3">
                  {tickets.map(tkt => (
                    <Link key={tkt.id} to={location.pathname.includes('/complaints') ? `../${tkt.id}` : `../../complaints/${tkt.id}`} className="flex items-center justify-between p-4 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] rounded-xl transition-all cursor-pointer">
                      <div className="flex flex-col">
                        <span className="text-white font-medium">{tkt.ticket_id || 'Live Chat'}</span>
                        <span className="text-xs text-ink-muted line-clamp-1">{tkt.issue_description}</span>
                      </div>
                      <StatusBadge status={tkt.status} />
                    </Link>
                  ))}
                </div>
              )}
            </Card>

          </div>
        </div>
      </div>

      {/* Delete Modal - strictly restricted to Admins */}
      {isAdmin && (
        <Modal isOpen={showDeleteModal} onClose={() => !isDeleting && setShowDeleteModal(false)} title="Delete Customer">
          <div className="space-y-4">
            <div className="bg-status-fail/10 text-status-fail p-4 rounded-xl flex gap-3 text-sm border border-status-fail/20">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <p>This action cannot be undone. All personal data will be permanently deleted. Transaction records will be anonymized.</p>
            </div>
            {deleteError && <p className="text-status-fail text-sm font-medium">{deleteError}</p>}
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="secondary" onClick={() => setShowDeleteModal(false)} disabled={isDeleting}>Cancel</Button>
              <Button onClick={handleDelete} className="bg-status-fail text-white hover:bg-status-fail/90" disabled={isDeleting}>
                {isDeleting ? "Deleting..." : "Delete Permanently"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Approve Modal - strictly restricted to Admins */}
      {isAdmin && (
        <Modal isOpen={showApproveModal} onClose={() => !isApproving && setShowApproveModal(false)} title="Approve Customer">
          <div className="space-y-4">
            <div className="bg-status-ok/10 text-status-ok p-4 rounded-xl flex gap-3 text-sm border border-status-ok/20">
              <UserCheck className="w-5 h-5 shrink-0" />
              <p>
                You are about to verify this customer's KYC data. This grants them full access
                to the MiliPay network and tells them by SMS, WhatsApp and email that they are
                verified. They log in with their phone number and a one-time SMS code.
              </p>
            </div>
            {approvalError && <p className="text-status-fail text-sm font-medium">{approvalError}</p>}
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="secondary" onClick={() => setShowApproveModal(false)} disabled={isApproving}>Cancel</Button>
              <Button onClick={handleApprove} className="bg-status-ok text-ledger hover:bg-status-ok/90" disabled={isApproving}>
                {isApproving ? "Approving..." : "Approve & Verify"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Modal - strictly restricted to Admins */}
      {isAdmin && (
        <Modal isOpen={showRejectModal} onClose={() => !isRejecting && setShowRejectModal(false)} title="Reject Customer">
          <div className="space-y-4">
            <div className="bg-status-warn/10 text-status-warn p-4 rounded-xl flex gap-3 text-sm border border-status-warn/20">
              <FileText className="w-5 h-5 shrink-0" />
              <p>Please select a reason for rejection. This will be visible to the customer and field agents.</p>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm text-ink-muted">Reason for rejection</label>
              <select 
                className="w-full bg-ledger border border-white/[0.1] rounded-xl px-4 py-3 text-white outline-none focus:border-signal/50"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                disabled={isRejecting}
              >
                {DEFAULT_REJECTION_REASONS.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {rejectReason === "Other" && (
              <div className="space-y-2">
                <label className="text-sm text-ink-muted">Specify Reason</label>
                <Input 
                  value={customRejectReason}
                  onChange={(e) => setCustomRejectReason(e.target.value)}
                  placeholder="Enter specific reason..."
                  disabled={isRejecting}
                />
              </div>
            )}

            {rejectError && <p className="text-status-fail text-sm font-medium">{rejectError}</p>}
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="secondary" onClick={() => setShowRejectModal(false)} disabled={isRejecting}>Cancel</Button>
              <Button onClick={handleReject} className="bg-status-warn text-ledger hover:bg-status-warn/90" disabled={isRejecting}>
                {isRejecting ? "Rejecting..." : "Confirm Rejection"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Customer Modal - strictly restricted to Admins */}
      {isAdmin && (
        <Modal isOpen={showEditModal} onClose={() => !isSavingEdit && setShowEditModal(false)} title="Edit Customer Details">
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <div className="bg-signal/10 border border-signal/20 rounded-xl p-3.5 flex items-start gap-3 text-xs text-ink-muted">
            <ShieldCheck className="w-4 h-4 text-signal shrink-0 mt-0.5" />
            <p>
              <strong className="text-white">Admin Privileges:</strong> Personal details can be updated here. Immutable KYC records (NIN, Palm Vein Biometrics) are cryptographically bound and cannot be manually modified.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First Name"
              value={editFirstName}
              onChange={(e) => setEditFirstName(e.target.value)}
              placeholder="e.g. Adebayo"
              required
              disabled={isSavingEdit}
            />
            <Input
              label="Last Name"
              value={editLastName}
              onChange={(e) => setEditLastName(e.target.value)}
              placeholder="e.g. Ogunlesi"
              required
              disabled={isSavingEdit}
            />
          </div>

          <Input
            label="Phone Number"
            type="tel"
            value={editPhone}
            onChange={(e) => setEditPhone(e.target.value)}
            placeholder="+234..."
            required
            disabled={isSavingEdit}
          />

          <Input
            label="Email Address"
            type="email"
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
            placeholder="customer@example.com"
            disabled={isSavingEdit}
          />

          <Input
            label="Residential Address"
            value={editAddress}
            onChange={(e) => setEditAddress(e.target.value)}
            placeholder="e.g. 14 Admiralty Way, Lekki Phase 1"
            disabled={isSavingEdit}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
              State of Residence <span className="text-status-warn">*</span>
            </label>
            <select
              value={editState}
              onChange={(e) => setEditState(e.target.value)}
              disabled={isSavingEdit}
              className="w-full rounded bg-white/[0.03] border border-ledger-line2 px-4 py-3 text-[15px] text-ink outline-none transition-colors focus:border-signal/60 focus:ring-1 focus:ring-signal/30"
            >
              {NIGERIAN_STATES.map((st) => (
                <option key={st} value={st} className="bg-ledger text-white">
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Immutable Compliance Fields (Read-Only) */}
          <div className="pt-2 border-t border-white/[0.05] space-y-2">
            <div className="text-xs font-semibold text-ink-faint uppercase tracking-wider">
              Protected KYC Records (Read-Only)
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-2.5 flex items-center justify-between text-xs">
                <span className="text-ink-muted">National ID</span>
                <span className="font-mono text-ink flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-ink-faint" /> **** {customer.ninLast4}
                </span>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-2.5 flex items-center justify-between text-xs">
                <span className="text-ink-muted">Biometrics</span>
                <span className="font-mono text-ink flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-ink-faint" /> {customer.hasPalmTemplate ? "VP930Pro" : "None"}
                </span>
              </div>
            </div>
          </div>

          {editError && <p className="text-status-fail text-sm font-medium">{editError}</p>}

          <div className="flex justify-end gap-3 mt-6 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowEditModal(false)} disabled={isSavingEdit}>
              Cancel
            </Button>
            <Button type="submit" className="bg-signal text-ledger hover:bg-signal/90 font-medium" disabled={isSavingEdit}>
              {isSavingEdit ? "Saving Changes..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>
      )}

      {/* Linked Bank Account Details & Isolated Transactions Modal */}
      {selectedBank && (
        <Modal 
          isOpen={showBankModal} 
          onClose={() => setShowBankModal(false)} 
          title="Bank Account & Transaction History"
          size="2xl"
        >
          <div className="space-y-6">
            {/* Header / Overview Card */}
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  selectedBank.is_active !== false ? 'bg-signal/15 text-signal' : 'bg-white/[0.05] text-ink-muted'
                }`}>
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-display font-semibold text-white">
                      {selectedBank.bank_name}
                    </h3>
                    {selectedBank.is_active !== false ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-status-ok/10 text-status-ok border border-status-ok/20">
                        Active Account
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-status-fail/10 text-status-fail border border-status-fail/20">
                        Removed by User
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-muted mt-1 flex flex-wrap items-center gap-2">
                    <span>Account Holder: <strong className="text-white">{selectedBank.account_name || customer.fullName}</strong></span>
                    <span>•</span>
                    <span className="font-mono text-signal font-medium">**** {selectedBank.account_number ? selectedBank.account_number.slice(-4) : '••••'}</span>
                  </p>
                </div>
              </div>

              <div className="flex sm:flex-col items-end justify-between sm:justify-center border-t sm:border-t-0 pt-3 sm:pt-0 border-white/[0.05]">
                <span className="text-[11px] text-ink-faint uppercase tracking-wider font-semibold">Open Banking</span>
                <span className="text-xs text-status-ok bg-status-ok/10 px-2 py-0.5 rounded border border-status-ok/20 flex items-center gap-1 font-mono mt-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Mono Connected
                </span>
              </div>
            </div>

            {/* Account Details Breakdown Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-1">
                <span className="text-[11px] text-ink-faint uppercase tracking-wider font-semibold">Account Number</span>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-white text-sm font-semibold">{selectedBank.account_number || 'N/A'}</span>
                  {selectedBank.account_number && (
                    <button 
                      type="button" 
                      onClick={() => handleCopyBankText(selectedBank.account_number, 'acc_num')} 
                      className="p-1 hover:bg-white/10 rounded text-ink-muted hover:text-white transition-colors"
                      title="Copy Account Number"
                    >
                      {copiedBankField === 'acc_num' ? <Check className="w-3.5 h-3.5 text-status-ok" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-1">
                <span className="text-[11px] text-ink-faint uppercase tracking-wider font-semibold">Mono Account ID</span>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-ink text-xs truncate max-w-[140px]" title={selectedBank.mono_account_id}>
                    {selectedBank.mono_account_id || 'N/A'}
                  </span>
                  {selectedBank.mono_account_id && (
                    <button 
                      type="button" 
                      onClick={() => handleCopyBankText(selectedBank.mono_account_id, 'mono_id')} 
                      className="p-1 hover:bg-white/10 rounded text-ink-muted hover:text-white transition-colors"
                      title="Copy Mono ID"
                    >
                      {copiedBankField === 'mono_id' ? <Check className="w-3.5 h-3.5 text-status-ok" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-1">
                <span className="text-[11px] text-ink-faint uppercase tracking-wider font-semibold">Linked Date</span>
                <div className="text-ink text-xs font-mono">
                  {formatDate(selectedBank.created_at)}
                </div>
              </div>
            </div>

            {/* Metrics & Performance Summary for this Bank */}
            <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-signal/5 border border-signal/15">
              <div>
                <span className="text-[11px] text-ink-muted uppercase tracking-wide block">Total Volume</span>
                <span className="text-lg font-display font-bold text-signal">
                  {formatNaira(bankTransactions.filter(t => t.status === 'success').reduce((sum, t) => sum + Number(t.amount || 0), 0))}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-ink-muted uppercase tracking-wide block">Total Debits</span>
                <span className="text-lg font-display font-bold text-white">
                  {bankTransactions.length}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-ink-muted uppercase tracking-wide block">Success Rate</span>
                <span className="text-lg font-display font-bold text-status-ok">
                  {bankTransactions.length > 0 
                    ? `${Math.round((bankTransactions.filter(t => t.status === 'success').length / bankTransactions.length) * 100)}%` 
                    : '100%'}
                </span>
              </div>
            </div>

            {/* Isolated Transaction History */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-signal" />
                  Account Transaction History
                  <span className="text-xs font-mono font-normal bg-white/10 px-2 py-0.5 rounded-full text-ink">
                    {bankTransactions.length} {bankTransactions.length === 1 ? 'record' : 'records'}
                  </span>
                </h4>
                <span className="text-xs text-ink-muted">Filtered exclusively to this bank</span>
              </div>

              {isLoadingBankTx ? (
                <div className="py-12 text-center text-ink-muted flex flex-col items-center justify-center gap-3">
                  <LoadingSpinner size="md" />
                  <span className="text-xs font-medium">Retrieving linked account ledger...</span>
                </div>
              ) : bankTransactions.length === 0 ? (
                <div className="text-center py-10 px-4 bg-white/[0.01] border border-dashed border-white/10 rounded-2xl">
                  <Receipt className="w-8 h-8 text-ink-muted mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium text-ink">No transactions on this account</p>
                  <p className="text-xs text-ink-muted mt-1 max-w-sm mx-auto">
                    This linked account has not been debited for any biometric POS payments or transactions yet.
                  </p>
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {bankTransactions.map(tx => (
                    <div 
                      key={tx.id} 
                      className="p-3.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center text-ink-muted shrink-0 font-mono text-xs">
                          <Receipt className="w-4 h-4 text-signal" />
                        </div>
                        <div>
                          <div className="font-mono text-xs font-semibold text-white flex items-center gap-2">
                            <span>{tx.reference}</span>
                            <button 
                              type="button" 
                              onClick={() => handleCopyBankText(tx.reference, `tx_${tx.id}`)}
                              className="text-ink-faint hover:text-white transition-colors"
                              title="Copy Reference"
                            >
                              {copiedBankField === `tx_${tx.id}` ? <Check className="w-3 h-3 text-status-ok" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                          <div className="text-[11px] text-ink-muted mt-0.5">
                            {formatDate(tx.created_at)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end">
                        <span className="text-signal font-display font-semibold text-sm">
                          {formatNaira(tx.amount)}
                        </span>
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded mt-0.5 ${
                          tx.status === 'success' 
                            ? 'text-status-ok bg-status-ok/10 border border-status-ok/20' 
                            : tx.status === 'pending'
                            ? 'text-status-warn bg-status-warn/10 border border-status-warn/20'
                            : 'text-status-fail bg-status-fail/10 border border-status-fail/20'
                        }`}>
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end pt-2 border-t border-white/[0.05]">
              <Button variant="secondary" onClick={() => setShowBankModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
