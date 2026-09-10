const fs = require('fs');

const content = \import { useState, useEffect } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { 
  ArrowLeft, User, Mail, Phone, MapPin, Fingerprint, Ban, CheckCircle, 
  Smartphone, ShieldCheck, Clock, Trash2, AlertTriangle, XCircle, 
  ShieldAlert, UserCheck, RotateCcw, FileText, Key, Building2, CreditCard, 
  Activity, Ticket
} from "lucide-react";
import { Card } from "@milipay/shared/components/ui/Card";
import { StatusBadge } from "@milipay/shared/components/ui/StatusBadge";
import { Button } from "@milipay/shared/components/ui/Button";
import { Modal } from "@milipay/shared/components/ui/Modal";
import { Input } from "@milipay/shared/components/ui/Input";
import { supabase } from "@milipay/shared/lib/supabase";
import { 
  fetchCustomerById, 
  updateCustomerStatus, 
  deleteCustomer,
  approveCustomer,
  rejectCustomer
} from "@milipay/shared/features/customers/api";
import { formatDate, formatCurrency } from "@milipay/shared/lib/utils/format";
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
  const [isApproving, setIsApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  // Rejection state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState<string>(DEFAULT_REJECTION_REASONS[0]);
  const [customRejectReason, setCustomRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

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
          supabase.from('transactions').select('*').eq('user_id', custData.authUserId).order('created_at', { ascending: false }).limit(5),
          supabase.from('support_tickets').select('*').eq('customer_id', custData.id).order('created_at', { ascending: false }).limit(5)
        ]);
        
        if (accRes.data) setLinkedAccounts(accRes.data);
        if (txRes.data) setTransactions(txRes.data);
        if (tktRes.data) setTickets(tktRes.data);
      } else if (custData) {
        // Just fetch tickets via customer_id
        const tktRes = await supabase.from('support_tickets').select('*').eq('customer_id', custData.id).order('created_at', { ascending: false }).limit(5);
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

  const handleStatusChange = async (newStatus: Customer['status']) => {
    if (!customer || !id) return;
    setIsUpdatingStatus(true);
    const updated = await updateCustomerStatus(id, newStatus);
    if (updated) {
      setCustomer({ ...customer, status: newStatus });
    }
    setIsUpdatingStatus(false);
  };

  const handleDelete = async () => {
    if (!customer || !id) return;
    setIsDeleting(true);
    setDeleteError(null);
    const success = await deleteCustomer(id);
    if (success) {
      navigate('..');
    } else {
      setDeleteError("Failed to delete customer. They might have active transactions or tickets.");
      setIsDeleting(false);
    }
  };

  const handleApprove = async () => {
    if (!customer || !id || !user) return;
    setIsApproving(true);
    setApprovalError(null);
    const success = await approveCustomer(id, user.id);
    if (success) {
      setCustomer({ ...customer, status: 'active', verifiedAt: new Date().toISOString(), verifiedBy: user.id });
      setShowApproveModal(false);
    } else {
      setApprovalError("Failed to approve customer. Please try again.");
    }
    setIsApproving(false);
  };

  const handleReject = async () => {
    if (!customer || !id || !user) return;
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

  if (isLoading) {
    return <div className="p-8 text-ink-muted">Loading customer details...</div>;
  }

  if (!customer) {
    return (
      <div className="p-8">
        <Link to=".." className="flex items-center gap-2 text-ink-muted hover:text-signal transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Customers
        </Link>
        <div className="text-status-fail">Customer not found</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-ledger min-h-screen">
      <div className="max-w-6xl mx-auto p-8 space-y-8 pb-32">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.05] pb-6">
          <div className="flex items-center gap-4">
            <Link to=".." className="p-2 -ml-2 rounded-xl hover:bg-white/[0.05] text-ink-muted transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-3xl font-display text-white tracking-tight flex items-center gap-3">
                {customer.firstName} {customer.lastName}
                <StatusBadge status={customer.status} />
              </h1>
              <p className="text-ink-muted mt-1 font-mono text-sm">ID: {customer.id}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {customer.status === 'pending' && (
              <>
                <Button 
                  onClick={() => setShowApproveModal(true)} 
                  className="bg-status-ok hover:bg-status-ok/90 text-ledger gap-2"
                >
                  <CheckCircle className="w-4 h-4" /> Approve
                </Button>
                <Button 
                  onClick={() => setShowRejectModal(true)} 
                  variant="outline" 
                  className="border-status-fail/30 text-status-fail hover:bg-status-fail/10 gap-2"
                >
                  <XCircle className="w-4 h-4" /> Reject
                </Button>
              </>
            )}

            {customer.status === 'active' && (
              <Button 
                onClick={() => handleStatusChange('suspended')} 
                variant="outline" 
                className="border-status-warning/30 text-status-warning hover:bg-status-warning/10 gap-2"
                disabled={isUpdatingStatus}
              >
                <Ban className="w-4 h-4" /> Suspend Account
              </Button>
            )}

            {customer.status === 'suspended' && (
              <Button 
                onClick={() => handleStatusChange('active')} 
                variant="outline" 
                className="border-status-ok/30 text-status-ok hover:bg-status-ok/10 gap-2"
                disabled={isUpdatingStatus}
              >
                <RotateCcw className="w-4 h-4" /> Reactivate
              </Button>
            )}
            
            <Button 
              onClick={() => setShowDeleteModal(true)}
              variant="outline"
              className="border-status-fail/30 text-status-fail hover:bg-status-fail/10 p-3"
              title="Delete Customer"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {customer.status === 'rejected' && customer.rejectionReason && (
          <div className="bg-status-fail/10 border border-status-fail/30 rounded-2xl p-6 flex gap-4 items-start">
            <AlertTriangle className="w-6 h-6 text-status-fail shrink-0 mt-0.5" />
            <div>
              <h3 className="text-status-fail font-medium">Application Rejected</h3>
              <p className="text-status-fail/80 mt-1">{customer.rejectionReason}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Profile Details Card */}
          <Card className="md:col-span-1 p-6 space-y-6">
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              <User className="w-5 h-5 text-signal" /> Profile Details
            </h2>
            
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

              <div className="flex flex-col gap-1 pt-2 border-t border-white/[0.05]">
                <span className="text-xs text-ink-faint uppercase tracking-wider font-semibold">National ID (NIN)</span>
                <div className="flex items-center gap-2 text-ink font-mono">
                  <ShieldCheck className="w-4 h-4 text-status-ok" />
                  •••• {customer.ninLast4}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-ink-faint uppercase tracking-wider font-semibold">Biometrics Status</span>
                <div className="flex items-center gap-2 text-ink">
                  <Fingerprint className="w-4 h-4 text-signal" />
                  {customer.capturedFingers?.length > 0 ? (
                    <span className="text-status-ok text-sm">{customer.capturedFingers.length} Prints Registered</span>
                  ) : (
                    <span className="text-status-warning text-sm">No Biometrics</span>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col gap-1 pt-2 border-t border-white/[0.05]">
                <span className="text-xs text-ink-faint uppercase tracking-wider font-semibold">Registration Date</span>
                <div className="flex items-center gap-2 text-ink">
                  <Clock className="w-4 h-4 text-ink-muted" />
                  {formatDate(customer.createdAt)}
                </div>
              </div>
            </div>
          </Card>

          {/* Linked Banks & Transactions */}
          <div className="md:col-span-2 space-y-8">
            
            {/* Linked Accounts */}
            <Card className="p-6">
              <h2 className="text-lg font-medium text-white mb-6 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-signal" /> Linked Bank Accounts
              </h2>
              {linkedAccounts.length === 0 ? (
                <div className="text-center py-6 text-ink-muted border border-dashed border-white/10 rounded-xl">
                  No linked bank accounts found.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {linkedAccounts.map(acc => (
                    <div key={acc.id} className="bg-white/[0.02] border border-white/[0.05] p-4 rounded-xl flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-signal/10 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-signal" />
                      </div>
                      <div>
                        <div className="text-white font-medium">{acc.bank_name}</div>
                        <div className="text-ink-muted text-sm font-mono">•••• {acc.account_number.slice(-4)}</div>
                      </div>
                    </div>
                  ))}
                </div>
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
                        <span className="text-signal font-display">{formatCurrency(tx.amount)}</span>
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
                    <Link key={tkt.id} to={location.pathname.includes('/complaints') ? \../\\ : \../../complaints/\\} className="flex items-center justify-between p-4 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] rounded-xl transition-all cursor-pointer">
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

      {/* Delete Modal */}
      <Modal isOpen={showDeleteModal} onClose={() => !isDeleting && setShowDeleteModal(false)} title="Delete Customer">
        <div className="space-y-4">
          <div className="bg-status-fail/10 text-status-fail p-4 rounded-xl flex gap-3 text-sm border border-status-fail/20">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <p>This action cannot be undone. All personal data will be permanently deleted. Transaction records will be anonymized.</p>
          </div>
          {deleteError && <p className="text-status-fail text-sm font-medium">{deleteError}</p>}
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => setShowDeleteModal(false)} disabled={isDeleting}>Cancel</Button>
            <Button onClick={handleDelete} className="bg-status-fail text-white hover:bg-status-fail/90" disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete Permanently"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Approve Modal */}
      <Modal isOpen={showApproveModal} onClose={() => !isApproving && setShowApproveModal(false)} title="Approve Customer">
        <div className="space-y-4">
          <div className="bg-status-ok/10 text-status-ok p-4 rounded-xl flex gap-3 text-sm border border-status-ok/20">
            <UserCheck className="w-5 h-5 shrink-0" />
            <p>You are about to verify this customer's KYC data. This will grant them full access to the MiliPay network.</p>
          </div>
          {approvalError && <p className="text-status-fail text-sm font-medium">{approvalError}</p>}
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => setShowApproveModal(false)} disabled={isApproving}>Cancel</Button>
            <Button onClick={handleApprove} className="bg-status-ok text-ledger hover:bg-status-ok/90" disabled={isApproving}>
              {isApproving ? "Approving..." : "Approve & Verify"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal isOpen={showRejectModal} onClose={() => !isRejecting && setShowRejectModal(false)} title="Reject Customer">
        <div className="space-y-4">
          <div className="bg-status-warning/10 text-status-warning p-4 rounded-xl flex gap-3 text-sm border border-status-warning/20">
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
            <Button variant="outline" onClick={() => setShowRejectModal(false)} disabled={isRejecting}>Cancel</Button>
            <Button onClick={handleReject} className="bg-status-warning text-ledger hover:bg-status-warning/90" disabled={isRejecting}>
              {isRejecting ? "Rejecting..." : "Confirm Rejection"}
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
\

fs.writeFileSync('packages/shared/src/pages/customers/CustomerDetailsPage.tsx', content, 'utf8');
