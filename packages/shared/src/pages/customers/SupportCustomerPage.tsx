import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MessageSquarePlus } from "lucide-react";
import clsx from "clsx";
import {
  applicantChips,
  customerChips,
  limitsOf,
  monthYear,
  paymentLook,
  securityLines,
  signupState,
  toneText,
  usePerson,
} from "@milipay/shared/components/support/Customer360";
import { NewTicketDialog } from "@milipay/shared/components/support/NewTicketDialog";
import { useDesk } from "@milipay/shared/features/support/DeskContext";
import { ago, signupRef } from "@milipay/shared/features/support/desk";
import { SUPPORT_ROUTES } from "@milipay/shared/lib/constants";
import { presentTransactionStatus } from "@milipay/shared/lib/transactionStatus";
import { formatNairaWhole, initials } from "@milipay/shared/lib/utils/format";

/**
 * Support › Customer (design handoff, MiliPay Support "customer"): the full
 * profile behind the inbox panel's expand button, for an account holder or
 * someone still signing up. Read-only, plus "New ticket" for a call or email.
 */
export default function SupportCustomerPage({ applicant = false }: { applicant?: boolean }) {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { inbox, reload } = useDesk();
  const person = usePerson(applicant ? null : id, applicant ? id : null);
  const [newTicket, setNewTicket] = useState(false);
  const { detail: c, applicant: a, payments } = person;

  const back = (
    <button
      type="button"
      onClick={() => navigate(SUPPORT_ROUTES.customers)}
      className="flex w-max items-center gap-1.5 font-medium text-muted hover:text-fg"
    >
      <ArrowLeft size={15} aria-hidden="true" />
      Customers
    </button>
  );

  if (person.loading && !c && !a) {
    return <div className="flex max-w-[1300px] flex-col gap-4 px-4 py-[26px] sm:px-7">{back}<div className="text-muted">Loading…</div></div>;
  }
  if (!c && !a) {
    return (
      <div className="flex max-w-[1300px] flex-col gap-4 px-4 py-[26px] sm:px-7">
        {back}
        <div className="rounded-card border border-line bg-panel p-5 text-muted">This person wasn't found.</div>
      </div>
    );
  }

  const name = c?.name ?? a?.name ?? "Signing up";
  const chips = c ? customerChips(c) : applicantChips(a!);
  const openTickets = (inbox?.tickets ?? []).filter(
    (t) => t.status !== "resolved" && (c ? t.customerId === c.id : t.signupId === a!.id),
  ).length;
  const [single, daily] = c ? limitsOf(c) : ["—", "—"];
  const rows: [string, string][] = [
    ["Phone", c?.phone ?? a?.phone ?? "—"],
    ["Registered", c ? (c.source === "self" ? "Self sign-up · app" : "By an agent") : "Still signing up"],
    ["State", c?.state ?? a?.state ?? "—"],
    ["Customer since", c ? monthYear(c.createdAt) : "—"],
    ["Linked banks", c ? c.accounts.map((b) => b.bank).filter(Boolean).join(", ") || "None" : "None"],
    ["Per payment", single],
    ["Daily limit", daily],
    ["Open tickets", String(openTickets)],
  ];
  const security = c ? securityLines(c) : [];
  const signupLine = a ? `${signupRef(a.id)} · step ${a.stepNumber} of 5 · ${signupState(a).label}` : "";

  return (
    <div className="flex max-w-[1300px] animate-fade-in flex-col gap-4 px-4 py-[26px] sm:px-7">
      {back}
      <div className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-panel p-5 shadow-card">
        <div className="flex h-[58px] w-[58px] flex-none items-center justify-center rounded-full bg-[linear-gradient(145deg,#0a7a5a,#022c22)] text-xl font-bold text-[#fff]">
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[21px] font-bold tracking-[-.02em]">{name}</div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {chips.map((ch) => (
              <span key={ch.label} className={clsx("inline-flex items-center gap-[5px] rounded-md px-2 py-[3px] text-xs font-semibold", ch.cls)}>
                <ch.icon size={12} aria-hidden="true" />
                {ch.label}
              </span>
            ))}
          </div>
        </div>
        {signupLine && <div className="font-mono text-[13px] font-semibold text-warn">{signupLine}</div>}
        <button
          type="button"
          onClick={() => setNewTicket(true)}
          className="flex h-[38px] items-center gap-2 rounded-[10px] bg-brand px-3.5 font-bold text-brand-ink"
        >
          <MessageSquarePlus size={16} aria-hidden="true" />
          New ticket
        </button>
      </div>

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
          <div className="px-[18px] pb-2.5 pt-4 text-[15px] font-bold">Profile</div>
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-t border-line2 px-[18px] py-2.5 text-[13px]">
              <div className="text-muted">{k}</div>
              <div className="text-right font-medium">{v}</div>
            </div>
          ))}
          {security.length > 0 && (
            <>
              <div className="border-t border-line px-[18px] pb-1.5 pt-3.5 text-[15px] font-bold">Security</div>
              {security.map((e, i) => (
                <div key={i} className="flex gap-2.5 border-t border-line2 px-[18px] py-[9px] text-[13px]">
                  <div className="pt-px text-faint">
                    <e.icon size={14} aria-hidden="true" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">{e.text}</div>
                    <div className="text-xs text-muted">{e.sub}</div>
                  </div>
                  <div className="text-xs text-faint">{e.when}</div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
          <div className="px-[18px] pb-2.5 pt-4 text-[15px] font-bold">Payments</div>
          {payments.length === 0 && <div className="border-t border-line2 p-[18px] text-[13px] text-muted">No payments yet.</div>}
          {payments.map((p) => {
            const look = paymentLook(p);
            const st = presentTransactionStatus(p.status);
            return (
              <div key={p.id} className="flex items-center gap-3 border-t border-line2 px-[18px] py-2.5">
                <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px]" style={{ background: `${look.color}24`, color: look.color }}>
                  <look.icon size={14} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{look.title}</div>
                  <div className="text-xs text-muted">
                    <span className="font-mono">{p.reference}</span> · {ago(p.createdAt)} ago
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold tabular-nums">{formatNairaWhole(p.amount)}</div>
                  <div className={clsx("text-xs font-semibold", toneText(st.tone))}>{st.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <NewTicketDialog
        open={newTicket}
        name={name}
        customerId={c?.id}
        signupId={c ? null : a?.id}
        onClose={() => setNewTicket(false)}
        onCreated={(ticketId) => {
          setNewTicket(false);
          void reload();
          navigate(SUPPORT_ROUTES.complaintDetails.replace(":id", ticketId));
        }}
      />
    </div>
  );
}
