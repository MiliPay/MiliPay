import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Ticket, CheckCircle2, ShieldAlert, AlertTriangle, Clock, User, Phone, FileText, Check } from "lucide-react";
import { supabase } from "@milipay/shared/lib/supabase";
import type { SupportTicket } from "@milipay/shared/types";
import { formatDate } from "@milipay/shared/lib/utils/format";
import { Button } from "@milipay/shared/components/ui/Button";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { bumpTicketPriority } from "@milipay/shared/features/support/api";
import clsx from "clsx";

export function AgentTicketDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<SupportTicket & { solverName?: string; isEscalated?: boolean; subject?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSolving, setIsSolving] = useState(false);
  const [isEscalating, setIsEscalating] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalateReason, setEscalateReason] = useState("");
  const [isBumping, setIsBumping] = useState(false);
  const { user } = useAuth();

  const loadTicket = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .select(`
          id, ticket_id, issue_description, status, urgency, created_at, updated_at,
          customer_id, customers:customer_id ( first_name, last_name, phone ),
          assigned_to, staff_profiles:assigned_to ( full_name ),
          is_escalated, subject, solved_by, resolved_at
        `)
        .eq("id", id)
        .single();

      if (error || !data) {
        setTicket(null);
        setIsLoading(false);
        return;
      }

      const cust: any = Array.isArray(data.customers) ? data.customers[0] : data.customers;
      const staff: any = Array.isArray(data.staff_profiles) ? data.staff_profiles[0] : data.staff_profiles;

      let solverName: string | undefined;
      if (data.solved_by) {
        const { data: solverData } = await supabase
          .from("staff_profiles")
          .select("full_name")
          .eq("id", data.solved_by)
          .single();
        solverName = solverData?.full_name;
      }

      setTicket({
        id: data.id,
        ticketId: data.ticket_id,
        issueDescription: data.issue_description,
        status: data.status,
        urgency: data.urgency,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        customerId: data.customer_id,
        customerName: cust ? `${cust.first_name} ${cust.last_name}` : "Walk-in Customer",
        customerPhone: cust?.phone,
        assignedTo: data.assigned_to,
        assignedToName: staff?.full_name,
        isEscalated: data.is_escalated,
        subject: data.subject,
        solverName: solverName || (data.status === "resolved" ? "Support Staff" : undefined)
      });
    } catch (err) {
      console.error("Failed to load walk-in ticket:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTicket();
  }, [id]);

  const handleSolveTicket = async () => {
    if (!ticket || !user || isSolving) return;
    setIsSolving(true);
    try {
      const { error } = await supabase
        .from("support_tickets")
        .update({
          status: "resolved",
          solved_by: user.id,
          resolved_at: new Date().toISOString()
        })
        .eq("id", ticket.id);

      if (error) throw error;
      await loadTicket();
    } catch (err) {
      console.error("Failed to solve ticket:", err);
    } finally {
      setIsSolving(false);
    }
  };

  const handleEscalateToAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !escalateReason.trim() || isEscalating) return;
    setIsEscalating(true);
    try {
      const { error } = await supabase
        .from("support_tickets")
        .update({
          is_escalated: true,
          urgency: "high",
          subject: escalateReason.trim(),
          assigned_to: null
        })
        .eq("id", ticket.id);

      if (error) throw error;
      setShowEscalateModal(false);
      setEscalateReason("");
      await loadTicket();
    } catch (err) {
      console.error("Failed to escalate ticket:", err);
    } finally {
      setIsEscalating(false);
    }
  };

  const handleBumpPriority = async () => {
    if (!ticket || !user || isBumping) return;
    setIsBumping(true);
    try {
      await bumpTicketPriority(ticket.id, user.fullName || "Field Agent");
      await loadTicket();
    } catch (err) {
      console.error("Failed to bump priority:", err);
    } finally {
      setIsBumping(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto bg-ledger min-h-screen flex items-center justify-center p-6">
        <LoadingState
          minHeight="min-h-[60vh]"
          title="Loading Walk-in Complaint..."
          description="Retrieving in-person dialogue log and case resolution records."
        />
      </div>
    );
  }
  if (!ticket) return <div className="p-8 text-status-fail">Complaint record not found.</div>;

  const hoursSinceCreation = (new Date().getTime() - new Date(ticket.createdAt).getTime()) / (1000 * 60 * 60);
  const isOver24Hours = hoursSinceCreation >= 24;
  const canBumpPriority = isOver24Hours && ticket.status !== "resolved" && ticket.urgency !== "critical";
  const isResolved = ticket.status === "resolved";

  return (
    <div className="flex-1 overflow-auto bg-ledger min-h-screen">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 pb-32">
        
        {/* Navigation Breadcrumb */}
        <Link to="/support" className="inline-flex items-center gap-2 text-ink-muted hover:text-ink transition-colors text-sm">
          <ArrowLeft className="w-4 h-4" /> Back to Complaints
        </Link>
        
        {/* Header with Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-display text-ink tracking-tight flex items-center gap-3">
                <Ticket className="w-7 h-7 sm:w-8 sm:h-8 text-signal" />
                Complaint {ticket.ticketId || "Pending ID"}
              </h1>
              <span className={clsx("px-2.5 py-1 rounded-full text-xs font-semibold capitalize",
                isResolved ? "bg-status-ok/10 text-status-ok border border-status-ok/20" :
                ticket.isEscalated ? "bg-status-fail/10 text-status-fail border border-status-fail/20" :
                ticket.status === "in_progress" ? "bg-status-info/10 text-status-info border border-status-info/20" :
                "bg-status-warn/10 text-status-warn border border-status-warn/20"
              )}>
                {isResolved ? "Resolved" : ticket.isEscalated ? "Escalated to Admin" : ticket.status.replace("_", " ")}
              </span>
            </div>
            <p className="text-ink-muted text-xs sm:text-sm mt-1">
              Field Agent Walk-in Record • Logged in-person at agent location
            </p>
          </div>
          
          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {!isResolved && (
              <>
                <Button 
                  onClick={handleSolveTicket} 
                  disabled={isSolving}
                  className="bg-status-ok hover:brightness-110 text-white gap-2 shadow-[0_0_15px_rgba(34,197,94,0.25)] text-xs sm:text-sm"
                >
                  <Check className="w-4 h-4" /> {isSolving ? "Saving..." : "Solve on the Spot"}
                </Button>

                {!ticket.isEscalated && (
                  <Button 
                    onClick={() => setShowEscalateModal(true)} 
                    className="bg-status-fail hover:brightness-110 text-white gap-2 shadow-[0_0_15px_rgba(239,68,68,0.25)] text-xs sm:text-sm"
                  >
                    <ShieldAlert className="w-4 h-4" /> Escalate to Admin
                  </Button>
                )}
              </>
            )}

            {canBumpPriority && (
              <Button 
                onClick={handleBumpPriority} 
                disabled={isBumping}
                className="bg-status-warn hover:brightness-110 text-ledger font-semibold gap-2 text-xs sm:text-sm"
              >
                <AlertTriangle className="w-4 h-4" /> {isBumping ? "Bumping..." : "Flag Critical"}
              </Button>
            )}
          </div>
        </div>

        {/* 24-hour SLA Warning Banner */}
        {canBumpPriority && (
          <div className="bg-status-warn/10 border border-status-warn/20 rounded-2xl p-4 flex gap-3 text-status-warn text-xs sm:text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p>This complaint has been active for over 24 hours without resolution. You can flag its priority as Critical to prioritize administrative review.</p>
          </div>
        )}

        {/* Main 2-Column Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          
          {/* Left 2 Cols: Complaint Dialogue & Case Summary */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Walk-in Complaint Details */}
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl sm:rounded-3xl p-6 backdrop-blur-xl space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.05]">
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-signal" />
                  In-Person Dialogue Record
                </h2>
                <span className="text-xs text-ink-muted">Recorded by Field Agent</span>
              </div>

              <div>
                <label className="text-xs font-medium text-ink-muted uppercase tracking-wider block mb-2">Customer Issue Statement</label>
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4 text-sm text-ink leading-relaxed whitespace-pre-wrap font-sans">
                  {ticket.issueDescription || "No issue description recorded."}
                </div>
              </div>

              {/* Status Outcome Banner */}
              {isResolved && (
                <div className="p-4 rounded-xl bg-status-ok/10 border border-status-ok/20 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-status-ok shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-status-ok">Complaint Solved</div>
                    <p className="text-xs text-ink-muted mt-0.5">
                      This issue was successfully resolved during the physical walk-in visit
                      {ticket.solverName && <> by <span className="text-white font-medium">{ticket.solverName}</span></>}.
                    </p>
                  </div>
                </div>
              )}

              {ticket.isEscalated && (
                <div className="p-4 rounded-xl bg-status-fail/10 border border-status-fail/20 flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-status-fail shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-status-fail">Escalated to Administration</div>
                    <p className="text-xs text-ink mt-0.5">
                      <strong className="text-white">Reason:</strong> {ticket.subject || "Escalated for senior admin review."}
                    </p>
                    <p className="text-[11px] text-ink-muted mt-1">This ticket is actively queued in the Admin Panel.</p>
                  </div>
                </div>
              )}

              {!isResolved && !ticket.isEscalated && (
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-start gap-3">
                  <Clock className="w-5 h-5 text-status-info shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-white">Pending Field Resolution</div>
                    <p className="text-xs text-ink-muted mt-0.5">
                      You can mark this walk-in complaint as solved if resolved on the spot, or escalate it directly to Admin if specialized action is required.
                    </p>
                  </div>
                </div>
              )}

              {/* Role Segregation Notice */}
              <div className="pt-4 border-t border-white/[0.05]">
                <p className="text-xs text-ink-muted/80 leading-normal">
                  <strong className="text-ink-muted">Role Policy:</strong> Field Agents handle physical walk-in dialogue and complaint logging. Digital live chat threads and online instant messaging are managed exclusively by the Support Staff portal.
                </p>
              </div>
            </div>

          </div>

          {/* Right 1 Col: Customer & Ticket Metadata */}
          <div className="space-y-6">
            
            {/* Customer Card */}
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl sm:rounded-3xl p-6 backdrop-blur-xl space-y-4">
              <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider flex items-center gap-2">
                <User className="w-4 h-4 text-signal" />
                Customer Details
              </h2>
              
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-xs text-ink-muted block">Full Name</span>
                  <span className="font-semibold text-white">{ticket.customerName}</span>
                </div>

                {ticket.customerPhone && (
                  <div>
                    <span className="text-xs text-ink-muted block">Phone Number</span>
                    <span className="text-ink font-mono flex items-center gap-1.5 mt-0.5">
                      <Phone className="w-3.5 h-3.5 text-ink-muted" />
                      {ticket.customerPhone}
                    </span>
                  </div>
                )}

                {ticket.customerId && (
                  <div className="pt-2">
                    <Link 
                      to={`/customers/${ticket.customerId}`} 
                      className="text-xs text-signal hover:underline inline-flex items-center gap-1 font-medium"
                    >
                      View KYC Profile & Enrolled Palms →
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Case Audit Card */}
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl sm:rounded-3xl p-6 backdrop-blur-xl space-y-4">
              <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider">
                Case Tracking
              </h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-ink-muted text-xs">Ticket ID:</span>
                  <span className="font-mono text-white text-xs bg-white/[0.05] px-2 py-0.5 rounded">
                    {ticket.ticketId || "Pending"}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-ink-muted text-xs">Status:</span>
                  <span className={clsx("capitalize text-xs font-semibold",
                    isResolved ? "text-status-ok" :
                    ticket.isEscalated ? "text-status-fail" :
                    ticket.status === "in_progress" ? "text-status-info" : "text-status-warn"
                  )}>
                    {ticket.status.replace("_", " ")}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-ink-muted text-xs">Urgency:</span>
                  <span className={clsx("capitalize text-xs font-medium", ticket.urgency === "critical" && "text-status-fail font-semibold")}>
                    {ticket.urgency}
                  </span>
                </div>

                {ticket.solverName && (
                  <div className="flex justify-between items-center">
                    <span className="text-ink-muted text-xs">Solved By:</span>
                    <span className="text-white text-xs">{ticket.solverName}</span>
                  </div>
                )}

                <div className="flex justify-between items-center pt-2 border-t border-white/[0.05]">
                  <span className="text-ink-muted text-xs">Date Filed:</span>
                  <span className="text-ink text-xs">{formatDate(ticket.createdAt)}</span>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* Escalate to Admin Modal */}
      {showEscalateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={() => setShowEscalateModal(false)} />
          <div className="relative bg-ledger border border-white/[0.1] rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-display text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-status-fail" />
              Escalate Complaint to Admin
            </h3>
            <p className="text-xs text-ink-muted">
              Forward this walk-in issue directly to the Admin Panel. Provide details on what administrative or system action is required.
            </p>
            <form onSubmit={handleEscalateToAdmin} className="space-y-4">
              <textarea
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
                placeholder="State the reason for escalation (e.g. Account lockout, fraudulent charge, backend error)..."
                className="w-full bg-white/[0.02] border border-white/[0.1] rounded-xl p-3 text-sm text-white focus:outline-none focus:border-status-fail/50 min-h-[90px] resize-none"
                autoFocus
                required
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button 
                  type="button" 
                  onClick={() => setShowEscalateModal(false)} 
                  className="bg-transparent border border-white/[0.1] text-ink hover:text-white text-xs"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={!escalateReason.trim() || isEscalating} 
                  className="bg-status-fail text-white hover:brightness-110 text-xs"
                >
                  {isEscalating ? "Escalating..." : "Confirm Escalation"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
