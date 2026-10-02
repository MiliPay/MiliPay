import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  Clock,
  Contact,
  Lock,
  MapPin,
  MessageSquare,
  Minus,
  ScanFace,
  Search,
  ShieldAlert,
  Smartphone,
  TrendingUp,
  UserCheck,
  UserRoundPlus,
  UserX,
  X,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { Tabs, ToolbarSearch } from "@milipay/shared/components/ui/Tabs";
import { Pill, TONE_CLASSES, type Tone } from "@milipay/shared/components/ui/StatusBadge";
import { Drawer, DrawerSection, KeyValues } from "@milipay/shared/components/ui/Drawer";
import { ReasonDialog, type ReasonDialogProps } from "@milipay/shared/components/ui/ReasonDialog";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { useToast } from "@milipay/shared/components/ui/Toast";
import { RANGES, funnelRows, conversion, type DashboardRange } from "@milipay/shared/features/dashboard/view";
import {
  SIGNUP_REJECT_REASONS,
  SIGNUP_STEPS,
  STATUS_LABEL,
  canApprove,
  fetchSignupDetail,
  fetchSignups,
  progressBars,
  smileChip,
  stepNumber,
  whyHere,
  type SignupDetail,
  type SignupTab,
  type SignupsData,
} from "@milipay/shared/features/signups/admin";
import { decideSignupReview, remindSignup } from "@milipay/shared/features/signupReviews/api";
import { ROUTES } from "@milipay/shared/lib/constants";
import { initials, timeAgo } from "@milipay/shared/lib/utils/format";

/**
 * Admin › Sign-ups (design handoff): people opening an account in the app.
 * Where they drop off, bank-name mismatches, and the list by outcome. A
 * sign-up Smile ID couldn't confirm opens in the review drawer: approve
 * (only against NIMC's own record), send to an agent, or reject; unfinished
 * ones can be reminded by SMS. Every decision is on the audit log.
 */

const TABS: { id: SignupTab; label: string; hot?: boolean }[] = [
  { id: "review", label: "Needs review", hot: true },
  { id: "in_progress", label: "In progress" },
  { id: "abandoned", label: "Abandoned" },
  { id: "completed", label: "Created" },
  { id: "rejected", label: "Rejected" },
];
const COLS = "grid grid-cols-[minmax(0,1.5fr)_190px_130px_90px_150px_100px] gap-3.5";
type DialogConfig = Omit<ReasonDialogProps, "open" | "onClose">;

