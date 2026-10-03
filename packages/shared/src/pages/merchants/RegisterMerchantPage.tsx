import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Briefcase, Fuel, Loader2, Pill as PillIcon, ShoppingBag, ShoppingCart, Store, Utensils } from "lucide-react";
import { StepProgress } from "@milipay/shared/components/ui/StepProgress";
import { HARDWARE_MODELS, MERCHANT_CATEGORIES, NIGERIAN_SETTLEMENT_BANKS, onboardMerchant, resolveSettlementAccount } from "@milipay/shared/features/merchants/merchantService";
import {
  EMPTY_MERCHANT_FORM,
  accountName,
  merchantStepError,
  onboardingBody,
  type MerchantForm,
} from "@milipay/shared/features/merchants/register";
import { categoryStyle } from "@milipay/shared/features/merchants/admin";
import { NIGERIAN_STATES } from "@milipay/shared/lib/constants";
import { ChoiceChips, DoneCard, Field, FormError, InfoBox, ReviewRows, SelectField, StepNav } from "../register/formParts";

/**
 * Register merchant (design handoff, admin "Register merchant"): business,
 * director, settlement, first terminal, review. The account name is checked
 * with the bank as soon as there's a bank and ten digits. onboard-merchant
 * creates the login, the merchant (Pending until an admin approves it) and
 * the terminal, and sends the director their login.
 */

const STEPS = [{ label: "Business" }, { label: "Director" }, { label: "Settlement" }, { label: "Terminal" }, { label: "Review" }];
const CAT_ICON: Record<string, typeof Store> = {
  supermarket: ShoppingCart,
  dining: Utensils,
  pharmacy: PillIcon,
  fuel: Fuel,
  retail: ShoppingBag,
  services: Briefcase,
  other: Store,
};
const digits = (n: number) => (v: string) => v.replace(/\D/g, "").slice(0, n);

interface Done {
  id: string;
  tid: string;
  delivered: boolean;
}

