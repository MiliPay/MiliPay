import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Ticket, AlertTriangle, ShieldAlert } from "lucide-react";
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
  const [isLoading, setIsLoading] = useState(true);
  const [isBumping, setIsBumping] = useState(false);
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
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadTicket();
  }, [id]);

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

  if (isLoading) return <div className="p-8 text-ink-muted">Loading ticket...</div>;
  if (!ticket) return <div className="p-8 text-status-fail">Ticket not found.</div>;

  const hoursSinceCreation = (new Date().getTime() - new Date(ticket.createdAt).getTime()) / (1000 * 60 * 60);
  const isOver24Hours = hoursSinceCreation >= 24;
  const canBumpPriority = isOver24Hours && ticket.status !== "resolved" && ticket.urgency !== "critical";

  return (
    <div className="flex-1 overflow-auto bg-ledger min-h-screen">
      <div className="max-w-4xl mx-auto p-8 space-y-8 pb-32">
        
        <Link to="/support" className="inline-flex items-center gap-2 text-ink-muted hover:text-ink transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Support
        </Link>
        
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-display text-ink tracking-tight flex items-center gap-3">
            <Ticket className="w-8 h-8 text-signal" />
            Ticket {ticket.ticketId}
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
          <div className="md:col-span-2 space-y-6">
            
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl">
              <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-4">Initial Complaint</h2>
              <p className="text-ink text-lg leading-relaxed">{ticket.issueDescription}</p>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl space-y-4">
              <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-2">Communication History</h2>
              
              {messages.length === 0 ? (
                <p className="text-ink-muted text-sm">No messages yet. Support team will reply soon.</p>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div key={msg.id} className="p-4 rounded-xl border border-white/[0.05] bg-white/[0.01]">
                      <div className="flex justify-between items-start mb-2">
                        <span className={clsx("text-sm font-medium", 
                          msg.senderType === "system" ? "text-status-warning" : 
                          msg.senderType === "staff" ? "text-signal" : "text-ink"
                        )}>
                          {msg.senderName} {msg.senderType === "system" && "(System)"}
                        </span>
                        <span className="text-xs text-ink-muted">{formatDate(msg.createdAt)}</span>
                      </div>
                      <p className={clsx("text-sm", msg.senderType === "system" ? "text-status-warning" : "text-ink-muted")}>
                        {msg.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
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
                <span className="text-ink-muted">Unknown</span>
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
