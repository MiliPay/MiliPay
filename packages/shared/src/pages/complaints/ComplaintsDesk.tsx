import { useEffect, useState } from "react";
import { MessageSquareWarning, Filter, MoreVertical, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchSupportTickets } from "@milipay/shared/features/support/api";
import type { SupportTicket } from "@milipay/shared/types";
import { formatDate } from "@milipay/shared/lib/utils/format";

export function ComplaintsDesk() {
  const [complaints, setComplaints] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSupportTickets().then((res) => {
      setComplaints(res.items);
      setIsLoading(false);
    });
  }, []);

  const getSLAColor = (createdAt: string) => {
    const hoursOpen = (new Date().getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
    if (hoursOpen >= 4) return "bg-status-fail/10 text-status-fail border-status-fail/20"; // Red (Critical)
    if (hoursOpen >= 2) return "bg-status-warning/10 text-status-warning border-status-warning/20"; // Yellow (Warning)
    return "bg-white/[0.05] text-ink border-white/[0.1]"; // Default (Normal)
  };

  return (
    <div className="flex-1 overflow-auto bg-ledger min-h-screen">
      <div className="max-w-5xl mx-auto p-8 space-y-8 pb-32">
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display text-ink tracking-tight flex items-center gap-3">
              <MessageSquareWarning className="w-8 h-8 text-status-warning" />
              Complaints Desk
            </h1>
            <p className="text-ink-muted mt-1">Manage and resolve issues submitted from the MiliPay app.</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.05] border border-white/[0.1] text-ink hover:bg-white/[0.1] transition-colors">
            <Filter className="w-4 h-4" />
            Filter Tickets
          </button>
        </div>

        <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl backdrop-blur-xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.05] bg-white/[0.01]">
                <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Ticket ID</th>
                <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Customer</th>
                <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Issue Description</th>
                <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Status</th>
                <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Assigned To</th>
                <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-ink-muted">Loading tickets...</td>
                </tr>
              ) : complaints.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-ink-muted">No tickets found.</td>
                </tr>
              ) : (
                complaints.map((ticket) => (
                  <tr 
                    key={ticket.id} 
                    className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                    onClick={() => { window.location.href = `/complaints/${ticket.id}` }}
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
                    <td className="p-4 text-sm text-ink-muted">
                      {ticket.assignedToName || "Unassigned"}
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
  );
}
