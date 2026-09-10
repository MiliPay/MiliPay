import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { ArrowLeft, User, MessageSquareWarning, ShieldCheck, AlertTriangle, Send } from "lucide-react";
import { supabase } from "@milipay/shared/lib/supabase";
import type { SupportTicket, TicketMessage } from "@milipay/shared/types";
import { formatDate } from "@milipay/shared/lib/utils/format";
import { Button } from "@milipay/shared/components/ui/Button";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { claimTicket, resolveTicket, escalateTicket, fetchTicketMessages, sendTicketMessage } from "@milipay/shared/features/support/api";
import clsx from "clsx";

export function TicketDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { user } = useAuth();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isEscalating, setIsEscalating] = useState(false);
  const [escalationSubject, setEscalationSubject] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadTicketAndMessages = async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from("support_tickets")
      .select(`
        id, ticket_id, subject, issue_description, status, urgency, created_at, updated_at,
        customer_id, customers ( first_name, last_name, phone ),
        assigned_to, staff_profiles!support_tickets_assigned_to_fkey ( full_name )
      `)
      .eq("id", id)
      .single();
      
    if (error) {
      console.error("Ticket fetch error:", error);
      setFetchError(error.message || "Unknown database error");
    }

    if (data) {
      const cust: any = Array.isArray(data.customers) ? data.customers[0] : data.customers;
      const staff: any = Array.isArray(data.staff_profiles) ? data.staff_profiles[0] : data.staff_profiles;
      
      setTicket({
        id: data.id,
        ticketId: data.ticket_id,
        subject: data.subject,
        issueDescription: data.issue_description,
        status: data.status,
        urgency: data.urgency,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        customerId: data.customer_id,
        customerName: cust ? `${cust.first_name} ${cust.last_name}` : "Unknown Walk-in",
        customerPhone: cust?.phone,
        assignedTo: data.assigned_to,
        assignedToName: staff?.full_name,
      });

      const msgs = await fetchTicketMessages(data.id);
      setMessages(msgs);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadTicketAndMessages();
    
    if (!id) return;
    const channel = supabase
      .channel(`ticket_chat_${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ticket_messages',
          filter: `ticket_id=eq.${id}`
        },
        () => {
          loadTicketAndMessages();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_tickets',
          filter: `id=eq.${id}`
        },
        () => {
          loadTicketAndMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const handleClaim = async () => {
    if (!ticket || !user) return;
    await claimTicket(ticket.id, user.id);
    await loadTicketAndMessages();
  };

  const handleResolve = async () => {
    if (!ticket || !user) return;
    await resolveTicket(ticket.id, user.id);
    await loadTicketAndMessages();
  };

  const handleEscalateClick = () => {
    setIsEscalating(true);
  };

  const handleConfirmEscalate = async () => {
    if (!ticket || !escalationSubject.trim()) return;
    await escalateTicket(ticket.id, escalationSubject.trim(), user?.id);
    setIsEscalating(false);
    setEscalationSubject("");
    await loadTicketAndMessages();
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !user || !newMessage.trim()) return;
    
    await sendTicketMessage(ticket.id, user.id, "staff", newMessage.trim());
    setNewMessage("");
    await loadTicketAndMessages();
  };

  if (isLoading) return <div className="p-8 text-ink-muted">Loading ticket...</div>;
  if (fetchError) return (
    <div className="p-8 space-y-4">
      <div className="text-status-fail font-medium text-lg">Database Error Detected:</div>
      <div className="text-ink font-mono bg-white/[0.05] p-4 rounded-xl border border-status-fail/20">{fetchError}</div>
      <div className="text-ink-muted">Please run the latest SQL migrations in your Supabase dashboard.</div>
    </div>
  );
  if (!ticket) return <div className="p-8 text-status-fail">Ticket not found.</div>;

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isAssignedToMe = ticket.assignedTo === user?.id;
  const canChat = (isAssignedToMe || isAdmin) && ticket.status !== "resolved";
  
  const isDashboardRoute = location.pathname.includes("/dashboard");
  const backLink = isDashboardRoute ? "/dashboard/support" : "/complaints";
  const customerLink = isDashboardRoute && ticket?.customerId ? `/dashboard/customers/${ticket.customerId}` : `/customers/${ticket?.customerId}`;

  return (
    <div className="flex-1 overflow-hidden bg-ledger flex flex-col h-screen">
      {/* Header */}
      <div className="p-6 border-b border-white/[0.05] bg-ledger/95 backdrop-blur-sm z-10 flex-shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to={backLink} className="text-ink-muted hover:text-ink transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-display text-ink tracking-tight flex items-center gap-3">
                <MessageSquareWarning className={clsx("w-6 h-6", ticket.urgency === "high" || ticket.urgency === "critical" ? "text-status-fail" : "text-status-warning")} />
                {ticket.ticketId ? `Ticket ${ticket.ticketId}` : "Live Chat"}
              </h1>
              {ticket.subject && (
                <div className="text-lg font-medium text-ink mt-2">
                  {ticket.subject}
                </div>
              )}
              <div className="flex items-center gap-3 mt-1 text-sm text-ink-muted">
                <span className="capitalize text-ink">Status: {ticket.status.replace("_", " ")}</span>
                <span>•</span>
                <span className="capitalize">Urgency: {ticket.urgency}</span>
                <span>•</span>
                <span>Assigned: {ticket.assignedToName || "Unassigned"}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {(!ticket.assignedTo || (!isAssignedToMe && isAdmin)) && ticket.status !== "resolved" && (
              <Button onClick={handleClaim} className="bg-signal hover:brightness-110 text-white gap-2">
                Attend Ticket
              </Button>
            )}
            {!isAdmin && isAssignedToMe && ticket.status !== "resolved" && (
              <Button onClick={handleEscalateClick} className="bg-transparent text-status-fail border border-status-fail/50 hover:bg-status-fail/10 gap-2">
                <AlertTriangle className="w-4 h-4" /> Escalate to Admin
              </Button>
            )}
            {(isAssignedToMe || isAdmin) && ticket.status !== "resolved" && (
              <Button onClick={handleResolve} className="bg-status-ok hover:brightness-110 text-white gap-2">
                <ShieldCheck className="w-4 h-4" /> Solve Ticket
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex max-w-6xl w-full mx-auto overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col border-r border-white/[0.05]">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Original Issue Bubble */}
            <div className="flex flex-col gap-1 max-w-[80%]">
              <span className="text-xs text-ink-muted ml-2">{ticket.customerName} (Original Issue)</span>
              <div className="bg-white/[0.05] border border-white/[0.1] rounded-2xl rounded-tl-sm p-4 text-ink">
                {ticket.issueDescription}
              </div>
              <span className="text-xs text-ink-faint ml-2">{formatDate(ticket.createdAt)}</span>
            </div>

            {/* Chat History */}
            {messages.map((msg) => {
              if (msg.senderType === "system") {
                return (
                  <div key={msg.id} className="flex justify-center my-2">
                    <span className="text-xs bg-white/[0.05] border border-white/[0.1] text-ink-muted px-4 py-1.5 rounded-full font-medium shadow-sm">
                      {msg.content}
                    </span>
                  </div>
                );
              }

              const isMe = msg.senderId === user?.id;
              const isCustomer = msg.senderType === "customer";
              
              return (
                <div key={msg.id} className={clsx("flex flex-col gap-1 max-w-[80%]", isMe ? "ml-auto items-end" : "mr-auto")}>
                  <span className={clsx("text-xs text-ink-muted", isMe ? "mr-2" : "ml-2")}>
                    {isMe ? "You" : msg.senderName} {isCustomer && "(Customer)"}
                  </span>
                  <div className={clsx(
                    "p-3 px-4 rounded-2xl text-sm",
                    isMe 
                      ? "bg-signal text-ledger rounded-tr-sm font-medium" 
                      : "bg-white/[0.05] border border-white/[0.1] text-ink rounded-tl-sm"
                  )}>
                    {msg.content}
                  </div>
                  <span className={clsx("text-xs text-ink-faint", isMe ? "mr-2" : "ml-2")}>
                    {formatDate(msg.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Chat Input */}
          <div className="p-4 bg-white/[0.02] border-t border-white/[0.05]">
            {!canChat ? (
              <div className="text-center p-4 text-ink-muted bg-white/[0.02] rounded-xl border border-white/[0.05]">
                {ticket.status === "resolved" 
                  ? "This ticket has been marked as solved. Conversation is closed."
                  : "Click 'Attend Ticket' above to start responding to the customer."}
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="flex items-center gap-3 relative">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message to the customer..."
                  className="flex-1 bg-white/[0.05] border border-white/[0.1] text-ink px-4 py-3 rounded-xl focus:outline-none focus:border-signal/50 focus:bg-white/[0.08] transition-all"
                />
                <Button type="submit" disabled={!newMessage.trim()} className="bg-signal text-ledger px-4 py-3 h-auto rounded-xl">
                  <Send className="w-5 h-5" />
                </Button>
              </form>
            )}
          </div>
        </div>

        {/* Sidebar Context */}
        <div className="w-80 p-6 overflow-y-auto bg-white/[0.01]">
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-4">Customer Profile</h2>
          {ticket.customerId ? (
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 space-y-4">
              <div>
                <div className="text-ink font-medium text-lg">{ticket.customerName}</div>
                <div className="text-ink-muted text-sm">{ticket.customerPhone}</div>
              </div>
              <Link to={customerLink} className="inline-flex items-center gap-2 px-3 py-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-lg text-sm text-ink transition-colors w-full justify-center">
                <User className="w-4 h-4" /> View Full Profile
              </Link>
            </div>
          ) : (
            <div className="text-ink-muted">Unknown Customer</div>
          )}
        </div>
      </div>

      {/* Escalate Modal */}
      {isEscalating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm">
          <div className="bg-ledger border border-white/[0.1] rounded-3xl w-full max-w-md p-6 space-y-6">
            <h2 className="text-xl font-display text-white">Escalate to Admin</h2>
            <div>
              <label className="block text-sm font-medium text-ink-muted mb-2">Subject / Title</label>
              <input
                type="text"
                autoFocus
                value={escalationSubject}
                onChange={(e) => setEscalationSubject(e.target.value)}
                placeholder="e.g. Stuck Transfer - Requires DB Override"
                className="w-full bg-white/[0.05] border border-white/[0.1] text-ink px-4 py-3 rounded-xl focus:outline-none focus:border-signal/50"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button onClick={() => setIsEscalating(false)} className="bg-transparent border border-white/[0.1] text-ink hover:text-white">Cancel</Button>
              <Button onClick={handleConfirmEscalate} disabled={!escalationSubject.trim()} className="bg-status-fail text-white">Confirm Escalate</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
