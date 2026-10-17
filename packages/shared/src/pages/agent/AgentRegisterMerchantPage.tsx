import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Clock, Loader2, LocateFixed, Router } from "lucide-react";
import clsx from "clsx";
import { StepProgress } from "@milipay/shared/components/ui/StepProgress";
import { AGENT_ROUTES } from "@milipay/shared/components/layout/AgentLayout";
import { MERCHANT_CATEGORIES, NIGERIAN_SETTLEMENT_BANKS, onboardMerchant, resolveSettlementAccount } from "@milipay/shared/features/merchants/merchantService";
import {
  EMPTY_MERCHANT_FORM,
  accountName,
  agentMerchantStepError,
  agentOnboardingBody,
  type AgentTerminalChoice,
  type MerchantForm,
} from "@milipay/shared/features/merchants/register";
import { categoryStyle } from "@milipay/shared/features/merchants/admin";
import { fetchDefaultMerchantFee } from "@milipay/shared/features/settings/api";
import { fetchStock, type StockTerminal } from "@milipay/shared/features/agent/api";
import { NIGERIAN_STATES } from "@milipay/shared/lib/constants";
import { formatNaira } from "@milipay/shared/lib/utils/format";
import { ChoiceChips, Field, FormError, ReviewRows, SelectField, StepNav } from "../register/formParts";
import { Page, PageHeader, Panel } from "./parts";

/**
 * Register merchant, agent portal (handoff screen 6): business and owner,
 * bank (dropdown, 10 digits, "Check account name"), location ("Use my
 * location"), a terminal from the agent's stock or "Assign later", review
 * with consent. onboard-merchant creates the login and the merchant
 * (Pending until an admin approves it) and hands over the terminal.
 */

const STEPS = [{ label: "Business" }, { label: "Bank" }, { label: "Location" }, { label: "Terminal" }, { label: "Review" }];
const digits = (n: number) => (v: string) => v.replace(/\D/g, "").slice(0, n);
type Lookup = "idle" | "checking" | "done";

