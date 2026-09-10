import { useState, useEffect } from "react";
import { MessageSquare, Clock, ArrowRight, UserCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import type { SupportTicket } from "../../types";
import { formatDate } from "../../lib/utils/format";
import { useAuth } from "../../features/auth/AuthContext";
import { claimTicket } from "../../features/support/api";

export function LiveChatQueue({ routePrefix = "/support" }: { routePrefix?: string }) {
  const [activeChats, setActiveChats] = useState<SupportTicket[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [attendingId, setAttendingId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const loadActiveChats = async () => {
    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .select(`
          id, ticket_id, issue_description, status, urgency, created_at, updated_at, customer_id, assigned_to,
          customers ( first_name, last_name )
        `)
        .in('status', ['open', 'in_progress'])
        .order('updated_at', { ascending: false });

      if (error) throw error;
      
      const formatted = (data || []).map((d: any) => {
        const cust = Array.isArray(d.customers) ? d.customers[0] : d.customers;
        return {
          id: d.id,
          ticketId: d.ticket_id,
          issueDescription: d.issue_description,
          status: d.status,
          urgency: d.urgency,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
          customerId: d.customer_id,
          customerName: cust ? `${cust.first_name} ${cust.last_name}` : "Unknown Customer",
          assignedTo: d.assigned_to,
        } as SupportTicket;
      });
      setActiveChats(formatted);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingChats(false);
    }
  };

  const handleAttend = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!user) return;
    setAttendingId(chatId);
    try {
      await claimTicket(chatId, user.id);
      navigate(`${routePrefix}/${chatId}`);
    } catch (err) {
      console.error("Failed to attend chat:", err);
    } finally {
      setAttendingId(null);
    }
  };

  useEffect(() => {
    loadActiveChats();
    
    const channel = supabase
      .channel('support_queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => {
        loadActiveChats();
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-8 backdrop-blur-xl h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-medium text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-signal" /> Live Chat Queue
        </h2>
        <span className="text-xs text-ink-muted bg-white/[0.05] px-3 py-1 rounded-full border border-white/[0.05]">
          {activeChats.filter(c => c.status === 'open').length} waiting
        </span>
      </div>
      
      {isLoadingChats ? (
        <div className="text-ink-muted">Loading queue...</div>
      ) : activeChats.length === 0 ? (
        <div className="text-ink-faint italic p-8 text-center border border-dashed border-white/[0.05] rounded-2xl">
          No active chats in the queue right now.
        </div>
      ) : (
        <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {activeChats.map(chat => {
            const isAssignedToMe = chat.assignedTo === user?.id;
            const isUnassigned = !chat.assignedTo;

            return (
              <div 
                key={chat.id}
                onClick={() => navigate(`${routePrefix}/${chat.id}`)}
                className="group flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] hover:border-signal/30 cursor-pointer transition-all gap-4"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-ink truncate">{chat.customerName}</span>
                    {chat.status === 'open' && (
                      <span className="px-2 py-0.5 rounded-full bg-status-fail/20 text-status-fail text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-status-fail animate-pulse" />
                        Waiting
                      </span>
                    )}
                    {chat.status === 'in_progress' && (
                      <span className="px-2 py-0.5 rounded-full bg-status-info/20 text-status-info text-[10px] font-bold uppercase tracking-wider">
                        {isAssignedToMe ? "Assigned to You" : "In Progress"}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ink-muted truncate max-w-md">{chat.issueDescription}</p>
                  <div className="flex items-center gap-3 text-xs text-ink-faint mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDate(chat.updatedAt)}
                    </span>
                    <span>•</span>
                    <span className="font-mono">{chat.ticketId || 'Live Chat'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  {isUnassigned && (
                    <button
                      type="button"
                      onClick={(e) => handleAttend(e, chat.id)}
                      disabled={attendingId === chat.id}
                      className="px-4 py-2 rounded-xl bg-signal hover:brightness-110 text-white font-medium text-xs flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,200,150,0.3)] transition-all cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      {attendingId === chat.id ? "Attending..." : "Attend"}
                    </button>
                  )}
                  {(!isUnassigned || isAssignedToMe) && (
                    <div className="text-ink-muted group-hover:text-signal transition-colors p-2 rounded-lg bg-white/[0.02]">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
