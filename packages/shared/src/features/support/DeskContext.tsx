import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@milipay/shared/lib/supabase";
import { fetchInbox, setPresence, slaOf, type DeskInbox, type DeskTicket, type Presence } from "./desk";

/**
 * The support portal's live state, shared by the shell and every page: the
 * queue (kept fresh by realtime on tickets and messages), the team, and the
 * signed-in agent's presence, sent as a heartbeat every 2 minutes so a
 * closed tab drops to offline on its own.
 */

interface DeskValue {
  inbox: DeskInbox | null;
  error: string | null;
  reload: () => Promise<void>;
  presence: Presence;
  changePresence: (p: Presence) => Promise<void>;
  /** Bumps whenever a message lands, so an open thread can refetch. */
  messageTick: number;
  /** Open tickets: overdue, at risk (last 25%), and new (nobody holds them). */
  summary: { overdue: number; risk: number; unassigned: number };
}

const DeskContext = createContext<DeskValue | null>(null);

const HEARTBEAT_MS = 2 * 60 * 1000;

export function summarise(tickets: DeskTicket[], now = Date.now()) {
  const open = tickets.filter((t) => t.status !== "resolved");
  let overdue = 0;
  let risk = 0;
  for (const t of open) {
    const s = slaOf(t, now);
    if (s.left < 0) overdue++;
    else if (s.tone === "warn") risk++;
  }
  return { overdue, risk, unassigned: open.filter((t) => !t.assignedTo).length };
}

/** `trackPresence`: the support portal reports this agent as online/away; the admin page does not. */
export function DeskProvider({ children, trackPresence = true }: { children: ReactNode; trackPresence?: boolean }) {
  const [inbox, setInbox] = useState<DeskInbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [presence, setPresenceState] = useState<Presence>("online");
  const [messageTick, setMessageTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const presenceRef = useRef<Presence>("online");
  const pending = useRef<ReturnType<typeof setTimeout>>();

  const reload = useCallback(async () => {
    try {
      setInbox(await fetchInbox());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the queue.");
    }
  }, []);

  // A burst of changes (a customer typing several lines) reloads once.
  const soon = useCallback(() => {
    clearTimeout(pending.current);
    pending.current = setTimeout(() => void reload(), 400);
  }, [reload]);

  useEffect(() => {
    void reload();
    const channel = supabase
      .channel("support_desk")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, soon)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages" }, () => {
        setMessageTick((n) => n + 1);
        soon();
      })
      .subscribe();
    // Realtime can drop quietly; the team's presence changes without events.
    const poll = setInterval(() => void reload(), 30_000);
    return () => {
      clearTimeout(pending.current);
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [reload, soon]);

  // Start where the agent left off (unless they had gone offline), then keep it alive.
  useEffect(() => {
    if (!inbox?.me) return;
    if (presenceRef.current === "online" && inbox.me.presence === "away") {
      presenceRef.current = "away";
      setPresenceState("away");
    }
  }, [inbox?.me]);

  useEffect(() => {
    if (!trackPresence) return;
    const beat = () => void setPresence(presenceRef.current).catch(() => undefined);
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [trackPresence]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const changePresence = useCallback(
    async (p: Presence) => {
      presenceRef.current = p;
      setPresenceState(p);
      await setPresence(p);
      void reload();
    },
    [reload],
  );

  const summary = useMemo(() => summarise(inbox?.tickets ?? [], now), [inbox, now]);

  const value = useMemo<DeskValue>(
    () => ({ inbox, error, reload, presence, changePresence, messageTick, summary }),
    [inbox, error, reload, presence, changePresence, messageTick, summary],
  );
  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>;
}

export function useDesk(): DeskValue {
  const v = useContext(DeskContext);
  if (!v) throw new Error("useDesk must be used inside DeskProvider");
  return v;
}

/** Re-renders every second, for the SLA countdowns. */
export function useClock(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
