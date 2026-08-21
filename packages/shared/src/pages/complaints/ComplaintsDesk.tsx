import { MessageSquareWarning, Filter, MoreVertical, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

export function ComplaintsDesk() {
  const complaints = [
    { id: "TKT-1092", user: "Adeola Okafor", issue: "Transfer failed but money was debited", status: "Open", urgency: "High", time: "10 mins ago" },
    { id: "TKT-1091", user: "Musa Ibrahim", issue: "Cannot reset PIN via SMS", status: "In Progress", urgency: "Medium", time: "1 hour ago" },
    { id: "TKT-1090", user: "Chidinma Eze", issue: "App crashes on biometric scan", status: "Open", urgency: "High", time: "2 hours ago" },
    { id: "TKT-1089", user: "Lana Adesanya", issue: "Card delivery delayed", status: "Resolved", urgency: "Low", time: "Yesterday" },
  ];

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
                <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {complaints.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="p-4 font-mono text-sm text-ink-muted">{ticket.id}</td>
                  <td className="p-4">
                    <Link to={`/customer/cus_1001`} className="font-medium text-status-info hover:underline">
                      {ticket.user}
                    </Link>
                  </td>
                  <td className="p-4">
                    <div className="text-sm text-ink">{ticket.issue}</div>
                    <div className="text-xs text-ink-muted mt-0.5">{ticket.time}</div>
                  </td>
                  <td className="p-4">
                    {ticket.status === "Open" && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-status-fail/10 text-status-fail border border-status-fail/20">{ticket.status}</span>}
                    {ticket.status === "In Progress" && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-status-warning/10 text-status-warning border border-status-warning/20">{ticket.status}</span>}
                    {ticket.status === "Resolved" && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-status-ok/10 text-status-ok border border-status-ok/20"><CheckCircle2 className="w-3 h-3 mr-1"/>{ticket.status}</span>}
                  </td>
                  <td className="p-4">
                    <button className="text-ink-muted hover:text-ink transition-colors">
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
