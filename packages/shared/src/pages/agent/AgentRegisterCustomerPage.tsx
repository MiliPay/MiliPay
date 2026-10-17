import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2, ShieldCheck, ShieldAlert, User } from "lucide-react";
import clsx from "clsx";
import { StepProgress } from "@milipay/shared/components/ui/StepProgress";
import { AGENT_ROUTES } from "@milipay/shared/components/layout/AgentLayout";
import { registerCustomer, verifyCustomerIdentity } from "@milipay/shared/features/customers/api";
import { QUALITY_MIN, formatNin, resendPhoneCheck, sendPhoneCheck, verifyPhoneCheck } from "@milipay/shared/features/agent/api";
import { NIGERIAN_STATES } from "@milipay/shared/lib/constants";
import { formatNaira } from "@milipay/shared/lib/utils/format";
import { EMPTY_CUSTOMER_DRAFT, type CustomerDraft } from "@milipay/shared/types";
import { ChoiceChips, Field, FormError, ReviewRows, SelectField, StepNav } from "../register/formParts";
import { CaptureTile, Page, PageHeader, Panel, type Captured } from "./parts";

/**
 * Register customer, agent portal (handoff screen 4), in six steps:
 * phone + SMS code, NIN + date of birth checked with NIMC, contact, face,
 * palm, review and consent. enrol-customer checks the phone check, re-runs
 * the NIN check and sets the customer Pending review.
 */

const STEPS = [
  { label: "Phone" },
  { label: "NIN" },
  { label: "Contact" },
  { label: "Face" },
  { label: "Palm" },
  { label: "Review" },
];
const digits = (n: number) => (v: string) => v.replace(/\D/g, "").slice(0, n);
const PHONE_RE = /^0[789][01]\d{8}$/;

