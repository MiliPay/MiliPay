import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHAT_STATUS,
  FAQ,
  SUPPORT_BADGE,
  agoLabel,
  bubbleTime,
  chatCount,
  lastSaid,
  supportState,
} from "../mobile-app/src/lib/supportView";

/**
 * Support chat (redesign phase 5): the customer's Help & support and chat
 * screens, the staff portal on the other end, and what the database lets each
 * side do.
 */

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const MIGRATION = read("supabase/migrations/20260928120000_support_chat_hardening.sql");
const PORTAL_API = read("packages/shared/src/features/support/api.ts");
// The ticket thread is the middle pane of the complaints desk (portal redesign, step 7).
const PORTAL_CHAT = read("packages/shared/src/pages/complaints/ComplaintsDesk.tsx");
const STORE = read("mobile-app/src/store/useStore.ts");
const supportStore = STORE.slice(STORE.indexOf("export const useSupportStore"), STORE.indexOf("export interface AppTransaction"));

describe("where a chat stands", () => {
  it("reads the columns staff actually move", () => {
    expect(supportState({ status: "open", assigned_to: null })).toBe("waiting");
    expect(supportState({ status: "in_progress", assigned_to: "staff-1" })).toBe("in_progress");
    // Escalating hands the ticket back to the admin queue: open, unassigned.
    expect(supportState({ status: "open", assigned_to: null, is_escalated: true })).toBe("escalated");
    expect(supportState({ status: "resolved", is_escalated: true })).toBe("resolved");
  });

  it("in the design's words", () => {
    expect(SUPPORT_BADGE.waiting.label).toBe("Waiting for agent");
    expect(SUPPORT_BADGE.escalated.label).toBe("Escalated to admin");
    expect(SUPPORT_BADGE.resolved.label).toBe("Solved");
    expect(CHAT_STATUS.in_progress).toBe("Agent active");
  });

  it("previews and times", () => {
    const now = new Date(2026, 8, 28, 12, 0);
    expect(agoLabel(new Date(2026, 8, 28, 11, 48).toISOString(), now)).toBe("12m ago");
    expect(agoLabel(new Date(2026, 8, 28, 10, 0).toISOString(), now)).toBe("2h ago");
    expect(agoLabel(new Date(2026, 8, 22, 10, 0).toISOString(), now)).toBe("Sep 22");
    expect(bubbleTime(new Date(2026, 8, 28, 7, 52).toISOString())).toBe("7:52 AM");
    expect(chatCount(1)).toBe("1 chat");
    expect(chatCount(3)).toBe("3 chats");
    expect(
      lastSaid(
        [
          { sender_type: "customer", content: "My token?", created_at: "1" },
          { sender_type: "system", content: "Ticket marked as solved", created_at: "2" },
        ],
        "",
      ),
    ).toBe("My token?");
  });

  it("quick answers point where things really are", () => {
    expect(FAQ.map((f) => f.label)).toEqual(["Stuck payment", "Unlink bank", "Biometrics / PIN", "Daily limits"]);
    // "Your limits" is on the Palm tab in this app.
    expect(FAQ.find((f) => f.id === "limits")!.body).toMatch(/Palm tab/);
  });
});

describe("what a customer may do to a ticket", () => {
  it("can no longer edit it", () => {
    expect(MIGRATION).toMatch(/DROP POLICY IF EXISTS "Customers can update own tickets"/);
    expect(MIGRATION).not.toMatch(/CREATE POLICY "Customers can update own tickets"/);
    // Nor does the app try: sending is a message and nothing else.
    const send = supportStore.slice(supportStore.indexOf("sendMessage: async"), supportStore.indexOf("unsubscribe: () =>"));
    expect(send).not.toMatch(/from\('support_tickets'\)/);
  });

  it("opens only an open, unassigned ticket of their own", () => {
    for (const rule of ["status = 'open'", "assigned_to IS NULL", "coalesce(is_escalated, false) = false", "solved_by IS NULL", "created_by = auth.uid()"]) {
      expect(MIGRATION, rule).toContain(rule);
    }
  });

  it("cannot write into a solved chat", () => {
    expect(MIGRATION).toMatch(/support_tickets\.status <> 'resolved'/);
  });

  it("the database moves the ticket up the staff queue on every message", () => {
    expect(MIGRATION).toMatch(/AFTER INSERT ON public\.ticket_messages/);
    expect(MIGRATION).toMatch(/UPDATE public\.support_tickets SET updated_at = now\(\) WHERE id = NEW\.ticket_id/);
  });

  it("a chat starts with the customer's own first message", () => {
    const start = supportStore.slice(supportStore.indexOf("startNewChat: async"), supportStore.indexOf("selectChat: async"));
    expect(start).toMatch(/from\('support_tickets'\)[\s\S]*\.insert\(/);
    expect(start).toMatch(/from\('ticket_messages'\)[\s\S]*sender_type: 'customer', content: text/);
  });
});

describe("the staff portal's side", () => {
  it("every message it saves says which ticket it belongs to", () => {
    // ebe6d458 dropped ticket_id from these inserts; ticket_messages.ticket_id
    // is NOT NULL, so every staff reply, "joined the chat" and priority note
    // failed to save and customers never saw an answer.
    const inserts = [...PORTAL_API.matchAll(/from\("ticket_messages"\)\s*\.insert\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]);
    expect(inserts.length).toBeGreaterThanOrEqual(5);
    for (const body of inserts) expect(body).toMatch(/ticket_id:/);
  });

  it("system notes are the customer's words, not internal ones", () => {
    expect(PORTAL_API).toMatch(/from MiliPay Support joined the chat/);
    expect(PORTAL_API).toMatch(/content: "Escalated to admin"/);
    expect(PORTAL_API).toMatch(/content: "Ticket marked as solved"/);
    // The escalation subject and SLA details are for staff only.
    expect(PORTAL_API).not.toMatch(/content: `Ticket \$\{data\.ticket_id\} has been escalated/);
    expect(PORTAL_API).not.toMatch(/due to 24hr SLA breach/);
  });

  it("typing dots: the portal and the app use the same live channel", () => {
    expect(PORTAL_CHAT).toMatch(/supabase\.channel\(`support_typing_\$\{ticket\.id\}`\)/);
    expect(PORTAL_CHAT).toMatch(/event: "typing", payload: \{ from: "staff" \}/);
    expect(supportStore).toMatch(/\.channel\(`support_typing_\$\{ticketId\}`\)/);
    expect(supportStore).toMatch(/\.on\('broadcast', \{ event: 'typing' \}/);
  });
});
