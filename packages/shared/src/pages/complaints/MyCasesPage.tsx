import { useEffect, useState } from "react";
import { Users, MoreVertical, CheckCircle2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { fetchSupportTickets } from "@milipay/shared/features/support/api";
import type { SupportTicket } from "@milipay/shared/types";
import { formatDate } from "@milipay/shared/lib/utils/format";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { TableSkeletonRows } from "@milipay/shared/components/ui/Skeleton";

export function MyCasesPage() {
  const [complaints, setComplaints] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.id) {
      fetchSupportTickets({ assignedTo: user.id }).then((res) => {
        setComplaints(res.items);
        setIsLoading(false);
      });
    }
  }, [user]);

  const getSLAColor = (createdAt: string) => {
    const hoursOpen = (new Date().getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
    if (hoursOpen >= 4) return "bg-status-fail/10 text-status-fail border-status-fail/20";
    if (hoursOpen >= 2) return "bg-status-warn/10 text-status-warn border-status-warn/20";
    return "bg-white/[0.05] text-ink border-white/[0.1]";
  };

  return (
    <div className="flex-1 overflow-auto bg-ledger min-h-screen">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 pb-32">
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display text-ink tracking-tight flex items-center gap-3">
              <Users className="w-7 h-7 sm:w-8 sm:h-8 text-status-info" />
              My Assigned Cases
            </h1>
            <p className="text-ink-muted text-xs sm:text-sm mt-1">Manage and resolve tickets assigned directly to you.</p>
          </div>
        </div>

        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl sm:rounded-3xl backdrop-blur-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.05] bg-white/[0.01]">
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Ticket ID</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Customer</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Issue Description</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Status</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {isLoading ? (
                  <TableSkeletonRows columns={5} rows={5} />
                ) : complaints.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-ink-muted text-xs sm:text-sm">You have no active cases assigned to you.</td>
                  </tr>
                ) : (
                  complaints.map((ticket) => (
                    <tr 
                      key={ticket.id} 
                      className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                      onClick={() => { navigate(`/complaints/${ticket.id}`); }}
                    >
                    <td className="p-4 font-mono text-sm text-ink-muted">{ticket.ticketId}</td>
                    <td className="p-4">
                      {ticket.customerId ? (
                        <Link to={`/customers/${ticket.customerId}`} className="font-medium text-status-info hover:underline">
                          {ticket.customerName}
                        </Link>
                      ) : (
                        <span className="text-ink-muted">Unknown</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="text-sm text-ink font-medium">{ticket.issueDescription}</div>
                      <div className="text-xs text-ink-muted mt-0.5">{formatDate(ticket.createdAt)}</div>
                    </td>
                    <td className="p-4">
                      {ticket.status === "open" && (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getSLAColor(ticket.createdAt)}`}>
                          Open
                        </span>
                      )}
                      {ticket.status === "in_progress" && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-status-info/10 text-status-info border border-status-info/20">In Progress</span>}
                      {ticket.status === "resolved" && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-status-ok/10 text-status-ok border border-status-ok/20"><CheckCircle2 className="w-3 h-3 mr-1"/>Resolved</span>}
                    </td>
                    <td className="p-4">
                      <button className="text-ink-muted hover:text-ink transition-colors">
                        <MoreVertical className="w-5 h-5" />
                      </button>
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