export default function SignupsPage() {
  const navigate = useNavigate();
  const { flash } = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "review") as SignupTab;
  const openId = params.get("id");
  const [range, setRange] = useState<DashboardRange>("today");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<SignupsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    try {
      setData(await fetchSignups(range, tab, query));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load sign-ups.");
    }
  }, [range, tab, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const setParam = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) v === null ? p.delete(k) : p.set(k, v);
    setParams(p, { replace: true });
  };

  const funnel = data ? funnelRows(data.funnel) : [];
  const conv = data ? conversion(data.funnel) : null;
  const stats: { label: string; value: string; icon: LucideIcon; tone: Tone }[] = [
    { label: "Sign-ups started", value: (data?.funnel[0] ?? 0).toLocaleString("en-NG"), icon: UserRoundPlus, tone: "muted" },
    { label: "Accounts created", value: (data?.funnel[5] ?? 0).toLocaleString("en-NG"), icon: BadgeCheck, tone: "ok" },
    { label: "Conversion", value: conv === null ? "—" : `${conv}%`, icon: TrendingUp, tone: "ok" },
    { label: "Waiting for review", value: String(data?.counts.review ?? 0), icon: ShieldAlert, tone: data?.counts.review ? "warn" : "muted" },
  ];

  return (
    <div className="flex max-w-[1480px] animate-fade-in flex-col gap-[18px] p-4 sm:p-7">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1">
          <h1 className="text-2xl font-bold tracking-[-.02em]">Sign-ups</h1>
          <div className="mt-1 text-muted">
            People opening an account in the app. Smile ID checks their NIN and selfie; anything it can't confirm comes here for review.
          </div>
        </div>
        <div className="flex gap-0.5 rounded-[10px] bg-chip p-[3px]" role="tablist" aria-label="Period">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={range === r.id}
              onClick={() => setRange(r.id)}
              className={clsx("rounded-lg px-3.5 py-[7px] text-[13px] font-semibold", range === r.id ? "bg-panel text-fg shadow-[0_1px_3px_rgba(0,0,0,.08)]" : "text-muted")}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="rounded-xl bg-fail-soft p-3.5 text-[13px] text-fail">{error}</div>}

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {stats.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="flex items-center gap-3.5 rounded-card border border-line bg-panel px-[18px] py-4 shadow-card">
              <div className={clsx("flex h-10 w-10 items-center justify-center rounded-[11px]", TONE_CLASSES[k.tone])}>
                <Icon size={19} aria-hidden="true" />
              </div>
              <div>
                <div className="text-[22px] font-bold tabular-nums tracking-[-.02em]">{k.value}</div>
                <div className="text-[13px] text-muted">{k.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="rounded-card border border-line bg-panel px-5 py-[18px] shadow-card">
          <div className="flex items-center">
            <h2 className="flex-1 text-[15px] font-bold">Where people drop off</h2>
            <div className="text-xs text-muted">Share of everyone who started</div>
          </div>
          <div className="mt-3.5 flex flex-col gap-2.5">
            {data && !data.funnel[0] && <div className="rounded-xl bg-field p-5 text-center text-[13px] text-muted">Nobody started signing up in this period.</div>}
            {data &&
              data.funnel[0] > 0 &&
              funnel.map((s, i) => (
                <div key={s.label} className="grid grid-cols-[130px_minmax(0,1fr)_70px_50px_52px] items-center gap-3 text-[13px]">
                  <div className="text-muted">{s.label}</div>
                  <div className="h-[22px] overflow-hidden rounded-md bg-chip">
                    <div
                      className="h-full rounded-md transition-[width] duration-[400ms]"
                      style={{
                        width: `${s.share}%`,
                        background: i === funnel.length - 1 ? "rgb(var(--brand))" : "color-mix(in oklch, rgb(var(--brand)) 55%, transparent)",
                      }}
                    />
                  </div>
                  <div className="text-right font-bold tabular-nums">{s.count.toLocaleString("en-NG")}</div>
                  <div className="text-right tabular-nums text-muted">{Math.round(s.share)}%</div>
                  <div className={clsx("text-right text-xs font-semibold tabular-nums", s.bad ? "text-fail" : "text-muted")}>{s.drop === null ? "" : `−${s.drop}%`}</div>
                </div>
              ))}
          </div>
        </div>
        <div className="flex flex-col overflow-hidden rounded-card border border-line bg-panel shadow-card">
          <div className="px-5 pb-1.5 pt-[18px]">
            <h2 className="text-[15px] font-bold">Bank name mismatches</h2>
            <div className="mt-[3px] text-xs text-muted">Customers who tried to link a bank account in someone else's name. The app blocked it.</div>
          </div>
          {data?.mismatches.length === 0 && <div className="border-t border-line2 px-5 py-4 text-[13px] text-muted">None in the last 30 days.</div>}
          {data?.mismatches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => navigate(ROUTES.customerDetails.replace(":id", m.customerId))}
              className="flex items-center gap-2.5 border-t border-line2 px-5 py-2.5 text-left hover:bg-hover"
            >
              <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-chip text-[11px] font-bold text-muted">{initials(m.customer)}</div>
              <div className="min-w-0 flex-1 text-[13px]">
                <div className="font-semibold">{m.customer || "Customer"}</div>
                <div className="text-xs text-muted">
                  {m.bank} · account name <span className="font-mono">{m.accountName}</span>
                </div>
              </div>
              <div className="text-xs text-faint">{timeAgo(m.createdAt)}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
        <Tabs
          tabs={TABS.map((t) => ({ ...t, count: data?.counts[t.id] ?? null }))}
          value={tab}
          onChange={(t) => setParam({ tab: t === "review" ? null : t })}
          right={<ToolbarSearch value={q} onChange={setQ} width={280} placeholder="Name or phone" icon={<Search size={15} aria-hidden="true" />} />}
        />
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className={clsx(COLS, "border-b border-line bg-field px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-faint")}>
              <div>Applicant</div>
              <div>Progress</div>
              <div>Smile ID</div>
              <div>Attempts</div>
              <div>Status</div>
              <div className="text-right">Last activity</div>
            </div>
            {!data && !error && <div className="p-10 text-center text-muted">Loading…</div>}
            {data?.rows.length === 0 && <div className="p-10 text-center text-muted">Nothing here.</div>}
            {data?.rows.map((x) => {
              const [label, tone] = STATUS_LABEL[x.status];
              const [chip, chipTone] = smileChip(x);
              const n = stepNumber(x.step, x.status);
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setParam({ id: x.id })}
                  className={clsx(COLS, "h-[58px] w-full items-center border-b border-line2 px-5 text-left hover:bg-hover", openId === x.id && "bg-hover")}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-chip text-[11px] font-bold text-muted">{initials(x.name) || "?"}</div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{x.name || "Name not confirmed yet"}</div>
                      <div className="font-mono text-xs text-muted">{x.phone}</div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-[5px]">
                    <div className="grid grid-cols-5 gap-[3px]">
                      {progressBars(x).map((b, i) => (
                        <div key={i} className={clsx("h-1 rounded-sm", b === "done" ? "bg-brand" : b === "warn" ? "bg-warn" : b === "stalled" ? "bg-faint" : "bg-line")} />
                      ))}
                    </div>
                    <div className="text-xs text-muted">{n === 5 && (x.status === "completed" || x.status === "approved") ? "All 5 steps" : `Step ${n} · ${SIGNUP_STEPS[n - 1]}`}</div>
                  </div>
                  <div>
                    <span className={clsx("inline-flex rounded-md px-2 py-0.5 text-xs font-semibold", TONE_CLASSES[chipTone])}>{chip}</span>
                  </div>
                  <div className="tabular-nums text-muted">{x.attempts} of 3</div>
                  <div>
                    <Pill tone={tone}>{label}</Pill>
                  </div>
                  <div className="text-right text-[13px] text-muted">{timeAgo(x.updatedAt)}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <SignupDrawer
        id={openId}
        onClose={() => setParam({ id: null })}
        onChanged={async (message) => {
          flash(message);
          setParam({ id: null });
          await load();
        }}
        onError={(m) => flash(m, "fail")}
        onOpenCustomer={(cid) => navigate(ROUTES.customerDetails.replace(":id", cid))}
      />
    </div>
  );
}

function SignupDrawer({
  id,
  onClose,
  onChanged,
  onError,
  onOpenCustomer,
}: {
  id: string | null;
  onClose: () => void;
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
  onOpenCustomer: (customerId: string) => void;
}) {
  const [d, setD] = useState<SignupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogConfig | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setD(null);
    setError(null);
    if (!id) return;
    fetchSignupDetail(id).then(
      (x) => (x ? setD(x) : setError("That sign-up wasn't found.")),
      (e: Error) => setError(e.message),
    );
  }, [id]);

  if (!id) return null;
  const who = d?.name || d?.phone || "this person";
  const [label, tone] = d ? STATUS_LABEL[d.status] : ["", "muted" as Tone];
  const why = d ? whyHere(d) : null;
  const n = d ? stepNumber(d.step, d.status) : 0;
  const finished = d?.status === "completed" || d?.status === "approved";

  const decide = (decision: "approve" | "agent" | "reject") => {
    if (!d) return;
    if (decision === "reject") {
      setDialog({
        title: `Reject ${who}'s sign-up?`,
        body: "They get an SMS with the reason. They can still register in person at an agent.",
        icon: UserX,
        tone: "fail",
        confirmLabel: "Reject sign-up",
        reasons: SIGNUP_REJECT_REASONS,
        notePlaceholder: "Optional note (only staff see it)",
        onConfirm: async (note, reason) => {
          const told = reason === "Other reason" ? note : reason ?? "";
          if (told.length < 3) throw new Error("Say why in the note: it's what they'll be told.");
          const r = await decideSignupReview(d.id, "reject", told, reason === "Other reason" ? undefined : note);
          setDialog(null);
          await onChanged(`${who} rejected${r.customerTold ? "" : " · the SMS didn't send"} · logged`);
        },
      });
    } else if (decision === "agent") {
      setDialog({
        title: "Ask them to visit an agent?",
        body: `${who} gets an SMS asking them to finish at a MiliPay agent with their NIN.`,
        icon: MapPin,
        tone: "ok",
        confirmLabel: "Send SMS",
        notePlaceholder: "Optional note",
        onConfirm: async (note) => {
          const r = await decideSignupReview(d.id, "agent", undefined, note);
          setDialog(null);
          await onChanged(r.customerTold ? "SMS sent · logged" : "Logged · the SMS didn't send");
        },
      });
    } else {
      setDialog({
        title: `Approve ${who}?`,
        body: "They can finish signing up: confirm their NIMC details, add an address and set a password and PIN. Their account opens on Tier 1.",
        icon: UserCheck,
        tone: "ok",
        confirmLabel: "Approve",
        noteRequired: true,
        notePlaceholder: "What did you check? (required)",
        onConfirm: async (note) => {
          const r = await decideSignupReview(d.id, "approve", undefined, note);
          setDialog(null);
          await onChanged(`${who} approved${r.customerTold ? "" : " · the SMS didn't send"} · logged`);
        },
      });
    }
  };

  const remind = async () => {
    if (!d || busy) return;
    setBusy(true);
    try {
      const r = await remindSignup(d.id);
      await onChanged(r.customerTold ? "Reminder sent · logged" : "Logged · the SMS didn't send");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not send the reminder.");
    } finally {
      setBusy(false);
    }
  };

  const btn = (style: "primary" | "danger" | "plain") =>
    clsx(
      "flex h-[42px] flex-1 items-center justify-center gap-2 rounded-[10px] border font-bold disabled:opacity-45",
      style === "primary" && "border-brand bg-brand text-brand-ink",
      style === "danger" && "border-line text-fail",
      style === "plain" && "border-line bg-panel",
    );

  const footer = d ? (
    d.status === "review" ? (
      <div className="flex gap-2.5">
        <button type="button" className={btn("danger")} onClick={() => decide("reject")}>
          <X size={16} aria-hidden="true" />
          Reject
        </button>
        <button type="button" className={btn("plain")} onClick={() => decide("agent")}>
          <MapPin size={16} aria-hidden="true" />
          Send to an agent
        </button>
        <button
          type="button"
          className={btn("primary")}
          disabled={!canApprove(d)}
          title={canApprove(d) ? "Let them finish signing up" : "Only possible when NIMC's record matches the NIN and birthday they typed"}
          onClick={() => decide("approve")}
        >
          <Check size={16} aria-hidden="true" />
          Approve
        </button>
      </div>
    ) : d.status === "in_progress" ? (
      <button type="button" className={btn("plain")} disabled={busy} onClick={() => void remind()}>
        <MessageSquare size={16} aria-hidden="true" />
        {busy ? "Sending…" : "Send reminder SMS"}
      </button>
    ) : d.customerId ? (
      <button type="button" className={btn("primary")} onClick={() => onOpenCustomer(d.customerId!)}>
        <ArrowUpRight size={16} aria-hidden="true" />
        Open customer
      </button>
    ) : undefined
  ) : undefined;

  const trail: { icon: LucideIcon; text: string; at: string | null }[] = d
    ? [
        { icon: UserRoundPlus, text: "Started signing up", at: d.createdAt },
        { icon: Smartphone, text: "Phone verified with an SMS code", at: d.phoneVerifiedAt },
        { icon: Contact, text: "NIN and date of birth entered, consent given", at: d.consentAt },
        ...(d.attempts > 0 || d.selfieFailure
          ? [{ icon: ScanFace, text: `${d.attempts} selfie attempt${d.attempts === 1 ? "" : "s"}${d.selfieFailure ? `, last: ${d.selfieFailure.replace(/_/g, " ")}` : ""}`, at: null }]
          : []),
        { icon: Check, text: "Confirmed their NIMC details", at: d.confirmedAt },
        ...(d.reviewedAt ? [{ icon: ShieldAlert, text: `Reviewed by ${d.reviewedBy ?? "an administrator"}`, at: d.reviewedAt }] : []),
        ...(d.remindedAt ? [{ icon: MessageSquare, text: "Reminder SMS sent", at: d.remindedAt }] : []),
        ...(d.customerId ? [{ icon: Lock, text: "Account opened (Tier 1)", at: d.updatedAt }] : []),
      ].filter((e) => e.at !== null || e.icon === ScanFace)
    : [];

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        width={560}
        label="Sign-up"
        footer={footer}
        header={
          d ? (
            <>
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-chip font-bold text-muted">{initials(d.name) || "?"}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-bold">{d.name || "Name not confirmed yet"}</div>
                <div className="mt-0.5 font-mono text-xs text-muted">{d.phone}</div>
              </div>
              <Pill tone={tone}>{label}</Pill>
            </>
          ) : (
            <div className="text-base font-bold">Sign-up</div>
          )
        }
      >
        {!d && !error && <LoadingState title="Loading the sign-up" minHeight="min-h-[240px]" />}
        {error && <div className="rounded-xl bg-fail-soft p-3.5 text-[13px] text-fail">{error}</div>}
        {d && (
          <>
            {why && d.status === "review" && (
              <div className="flex gap-2.5 rounded-xl bg-warn-soft px-3.5 py-3 text-[13px] leading-[1.45] text-warn">
                <ShieldAlert size={16} className="mt-px flex-none" aria-hidden="true" />
                <div>
                  <b>Why it's here:</b> {why}
                </div>
              </div>
            )}
            <DrawerSection title="Progress">
              <div className="grid grid-cols-5 gap-2">
                {SIGNUP_STEPS.map((step, i) => {
                  const k = i + 1;
                  const done = k < n || finished;
                  const cur = k === n && !done;
                  return (
                    <div key={step} className="flex flex-col items-center gap-1.5">
                      <div
                        className={clsx(
                          "flex h-7 w-7 items-center justify-center rounded-full",
                          done ? "bg-brand text-brand-ink" : cur ? (d.status === "review" ? "bg-warn-soft text-warn" : "bg-info-soft text-info") : "bg-chip text-faint",
                        )}
                      >
                        {done ? <Check size={14} strokeWidth={2.5} /> : cur ? <Clock size={14} strokeWidth={2.5} /> : <Minus size={14} strokeWidth={2.5} />}
                      </div>
                      <div className={clsx("text-xs font-semibold", done || cur ? "text-fg" : "text-faint")}>{step}</div>
                    </div>
                  );
                })}
              </div>
            </DrawerSection>

            {d.smile && (
              <DrawerSection title="Smile ID check">
                <div className="mb-3 grid grid-cols-2 gap-2.5">
                  <Photo url={d.smile.selfieUrl} label="Selfie" icon={ScanFace} />
                  <Photo url={d.smile.photoUrl} label="NIN photo (NIMC)" icon={Contact} />
                </div>
                {d.smile.confidence !== null && (
                  <div className="mb-3 flex items-center gap-2.5 text-[13px]">
                    <div className="w-[90px] text-muted">Face match</div>
                    <div className="h-2 flex-1 overflow-hidden rounded bg-chip">
                      <div className={clsx("h-full rounded", d.smile.confidence >= 80 ? "bg-brand" : "bg-warn")} style={{ width: `${Math.min(100, d.smile.confidence)}%` }} />
                    </div>
                    <div className="w-[42px] text-right font-bold">{Math.round(d.smile.confidence)}%</div>
                  </div>
                )}
                <KeyValues
                  rows={[
                    { k: "Job ID", v: d.smile.jobId ?? "—", mono: true },
                    {
                      k: "Result",
                      v:
                        d.smile.status === "clear"
                          ? "Passed"
                          : d.smile.status === "attention"
                            ? `Needs a look${d.smile.reason ? `: ${d.smile.reason.replace(/_/g, " ")}` : ""}`
                            : d.smile.status === "block"
                              ? `Blocked${d.smile.reason ? `: ${d.smile.reason.replace(/_/g, " ")}` : ""}`
                              : d.smile.status ?? "—",
                    },
                    ...(d.smile.risk ? [{ k: "Fraud risk", v: d.smile.risk }] : []),
                    {
                      k: "NIMC lookup",
                      v: d.smile.nimcName
                        ? `${d.smile.nimcName} · ${d.smile.ninMatches ? "NIN matches" : "NIN differs"} · ${d.smile.dobMatches ? "birthday matches" : "birthday differs"}`
                        : "No record returned",
                    },
                    { k: "Attempts", v: `${d.attempts} of 3` },
                  ]}
                />
              </DrawerSection>
            )}

            <DrawerSection title="Details">
              <KeyValues
                rows={[
                  { k: "Phone", v: `${d.phone}${d.phoneVerifiedAt ? " · verified" : ""}`, mono: true },
                  { k: "NIN", v: d.ninLast4 ? `•••• ••• ${d.ninLast4}` : "Not entered yet", mono: Boolean(d.ninLast4) },
                  { k: "Date of birth", v: d.dob ?? "—" },
                  { k: "State", v: [d.lga, d.state].filter(Boolean).join(", ") || "—" },
                  { k: "Started", v: timeAgo(d.createdAt) },
                ]}
              />
            </DrawerSection>

            <DrawerSection title="Timeline">
              {[...trail].reverse().map((e, i) => {
                const Icon = e.icon;
                return (
                  <div key={i} className="flex gap-2.5 border-t border-line2 py-[9px] text-[13px]">
                    <div className="pt-px text-faint">
                      <Icon size={14} aria-hidden="true" />
                    </div>
                    <div className="flex-1 leading-[1.4]">{e.text}</div>
                    <div className="whitespace-nowrap text-xs text-faint">{e.at ? timeAgo(e.at) : ""}</div>
                  </div>
                );
              })}
            </DrawerSection>
          </>
        )}
      </Drawer>
      {dialog && <ReasonDialog open onClose={() => setDialog(null)} {...dialog} />}
    </>
  );
}

function Photo({ url, label, icon: Icon }: { url: string | null; label: string; icon: LucideIcon }) {
  return url ? (
    <figure className="m-0 flex flex-col gap-1.5">
      <img src={url} alt={label} className="aspect-[4/5] w-full rounded-[14px] border border-line object-cover" />
      <figcaption className="text-center text-xs text-faint">{label}</figcaption>
    </figure>
  ) : (
    <div className="flex aspect-[4/5] flex-col items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-line bg-field text-xs text-faint">
      <Icon size={30} aria-hidden="true" />
      {label}
    </div>
  );
}
