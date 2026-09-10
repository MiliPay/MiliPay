const fs = require('fs');
let content = fs.readFileSync('packages/shared/src/features/support/api.ts', 'utf8');

// Replace resolveTicket
const oldResolve = \export async function resolveTicket(ticketId: string) {
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
}\;

const newResolve = \export async function resolveTicket(dbId: string, staffId: string) {
  const tktId = \\\TKT-\\\\\\;
  const { data, error } = await supabase
    .from("support_tickets")
    .update({ 
      status: "resolved",
      resolved_at: new Date().toISOString(),
      ticket_id: tktId,
      solved_by: staffId
    })
    .eq("id", dbId)
    .select()
    .single();
    
  if (error) throw error;
  return data;
}\;

// Replace escalateTicket
const oldEscalate = \export async function escalateTicket(ticketId: string) {
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
}\;

const newEscalate = \export async function escalateTicket(dbId: string, subject: string) {
  const tktId = \\\TKT-\\\\\\;
  const { data, error } = await supabase
    .from("support_tickets")
    .update({ 
      urgency: "high",
      assigned_to: null,
      status: "open",
      ticket_id: tktId,
      subject: subject,
      is_escalated: true
    })
    .eq("id", dbId)
    .select()
    .single();
    
  if (error) throw error;
  return data;
}\;

content = content.replace(oldResolve, newResolve).replace(oldEscalate, newEscalate);
fs.writeFileSync('packages/shared/src/features/support/api.ts', content, 'utf8');