export default function RegisterMerchantPage() {
  const { pathname } = useLocation();
  const listPath = pathname.startsWith("/dashboard/") ? "/dashboard/merchants" : "/merchants";
  const [f, setF] = useState<MerchantForm>(EMPTY_MERCHANT_FORM);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [lookup, setLookup] = useState<"idle" | "checking" | "done">("idle");
  const [done, setDone] = useState<Done | null>(null);

  const set = (patch: Partial<MerchantForm>) => {
    setF((p) => ({ ...p, ...patch }));
    setErr("");
  };
  const bankCode = NIGERIAN_SETTLEMENT_BANKS.find((b) => b.name === f.bank)?.code ?? "";

  // Ask the bank whose account it is once there's a bank and ten digits.
  useEffect(() => {
    if (!bankCode || !/^\d{10}$/.test(f.acct)) {
      setLookup("idle");
      return;
    }
    let live = true;
    setLookup("checking");
    const t = setTimeout(async () => {
      const name = await resolveSettlementAccount(bankCode, f.acct);
      if (!live) return;
      setF((p) => ({ ...p, acctName: name }));
      setLookup("done");
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [bankCode, f.acct]);

  const next = async () => {
    const e = merchantStepError(step, f, lookup);
    if (e) return setErr(e);
    if (step < 4) return setStep(step + 1);
    setBusy(true);
    try {
      const r = await onboardMerchant(onboardingBody(f, bankCode));
      setDone({ id: r.merchantId, tid: r.terminalId ?? f.tid, delivered: Boolean(r.credentials?.delivered) });
      setStep(5);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not register the merchant.");
    } finally {
      setBusy(false);
    }
  };

  const again = () => {
    setF(EMPTY_MERCHANT_FORM);
    setStep(0);
    setErr("");
    setDone(null);
  };

  const unchecked = lookup === "done" && f.acctName === null;
  const acctHint =
    lookup === "checking" ? (
      <>
        <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Checking with the bank…
      </>
    ) : f.acctName ? (
      `✓ ${f.acctName}`
    ) : unchecked ? (
      "The bank didn't answer. Type the name on the account below; it'll show as not checked."
    ) : (
      "We check the account name with the bank."
    );

  return (
    <div className="flex max-w-[1080px] animate-fade-in flex-col gap-[18px] p-4 sm:p-7">
      <div>
        <h1 className="text-2xl font-bold tracking-[-.02em]">Register merchant</h1>
        <div className="mt-1 text-muted">Onboard a business, set up settlement and assign its first terminal.</div>
      </div>

      <StepProgress steps={STEPS} current={step} onPick={setStep} canRevisit={step < 5 && !busy} />

      <div className="flex flex-col gap-[18px] rounded-card border border-line bg-panel p-6 shadow-card">
        {step === 0 && (
          <>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field full label="Business name" placeholder="As registered with CAC" value={f.biz} onChange={(e) => set({ biz: e.target.value })} />
              <Field label="CAC RC number" placeholder="RC-0000000" mono value={f.rc} onChange={(e) => set({ rc: e.target.value })} />
              <Field label="Business address" placeholder="Street, area" value={f.addr} onChange={(e) => set({ addr: e.target.value })} />
            </div>
            <ChoiceChips
              label="Category"
              value={f.cat}
              onChange={(cat) => set({ cat })}
              options={MERCHANT_CATEGORIES.map((c) => {
                const Icon = CAT_ICON[c.value] ?? Store;
                return { value: c.value, label: categoryStyle(c.value).label, icon: <Icon size={14} aria-hidden="true" /> };
              })}
            />
            <SelectField label="State" value={f.state} onChange={(state) => set({ state })} placeholder="Select a state" options={NIGERIAN_STATES} />
          </>
        )}

        {step === 1 && (
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Director full name" placeholder="As on BVN" value={f.dir} onChange={(e) => set({ dir: e.target.value })} />
            <Field
              label="Director phone"
              placeholder="0803 000 0000"
              mono
              inputMode="tel"
              value={f.dphone}
              onChange={(e) => set({ dphone: digits(11)(e.target.value) })}
            />
            <Field label="Director BVN" placeholder="11 digits" mono inputMode="numeric" value={f.dbvn} onChange={(e) => set({ dbvn: digits(11)(e.target.value) })} />
            <Field
              label="Login email"
              placeholder="owner@business.ng"
              type="email"
              value={f.email}
              onChange={(e) => set({ email: e.target.value })}
              hint="Their merchant-portal login. It can't already have a MiliPay login."
            />
          </div>
        )}

        {step === 2 && (
          <>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field
                label="Settlement account number"
                placeholder="10 digits"
                mono
                inputMode="numeric"
                value={f.acct}
                onChange={(e) => set({ acct: digits(10)(e.target.value), acctName: null, acctNameTyped: "" })}
                hint={acctHint}
                hintTone={f.acctName ? "ok" : "muted"}
              />
              <Field
                label="Platform fee"
                placeholder="1.2"
                prefix="%"
                inputMode="decimal"
                value={f.fee}
                onChange={(e) => set({ fee: e.target.value.replace(/[^0-9.]/g, "").slice(0, 4) })}
              />
              {unchecked && (
                <Field full label="Account name" placeholder="As the bank shows it" value={f.acctNameTyped} onChange={(e) => set({ acctNameTyped: e.target.value })} />
              )}
            </div>
            <SelectField
              label="Bank"
              value={f.bank}
              onChange={(bank) => set({ bank, acctName: null, acctNameTyped: "" })}
              placeholder="Select a bank"
              options={NIGERIAN_SETTLEMENT_BANKS.map((b) => b.name)}
            />
            <ChoiceChips
              label="Settlement"
              value={f.schedule}
              onChange={(schedule) => set({ schedule })}
              options={[
                { value: "instant", label: "Instant (T+0)" },
                { value: "daily_eod", label: "Daily at end of day" },
              ]}
            />
          </>
        )}

        {step === 3 && (
          <>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Terminal ID" placeholder="TRM-0000" mono value={f.tid} onChange={(e) => set({ tid: e.target.value.toUpperCase().slice(0, 40) })} />
              <Field label="Device serial number" placeholder="Printed under the device" mono value={f.serial} onChange={(e) => set({ serial: e.target.value })} />
            </div>
            <ChoiceChips
              label="Device model"
              value={f.model}
              onChange={(model) => set({ model })}
              options={HARDWARE_MODELS.map((h) => ({ value: h.value, label: h.value.replace("HFSecurity ", "") }))}
            />
          </>
        )}

        {step === 4 && (
          <>
            <ReviewRows
              rows={[
                ["Business", f.biz],
                ["Category", f.cat ? categoryStyle(f.cat).label : ""],
                ["CAC number", f.rc || "Not provided"],
                ["Address", `${f.addr}, ${f.state}`],
                ["Director", f.dir],
                ["Director phone", f.dphone],
                ["Login email", f.email],
                ["Settlement", `${f.bank} · ${f.acct}`],
                ["Account name", f.acctName ?? `${accountName(f)} · not checked`],
                ["Schedule", f.schedule === "instant" ? "Instant (T+0)" : "Daily at end of day"],
                ["Platform fee", `${f.fee}%`],
                ["Terminal", `${f.tid} · ${f.model.replace("HFSecurity ", "")}`],
              ]}
            />
            <InfoBox>
              We send the director their merchant-portal login by WhatsApp or SMS. The merchant stays Pending, and its terminal can't take payments, until an
              admin approves it.
            </InfoBox>
          </>
        )}

        {step === 5 && done && (
          <DoneCard
            title={`${f.biz || "Merchant"} is set up`}
            actions={
              <>
                <Link to={listPath} className="flex h-10 items-center rounded-[10px] border border-line px-4 font-semibold">
                  All merchants
                </Link>
                <button type="button" onClick={again} className="flex h-10 items-center rounded-[10px] bg-brand px-4 font-bold text-brand-ink">
                  Register another
                </button>
              </>
            }
          >
            Terminal <span className="font-mono text-fg">{done.tid}</span> is assigned.{" "}
            {done.delivered
              ? "Login details were sent to the director."
              : "The login details couldn't be sent to the director's phone, so check the number with them."}
          </DoneCard>
        )}

        {err && <FormError>{err}</FormError>}
        {step < 5 && <StepNav canBack={step > 0} onBack={() => setStep(step - 1)} onNext={() => void next()} nextLabel={busy ? "Creating…" : step === 4 ? "Create merchant" : "Continue"} busy={busy} />}
      </div>
    </div>
  );
}
