import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { DataTable, type Column } from "@milipay/shared/components/ui/DataTable";
import { SearchInput } from "@milipay/shared/components/ui/SearchInput";
import { FilterChips } from "@milipay/shared/components/ui/FilterChips";
import { StatusBadge } from "@milipay/shared/components/ui/StatusBadge";
import { Button } from "@milipay/shared/components/ui/Button";
import { Modal } from "@milipay/shared/components/ui/Modal";
import { Input } from "@milipay/shared/components/ui/Input";
import { 
  fetchCustomers, 
  deleteCustomer, 
  approveCustomer, 
  rejectCustomer, 
  fetchPendingCustomerCount 
} from "@milipay/shared/features/customers/api";
import { formatDate } from "@milipay/shared/lib/utils/format";
import { 
  DEFAULT_REJECTION_REASONS,
  type Customer, 
  type CustomerStatus, 
  type PaginatedResult 
} from "@milipay/shared/types";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { Trash2, AlertTriangle, CheckCircle, XCircle, Smartphone, ShieldCheck, UserCheck } from "lucide-react";

export default function CustomersPage() {
  const [data, setData] = useState<PaginatedResult<Customer> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | "all">("all");
  const [pendingCount, setPendingCount] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  // Deletion state
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Approval state
  const [customerToApprove, setCustomerToApprove] = useState<Customer | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  // Rejection state
  const [customerToReject, setCustomerToReject] = useState<Customer | null>(null);
  const [rejectReason, setRejectReason] = useState<string>(DEFAULT_REJECTION_REASONS[0]);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const agentId = user?.role === 'agent' ? user.id : undefined;

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [result, count] = await Promise.all([
        fetchCustomers({ 
          page, 
          pageSize: 10, 
          search, 
          status: statusFilter === "all" ? "" : statusFilter,
          registeredBy: agentId 
        }),
        fetchPendingCustomerCount(agentId)
      ]);
      setData(result);
      setPendingCount(count);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter, agentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleConfirmDelete = async () => {
    if (!customerToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteCustomer(customerToDelete.id);
      setCustomerToDelete(null);
      loadData();
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete customer");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmApprove = async () => {
    if (!customerToApprove) return;
    setIsApproving(true);
    setApprovalError(null);
    try {
      await approveCustomer(customerToApprove.id);
      setCustomerToApprove(null);
      loadData();
    } catch (err: any) {
      setApprovalError(err.message || "Failed to approve customer");
    } finally {
      setIsApproving(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!customerToReject) return;
    setIsRejecting(true);
    setRejectError(null);
    try {
      await rejectCustomer(customerToReject.id, rejectReason);
      setCustomerToReject(null);
      setRejectReason(DEFAULT_REJECTION_REASONS[0]);
      loadData();
    } catch (err: any) {
      setRejectError(err.message || "Failed to reject customer");
    } finally {
      setIsRejecting(false);
    }
  };

  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: "Customer",
      render: (row) => (
        <div>
          <span className="text-sm font-medium text-ink block">{row.fullName}</span>
          <span className="text-xs text-ink-muted">NIN: ••••{row.ninLast4}</span>
        </div>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      render: (row) => <span className="font-data text-sm text-ink-muted">{row.phone}</span>,
    },
    {
      key: "enrolled_by",
      header: "Enrolled By",
      render: (row) => (
        row.registeredByName ? (
          <div>
            <span className="text-xs font-medium text-white block">{row.registeredByName}</span>
            <span className="text-[10px] text-signal-bright uppercase font-semibold flex items-center gap-1">
              <UserCheck className="w-3 h-3" />
              {row.registeredByRole || "Agent"} {row.registeredByState ? `• ${row.registeredByState}` : ""}
            </span>
          </div>
        ) : (
          <span className="text-xs text-ink-muted italic">Direct Admin</span>
        )
      ),
    },
    {
      key: "state",
      header: "Territory / State",
      render: (row) => <span className="text-sm text-ink-muted">{row.state}</span>,
    },
    {
      key: "status",
      header: "KYC Status",
      render: (row) => (
        <div className="space-y-0.5">
          <StatusBadge status={row.status} />
          {row.status === "rejected" && row.rejectionReason && (
            <p className="text-[10px] text-status-fail line-clamp-1 max-w-[160px]" title={row.rejectionReason}>
              {row.rejectionReason}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "registered",
      header: "Registered",
      render: (row) => <span className="text-sm text-ink-faint">{formatDate(row.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        isAdmin ? (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {row.status === "pending" && (
              <>
                <button
                  onClick={() => {
                    setCustomerToApprove(row);
                    setApprovalError(null);
                  }}
                  className="p-1.5 rounded-lg text-status-ok hover:bg-status-ok/10 transition-colors"
                  title="Approve & Send SMS Password"
                >
                  <CheckCircle className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setCustomerToReject(row);
                    setRejectReason(DEFAULT_REJECTION_REASONS[0]);
                    setRejectError(null);
                  }}
                  className="p-1.5 rounded-lg text-status-warn hover:bg-status-warn/10 transition-colors"
                  title="Reject Enrollment"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={() => {
                setCustomerToDelete(row);
                setDeleteError(null);
              }}
              className="p-1.5 rounded-lg text-status-fail hover:bg-status-fail/10 transition-colors"
              title="Delete Customer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <span className="text-ink-faint text-xs">—</span>
        )
      ),
    }
  ];

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto animate-rise-in">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-ink">
          {user?.role === "agent" ? "Your Enrolled Customers" : "Customer KYC & Verification"}
        </h1>
        <p className="text-ink-muted mt-1 text-sm">
          {user?.role === "agent" 
            ? "Track and manage identity verification for customers you have enrolled." 
            : "Manage biometric identity enrollments and customer verifications."}
        </p>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="w-full md:w-80">
          <SearchInput 
            onSearch={(val) => { setSearch(val); setPage(1); }} 
            placeholder="Search by name or phone..." 
          />
        </div>
        <FilterChips
          options={[
            { label: "All Customers", value: "all" },
            { 
              label: pendingCount > 0 ? `Pending Verification (${pendingCount})` : "Pending Verification", 
              value: "pending" 
            },
            { label: "Active", value: "active" },
            { label: "Rejected", value: "rejected" },
            { label: "Suspended", value: "suspended" },
          ]}
          selected={statusFilter}
          onChange={(val) => { setStatusFilter(val as CustomerStatus | "all"); setPage(1); }}
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.items || []}
        isLoading={isLoading}
        page={data?.page}
        pageSize={10}
        totalCount={data?.totalCount}
        onPageChange={setPage}
        onRowClick={(row) => {
          const basePath = location.pathname.startsWith('/dashboard') ? '/dashboard/customers' : '/customers';
          navigate(`${basePath}/${row.id}`);
        }}
        rowKey={(row) => row.id}
        emptyMessage="No customers found matching your criteria."
      />

      {/* Approve Customer Modal */}
      {customerToApprove && (
        <Modal
          isOpen={!!customerToApprove}
          onClose={() => {
            if (!isApproving) setCustomerToApprove(null);
          }}
          title="Approve Customer & Dispatch Login SMS"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-status-ok/10 border border-status-ok/25 rounded-xl">
              <ShieldCheck className="w-5 h-5 text-status-ok shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-white">Verification Approval</p>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                  Approving <strong className="text-white">{customerToApprove.fullName}</strong> ({customerToApprove.phone}) will create their Supabase Auth account and immediately dispatch a temporary password via SMS.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-ledger-line/50 p-4 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-ink-muted">Customer Name</span>
                <span className="text-white font-medium">{customerToApprove.fullName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-ink-muted">Enrolled By</span>
                <span className="text-signal-bright font-medium">{customerToApprove.registeredByName || "Direct Admin Enrollment"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-ink-muted">Phone Number (SMS Recipient)</span>
                <span className="text-signal-bright font-data">{customerToApprove.phone}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-ink-muted">Verified NIN</span>
                <span className="text-white font-data">••••••••{customerToApprove.ninLast4}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-ink-muted">Biometric Status</span>
                <span className="text-status-ok font-medium">4 Fingers Enrolled</span>
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
                onClick={() => setCustomerToApprove(null)}
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

      {/* Reject Customer Modal with Standard Default Reasons */}
      {customerToReject && (
        <Modal
          isOpen={!!customerToReject}
          onClose={() => {
            if (!isRejecting) setCustomerToReject(null);
          }}
          title="Reject Customer Enrollment"
        >
          <div className="space-y-4">
            <p className="text-xs text-ink-muted leading-relaxed">
              Rejecting enrollment for <strong className="text-white">{customerToReject.fullName}</strong>. Select a standard rejection reason or specify a custom reason below:
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
              label="Selected Reason / Additional Message"
              placeholder="e.g. NIN name mismatch, unclear fingerprint capture..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              required
            />

            <div className="p-3 bg-ledger-line rounded-lg border border-white/[0.08] flex items-center gap-2 text-xs text-ink-muted">
              <Smartphone className="w-4 h-4 text-signal-bright shrink-0" />
              <span>
                An SMS with this rejection explanation will be dispatched to <strong className="text-white">{customerToReject.phone}</strong>.
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
                onClick={() => setCustomerToReject(null)}
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
      {customerToDelete && (
        <Modal
          isOpen={!!customerToDelete}
          onClose={() => {
            if (!isDeleting) setCustomerToDelete(null);
          }}
          title="Delete Customer Account"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-status-fail/10 border border-status-fail/25 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-status-fail shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-white">Permanent Deletion Warning</p>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                  Are you sure you want to delete <strong className="text-white">{customerToDelete.fullName}</strong> ({customerToDelete.phone})? 
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
                onClick={() => setCustomerToDelete(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
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
