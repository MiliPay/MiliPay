import { supabase } from "@milipay/shared/lib/supabase";
import type { PaginatedResult, SupportTicket, TicketStatus } from "@milipay/shared/types";

interface FetchTicketsOptions {
  page?: number;
  pageSize?: number;
  assignedTo?: string; // Filter by assigned agent
  status?: TicketStatus;
  onlyFormal?: boolean;
}

export async function fetchSupportTickets(options: FetchTicketsOptions = {}): Promise<PaginatedResult<SupportTicket>> {
  const { page = 1, pageSize = 15, assignedTo, status, onlyFormal } = options;

  let query = supabase
    .from("support_tickets")
    .select(`
      id,
      ticket_id,
      issue_description,
      status,
      urgency,
      created_at,
      updated_at,
      customer_id,
      customers ( first_name, last_name, phone ),
      assigned_to,
      staff_profiles!support_tickets_assigned_to_fkey ( full_name )
    `, { count: "exact" })
    .order("created_at", { ascending: false });

  if (assignedTo) {
    query = query.eq("assigned_to", assignedTo);
  }
  if (status) {
    query = query.eq("status", status);
  }
  if (onlyFormal) {
    query = query.not("ticket_id", "is", null);
  }

  const start = (page - 1) * pageSize;
  const { data, error, count } = await query.range(start, start + pageSize - 1);

  if (error) {
    console.error("Error fetching support tickets:", error);
    return { items: [], page, pageSize, totalCount: 0 };
  }

  const items: SupportTicket[] = (data || []).map((row: any) => {
    const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    const staff = Array.isArray(row.staff_profiles) ? row.staff_profiles[0] : row.staff_profiles;
    return {
      id: row.id,
      ticketId: row.ticket_id,
      issueDescription: row.issue_description,
      status: row.status,
      urgency: row.urgency,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      customerId: row.customer_id,
      customerName: cust ? `${cust.first_name} ${cust.last_name}` : "Unknown",
      customerPhone: cust?.phone,
      assignedTo: row.assigned_to,
      assignedToName: staff?.full_name,
    };
  });

  return { items, page, pageSize, totalCount: count || 0 };
}

export async function fetchSupportTicketStats() {
  const { count: totalTickets } = await supabase
    .from("support_tickets")
    .select("*", { count: "exact", head: true });

  const { count: openCount } = await supabase
    .from("support_tickets")
    .select("*", { count: "exact", head: true })
    .eq("status", "open");

  const { count: inProgressCount } = await supabase
    .from("support_tickets")
    .select("*", { count: "exact", head: true })
    .eq("status", "in_progress");

  const { count: resolvedCount } = await supabase
    .from("support_tickets")
    .select("*", { count: "exact", head: true })
    .eq("status", "resolved");

  const { count: escalationCount } = await supabase
    .from("support_tickets")
    .select("*", { count: "exact", head: true })
    .in("urgency", ["high", "critical"])
    .neq("status", "resolved");

  const { data: resolvedTickets } = await supabase
    .from("support_tickets")
    .select("started_at, resolved_at")
    .eq("status", "resolved")
    .not("started_at", "is", null)
    .not("resolved_at", "is", null);

  let avgResolution = "N/A";
  if (resolvedTickets && resolvedTickets.length > 0) {
    const totalHours = resolvedTickets.reduce((acc, ticket) => {
      const start = new Date(ticket.started_at!).getTime();
      const end = new Date(ticket.resolved_at!).getTime();
      return acc + (end - start) / (1000 * 60 * 60);
    }, 0);
    avgResolution = (totalHours / resolvedTickets.length).toFixed(1) + "h";
  }

  const total = totalTickets || 0;
  const pending = (openCount || 0) + (inProgressCount || 0);
  const resolved = resolvedCount || 0;

  return {
    totalTickets: total,
    openComplaints: openCount || 0,
    pendingTickets: pending,
    resolvedTickets: resolved,
    escalations: escalationCount || 0,
    avgResolution,
    resolvedPercentage: total > 0 ? Math.round((resolved / total) * 100) : 0,
    pendingPercentage: total > 0 ? Math.round((pending / total) * 100) : 0,
  };
}

