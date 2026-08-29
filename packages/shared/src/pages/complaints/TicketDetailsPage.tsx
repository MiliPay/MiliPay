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
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const loadTicketAndMessages = async () => {
    if (!id) return;
    const { data } = await supabase
      .from("support_tickets")
      .select(`
        id, ticket_id, issue_description, status, urgency, created_at, updated_at,
        customer_id, customers:customer_id ( first_name, last_name, phone ),
        assigned_to, staff_profiles:assigned_to ( full_name )
      `)
      .eq("id", id)
      .single();
      
    if (data) {
      const cust: any = Array.isArray(data.customers) ? data.customers[0] : data.customers;
      const staff: any = Array.isArray(data.staff_profiles) ? data.staff_profiles[0] : data.staff_profiles;
      
      setTicket({
        id: data.id,
        ticketId: data.ticket_id,
        issueDescription: data.issue_description,
        status: data.status,
        urgency: data.urgency,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        customerId: data.customer_id,
        customerName: cust ? `${cust.first_name} ${cust.last_name}` : "Unknown",
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
    // In a real app, we'd also subscribe to realtime updates here
  }, [id]);

  const handleClaim = async () => {
    if (!ticket || !user) return;
    await claimTicket(ticket.id, user.id);
    await loadTicketAndMessages();
  };

  const handleResolve = async () => {
    if (!ticket) return;
    await resolveTicket(ticket.id);
    await loadTicketAndMessages();
  };

  const handleEscalate = async () => {
    if (!ticket) return;
    await escalateTicket(ticket.id);
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
  if (!ticket) return <div className="p-8 text-status-fail">Ticket not found.</div>;

  const isAssignedToMe = ticket.assignedTo === user?.id;
  const canChat = isAssignedToMe && ticket.status !== "resolved";
  
  const location = useLocation();
  const backLink = location.pathname.includes("/dashboard/support") ? "/dashboard/support" : "/complaints";

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
                Ticket {ticket.ticketId}
              </h1>
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
            {ticket.status === "open" && !isAssignedToMe && (
              <Button onClick={handleClaim} className="bg-signal hover:brightness-110 text-white gap-2">
                Claim Ticket
              </Button>
            )}
            {isAssignedToMe && ticket.status !== "resolved" && (
              <>
                <Button onClick={handleEscalate} className="bg-transparent text-status-fail border border-status-fail/50 hover:bg-status-fail/10 gap-2">
                  <AlertTriangle className="w-4 h-4" /> Escalate to Admin
                </Button>
                <Button onClick={handleResolve} className="bg-status-ok hover:brightness-110 text-white gap-2">
                  <ShieldCheck className="w-4 h-4" /> Mark Resolved
                </Button>
              </>
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
                      ? "bg-signal text-ledger rounded-tr-sm" 
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
                  ? "This ticket is resolved. If the customer replies, it will automatically reopen."
                  : "You must claim this ticket to send a message."}
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
              <Link to={`/customers/${ticket.customerId}`} className="inline-flex items-center gap-2 px-3 py-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-lg text-sm text-ink transition-colors w-full justify-center">
                <User className="w-4 h-4" /> View Full Profile
              </Link>
            </div>
          ) : (
            <div className="text-ink-muted">Unknown Customer</div>
          )}
        </div>
      </div>
    </div>
  );
}