export default function AgentRegisterCustomerPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<CustomerDraft>(EMPTY_CUSTOMER_DRAFT);
  const [checkId, setCheckId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [phoneOk, setPhoneOk] = useState(false);
  const [face, setFace] = useState<Captured | null>(null);
  const [palm, setPalm] = useState<Captured | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  const set = (patch: Partial<CustomerDraft>) => {
    setD((p) => ({ ...p, ...patch }));
    setErr("");
  };
  const v = d.ninVerification;
  const ninOk = v?.status === "verified" || v?.status === "unavailable";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const checkNin = () =>
    run(async () => {
      if (!d.fullName.trim().includes(" ")) throw new Error("Enter the full name as it appears on the NIN slip.");
      if (!/^\d{11}$/.test(d.nin)) throw new Error("The NIN is 11 digits.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dateOfBirth)) throw new Error("Enter the date of birth.");
      const r = await verifyCustomerIdentity({ idType: "nin", idNumber: d.nin, claimedName: d.fullName.trim() });
      set({ ninVerification: r });
      if (r.status === "failed") throw new Error(r.failureReason ?? "NIMC couldn't match this NIN.");
    });

  const stepError = (): string => {
    if (step === 0 && !phoneOk) return "Check the phone with the code first.";
    if (step === 1) {
      if (!d.gender) return "Choose a gender.";
      if (!ninOk) return "Check the NIN with NIMC first.";
    }
    if (step === 2) {
      if (d.email && !/^\S+@\S+\.\S+$/.test(d.email.trim())) return "That email doesn't look right. Leave it empty if they have none.";
      if (!d.state) return "Choose a state.";
      if (!d.lga?.trim()) return "Enter the LGA.";
      if (d.address.trim().length < 3) return "Enter the home address.";
    }
    if (step === 3 && (!face || face.quality < QUALITY_MIN)) return `Take a face photo with quality ${QUALITY_MIN} or more.`;
    if (step === 4 && (!palm || palm.quality < QUALITY_MIN)) return `Scan the palm with quality ${QUALITY_MIN} or more.`;
    if (step === 5 && !consent) return "Confirm the customer agreed.";
    return "";
  };

  const next = () => {
    const e = stepError();
    if (e) return setErr(e);
    if (step < 5) return setStep(step + 1);
    run(async () => {
      await registerCustomer({
        ...d,
        phoneCheckId: checkId ?? undefined,
        faceTemplate: face!.template,
        palmVeinTemplate: palm!.template,
        palmEnrolment: palm!.enrolment,
      });
      setSent(true);
    });
  };

  const again = () => {
    setD(EMPTY_CUSTOMER_DRAFT);
    setCheckId(null);
    setCode("");
    setPhoneOk(false);
    setFace(null);
    setPalm(null);
    setConsent(false);
    setSent(false);
    setStep(0);
  };

  if (sent) {
    return (
      <Page>
        <Panel className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-3 py-10 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand-text">
            <Check size={32} />
          </span>
          <h1 className="text-[22px] font-bold text-fg">Sent for review</h1>
          <p className="text-sm text-muted">
            {d.fullName.trim().split(/\s+/)[0]} is waiting for an admin to check their NIN and biometrics. You earn {formatNaira(200)} when they're approved,
            and they'll get an SMS telling them how to sign in.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => navigate(AGENT_ROUTES.registrations)} className="h-11 rounded-[12px] border border-line px-4 text-sm font-semibold text-fg">
              My registrations
            </button>
            <button type="button" onClick={again} className="h-11 rounded-[12px] bg-brand px-4 text-sm font-bold text-brand-ink">
              Register another
            </button>
          </div>
        </Panel>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title="Register customer" sub="In person, with their phone and NIN slip. They're Pending review until an admin approves them." />
      <StepProgress steps={STEPS} current={step} onPick={(s) => s < step && setStep(s)} canRevisit={!busy} />
      <Panel className="flex max-w-[760px] flex-col gap-[18px]">
        {step === 0 && (
          <>
            <Field
              label="Customer's phone number"
              placeholder="0803 000 0000"
              mono
              inputMode="tel"
              value={d.phone}
              ok={phoneOk}
              disabled={phoneOk}
              onChange={(e) => {
                set({ phone: digits(11)(e.target.value) });
                setCheckId(null);
                setPhoneOk(false);
              }}
              hint="We text them a code. They read it to you, so we know the phone is theirs."
            />
            {!checkId ? (
              <button
                type="button"
                disabled={!PHONE_RE.test(d.phone) || busy}
                onClick={() =>
                  run(async () => {
                    setCheckId((await sendPhoneCheck(d.phone)).checkId);
                    setCode("");
                  })
                }
                className="h-12 rounded-[12px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-45"
              >
                {busy ? "Sending…" : "Send code"}
              </button>
            ) : phoneOk ? (
              <div className="flex items-center gap-2 rounded-[12px] bg-brand-soft px-4 py-3 text-sm text-brand-text">
                <ShieldCheck size={18} /> Phone checked.
              </div>
            ) : (
              <>
                <input
                  value={code}
                  onChange={(e) => setCode(digits(6)(e.target.value))}
                  inputMode="numeric"
                  autoFocus
                  placeholder="000000"
                  aria-label="Code from the customer"
                  className="h-14 rounded-[12px] border border-line bg-field px-4 text-center font-mono text-[24px] tracking-[.4em] text-fg outline-none focus:border-brand"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(async () => void (await resendPhoneCheck(checkId)))}
                    className="h-12 rounded-[12px] border border-line px-4 text-sm font-semibold text-fg disabled:opacity-45"
                  >
                    Send a new code
                  </button>
                  <button
                    type="button"
                    disabled={code.length !== 6 || busy}
                    onClick={() =>
                      run(async () => {
                        await verifyPhoneCheck(checkId, code);
                        setPhoneOk(true);
                      })
                    }
                    className="h-12 flex-1 rounded-[12px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-45"
                  >
                    {busy ? "Checking…" : "Check code"}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field full label="Full name" placeholder="As on the NIN slip" value={d.fullName} onChange={(e) => set({ fullName: e.target.value, ninVerification: undefined })} />
              <Field
                label="NIN"
                placeholder="0000 000 0000"
                mono
                inputMode="numeric"
                value={formatNin(d.nin)}
                ok={v?.status === "verified"}
                onChange={(e) => set({ nin: digits(11)(e.target.value), ninVerification: undefined })}
              />
              <Field label="Date of birth" type="date" value={d.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value, ninVerification: undefined })} />
            </div>
            <ChoiceChips
              label="Gender"
              value={d.gender}
              onChange={(gender) => set({ gender })}
              options={[
                { value: "female" as const, label: "Female" },
                { value: "male" as const, label: "Male" },
              ]}
            />
            {!v || v.status === "failed" ? (
              <button type="button" disabled={busy} onClick={checkNin} className="h-12 rounded-[12px] bg-brand text-[15px] font-bold text-brand-ink disabled:opacity-45">
                {busy ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" /> Checking with NIMC…
                  </span>
                ) : (
                  "Check with NIMC"
                )}
              </button>
            ) : (
              <div className={clsx("flex gap-4 rounded-[16px] border p-4", v.status === "verified" ? "border-brand/40 bg-brand-soft" : "border-warn/40 bg-warn-soft")}>
                <div className="flex h-[88px] w-[72px] flex-none items-center justify-center rounded-[10px] bg-chip text-faint" aria-label="NIMC photo">
                  <User size={32} />
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-semibold text-fg">{(v.matchedName ?? d.fullName).toUpperCase()}</div>
                  <div className={clsx("mt-1 flex items-center gap-1.5 text-[13px]", v.status === "verified" ? "text-brand-text" : "text-warn")}>
                    {v.status === "verified" ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
                    {v.status === "verified"
                      ? `Verified with NIMC${v.simulated ? " (simulated)" : ""}`
                      : "NIMC didn't answer. You can go on; the reviewer will see it unverified."}
                  </div>
                  <div className="mt-2 text-[13px] text-muted">Check the photo matches the person in front of you.</div>
                </div>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field full label="Email (optional)" placeholder="name@example.com" type="email" value={d.email} onChange={(e) => set({ email: e.target.value })} />
              <Field label="LGA" placeholder="e.g. Ibadan North" value={d.lga ?? ""} onChange={(e) => set({ lga: e.target.value })} />
              <Field full label="Home address" placeholder="House number, street, area" value={d.address} onChange={(e) => set({ address: e.target.value })} />
            </div>
            <SelectField label="State" value={d.state} onChange={(state) => set({ state })} placeholder="Select a state" options={NIGERIAN_STATES} />
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-sm text-muted">Face the camera in good light. Remove glasses and caps.</p>
            <CaptureTile kind="face" value={face} onChange={setFace} />
          </>
        )}

        {step === 4 && (
          <>
            <p className="text-sm text-muted">Ask the customer to hold their right palm flat, 5 cm above the scanner, until it beeps.</p>
            <CaptureTile kind="palm" value={palm} onChange={setPalm} />
          </>
        )}

        {step === 5 && (
          <>
            <ReviewRows
              rows={[
                ["Phone", `${d.phone} · checked`],
                ["Name", d.fullName],
                ["NIN", `${formatNin(d.nin).replace(/^\d{4} \d{3}/, "•••• •••")} · ${v?.status === "verified" ? "verified" : "not verified"}`],
                ["Date of birth", d.dateOfBirth],
                ["Email", d.email || "—"],
                ["Address", `${d.address}, ${d.lga}, ${d.state}`],
                ["Face", face ? `Quality ${face.quality}/100` : "—"],
                ["Palm", palm ? `Quality ${palm.quality}/100` : "—"],
              ]}
            />
            <label className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-line p-4 text-sm text-fg">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand))]" />
              The customer agreed to MiliPay keeping their NIN, face and palm to verify payments, and I checked their NIN slip in person.
            </label>
          </>
        )}

        {err && <FormError>{err}</FormError>}
        <StepNav
          canBack={step > 0}
          onBack={() => setStep(step - 1)}
          onNext={next}
          nextLabel={busy && step === 5 ? "Submitting…" : step === 5 ? "Submit for review" : "Continue"}
          busy={busy}
        />
      </Panel>
    </Page>
  );
}