export async function fetchEscalatedTickets(): Promise<PaginatedResult<SupportTicket>> {
  let query = supabase
    .from("support_tickets")
    .select(`
      id,
      ticket_id,
      subject,
      issue_description,
      status,
      urgency,
      created_at,
      updated_at,
      customer_id,
      customers ( first_name, last_name, phone ),
      assigned_to,
      staff_profiles!support_tickets_assigned_to_fkey ( full_name )
    `, { count: "exact" })
    .in("urgency", ["high", "critical"])
    .neq("status", "resolved")
    .order("created_at", { ascending: false });

  const { data, error, count } = await query.range(0, 49);

  if (error) {
    console.error("Error fetching escalated tickets:", error);
    return { items: [], page: 1, pageSize: 50, totalCount: 0 };
  }

  const items: SupportTicket[] = (data || []).map((row: any) => {
    const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    const staff = Array.isArray(row.staff_profiles) ? row.staff_profiles[0] : row.staff_profiles;
    return {
      id: row.id,
      ticketId: row.ticket_id,
      subject: row.subject,
      issueDescription: row.issue_description,
      status: row.status,
      urgency: row.urgency,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      customerId: row.customer_id,
      customerName: cust ? `${cust.first_name} ${cust.last_name}` : "Unknown",
      customerPhone: cust?.phone,
      assignedTo: row.assigned_to,
      assignedToName: staff?.full_name,
    };
  });

  return { items, page: 1, pageSize: 50, totalCount: count || 0 };
}

export async function claimTicket(ticketId: string, agentId: string) {
  const { data, error } = await supabase
    .from("support_tickets")
    .update({ 
      assigned_to: agentId, 
      status: "in_progress",
      started_at: new Date().toISOString()
    })
    .eq("id", ticketId)
    .select()
    .single();
    
  if (error) throw error;

  // Fetch staff member name for friendly notification
  const { data: staff } = await supabase.from("staff_profiles").select("full_name").eq("id", agentId).single();
  const agentName = staff?.full_name || "A support agent";

  // Notify chat participants
  try {
    await supabase.from("ticket_messages").insert({
      sender_id: agentId,
      sender_type: "system",
      content: `${agentName} has attended this chat and is now assisting you.`
    });
  } catch (msgErr) {
    console.warn("Could not insert attend system message:", msgErr);
  }

  return data;
}

export async function resolveTicket(dbId: string, staffId: string) {
  const { data, error } = await supabase
    .from("support_tickets")
    .update({ 
      status: "resolved",
      resolved_at: new Date().toISOString(),
      solved_by: staffId
    })
    .eq("id", dbId)
    .select()
    .single();
    
  if (error) throw error;

  // Insert resolution announcement
  try {
    await supabase.from("ticket_messages").insert({
      ticket_id: dbId,
      sender_id: staffId,
      sender_type: "system",
      content: `Ticket ${data.ticket_id} has been marked as solved.`
    });
  } catch (msgErr) {
    console.warn("Could not insert solve system message:", msgErr);
  }

  return data;
}

export async function escalateTicket(dbId: string, subject: string, staffId?: string) {
  const { data, error } = await supabase
    .from("support_tickets")
    .update({ 
      urgency: "high",
      assigned_to: null, // Return to admin queue
      status: "open",     // Reset status so it appears as new to Admin
      is_escalated: true,
      subject: subject
    })
    .eq("id", dbId)
    .select()
    .single();
    
  if (error) throw error;

  // Insert escalation announcement
  try {
    await supabase.from("ticket_messages").insert({
      ticket_id: dbId,
      sender_id: staffId || null,
      sender_type: "system",
      content: `Ticket ${data.ticket_id} has been escalated to Administration: "${subject}". An Administrator will review and resolve this case.`
    });
  } catch (msgErr) {
    console.warn("Could not insert escalation system message:", msgErr);
  }

  return data;
}

