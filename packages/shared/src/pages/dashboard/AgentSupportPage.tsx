import { useState, useEffect } from "react";
import { Search, Plus, Ticket, ArrowRight, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@milipay/shared/components/ui/Button";
import { supabase } from "@milipay/shared/lib/supabase";
import { CreateTicketModal } from "@milipay/shared/components/support/CreateTicketModal";
import { fetchSupportTickets } from "@milipay/shared/features/support/api";
import type { SupportTicket } from "@milipay/shared/types";
import { formatDate } from "@milipay/shared/lib/utils/format";

export function AgentSupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();

  const loadTickets = async () => {
    setIsLoadingTickets(true);
    try {
      const res = await fetchSupportTickets({ pageSize: 25 });
      setTickets(res.items);
    } catch (err) {
      console.error("Failed to load tickets:", err);
    } finally {
      setIsLoadingTickets(false);
    }
  };

  useEffect(() => {
    loadTickets();
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
        navigate(`/support/${data.id}`);
      }
    } catch (err) {
      setErrorMsg("An error occurred while searching.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-ledger min-h-screen">
      <div className="max-w-6xl mx-auto p-8 space-y-8 pb-32">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6">
          <div>
            <h1 className="text-3xl font-display text-ink tracking-tight flex items-center gap-3">
              <Ticket className="w-8 h-8 text-signal" />
              Walk-in Complaints
            </h1>
            <p className="text-ink-muted mt-1">
              Log in-person customer complaints, track resolution progress, and escalate unresolved issues.
            </p>
          </div>
          <Button onClick={() => setIsModalOpen(true)} className="bg-signal text-white gap-2 shadow-[0_0_15px_rgba(var(--color-signal),0.3)]">
            <Plus className="w-4 h-4" /> Log Walk-in Complaint
          </Button>
        </div>

        {/* Track Existing Ticket Card */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl">
          <h2 className="text-base font-medium text-white mb-3 flex items-center gap-2">
            <Search className="w-4 h-4 text-signal" />
            Track Ticket by ID
          </h2>
          
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 flex items-center bg-white/[0.03] border border-white/[0.1] rounded-xl p-1 focus-within:border-signal/50 focus-within:bg-white/[0.05] transition-all">
              <div className="pl-3">
                <Search className="w-4 h-4 text-ink-muted" />
              </div>
              <input
                type="text"
                className="flex-1 bg-transparent border-none px-3 py-2 text-white placeholder-ink-faint outline-none uppercase font-mono text-sm"
                placeholder="Enter Ticket ID (e.g. TKT-1234)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={isSearching} className="bg-white/[0.08] hover:bg-white/[0.12] text-white px-6">
              {isSearching ? "Searching..." : "Track"}
            </Button>
          </form>
          {errorMsg && <p className="text-status-fail text-xs mt-2">{errorMsg}</p>}
        </div>

        {/* Complaints Directory */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-ink-muted" />
              Complaints Directory
            </h2>
            <span className="text-xs text-ink-muted">
              Showing {tickets.length} recent {tickets.length === 1 ? 'ticket' : 'tickets'}
            </span>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl backdrop-blur-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.05] bg-white/[0.01]">
                  <th className="p-4 pl-6 text-xs font-semibold text-ink-muted uppercase tracking-wider">Ticket ID</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Status</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Customer</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Issue Overview</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Date Filed</th>
                  <th className="p-4 pr-6 text-xs font-semibold text-ink-muted uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {isLoadingTickets ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-ink-muted">Loading complaints directory...</td>
                  </tr>
                ) : tickets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-ink-muted">
                      No walk-in complaints found. Use the button above to log a new complaint.
                    </td>
                  </tr>
                ) : (
                  tickets.map((t) => {
                    const isResolved = t.status === 'resolved';
                    const isInProgress = t.status === 'in_progress';
                    
                    return (
                      <tr 
                        key={t.id} 
                        onClick={() => navigate(`/support/${t.id}`)}
                        className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                      >
                        <td className="p-4 pl-6 font-mono text-sm text-ink-muted">
                          {t.ticketId || "Walk-in"}
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                            isResolved ? 'bg-status-ok/10 text-status-ok border border-status-ok/20' :
                            isInProgress ? 'bg-status-info/10 text-status-info border border-status-info/20' :
                            'bg-status-warning/10 text-status-warning border border-status-warning/20'
                          }`}>
                            {t.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="font-medium text-white text-sm">{t.customerName}</div>
                          {t.customerPhone && <div className="text-xs text-ink-muted">{t.customerPhone}</div>}
                        </td>
                        <td className="p-4">
                          <div className="text-sm text-ink max-w-sm truncate">{t.issueDescription}</div>
                        </td>
                        <td className="p-4 text-xs text-ink-muted">
                          {formatDate(t.createdAt)}
                        </td>
                        <td className="p-4 pr-6 text-right">
                          <span className="inline-flex items-center gap-1 text-xs text-signal group-hover:translate-x-0.5 transition-transform">
                            View <ArrowRight className="w-3.5 h-3.5" />
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <CreateTicketModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onCreated={(ticketId) => {
          setIsModalOpen(false);
          loadTickets();
          setSearchQuery(ticketId);
        }}
      />
    </div>
  );
}
