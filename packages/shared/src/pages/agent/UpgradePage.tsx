import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpCircle, Check, Search } from "lucide-react";
import { Pill } from "@milipay/shared/components/ui/StatusBadge";
import { AGENT_ROUTES } from "@milipay/shared/components/layout/AgentLayout";
import {
  completeUpgrade,
  fetchAgentHome,
  findCustomers,
  resendUpgradeCode,
  sendUpgradeCode,
  verifyUpgradeCode,
  QUALITY_MIN,
} from "@milipay/shared/features/agent/api";
import { formatNaira } from "@milipay/shared/lib/utils/format";
import { CaptureTile, Empty, ErrorLine, Page, PageHeader, Panel, type Captured } from "./parts";

/**
 * Upgrade to Tier 2 (handoff screen 5): pick a Tier 1 self sign-up, text
 * them a code, capture the palm, review. They're Tier 2 straight away.
 */

type Candidate = { id: string; name: string; hint: string };
const STEPS = ["Customer", "SMS code", "Palm", "Review"] as const;

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap gap-2">
      {STEPS.map((s, i) => (
        <li
          key={s}
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold ${
            i === step ? "bg-brand-soft text-brand-text" : i < step ? "text-brand-text" : "text-faint"
          }`}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px]">
            {i < step ? <Check size={12} /> : i + 1}
          </span>
          {s}
        </li>
      ))}
    </ol>
  );
}

export default function UpgradePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<Candidate[] | null>(null);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [palm, setPalm] = useState<Captured | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Tier 1 sign-ups near the agent, or a search across everyone.
  useEffect(() => {
    const term = q.trim();
    const t = setTimeout(() => {
      const load =
        term.length >= 3
          ? findCustomers(term).then((rows) =>
              rows
                .filter((c) => c.tier === 1 && c.status === "active" && !c.palm)
                .map((c) => ({ id: c.id, name: c.name, hint: `${c.phone}${c.state ? ` · ${c.state}` : ""}` })),
            )
          : fetchAgentHome().then((h) => h.tier1Nearby.map((n) => ({ id: n.id, name: n.name, hint: `•••• ${n.phoneLast4}${n.lga ? ` · ${n.lga}` : ""}` })));
      load.then(setOptions, (e) => setError(e instanceof Error ? e.message : "Could not load customers."));
    }, term ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);

  // Arriving from "Upgrade" on the dashboard or Find customer.
  useEffect(() => {
    const id = params.get("customer");
    if (id && options && !picked) {
      const hit = options.find((o) => o.id === id);
      if (hit) setPicked(hit);
    }
  }, [params, options, picked]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      const r = await sendUpgradeCode(picked!.id);
      setRequestId(r.requestId);
      setSentTo(r.sentTo);
      setCode("");
      setStep(1);
    });

  if (done && picked) {
    return (
      <Page>
        <Panel className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-3 py-10 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand-text">
            <Check size={32} />
          </span>
          <h1 className="text-[22px] font-bold text-fg">{picked.name} is Tier 2</h1>
          <p className="text-sm text-muted">
            They can now pay up to {formatNaira(150_000)} at a time and {formatNaira(500_000)} a day with their palm.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => navigate(AGENT_ROUTES.dashboard)} className="h-11 rounded-[12px] border border-line px-4 text-sm font-semibold text-fg">
              Back to dashboard
            </button>
            <button
              type="button"
              onClick={() => {
                setDone(false);
                setPicked(null);
                setPalm(null);
                setRequestId(null);
                setStep(0);
              }}
              className="h-11 rounded-[12px] bg-brand px-4 text-sm font-bold text-brand-ink"
            >
              Upgrade another
            </button>
          </div>
        </Panel>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title="Upgrade to Tier 2" sub="For customers who signed up on the app. Capture their palm and they can pay with it straight away." />
      <Stepper step={step} />
      <Panel className="flex max-w-[680px] flex-col gap-4">
        {step === 0 && (
          <>
            <div className="flex h-11 items-center gap-2 rounded-xl border border-line bg-field px-3">
              <Search size={16} className="text-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search Tier 1 customers by phone or name"
                aria-label="Search Tier 1 customers"
                className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-faint"
              />
            </div>
            {options === null ? (
              <div className="h-24 animate-pulse rounded-[14px] bg-field" />
            ) : options.length === 0 ? (
              <Empty>{q.trim() ? "No Tier 1 customer matches." : "No Tier 1 sign-ups near you right now. Search by phone or name."}</Empty>
            ) : (
              <div className="flex flex-col gap-2">
                {options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setPicked(o)}
                    className={`flex items-center gap-3 rounded-[14px] border px-4 py-3 text-left ${picked?.id === o.id ? "border-brand bg-brand-soft" : "border-line hover:bg-hover"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-fg">{o.name}</div>
                      <div className="font-mono text-[13px] text-muted">{o.hint}</div>
                    </div>
                    <Pill tone="muted">Tier 1</Pill>
                  </button>
                ))}
              </div>
            )}
            <button type="button" disabled={!picked || busy} onClick={sendCode} className="h-12 rounded-[12px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-45">
              {busy ? "Sending…" : "Text the customer a code"}
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-sm text-muted">
              We texted a 6-digit code to {picked?.name}'s phone ({sentTo}). Ask them to read it to you.
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoFocus
              placeholder="000000"
              aria-label="Customer's code"
              className="h-14 rounded-[12px] border border-line bg-field px-4 text-center font-mono text-[24px] tracking-[.4em] text-fg outline-none focus:border-brand"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(async () => setSentTo((await resendUpgradeCode(requestId!)).sentTo))}
                className="h-12 rounded-[12px] border border-line px-4 text-sm font-semibold text-fg disabled:opacity-45"
              >
                Send a new code
              </button>
              <button
                type="button"
                disabled={code.length !== 6 || busy}
                onClick={() =>
                  run(async () => {
                    await verifyUpgradeCode(requestId!, code);
                    setStep(2);
                  })
                }
                className="h-12 flex-1 rounded-[12px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-45"
              >
                {busy ? "Checking…" : "Check code"}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <CaptureTile kind="palm" value={palm} onChange={setPalm} />
            <button
              type="button"
              disabled={!palm || palm.quality < QUALITY_MIN}
              onClick={() => setStep(3)}
              className="h-12 rounded-[12px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-45"
            >
              Continue
            </button>
          </>
        )}

        {step === 3 && picked && palm && (
          <>
            <div className="rounded-[14px] border border-line">
              {[
                ["Customer", picked.name],
                ["Code", "Confirmed by the customer"],
                ["Palm quality", `${palm.quality}/100`],
                ["New limits", `${formatNaira(150_000)} a payment · ${formatNaira(500_000)} a day`],
              ].map(([k, v], i) => (
                <div key={k} className={`flex justify-between gap-3 px-4 py-3 text-[13px] ${i ? "border-t border-line" : ""}`}>
                  <span className="text-muted">{k}</span>
                  <span className="text-right font-medium text-fg">{v}</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await completeUpgrade(requestId!, palm.template, palm.quality);
                  setDone(true);
                })
              }
              className="flex h-12 items-center justify-center gap-2 rounded-[12px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-45"
            >
              <ArrowUpCircle size={18} /> {busy ? "Upgrading…" : "Upgrade to Tier 2"}
            </button>
          </>
        )}

        {error && <ErrorLine>{error}</ErrorLine>}
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className="self-start text-[13px] font-semibold text-muted hover:text-fg">
            ← Back
          </button>
        )}
      </Panel>
    </Page>
  );
}
