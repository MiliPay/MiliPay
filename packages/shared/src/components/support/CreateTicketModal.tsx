import { useState, useEffect } from "react";
import { X, Search } from "lucide-react";
import { Button } from "@milipay/shared/components/ui/Button";
import { fetchCustomers } from "@milipay/shared/features/customers/api";
import { createTicket } from "@milipay/shared/features/support/api";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import type { Customer } from "@milipay/shared/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (ticketId: string) => void;
}

export function CreateTicketModal({ isOpen, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [issueDescription, setIssueDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setSearchResults([]);
      setSelectedCustomer(null);
      setIssueDescription("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const res = await fetchCustomers({ search: searchQuery.trim(), pageSize: 5 });
      setSearchResults(res.items);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedCustomer || !issueDescription.trim() || !user) return;
    setIsSubmitting(true);
    try {
      const ticket = await createTicket(selectedCustomer.id, issueDescription.trim(), user.id);
      onCreated(ticket.ticket_id);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-ledger border border-white/[0.1] rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/[0.05]">
          <h2 className="text-xl font-display text-white">Create Support Ticket</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {!selectedCustomer ? (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-ink-muted">Find Customer</label>
              <form onSubmit={handleSearch} className="flex gap-2">
                <input
                  type="text"
                  placeholder="NIN, Phone, or Name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-white/[0.02] border border-white/[0.1] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-signal/50"
                  autoFocus
                />
                <Button type="submit" disabled={isSearching} className="bg-white/[0.05] text-white px-4">
                  <Search className="w-4 h-4" />
                </Button>
              </form>

              {searchResults.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-ink-muted uppercase tracking-wider mb-2">Select a customer</p>
                  {searchResults.map(cust => (
                    <button
                      key={cust.id}
                      onClick={() => setSelectedCustomer(cust)}
                      className="w-full text-left p-3 rounded-xl border border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.05] transition-colors flex items-center justify-between"
                    >
                      <div>
                        <div className="text-white font-medium">{cust.fullName}</div>
                        <div className="text-sm text-ink-muted">{cust.phone} • {cust.ninLast4}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-signal/10 border border-signal/20 flex items-center justify-between">
                <div>
                  <div className="text-signal text-sm font-medium">Selected Customer</div>
                  <div className="text-white font-semibold mt-1">{selectedCustomer.fullName}</div>
                  <div className="text-ink-muted text-sm">{selectedCustomer.phone}</div>
                </div>
                <button onClick={() => setSelectedCustomer(null)} className="text-ink-muted hover:text-white text-sm underline">
                  Change
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-muted mb-2">Issue Description</label>
                <textarea
                  value={issueDescription}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  placeholder="Describe the problem the customer is facing..."
                  className="w-full bg-white/[0.02] border border-white/[0.1] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-signal/50 min-h-[120px] resize-none"
                />
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/[0.05] flex justify-end gap-3">
          <Button onClick={onClose} className="bg-transparent border border-white/[0.1] text-ink hover:text-white">Cancel</Button>
          <Button 
            disabled={!selectedCustomer || !issueDescription.trim() || isSubmitting} 
            onClick={handleSubmit} 
            className="bg-signal text-white"
          >
            {isSubmitting ? "Creating..." : "Submit Ticket"}
          </Button>
        </div>

      </div>
    </div>
  );
}
