import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Shield, 
  Users, 
  Headset, 
  Mail, 
  Phone, 
  MapPin, 
  Fingerprint, 
  Calendar, 
  ExternalLink, 
  Copy, 
  Check, 
  Ban, 
  CheckCircle, 
  Trash2, 
  Clock, 
  CheckCircle2, 
  XCircle,
  TrendingUp,
  AlertTriangle,
  Key,
  Laptop
} from "lucide-react";
import { Card } from "@milipay/shared/components/ui/Card";
import { StatusBadge } from "@milipay/shared/components/ui/StatusBadge";
import { DataTable, type Column } from "@milipay/shared/components/ui/DataTable";
import { Button } from "@milipay/shared/components/ui/Button";
import { Modal } from "@milipay/shared/components/ui/Modal";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { 
  fetchStaffDetails, 
  getPortalDetails, 
  toggleStaffStatus, 
  deleteStaffMember 
} from "@milipay/shared/features/staff/api";
import { formatDate } from "@milipay/shared/lib/utils/format";
import type { StaffProfile, Role } from "@milipay/shared/types";

function RoleBadge({ role }: { role: Role }) {
  const styles = {
    agent: "bg-signal/10 text-signal-bright border-signal/20",
    support: "bg-status-info/10 text-status-info border-status-info/20",
    admin: "bg-status-warning/10 text-status-warning border-status-warning/20",
    super_admin: "bg-status-fail/10 text-status-fail border-status-fail/20",
  };

  const icons = {
    agent: <Users className="w-3.5 h-3.5 mr-1.5" />,
    support: <Headset className="w-3.5 h-3.5 mr-1.5" />,
    admin: <Shield className="w-3.5 h-3.5 mr-1.5" />,
    super_admin: <Shield className="w-3.5 h-3.5 mr-1.5" />,
  };

  const labels = {
    agent: "Field Agent",
    support: "Service / Support",
    admin: "Administrator",
    super_admin: "Super Admin",
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${styles[role]}`}>
      {icons[role]}
      {labels[role]}
    </span>
  );
}

export default function StaffDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [details, setDetails] = useState<{
    profile: StaffProfile;
    stats?: {
      totalEnrolled: number;
      pendingKYC: number;
      approvedKYC: number;
      rejectedKYC: number;
      recentCustomers: Array<{ id: string; fullName: string; phone: string; status: string; createdAt: string }>;
    };
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [hasCopiedPortal, setHasCopiedPortal] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const loadStaff = async () => {
      setIsLoading(true);
      try {
        const data = await fetchStaffDetails(id);
        if (!cancelled) setDetails(data);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadStaff();

    return () => { cancelled = true; };
  }, [id]);

  const handleToggleStatus = async () => {
    if (!details?.profile.id) return;
    setIsUpdatingStatus(true);
    try {
      const ok = await toggleStaffStatus(details.profile.id);
      if (ok) {
        setDetails((prev) => prev ? {
          ...prev,
          profile: {
            ...prev.profile,
            status: prev.profile.status === "active" ? "suspended" : "active"
          }
        } : null);
      }
    } catch (err) {
      console.error("Failed to toggle status", err);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleDeleteStaff = async () => {
    if (!details?.profile.id) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteStaffMember(details.profile.id);
      setShowDeleteModal(false);
      navigate("/dashboard/staff", { replace: true });
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete staff member");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyPortal = (url: string) => {
    navigator.clipboard.writeText(url);
    setHasCopiedPortal(true);
    setTimeout(() => setHasCopiedPortal(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto bg-ledger min-h-screen flex items-center justify-center p-6">
        <LoadingState
          minHeight="min-h-[50vh]"
          title="Loading Staff Profile..."
          description="Retrieving security credentials, portal permissions, and performance records."
        />
      </div>
    );
  }

  if (!details?.profile) {
    return (
      <div className="p-6 md:p-10 max-w-5xl mx-auto text-center space-y-4">
        <h1 className="text-2xl font-display font-bold text-ink">Staff Member Not Found</h1>
        <Button variant="secondary" onClick={() => navigate("/dashboard/staff")}>
          Back to Staff &amp; Team
        </Button>
      </div>
    );
  }

  const staff = details.profile;
  const portal = getPortalDetails(staff.role);
  const agentStats = details.stats;
  const totalEvaluated = agentStats ? agentStats.approvedKYC + agentStats.rejectedKYC : 0;
  const successRate = totalEvaluated > 0 
    ? Math.round((agentStats!.approvedKYC / totalEvaluated) * 100) 
    : (agentStats?.totalEnrolled ? 100 : 0);

  const customerColumns: Column<any>[] = [
    {
      key: "name",
      header: "Customer",
      render: (row) => (
        <div>
          <span className="text-sm font-medium text-white block">{row.fullName}</span>
          <span className="text-xs text-ink-muted font-data">{row.phone}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "KYC Status",
      render: (row) => <StatusBadge status={row.status as any} />,
    },
    {
      key: "date",
      header: "Enrolled Date",
      render: (row) => <span className="text-xs text-ink-muted">{formatDate(row.createdAt)}</span>,
    },
  ];

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8 animate-rise-in pb-32">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link 
            to="/dashboard/staff" 
            className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-signal-bright transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Staff &amp; Team
          </Link>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl md:text-3xl font-display font-bold text-ink">{staff.fullName}</h1>
            <RoleBadge role={staff.role} />
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              staff.status === 'active' 
                ? 'bg-status-ok/15 text-status-ok border border-status-ok/30' 
                : 'bg-status-fail/15 text-status-fail border border-status-fail/30'
            }`}>
              {staff.status === 'active' ? 'Active' : 'Suspended'}
            </span>
          </div>
          <p className="text-ink-muted mt-1 font-data text-sm">Staff ID: {staff.id}</p>
        </div>
        
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <Button 
            variant={staff.status === "suspended" ? "primary" : "secondary"} 
            onClick={handleToggleStatus}
            disabled={isUpdatingStatus || isDeleting}
          >
            {staff.status === "suspended" ? (
              <><CheckCircle className="w-4 h-4 mr-2" /> Activate Staff Member</>
            ) : (
              <><Ban className="w-4 h-4 mr-2" /> Suspend Staff Member</>
            )}
          </Button>

          <Button 
            variant="danger"
            onClick={() => {
              setDeleteError(null);
              setShowDeleteModal(true);
            }}
            disabled={isUpdatingStatus || isDeleting}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Staff
          </Button>
        </div>
      </div>

      {/* Top Row: Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Contact Info Card */}
        <Card raised className="p-6 space-y-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Mail className="w-24 h-24" />
          </div>
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-2 relative z-10">
            <Mail className="w-4 h-4 text-signal" /> Contact Details
          </h2>
          <div className="space-y-4 relative z-10">
            <div>
              <p className="text-xs text-ink-faint">Email Address (Login ID)</p>
              <p className="text-ink font-medium text-sm break-all mt-0.5">{staff.email}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Phone Number</p>
              <p className="font-data text-ink flex items-center gap-2 mt-0.5">
                <Phone className="w-3.5 h-3.5 text-ink-muted" /> {staff.phone}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Territory / Operating State</p>
              <p className="text-ink flex items-center gap-2 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-signal-bright" /> {staff.state || "National / Central"}
              </p>
            </div>
          </div>
        </Card>

        {/* Identity & Records Card */}
        <Card raised className="p-6 space-y-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Fingerprint className="w-24 h-24" />
          </div>
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-2 relative z-10">
            <Fingerprint className="w-4 h-4 text-signal" /> Identity &amp; Records
          </h2>
          <div className="space-y-4 relative z-10">
            <div>
              <p className="text-xs text-ink-faint">National Identification Number (NIN)</p>
              <p className="font-data text-ink flex items-center gap-2 mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-status-ok" />
                •••• •••• {staff.ninLast4 || staff.nin?.slice(-4) || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Identity Status</p>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-status-ok/10 text-status-ok border border-status-ok/20 mt-1">
                Verified Identity
              </span>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Date Registered / Joined</p>
              <p className="text-xs text-ink-muted mt-0.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-ink-muted" /> {formatDate(staff.createdAt)}
              </p>
            </div>
          </div>
        </Card>

        {/* Workspace & Portal Access */}
        <Card raised className="p-6 space-y-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Laptop className="w-24 h-24" />
          </div>
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-2 relative z-10">
            <Laptop className="w-4 h-4 text-signal" /> Portal Workspace Access
          </h2>
          <div className="space-y-3.5 relative z-10 text-xs">
            <div>
              <span className="text-ink-faint block">Assigned Web App</span>
              <span className="text-sm font-bold text-white mt-0.5 block">{portal.portalName}</span>
              <span className="text-signal-bright font-data block text-xs mt-0.5">{portal.portalUrl}</span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleCopyPortal(portal.portalUrl)}
                className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/10 text-white transition-colors border border-white/10 flex items-center gap-1.5"
              >
                {hasCopiedPortal ? <Check className="w-3.5 h-3.5 text-status-ok" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{hasCopiedPortal ? "Copied" : "Copy Link"}</span>
              </button>
              <a
                href={portal.portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-signal/15 hover:bg-signal/25 text-signal-bright transition-colors border border-signal/30 flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Launch</span>
              </a>
            </div>

            <div className="p-2.5 rounded-lg bg-ledger-line border border-white/[0.06] text-[11px] text-ink-muted flex items-start gap-2">
              <Key className="w-3.5 h-3.5 text-signal-bright shrink-0 mt-0.5" />
              <span>
                A one-time password was sent to this staff member&apos;s phone at
                creation. It is never displayed here.
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Field Agent Performance & Enrolled Customers (If Agent) */}
      {staff.role === "agent" && agentStats && (
        <div className="space-y-6">
          {/* 5-Metric Breakdown */}
          <div>
            <h2 className="text-xl font-display font-semibold text-ink mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-signal" /> Field Enrollment Performance
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 backdrop-blur-xl">
                <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider block">Total Enrolled</span>
                <span className="text-3xl font-display text-white font-bold mt-2 block">{agentStats.totalEnrolled}</span>
                <p className="text-[11px] text-ink-faint mt-1">Total registrations</p>
              </div>

              <div className="bg-status-warning/[0.03] border border-status-warning/20 rounded-2xl p-5 backdrop-blur-xl">
                <span className="text-xs font-semibold text-status-warning uppercase tracking-wider block flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Pending
                </span>
                <span className="text-3xl font-display text-status-warning font-bold mt-2 block">{agentStats.pendingKYC}</span>
                <p className="text-[11px] text-ink-faint mt-1">Awaiting admin review</p>
              </div>

              <div className="bg-status-ok/[0.03] border border-status-ok/20 rounded-2xl p-5 backdrop-blur-xl">
                <span className="text-xs font-semibold text-status-ok uppercase tracking-wider block flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                </span>
                <span className="text-3xl font-display text-status-ok font-bold mt-2 block">{agentStats.approvedKYC}</span>
                <p className="text-[11px] text-ink-faint mt-1">Active &amp; verified</p>
              </div>

              <div className="bg-status-fail/[0.03] border border-status-fail/20 rounded-2xl p-5 backdrop-blur-xl">
                <span className="text-xs font-semibold text-status-fail uppercase tracking-wider block flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> Declined
                </span>
                <span className="text-3xl font-display text-status-fail font-bold mt-2 block">{agentStats.rejectedKYC}</span>
                <p className="text-[11px] text-ink-faint mt-1">Action required</p>
              </div>

              <div className="col-span-2 sm:col-span-1 bg-signal/[0.04] border border-signal/25 rounded-2xl p-5 backdrop-blur-xl">
                <span className="text-xs font-semibold text-signal-bright uppercase tracking-wider block flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" /> Success Rate
                </span>
                <span className="text-3xl font-display text-white font-bold mt-2 block">{successRate}%</span>
                <p className="text-[11px] text-ink-faint mt-1">Approval accuracy</p>
              </div>
            </div>
          </div>

          {/* Enrolled Customers Table */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-ink">Customers Enrolled by {staff.fullName}</h3>
              <span className="text-xs text-ink-muted">{agentStats.recentCustomers.length} registered customers</span>
            </div>

            <DataTable
              columns={customerColumns}
              data={agentStats.recentCustomers}
              isLoading={false}
              onRowClick={(row) => navigate(`/dashboard/customers/${row.id}`)}
              rowKey={(row) => row.id}
              emptyMessage="No customer registrations recorded for this agent terminal yet."
            />
          </div>
        </div>
      )}

      {/* Delete Staff Confirmation Modal */}
      {showDeleteModal && (
        <Modal
          isOpen={showDeleteModal}
          onClose={() => {
            if (!isDeleting) setShowDeleteModal(false);
          }}
          title="Delete Staff Member"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-status-fail/10 border border-status-fail/25 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-status-fail shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-white">Permanently Revoke Staff Access</p>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                  Are you sure you want to delete <strong className="text-white">{staff.fullName}</strong> ({staff.email})? 
                  This will permanently delete their staff profile and revoke portal access immediately.
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
                onClick={handleDeleteStaff}
                disabled={isDeleting}
                className="px-4 py-2 bg-status-fail hover:bg-status-fail/90 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {isDeleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
