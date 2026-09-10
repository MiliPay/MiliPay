const fs = require('fs');

const content = \import { useState } from "react";
import { Search, Plus, Ticket } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@milipay/shared/components/ui/Button";
import { supabase } from "@milipay/shared/lib/supabase";
import { CreateTicketModal } from "@milipay/shared/components/support/CreateTicketModal";
import { LiveChatQueue } from "@milipay/shared/components/support/LiveChatQueue";

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
        navigate(\\\/support/\\\\\\);
      }
    } catch (err) {
      setErrorMsg("An error occurred while searching.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-ledger min-h-screen">
      <div className="max-w-7xl mx-auto p-8 space-y-10 pb-32">
        
        <div className="flex items-center justify-between mt-6">
          <div>
            <h1 className="text-3xl font-display text-ink tracking-tight flex items-center gap-3">
              <Ticket className="w-8 h-8 text-signal" />
              Support & Live Chat
            </h1>
            <p className="text-ink-muted mt-1">Manage incoming live chats and formal support tickets.</p>
          </div>
          <Button onClick={() => setIsModalOpen(true)} className="bg-signal text-white gap-2">
            <Plus className="w-4 h-4" /> Create Ticket
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Active Chats Queue */}
          <div className="lg:col-span-2">
            <LiveChatQueue routePrefix="/support" />
          </div>

          {/* Search Box */}
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-8 backdrop-blur-xl h-fit">
            <h2 className="text-lg font-medium text-white mb-6">Track Existing Ticket</h2>
            
            <form onSubmit={handleSearch} className="flex flex-col gap-3">
              <div className="relative flex flex-col gap-3">
                <div className="flex items-center bg-white/[0.03] border border-white/[0.1] rounded-2xl p-1.5 focus-within:border-signal/50 focus-within:bg-white/[0.05] transition-all">
                  <div className="pl-3">
                    <Search className="w-5 h-5 text-ink-muted" />
                  </div>
                  <input
                    type="text"
                    className="flex-1 bg-transparent border-none px-3 py-3 text-white placeholder-ink-faint outline-none uppercase font-mono w-full min-w-0"
                    placeholder="e.g. TKT-1234"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={isSearching} className="w-full bg-white/[0.1] hover:bg-white/[0.15] text-white rounded-xl py-3">
                  {isSearching ? "Searching..." : "Track Ticket"}
                </Button>
              </div>
              {errorMsg && <p className="text-status-fail text-sm">{errorMsg}</p>}
            </form>
          </div>
        </div>

      </div>

      <CreateTicketModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onCreated={(ticketId) => {
          setIsModalOpen(false);
          setSearchQuery(ticketId);
        }}
      />
    </div>
  );
}
\;

fs.writeFileSync('packages/shared/src/pages/dashboard/AgentSupportPage.tsx', content, 'utf8');
