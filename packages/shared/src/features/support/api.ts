import { supabase } from "@milipay/shared/lib/supabase";
import type { PaginatedResult, SupportTicket, TicketStatus } from "@milipay/shared/types";

interface FetchTicketsOptions {
  page?: number;
  pageSize?: number;
  assignedTo?: string; // Filter by assigned agent
  status?: TicketStatus;
}

export async function fetchSupportTickets(options: FetchTicketsOptions = {}): Promise<PaginatedResult<SupportTicket>> {
  const { page = 1, pageSize = 15, assignedTo, status } = options;

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
      customers:customer_id ( first_name, last_name, phone ),
      assigned_to,
      staff_profiles:assigned_to ( full_name )
    `, { count: "exact" })
    .order("created_at", { ascending: false });

  if (assignedTo) {
    query = query.eq("assigned_to", assignedTo);
  }
  if (status) {
    query = query.eq("status", status);
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
      issue_description,
      status,
      urgency,
      created_at,
      updated_at,
      customer_id,
      customers:customer_id ( first_name, last_name, phone ),
      assigned_to,
      staff_profiles:assigned_to ( full_name )
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
  return data;
}

export async function resolveTicket(ticketId: string) {
  const { data, error } = await supabase
    .from("support_tickets")
    .update({ 
      status: "resolved",
      resolved_at: new Date().toISOString()
    })
    .eq("id", ticketId)
    .select()
    .single();
    
  if (error) throw error;
  return data;
}

export async function escalateTicket(ticketId: string) {
  const { data, error } = await supabase
    .from("support_tickets")
    .update({ 
      urgency: "high",
      assigned_to: null, // Return to admin queue
      status: "open"      // Reset status so it appears as new
    })
    .eq("id", ticketId)
    .select()
    .single();
    
  if (error) throw error;
  return data;
}

import type { TicketMessage, MessageSenderType } from "@milipay/shared/types";

export async function fetchTicketMessages(ticketId: string): Promise<TicketMessage[]> {
  const { data, error } = await supabase
    .from("ticket_messages")
    .select(`
      id,
      ticket_id,
      sender_id,
      sender_type,
      content,
      created_at,
      staff_profiles:sender_id ( full_name ),
      customers:sender_id ( first_name, last_name )
    `)
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching messages:", error);
    return [];
  }

  return (data || []).map((row: any) => {
    let senderName = "Unknown";
    if (row.sender_type === "staff" && row.staff_profiles) {
      const staff = Array.isArray(row.staff_profiles) ? row.staff_profiles[0] : row.staff_profiles;
      senderName = staff?.full_name || "Staff";
    } else if (row.sender_type === "customer" && row.customers) {
      const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers;
      senderName = cust ? `${cust.first_name} ${cust.last_name}` : "Customer";
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
      ticket_id: ticketId,
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

export async function createTicket(customerId: string, issueDescription: string, createdById: string) {
  const ticketId = `TKT-${Math.floor(1000 + Math.random() * 9000)}`;
  const { data, error } = await supabase
    .from("support_tickets")
    .insert({
      ticket_id: ticketId,
      customer_id: customerId,
      issue_description: issueDescription,
      created_by: createdById,
      status: "open",
      urgency: "medium"
    })
    .select()
    .single();

  if (error) throw error;
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
      ticket_id: ticketId,
      sender_type: "system",
      content: `Priority escalated to CRITICAL by Field Agent ${agentName} due to 24hr SLA breach.`,
    });

  return data;
}
