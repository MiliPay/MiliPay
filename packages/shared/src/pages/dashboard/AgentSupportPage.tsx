import { useState } from "react";
import { Search, Plus, Ticket } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@milipay/shared/components/ui/Button";
import { supabase } from "@milipay/shared/lib/supabase";
import { CreateTicketModal } from "@milipay/shared/components/support/CreateTicketModal";

export function AgentSupportPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();

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
      <div className="max-w-4xl mx-auto p-8 space-y-10 pb-32">
        
        <div className="flex items-center justify-between mt-6">
          <div>
            <h1 className="text-3xl font-display text-ink tracking-tight flex items-center gap-3">
              <Ticket className="w-8 h-8 text-signal" />
              Customer Support
            </h1>
            <p className="text-ink-muted mt-1">Check ticket status or file a new complaint for a customer.</p>
          </div>
          <Button onClick={() => setIsModalOpen(true)} className="bg-signal text-white gap-2">
            <Plus className="w-4 h-4" /> Create Ticket
          </Button>
        </div>

        {/* Search Box */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-8 backdrop-blur-xl">
          <h2 className="text-lg font-medium text-white mb-6">Track Existing Ticket</h2>
          
          <form onSubmit={handleSearch} className="max-w-xl">
            <div className="flex flex-col gap-3">
              <div className="relative flex items-center bg-white/[0.03] border border-white/[0.1] rounded-2xl p-1.5 focus-within:border-signal/50 focus-within:bg-white/[0.05] transition-all">
                <div className="pl-3">
                  <Search className="w-5 h-5 text-ink-muted" />
                </div>
                <input
                  type="text"
                  className="flex-1 bg-transparent border-none px-3 py-3 text-white placeholder-ink-faint outline-none uppercase font-mono"
                  placeholder="e.g. TKT-1234"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Button type="submit" disabled={isSearching} className="bg-white/[0.1] hover:bg-white/[0.15] text-white rounded-xl px-6">
                  {isSearching ? "Searching..." : "Track"}
                </Button>
              </div>
              {errorMsg && <p className="text-status-fail text-sm ml-2">{errorMsg}</p>}
            </div>
          </form>
        </div>

      </div>

      <CreateTicketModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onCreated={(ticketId) => {
          setIsModalOpen(false);
          setSearchQuery(ticketId);
          // Auto trigger search or just show success
        }}
      />
    </div>
  );
}