export default function AgentRegisterMerchantPage() {
  const navigate = useNavigate();
  const [f, setF] = useState<MerchantForm>(EMPTY_MERCHANT_FORM);
  const [step, setStep] = useState(0);
  const [lookup, setLookup] = useState<Lookup>("idle");
  const [loc, setLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [stock, setStock] = useState<StockTerminal[] | null>(null);
  const [terminal, setTerminal] = useState<AgentTerminalChoice | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ delivered: boolean } | null>(null);

  const set = (patch: Partial<MerchantForm>) => {
    setF((p) => ({ ...p, ...patch }));
    setErr("");
  };
  const bankCode = NIGERIAN_SETTLEMENT_BANKS.find((b) => b.name === f.bank)?.code ?? "";

  // Agents don't set the fee: Settings › Fees "Palm payments (default)".
  useEffect(() => {
    fetchDefaultMerchantFee().then((fee) => fee && setF((p) => ({ ...p, fee: String(fee) })));
    fetchStock().then(setStock, () => setStock([]));
  }, []);

  const checkAccount = async () => {
    if (!bankCode || !/^\d{10}$/.test(f.acct)) return setErr("Choose the bank and enter the 10-digit account number.");
    setLookup("checking");
    const name = await resolveSettlementAccount(bankCode, f.acct);
    setF((p) => ({ ...p, acctName: name }));
    setLookup("done");
  };

  const locate = () => {
    if (!("geolocation" in navigator)) return setErr("This device can't share its location. Type the address carefully instead.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ latitude: Number(p.coords.latitude.toFixed(6)), longitude: Number(p.coords.longitude.toFixed(6)) });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setErr("We couldn't get your location. Allow location access, or carry on without it.");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const next = async () => {
    const e = agentMerchantStepError(step, f, lookup, terminal);
    if (e) return setErr(e);
    if (step < 4) return setStep(step + 1);
    if (!consent) return setErr("Confirm you met the owner and checked their CAC certificate.");
    setBusy(true);
    try {
      const r = await onboardMerchant(agentOnboardingBody(f, bankCode, terminal!, loc));
      setDone({ delivered: Boolean(r.credentials?.delivered) });
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not register the merchant.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Page>
        <Panel className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-3 py-10 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand-text">
            <Check size={32} />
          </span>
          <h1 className="text-[22px] font-bold text-fg">{f.biz} is sent for review</h1>
          <p className="text-sm text-muted">
            {terminal?.mode === "stock" ? `Terminal ${terminal.terminalId} is theirs. ` : "Assign a terminal from Merchants when you have one. "}
            {done.delivered ? "We texted the owner their merchant-portal login." : "We couldn't text the owner their login, so check their number."} You earn{" "}
            {formatNaira(1000)} once an admin approves the business.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => navigate(AGENT_ROUTES.merchants)} className="h-11 rounded-[12px] border border-line px-4 text-sm font-semibold text-fg">
              My merchants
            </button>
            <button
              type="button"
              onClick={() => {
                setF((p) => ({ ...EMPTY_MERCHANT_FORM, fee: p.fee }));
                setLoc(null);
                setTerminal(null);
                setConsent(false);
                setLookup("idle");
                setDone(null);
                setStep(0);
                fetchStock().then(setStock, () => setStock([]));
              }}
              className="h-11 rounded-[12px] bg-brand px-4 text-sm font-bold text-brand-ink"
            >
              Register another
            </button>
          </div>
        </Panel>
      </Page>
    );
  }

  const unchecked = lookup === "done" && !f.acctName;

  return (
    <Page>
      <PageHeader title="Register merchant" sub="Sign up a business in person. It's Pending until an admin approves it." />
      <StepProgress steps={STEPS} current={step} onPick={(s) => s < step && setStep(s)} canRevisit={!busy} />
      <Panel className="flex max-w-[760px] flex-col gap-[18px]">
        {step === 0 && (
          <>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field full label="Business name" placeholder="As on the CAC certificate" value={f.biz} onChange={(e) => set({ biz: e.target.value })} />
              <Field label="CAC number (optional)" placeholder="RC-0000000" mono value={f.rc} onChange={(e) => set({ rc: e.target.value })} />
              <Field label="Owner's full name" placeholder="As on their BVN" value={f.dir} onChange={(e) => set({ dir: e.target.value })} />
              <Field label="Owner's phone" placeholder="0803 000 0000" mono inputMode="tel" value={f.dphone} onChange={(e) => set({ dphone: digits(11)(e.target.value) })} />
              <Field label="Owner's BVN" placeholder="11 digits" mono inputMode="numeric" value={f.dbvn} onChange={(e) => set({ dbvn: digits(11)(e.target.value) })} />
              <Field
                full
                label="Login email"
                placeholder="owner@business.ng"
                type="email"
                value={f.email}
                onChange={(e) => set({ email: e.target.value })}
                hint="Their merchant-portal login. It can't already have a MiliPay login."
              />
            </div>
            <ChoiceChips
              label="Type of business"
              value={f.cat}
              onChange={(cat) => set({ cat })}
              options={MERCHANT_CATEGORIES.map((c) => ({ value: c.value, label: categoryStyle(c.value).label }))}
            />
          </>
        )}

        {step === 1 && (
          <>
            <SelectField
              label="Bank"
              value={f.bank}
              onChange={(bank) => {
                set({ bank, acctName: null, acctNameTyped: "" });
                setLookup("idle");
              }}
              placeholder="Select a bank"
              options={NIGERIAN_SETTLEMENT_BANKS.map((b) => b.name)}
            />
            <Field
              label="Account number"
              placeholder="10 digits"
              mono
              inputMode="numeric"
              value={f.acct}
              onChange={(e) => {
                set({ acct: digits(10)(e.target.value), acctName: null, acctNameTyped: "" });
                setLookup("idle");
              }}
            />
            {f.acctName ? (
              <div className="flex items-center gap-2 rounded-[12px] bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-text">
                <Check size={16} /> {f.acctName}
              </div>
            ) : unchecked ? (
              <Field
                label="Account name"
                placeholder="As the bank shows it"
                value={f.acctNameTyped}
                onChange={(e) => set({ acctNameTyped: e.target.value })}
                hint="The bank didn't answer. Type the name; it's marked not checked for the reviewer."
                hintTone="fail"
              />
            ) : (
              <button
                type="button"
                disabled={lookup === "checking"}
                onClick={() => void checkAccount()}
                className="h-12 rounded-[12px] border border-line text-sm font-semibold text-fg hover:bg-hover disabled:opacity-50"
              >
                {lookup === "checking" ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" /> Checking with the bank…
                  </span>
                ) : (
                  "Check account name"
                )}
              </button>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <SelectField label="State" value={f.state} onChange={(state) => set({ state })} placeholder="Select a state" options={NIGERIAN_STATES} />
            <Field label="Business address" placeholder="Shop number, street, area, LGA" value={f.addr} onChange={(e) => set({ addr: e.target.value })} />
            <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line p-4">
              <LocateFixed size={20} className={loc ? "text-brand-text" : "text-muted"} />
              <div className="min-w-[180px] flex-1 text-sm">
                {loc ? (
                  <span className="font-mono text-fg">
                    {loc.latitude}, {loc.longitude}
                  </span>
                ) : (
                  <span className="text-muted">Stand at the shop and use your location, so customers can find it.</span>
                )}
              </div>
              <button
                type="button"
                disabled={locating}
                onClick={locate}
                className="h-10 rounded-[12px] border border-line px-4 text-[13px] font-semibold text-fg hover:bg-hover disabled:opacity-50"
              >
                {locating ? "Locating…" : loc ? "Use my location again" : "Use my location"}
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-2">
            {stock === null ? (
              <div className="h-24 animate-pulse rounded-[14px] bg-field" />
            ) : (
              stock.map((t) => {
                const on = terminal?.mode === "stock" && terminal.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTerminal({ mode: "stock", id: t.id, terminalId: t.terminalId })}
                    className={clsx("flex items-center gap-3 rounded-[14px] border px-4 py-3 text-left", on ? "border-brand bg-brand-soft" : "border-line hover:bg-hover")}
                  >
                    <Router size={18} className="text-muted" />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-sm text-fg">{t.terminalId}</div>
                      <div className="text-[13px] text-muted">{t.model ?? "Terminal"} · in your stock</div>
                    </div>
                    {on && <Check size={18} className="text-brand-text" />}
                  </button>
                );
              })
            )}
            {stock?.length === 0 && <div className="text-[13px] text-muted">You have no terminals in your stock. Collect them from your hub.</div>}
            <button
              type="button"
              onClick={() => setTerminal({ mode: "later" })}
              className={clsx(
                "flex items-center gap-3 rounded-[14px] border px-4 py-3 text-left",
                terminal?.mode === "later" ? "border-brand bg-brand-soft" : "border-line hover:bg-hover",
              )}
            >
              <Clock size={18} className="text-muted" />
              <div className="flex-1 text-sm font-semibold text-fg">Assign later</div>
              {terminal?.mode === "later" && <Check size={18} className="text-brand-text" />}
            </button>
          </div>
        )}

        {step === 4 && (
          <>
            <ReviewRows
              rows={[
                ["Business", f.biz],
                ["Type", f.cat ? categoryStyle(f.cat).label : ""],
                ["CAC number", f.rc || "Not provided"],
                ["Owner", `${f.dir} · ${f.dphone}`],
                ["Login email", f.email],
                ["Settlement", `${f.bank} · ${f.acct}`],
                ["Account name", f.acctName ?? `${accountName(f)} · not checked`],
                ["Address", `${f.addr}, ${f.state}`],
                ["Location", loc ? `${loc.latitude}, ${loc.longitude}` : "Not captured"],
                ["Terminal", terminal?.mode === "stock" ? terminal.terminalId : "Assign later"],
              ]}
            />
            <label className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-line p-4 text-sm text-fg">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand))]" />
              I met the owner in person and checked their CAC certificate.
            </label>
          </>
        )}

        {err && <FormError>{err}</FormError>}
        <StepNav
          canBack={step > 0}
          onBack={() => setStep(step - 1)}
          onNext={() => void next()}
          nextLabel={busy ? "Creating…" : step === 4 ? "Register merchant" : "Continue"}
          busy={busy}
        />
      </Panel>
    </Page>
  );
}
