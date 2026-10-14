import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Timer, Zap } from "lucide-react";
import clsx from "clsx";
import { TONE_CLASSES } from "@milipay/shared/components/ui/StatusBadge";
import { PRESENCE_DOT } from "@milipay/shared/components/layout/ServiceLayout";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { useClock, useDesk } from "@milipay/shared/features/support/DeskContext";
import { CHANNEL_LABEL, fetchToday, firstNameOf, slaOf, type SupportToday } from "@milipay/shared/features/support/desk";
import { CHANNEL_ICON } from "@milipay/shared/pages/complaints/ComplaintsDesk";
import { SUPPORT_ROUTES } from "@milipay/shared/lib/constants";
import { initials } from "@milipay/shared/lib/utils/format";

/**
 * Support › Dashboard (design handoff, MiliPay Support "today"): your queue,
 * your numbers, the tickets closest to breaching, who is on, and anything
 * that will bring in tickets today (a provider that's slow right now).
 */

export function greeting(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function durationLabel(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

const SERVICE_WORD: Record<string, string> = {
  power: "Electricity tokens",
  electricity: "Electricity tokens",
  airtime: "Airtime top-ups",
  data: "Data bundles",
  cable: "Cable TV renewals",
};

/** The banner for a provider that's slow right now. */
export function slowBanner(s: SupportToday["slow"][number]): { title: string; body: string } {
  const what = (s.service && SERVICE_WORD[s.service.toLowerCase()]) || "Payments";
  return {
    title: `${s.provider} is slow right now.`,
    body: `${what} are taking up to ${Math.max(1, s.oldestMinutes)} minutes (${s.pending} waiting). Use the "Payment still pending" reply and don't request refunds before 60 minutes.`,
  };
}

export function SupportDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { inbox, presence } = useDesk();
  const now = useClock(1000);
  const [today, setToday] = useState<SupportToday | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => fetchToday().then((t) => live && setToday(t), () => undefined);
    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  const tickets = inbox?.tickets ?? [];
  const open = tickets.filter((t) => t.status !== "resolved");
  const mine = open.filter((t) => t.assignedTo === user?.id);
  const dueSoon = mine.filter((t) => {
    const s = slaOf(t, now);
    return s.left >= 0 && s.left < 60;
  }).length;
  const overdue = open.filter((t) => slaOf(t, now).left < 0).length;
  const teamAvg = today && today.solvers > 0 ? Math.round(today.solvedToday / today.solvers) : null;

  const stats: { label: string; value: string | number; hint: string; cls: string }[] = [
    { label: "Assigned to me", value: mine.length, hint: "Open right now", cls: "text-fg" },
    { label: "Due within 1 hour", value: dueSoon, hint: "Across your queue", cls: "text-warn" },
    { label: "Overdue", value: overdue, hint: "Whole team", cls: "text-fail" },
    { label: "Solved today", value: today?.solvedTodayMine ?? "—", hint: teamAvg != null ? `Team avg ${teamAvg}` : "Team avg —", cls: "text-brand-text" },
    {
      label: "First reply",
      value: durationLabel(today?.firstReplySeconds),
      hint: today?.firstReplyCount ? `Median · last 7 days` : "No replies yet this week",
      cls: "text-fg",
    },
    { label: "Satisfaction", value: "—", hint: "Ratings not collected yet", cls: "text-faint" },
  ];

  const risk = [...open].sort((a, b) => slaOf(a, now).left - slaOf(b, now).left).slice(0, 6);
  const team = (inbox?.agents ?? []).map((a) => {
    const you = a.id === user?.id;
    const p = you ? presence : a.presence;
    return {
      id: a.id,
      name: you ? `${a.name} (you)` : a.name,
      ini: initials(a.name),
      dot: PRESENCE_DOT[p],
      status: p === "online" ? (you ? "Online" : "Online · in chats") : p === "away" ? "Away" : "Offline",
      load: you ? mine.length : a.open,
    };
  });

  return (
    <div className="flex max-w-[1400px] animate-fade-in flex-col gap-[18px] px-4 py-[26px] sm:px-7">
      <div>
        <div className="text-2xl font-bold tracking-[-.02em]">
          {greeting(new Date(now))}, {firstNameOf(user?.fullName)}
        </div>
        <div className="mt-1 text-muted">Your queue, your numbers, and anything that will bring in tickets today.</div>
      </div>

      {(today?.slow ?? []).slice(0, 2).map((s) => {
        const b = slowBanner(s);
        return (
          <div key={`${s.provider}-${s.service}`} className="flex items-center gap-3 rounded-[14px] bg-warn-soft px-4 py-3.5 text-warn">
            <Zap size={18} className="flex-none" aria-hidden="true" />
            <div className="flex-1 text-[13px] leading-[1.45] text-fg">
              <b>{b.title}</b> {b.body}
            </div>
            <div className="hidden text-xs text-muted sm:block">Live from payments</div>
          </div>
        );
      })}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((k) => (
          <div key={k.label} className="rounded-2xl border border-line bg-panel px-4 py-3.5 shadow-card">
            <div className="text-[12.5px] text-muted">{k.label}</div>
            <div className={clsx("mt-1 text-2xl font-bold tabular-nums", k.cls)}>{k.value}</div>
            <div className="mt-0.5 text-xs text-faint">{k.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
          <div className="flex items-center px-5 pb-3 pt-4">
            <div className="flex-1 text-[15px] font-bold">Closest to breaching</div>
            <button type="button" onClick={() => navigate(SUPPORT_ROUTES.complaints)} className="text-[13px] font-semibold text-brand-text">
              Open inbox
            </button>
          </div>
          {inbox && risk.length === 0 && <div className="border-t border-line2 px-5 py-5 text-[13px] text-muted">Nothing open. Nice work.</div>}
          {risk.map((t) => {
            const s = slaOf(t, now);
            const Icon = CHANNEL_ICON[t.channel] ?? MessageCircle;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => navigate(SUPPORT_ROUTES.complaintDetails.replace(":id", t.id))}
                className="grid h-[52px] w-full grid-cols-[96px_minmax(0,1fr)_90px] items-center gap-3 border-t border-line2 px-5 text-left hover:bg-hover sm:grid-cols-[96px_minmax(0,1fr)_110px_90px]"
              >
                <span className={clsx("inline-flex h-6 items-center justify-center gap-1 rounded-[7px] text-xs font-bold tabular-nums", TONE_CLASSES[s.tone])}>
                  <Timer size={12} aria-hidden="true" />
                  {s.label}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold">{t.subject}</span>
                  <span className="block truncate text-xs text-muted">
                    {t.customer} · <span className="font-mono">{t.ticketId}</span>
                  </span>
                </span>
                <span className="hidden items-center gap-[5px] text-xs text-muted sm:flex">
                  <Icon size={13} aria-hidden="true" />
                  {CHANNEL_LABEL[t.channel]}
                </span>
                <span className="text-right text-xs text-muted">
                  {t.assignedTo ? (t.assignedTo === user?.id ? "You" : firstNameOf(t.assigneeName)) : "Unassigned"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
          <div className="px-5 pb-3 pt-4 text-[15px] font-bold">Team right now</div>
          {inbox && team.length === 0 && <div className="border-t border-line2 px-5 py-5 text-[13px] text-muted">No support agents yet.</div>}
          {team.map((a) => (
            <div key={a.id} className="flex items-center gap-2.5 border-t border-line2 px-5 py-2.5">
              <div className="relative">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-[11px] font-bold text-muted">{a.ini}</div>
                <div className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-panel" style={{ background: a.dot }} />
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-semibold">{a.name}</div>
                <div className="text-xs text-muted">{a.status}</div>
              </div>
              <div className="text-xs tabular-nums text-muted">{a.load} open</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SupportDashboard;
