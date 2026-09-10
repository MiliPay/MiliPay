import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Ticket, AlertTriangle, ShieldAlert, Send } from "lucide-react";
import { supabase } from "@milipay/shared/lib/supabase";
import type { SupportTicket, TicketMessage } from "@milipay/shared/types";
import { formatDate } from "@milipay/shared/lib/utils/format";
import { Button } from "@milipay/shared/components/ui/Button";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { bumpTicketPriority, fetchTicketMessages } from "@milipay/shared/features/support/api";
import clsx from "clsx";

export function AgentTicketDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBumping, setIsBumping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  const loadTicket = async () => {
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
      scrollToBottom();
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadTicket();
    
    // Subscribe to realtime messages
    if (id) {
      const channel = supabase
        .channel(`agent_chat_${id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${id}` },
          async () => {
            const msgs = await fetchTicketMessages(id);
            setMessages(msgs);
            scrollToBottom();
          }
        )
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [id]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleBumpPriority = async () => {
    if (!ticket || !user) return;
    setIsBumping(true);
    try {
      await bumpTicketPriority(ticket.id, user.fullName || "Agent");
      await loadTicket();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBumping(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || isSending || !ticket || !user) return;
    
    setIsSending(true);
    try {
      // If ticket is open, mark it as in_progress and assign to this agent
      if (ticket.status === 'open') {
        await supabase
          .from('support_tickets')
          .update({ status: 'in_progress', assigned_to: user.id })
          .eq('id', ticket.id);
        
        // Refresh ticket details silently
        loadTicket();
      }

      await supabase
        .from('ticket_messages')
        .insert({
          ticket_id: ticket.id,
          sender_id: user.id,
          sender_type: 'staff',
          content: replyText.trim()
        });

      setReplyText("");
      // realtime will handle fetching
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) return <div className="p-8 text-ink-muted">Loading ticket...</div>;
  if (!ticket) return <div className="p-8 text-status-fail">Ticket not found.</div>;

  const hoursSinceCreation = (new Date().getTime() - new Date(ticket.createdAt).getTime()) / (1000 * 60 * 60);
  const isOver24Hours = hoursSinceCreation >= 24;
  const canBumpPriority = isOver24Hours && ticket.status !== "resolved" && ticket.urgency !== "critical";

  return (
    <div className="flex-1 overflow-auto bg-ledger min-h-screen">
      <div className="max-w-5xl mx-auto p-8 space-y-8 pb-32">
        
        <Link to="/support" className="inline-flex items-center gap-2 text-ink-muted hover:text-ink transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Support
        </Link>
        
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-display text-ink tracking-tight flex items-center gap-3">
            <Ticket className="w-8 h-8 text-signal" />
            Ticket {ticket.ticketId || 'Informal Chat'}
          </h1>
          
          {canBumpPriority && (
            <Button 
              onClick={handleBumpPriority} 
              disabled={isBumping}
              className="bg-status-fail hover:brightness-110 text-white gap-2 shadow-[0_0_15px_rgba(239,68,68,0.3)]"
            >
              <ShieldAlert className="w-4 h-4" /> {isBumping ? "Bumping..." : "Escalate Priority"}
            </Button>
          )}
        </div>

        {canBumpPriority && (
          <div className="bg-status-warning/10 border border-status-warning/20 rounded-xl p-4 flex gap-3 text-status-warning text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p>This ticket has been open for over 24 hours without resolution. You can manually escalate its priority to Critical to alert the admin team.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6 flex flex-col h-[70vh]">
            
            <div className="flex-1 bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl flex flex-col">
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/[0.05]">
                <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider">Complaint Dialogue & Updates</h2>
                <div className="text-xs text-ink-muted">{ticket.issueDescription}</div>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-ink-muted text-sm">No recorded dialogue or notes yet.</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isStaff = msg.senderType === 'staff';
                    const isSystem = msg.senderType === 'system';
                    return (
                      <div key={msg.id} className={clsx("flex", isStaff ? "justify-end" : "justify-start")}>
                        <div className={clsx(
                          "max-w-[80%] p-4 rounded-2xl",
                          isSystem ? "bg-status-warning/10 border border-status-warning/20 text-status-warning mx-auto" :
                          isStaff ? "bg-signal text-white rounded-br-sm" : "bg-white/[0.05] border border-white/[0.05] text-ink rounded-bl-sm"
                        )}>
                          <div className="flex justify-between items-baseline gap-4 mb-1">
                            <span className="text-xs font-semibold opacity-75">
                              {isStaff ? 'You' : (isSystem ? 'System' : ticket.customerName)}
                            </span>
                            <span className="text-[10px] opacity-60">
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Box */}
              <form onSubmit={handleSendReply} className="mt-4 flex gap-2 pt-4 border-t border-white/[0.05]">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type notes or update..."
                  className="flex-1 bg-white/[0.03] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-ink-faint focus:border-signal/50 focus:bg-white/[0.05] outline-none transition-all"
                  disabled={isSending}
                />
                <Button 
                  type="submit" 
                  disabled={!replyText.trim() || isSending}
                  className="bg-signal hover:brightness-110 text-white rounded-xl px-6"
                >
                  <Send className="w-5 h-5" />
                </Button>
              </form>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl">
              <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-4">Customer Details</h2>
              {ticket.customerId ? (
                <div className="flex flex-col gap-2">
                  <span className="text-ink font-medium">{ticket.customerName}</span>
                  <span className="text-ink-muted text-sm">{ticket.customerPhone}</span>
                </div>
              ) : (
                <span className="text-ink-muted">Unknown Walk-in</span>
              )}
            </div>

            <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl">
              <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-4">Status Overview</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Status:</span>
                  <span className={clsx("capitalize font-medium", 
                    ticket.status === "open" ? "text-status-fail" :
                    ticket.status === "in_progress" ? "text-status-info" : "text-status-ok"
                  )}>{ticket.status.replace("_", " ")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Urgency:</span>
                  <span className={clsx("capitalize font-medium", ticket.urgency === "critical" && "text-status-fail")}>{ticket.urgency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Assigned To:</span>
                  <span className="text-ink">{ticket.assignedToName || "Pending Assignment"}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-white/[0.05]">
                  <span className="text-ink-muted">Created:</span>
                  <span className="text-ink">{formatDate(ticket.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
