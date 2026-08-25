import { useEffect, useState } from "react";
import { Plus, Clock, CheckCircle2, Search, XCircle, TrendingUp, Users } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@milipay/shared/components/ui/Button";
import { Input } from "@milipay/shared/components/ui/Input";
import { fetchCustomers } from "@milipay/shared/features/customers/api";
import { formatDate } from "@milipay/shared/lib/utils/format";
import type { Customer } from "@milipay/shared/types";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";

export function AgentDashboard() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const agentId = user?.role === "agent" ? user.id : undefined;

  useEffect(() => {
    setIsLoading(true);
    fetchCustomers({ search, registeredBy: agentId }).then((res) => {
      setCustomers(res.items);
      setIsLoading(false);
    });
  }, [search, agentId]);

  const totalEnrolled = customers.length;
  const pendingCount = customers.filter(c => c.status === "pending").length;
  const activeCount = customers.filter(c => c.status === "active").length;
  const rejectedCount = customers.filter(c => c.status === "rejected").length;

  const totalEvaluated = activeCount + rejectedCount;
  const successRate = totalEvaluated > 0 
    ? ((activeCount / totalEvaluated) * 100).toFixed(1) 
    : (totalEnrolled > 0 ? "100" : "0");

  return (
    <div className="flex-1 overflow-auto bg-ledger min-h-screen">
      <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-8 pb-32">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-ink tracking-tight">Agent Terminal</h1>
            <p className="text-ink-muted text-sm mt-1">
              Welcome back, <strong className="text-white">{user?.fullName || "Field Agent"}</strong>. Monitor your personal customer enrollments and KYC verifications.
            </p>
          </div>
          <Link to="/register">
            <Button className="gap-2 bg-signal text-white hover:bg-signal-bright shadow-[0_0_20px_rgba(var(--color-signal),0.3)] border border-signal-bright/50">
              <Plus className="w-4 h-4" />
              New Registration
            </Button>
          </Link>
        </div>

        {/* 5-Column Stats Row: Enrolled, Pending, Approved, Rejected, Success Rate */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Total Enrolled */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Enrolled</h3>
              <Users className="w-4 h-4 text-signal-bright" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-display text-white font-bold">{totalEnrolled}</span>
            </div>
            <p className="text-[11px] text-ink-faint mt-1">Total registrations</p>
          </div>

          {/* Pending Approval */}
          <div className="bg-status-warning/[0.03] border border-status-warning/20 rounded-2xl p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-status-warning uppercase tracking-wider">Pending</h3>
              <Clock className="w-4 h-4 text-status-warning" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-display text-status-warning font-bold">{pendingCount}</span>
            </div>
            <p className="text-[11px] text-ink-faint mt-1">Awaiting admin review</p>
          </div>

          {/* Approved & Active */}
          <div className="bg-status-ok/[0.03] border border-status-ok/20 rounded-2xl p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-status-ok uppercase tracking-wider">Approved</h3>
              <CheckCircle2 className="w-4 h-4 text-status-ok" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-display text-status-ok font-bold">{activeCount}</span>
            </div>
            <p className="text-[11px] text-ink-faint mt-1">Active &amp; verified</p>
          </div>

          {/* Action Required / Rejected */}
          <div className="bg-status-fail/[0.03] border border-status-fail/20 rounded-2xl p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-status-fail uppercase tracking-wider">Declined</h3>
              <XCircle className="w-4 h-4 text-status-fail" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-display text-status-fail font-bold">{rejectedCount}</span>
            </div>
            <p className="text-[11px] text-ink-faint mt-1">Action required</p>
          </div>

          {/* Success Rate */}
          <div className="col-span-2 sm:col-span-1 bg-signal/[0.04] border border-signal/25 rounded-2xl p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-signal-bright uppercase tracking-wider">Success Rate</h3>
              <TrendingUp className="w-4 h-4 text-signal-bright" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-display text-white font-bold">{successRate}%</span>
            </div>
            <p className="text-[11px] text-ink-faint mt-1">Approval accuracy</p>
          </div>
        </div>

        {/* Registration History */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl backdrop-blur-xl overflow-hidden shadow-xl">
          <div className="p-5 md:p-6 border-b border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-ink tracking-tight">Your Enrolled Customers</h2>
              <p className="text-xs text-ink-muted mt-0.5">Click any record to inspect status or rejection feedback.</p>
            </div>
            <div className="w-full sm:w-72 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <Input
                placeholder="Search name or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-white/[0.03] border-white/[0.05] text-xs"
              />
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.05] bg-white/[0.01]">
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Customer</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">NIN</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Date</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">KYC Status &amp; Feedback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-ink-muted text-xs">Loading customer records...</td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-ink-muted text-xs">
                      No registrations found for your agent terminal. Click "New Registration" to enroll a customer.
                    </td>
                  </tr>
                ) : (
                  customers.map((customer) => (
                    <tr 
                      key={customer.id} 
                      onClick={() => navigate(`/customers/${customer.id}`)}
                      className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                    >
                      <td className="p-4">
                        <div className="font-medium text-sm text-ink">{customer.fullName}</div>
                        <div className="text-xs text-ink-muted font-data">{customer.phone}</div>
                      </td>
                      <td className="p-4 font-data text-xs text-ink-muted">•••• {customer.ninLast4}</td>
                      <td className="p-4 text-xs text-ink-muted">{formatDate(customer.createdAt)}</td>
                      <td className="p-4">
                        {customer.status === "active" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-status-ok/10 text-status-ok border border-status-ok/20">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Approved &amp; Active
                          </span>
                        )}
                        {customer.status === "pending" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-status-warning/10 text-status-warning border border-status-warning/20">
                            <Clock className="w-3.5 h-3.5" />
                            Pending Admin Review
                          </span>
                        )}
                        {customer.status === "rejected" && (
                          <div>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-status-fail/10 text-status-fail border border-status-fail/20">
                              <XCircle className="w-3.5 h-3.5" />
                              Declined by Admin
                            </span>
                            {customer.rejectionReason && (
                              <p className="text-[11px] text-status-fail mt-1 line-clamp-1 font-medium">
                                Reason: {customer.rejectionReason}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