import type { TicketMessage, MessageSenderType } from "@milipay/shared/types";

export async function fetchTicketMessages(ticketId: string): Promise<TicketMessage[]> {
  const { data, error } = await supabase
    .from("ticket_messages")
    .select("id, ticket_id, sender_id, sender_type, content, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching messages:", error);
    return [];
  }

  // Fetch staff sender IDs to display friendly agent names
  const staffSenderIds = Array.from(
    new Set(
      (data || [])
        .filter((r) => r.sender_type === "staff" && r.sender_id)
        .map((r) => r.sender_id)
    )
  );

  const staffNameMap: Record<string, string> = {};
  if (staffSenderIds.length > 0) {
    const { data: staffData } = await supabase
      .from("staff_profiles")
      .select("id, full_name")
      .in("id", staffSenderIds);
    if (staffData) {
      staffData.forEach((s) => {
        staffNameMap[s.id] = s.full_name;
      });
    }
  }

  return (data || []).map((row: any) => {
    let senderName = "Customer";
    if (row.sender_type === "staff") {
      senderName = staffNameMap[row.sender_id] || "Support Agent";
    } else if (row.sender_type === "system") {
      senderName = "System";
    }

    return {
      id: row.id,
      ticketId: row.ticket_id,
      senderId: row.sender_id,
      senderType: row.sender_type as MessageSenderType,
      senderName,
      content: row.content,
      createdAt: row.created_at,
    };
  });
}

export async function sendTicketMessage(ticketId: string, senderId: string, senderType: MessageSenderType, content: string) {
  const { data, error } = await supabase
    .from("ticket_messages")
    .insert({
      sender_id: senderId,
      sender_type: senderType,
      content,
    })
    .select()
    .single();
    
  if (error) throw error;

  // Auto-reopen logic if customer messages a resolved ticket
  if (senderType === "customer") {
    const { data: ticket } = await supabase.from("support_tickets").select("status").eq("id", ticketId).single();
    if (ticket && ticket.status === "resolved") {
      await supabase.from("support_tickets").update({ status: "in_progress" }).eq("id", ticketId);
    }
  }

  return data;
}

export interface CreateTicketOptions {
  status?: TicketStatus;
  isEscalated?: boolean;
  subject?: string;
}

export async function createTicket(
  customerId: string, 
  issueDescription: string, 
  createdById: string,
  options?: CreateTicketOptions
) {
  const status = options?.status || "open";
  const isEscalated = options?.isEscalated || false;
  const urgency = isEscalated ? "high" : "medium";

  const { data, error } = await supabase
    .from("support_tickets")
    .insert({
      customer_id: customerId,
      issue_description: issueDescription,
      created_by: customerId, // Walk-in tickets belong to the customer profile
      status,
      urgency,
      is_escalated: isEscalated,
      subject: options?.subject || (isEscalated ? "Escalated Walk-in Complaint" : null),
      solved_by: status === "resolved" ? createdById : null,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
      started_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) throw error;

  // Walk-in complaints are physical in-person dialogues, not digital chat threads.
  // No ticket_messages are created here.

  return data;
}

export async function bumpTicketPriority(ticketId: string, agentName: string) {
  const { data, error } = await supabase
    .from("support_tickets")
    .update({ urgency: "critical" })
    .eq("id", ticketId)
    .select()
    .single();
    
  if (error) throw error;

  await supabase
    .from("ticket_messages")
    .insert({
      sender_type: "system",
      content: `Priority escalated to CRITICAL by Field Agent ${agentName} due to 24hr SLA breach.`,
    });

  return data;
}
