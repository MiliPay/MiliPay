import { useEffect, useState } from "react";
import { Ticket, Activity, CheckCircle2, Clock, AlertTriangle, AlertCircle, ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@milipay/shared/lib/supabase";
import { fetchSupportTicketStats, fetchEscalatedTickets, fetchSupportTickets } from "@milipay/shared/features/support/api";
import type { SupportTicket } from "@milipay/shared/types";
import { formatDate } from "@milipay/shared/lib/utils/format";
import { TableSkeletonRows, Skeleton } from "@milipay/shared/components/ui/Skeleton";

export function AdminSupportPage() {
  const [stats, setStats] = useState<any>(null);
  const [escalated, setEscalated] = useState<SupportTicket[]>([]);
  const [allTickets, setAllTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      fetchSupportTicketStats(),
      fetchEscalatedTickets(),
      fetchSupportTickets({ pageSize: 50 })
    ]).then(([statsData, escalatedData, allData]) => {
      setStats(statsData);
      setEscalated(escalatedData.items);
      setAllTickets(allData.items);
      setIsLoading(false);
    });
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || isSearching) return;
    
    setErrorMsg("");
    setIsSearching(true);
    
    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id")
        .eq("ticket_id", searchQuery.trim().toUpperCase())
        .single();
        
      if (error || !data) {
        setErrorMsg("Ticket not found. Please check the Ticket ID and try again.");
      } else {
        navigate(`/dashboard/support/${data.id}`);
      }
    } catch (err) {
      setErrorMsg("An error occurred while searching.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-ledger min-h-screen">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-10 pb-32">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display text-ink tracking-tight flex items-center gap-3">
              <Ticket className="w-7 h-7 sm:w-8 sm:h-8 text-signal" />
              Support & Escalations
            </h1>
            <p className="text-ink-muted text-xs sm:text-sm mt-1">Monitor global support health and resolve escalated tickets.</p>
          </div>
          <div className="flex flex-col sm:items-end gap-1 w-full sm:w-auto">
            <form onSubmit={handleSearch} className="relative flex items-center bg-white/[0.03] border border-white/[0.1] rounded-xl p-1 focus-within:border-signal/50 focus-within:bg-white/[0.05] transition-all w-full sm:w-auto">
              <input
                type="text"
                className="bg-transparent border-none px-3 py-1.5 text-sm text-white placeholder-ink-faint outline-none uppercase font-mono w-full sm:w-48"
                placeholder="Search TKT-..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit" disabled={isSearching} className="px-3 py-1 bg-white/[0.08] hover:bg-white/[0.15] text-xs font-semibold rounded-lg text-white transition-colors">
                {isSearching ? "..." : "Go"}
              </button>
            </form>
            {errorMsg && <p className="text-status-fail text-xs mt-1">{errorMsg}</p>}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl sm:rounded-3xl p-4 sm:p-6 backdrop-blur-xl">
            <div className="w-10 h-10 rounded-full bg-signal/10 flex items-center justify-center mb-4 border border-signal/20">
              <Activity className="w-5 h-5 text-signal" />
            </div>
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider">Total Tickets</h3>
            <div className="mt-2 flex items-end gap-2">
              {isLoading ? <Skeleton className="h-8 w-16" /> : <span className="text-3xl font-display text-ink">{stats?.totalTickets}</span>}
            </div>
          </div>
          
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-status-ok/5 pointer-events-none" />
            <div className="w-10 h-10 rounded-full bg-status-ok/10 flex items-center justify-center mb-4 border border-status-ok/20 relative z-10">
              <CheckCircle2 className="w-5 h-5 text-status-ok" />
            </div>
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider relative z-10">Resolved Tickets</h3>
            <div className="mt-2 flex items-end gap-3 relative z-10">
              {isLoading ? <Skeleton className="h-8 w-16" /> : (
                <>
                  <span className="text-3xl font-display text-ink">{stats?.resolvedTickets}</span>
                  <span className="text-sm text-status-ok font-medium mb-1">
                    {stats?.resolvedPercentage}%
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-status-info/5 pointer-events-none" />
            <div className="w-10 h-10 rounded-full bg-status-info/10 flex items-center justify-center mb-4 border border-status-info/20 relative z-10">
              <Clock className="w-5 h-5 text-status-info" />
            </div>
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider relative z-10">Pending Tickets</h3>
            <div className="mt-2 flex items-end gap-3 relative z-10">
              {isLoading ? <Skeleton className="h-8 w-16" /> : (
                <>
                  <span className="text-3xl font-display text-ink">{stats?.pendingTickets}</span>
                  <span className="text-sm text-status-info font-medium mb-1">
                    {stats?.pendingPercentage}%
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="bg-white/[0.02] border border-status-fail/20 rounded-3xl p-6 backdrop-blur-xl relative overflow-hidden shadow-[inset_0_0_20px_rgba(239,68,68,0.05)]">
            <div className="w-10 h-10 rounded-full bg-status-fail/10 flex items-center justify-center mb-4 border border-status-fail/20 relative z-10">
              <AlertTriangle className="w-5 h-5 text-status-fail" />
            </div>
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider relative z-10">Escalations</h3>
            <div className="mt-2 flex items-end gap-3 relative z-10">
              {isLoading ? <Skeleton className="h-8 w-16" /> : (
                <>
                  <span className="text-3xl font-display text-status-fail">{stats?.escalations}</span>
                  {stats?.escalations > 0 && (
                    <span className="text-xs text-status-fail/80 uppercase font-bold tracking-wider mb-2">Requires Action</span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Escalated Queue */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-status-fail" />
            <h2 className="text-lg font-medium text-white">Escalation Queue</h2>
          </div>
          
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl backdrop-blur-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.05] bg-white/[0.01]">
                  <th className="p-4 pl-6 text-xs font-semibold text-ink-muted uppercase tracking-wider">Ticket ID</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Urgency</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Issue Overview</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Customer</th>
                  <th className="p-4 pr-6 text-xs font-semibold text-ink-muted uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {isLoading ? (
                  <TableSkeletonRows columns={5} rows={4} />
                ) : escalated.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center">
                      <div className="w-12 h-12 rounded-full bg-status-ok/10 flex items-center justify-center mx-auto mb-4 border border-status-ok/20">
                        <CheckCircle2 className="w-6 h-6 text-status-ok" />
                      </div>
                      <p className="text-ink font-medium">Inbox Zero</p>
                      <p className="text-ink-muted text-sm mt-1">There are no escalated tickets requiring admin attention.</p>
                    </td>
                  </tr>
                ) : (
                  escalated.map((ticket) => (
                    <tr 
                      key={ticket.id} 
                      className="hover:bg-white/[0.03] transition-colors group"
                    >
                      <td className="p-4 pl-6 font-mono text-sm text-ink-muted">{ticket.ticketId}</td>
                      <td className="p-4">
                        {ticket.urgency === "critical" ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-status-fail text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                            CRITICAL
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-status-warning/10 text-status-warning border border-status-warning/20">
                            HIGH
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="text-sm text-ink font-medium max-w-md truncate">{ticket.issueDescription}</div>
                        <div className="text-xs text-ink-muted mt-0.5">Created {formatDate(ticket.createdAt)}</div>
                      </td>
                      <td className="p-4">
                        {ticket.customerId ? (
                          <span className="font-medium text-ink">{ticket.customerName}</span>
                        ) : (
                          <span className="text-ink-muted">Unknown</span>
                        )}
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <Link 
                          to={`/dashboard/support/${ticket.id}`} 
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] rounded-xl transition-colors"
                        >
                          Resolve <ArrowRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Global Ticket Directory */}
        <div className="space-y-4 pt-8">
          <div className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-ink" />
            <h2 className="text-lg font-medium text-white">Global Ticket Directory</h2>
          </div>
          
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl backdrop-blur-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.05] bg-white/[0.01]">
                  <th className="p-4 pl-6 text-xs font-semibold text-ink-muted uppercase tracking-wider">Ticket ID</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Status</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Customer</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Assigned Staff</th>
                  <th className="p-4 pr-6 text-xs font-semibold text-ink-muted uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {isLoading ? (
                  <TableSkeletonRows columns={5} rows={5} />
                ) : allTickets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-ink-muted">No tickets found in the system.</td>
                  </tr>
                ) : (
                  allTickets.map((ticket) => (
                    <tr key={ticket.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="p-4 pl-6 font-mono text-sm text-ink-muted">{ticket.ticketId}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
                          ticket.status === 'resolved' ? 'bg-status-ok/10 text-status-ok border border-status-ok/20' :
                          ticket.status === 'in_progress' ? 'bg-status-info/10 text-status-info border border-status-info/20' :
                          'bg-status-warning/10 text-status-warning border border-status-warning/20'
                        }`}>
                          {ticket.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="font-medium text-ink">{ticket.customerName !== 'Unknown' ? ticket.customerName : 'N/A'}</span>
                      </td>
                      <td className="p-4">
                        <span className="text-ink">{ticket.assignedToName || 'Unassigned'}</span>
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <Link 
                          to={`/dashboard/support/${ticket.id}`} 
                          className="text-sm font-medium text-ink-muted hover:text-white transition-colors"
                        >
                          View Details
                        </Link>
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
