import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Hand, Loader2, RotateCcw, Scan, ScanFace, Shield, ShieldAlert, ShieldCheck, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { StepProgress } from "@milipay/shared/components/ui/StepProgress";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { registerCustomer, verifyCustomerIdentity } from "@milipay/shared/features/customers/api";
import { customerPath } from "@milipay/shared/pages/customers/CustomersPage";
import { registerPalm, PalmCaptureError } from "@milipay/shared/features/biometrics/palmScanner";
import { captureFaceTemplate, FaceCaptureError } from "@milipay/shared/features/biometrics/faceScanner";
import { NIGERIAN_STATES } from "@milipay/shared/lib/constants";
import { validateCustomerDraft } from "@milipay/shared/lib/utils/validation";
import { EMPTY_CUSTOMER_DRAFT, type CustomerDraft, type CustomerRegistrationResult } from "@milipay/shared/types";
import { ChoiceChips, DoneCard, Field, FormError, InfoBox, ReviewRows, SelectField, StepNav } from "../register/formParts";
import { PhoneCheckBox } from "@milipay/shared/components/ui/PhoneCheckBox";

/**
 * Register customer (design handoff, admin "Register customer"): identity
 * with a NIMC check, contact, palm and face from the enrolment device,
 * review. Shared by the admin and agent portals. enrol-customer re-runs the
 * NIN check on submit, so a pass here is not a free pass. The phone must be
 * checked with a code the customer reads back (since 2026-10-20).
 */

const STEPS = [
  { label: "Identity", sub: "Name, DOB, NIN" },
  { label: "Contact", sub: "Phone and address" },
  { label: "Biometrics", sub: "Palm and face" },
  { label: "Review", sub: "Check and submit" },
];
const digits = (n: number) => (v: string) => v.replace(/\D/g, "").slice(0, n);
const STEP_FIELDS = [
  ["fullName", "dateOfBirth", "gender", "nin", "bvn"],
  ["phone", "email", "address", "state"],
  ["palmVein", "face"],
];

type Bio = { quality: number | null; simulated: boolean; scanning: boolean; error: string | null };
const NO_BIO: Bio = { quality: null, simulated: false, scanning: false, error: null };

export default function RegisterCustomerPage() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<CustomerDraft>(EMPTY_CUSTOMER_DRAFT);
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [palm, setPalm] = useState<Bio>(NO_BIO);
  const [face, setFace] = useState<Bio>(NO_BIO);
  const [result, setResult] = useState<CustomerRegistrationResult | null>(null);

  const set = (patch: Partial<CustomerDraft>) => {
    setD((p) => ({ ...p, ...patch }));
    setErr("");
  };
  const v = d.ninVerification;
  const ninReady = /^\d{11}$/.test(d.nin);

  const verifyNin = async () => {
    if (!d.fullName.trim()) return setErr("Enter the full name as it appears on the NIN slip first.");
    setChecking(true);
    try {
      const r = await verifyCustomerIdentity({ idType: "nin", idNumber: d.nin, claimedName: d.fullName.trim() });
      set({ ninVerification: r });
      if (r.status === "failed") setErr(r.failureReason ?? "This NIN could not be verified.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The NIN check didn't go through. Try again.");
    } finally {
      setChecking(false);
    }
  };

  const stepError = (s: number): string => {
    if (s === 0) {
      if (!d.fullName.trim().includes(" ")) return "Enter the full name as it appears on the NIN slip.";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dateOfBirth)) return "Enter date of birth as YYYY-MM-DD.";
      if (!d.gender) return "Choose a gender.";
    }
    const first = validateCustomerDraft(d).find((e) => STEP_FIELDS[s]?.includes(e.field));
    if (first) return first.field === "palmVein" ? "Capture the palm scan." : first.field === "face" ? "Capture the face photo." : first.message;
    // "unavailable" is the provider being down, not a rejection: the
    // enrolment goes on and the reviewer sees it unverified.
    if (s === 0 && v?.status !== "verified" && v?.status !== "unavailable") return "Verify the NIN before continuing.";
    if (s === 1 && !d.phoneCheckId) return "Check the customer's phone with a code before continuing.";
    return "";
  };

  const next = async () => {
    const e = stepError(step);
    if (e) return setErr(e);
    if (step < 3) return setStep(step + 1);
    setBusy(true);
    try {
      setResult(await registerCustomer(d));
      setStep(4);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  };

  const capture = async (kind: "palm" | "face") => {
    const setBio = kind === "palm" ? setPalm : setFace;
    setBio({ ...NO_BIO, scanning: true });
    setErr("");
    try {
      if (kind === "palm") {
        const enrolment = await registerPalm();
        // Both kept: the legacy string fills customers.palm_vein_template,
        // the full record is what palm_templates stores.
        set({ palmVeinTemplate: enrolment.template, palmEnrolment: enrolment });
        setBio({ quality: enrolment.qualityScore, simulated: enrolment.simulated, scanning: false, error: null });
      } else {
        const c = await captureFaceTemplate();
        set({ faceTemplate: c.template });
        setBio({ quality: c.score, simulated: c.simulated, scanning: false, error: null });
      }
    } catch (x) {
      const known = x instanceof PalmCaptureError || x instanceof FaceCaptureError;
      setBio({ ...NO_BIO, error: known ? (x as Error).message : `${kind === "palm" ? "Palm" : "Face"} capture failed. Try again.` });
    }
  };

  const again = () => {
    setD(EMPTY_CUSTOMER_DRAFT);
    setPalm(NO_BIO);
    setFace(NO_BIO);
    setResult(null);
    setErr("");
    setStep(0);
  };

  const ninText = checking
    ? "Checking with NIMC…"
    : v?.status === "verified"
      ? `NIMC match: ${(v.matchedName ?? d.fullName).toUpperCase()}.${v.simulated ? " (Simulated until live lookup is on.)" : ""}`
      : v?.status === "unavailable"
        ? "NIMC didn't answer. You can go on; the registration is marked unverified for the reviewer."
        : v?.status === "failed"
          ? v.failureReason ?? "This NIN could not be verified."
          : ninReady
            ? "Ready to check this NIN against NIMC."
            : "Enter the 11-digit NIN to check it against NIMC.";
  const ninTone = v?.status === "verified" && !v.simulated ? "ok" : v?.status === "failed" ? "fail" : v?.status === "unavailable" || v?.simulated ? "warn" : "muted";
  const NinIcon: LucideIcon = checking ? Loader2 : v?.status === "verified" ? ShieldCheck : v?.status === "failed" || v?.status === "unavailable" ? ShieldAlert : Shield;
  const qual = (b: Bio) => (b.quality === null ? "" : `${Math.round(b.quality * 100)}/100${b.simulated ? " · simulated" : ""}`);

  return (
    <div className="flex max-w-[1080px] animate-fade-in flex-col gap-[18px] p-4 sm:p-7">
      <div>
        <h1 className="text-2xl font-bold tracking-[-.02em]">Register customer</h1>
        <div className="mt-1 text-muted">Enrol a customer in person. New registrations go to Pending review until an admin approves them.</div>
      </div>

      <StepProgress steps={STEPS} current={step} onPick={setStep} canRevisit={step < 4 && !busy} />

      <div className="flex flex-col gap-[18px] rounded-card border border-line bg-panel p-6 shadow-card">
        {step === 0 && (
          <>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field full label="Full name" placeholder="As on the NIN slip" value={d.fullName} onChange={(e) => set({ fullName: e.target.value, ninVerification: undefined })} />
              <Field label="Date of birth" placeholder="YYYY-MM-DD" mono value={d.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value.replace(/[^\d-]/g, "").slice(0, 10) })} />
              <Field
                label="NIN"
                placeholder="11 digits"
                mono
                inputMode="numeric"
                value={d.nin}
                ok={v?.status === "verified"}
                onChange={(e) => set({ nin: digits(11)(e.target.value), ninVerification: undefined })}
              />
              <Field label="BVN (optional)" placeholder="Needed for Tier 3 later" mono inputMode="numeric" value={d.bvn} onChange={(e) => set({ bvn: digits(11)(e.target.value) })} />
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
            <div
              className={clsx(
                "flex flex-wrap items-center gap-3 rounded-xl px-4 py-3.5",
                ninTone === "ok" ? "bg-brand-soft text-brand-text" : ninTone === "fail" ? "bg-fail-soft text-fail" : ninTone === "warn" ? "bg-warn-soft text-warn" : "bg-chip text-muted",
              )}
            >
              <NinIcon size={18} className={clsx(checking && "animate-spin")} aria-hidden="true" />
              <div className="min-w-[200px] flex-1 text-[13px] leading-[1.45]">{ninText}</div>
              {ninReady && !checking && (!v || v.status === "failed" || v.status === "unavailable") && (
                <button type="button" onClick={() => void verifyNin()} className="h-[34px] rounded-[9px] bg-brand px-3 text-[13px] font-bold text-brand-ink">
                  {v ? "Check again" : "Verify with NIMC"}
                </button>
              )}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field
                label="Phone number"
                placeholder="0803 000 0000"
                mono
                inputMode="tel"
                value={d.phone}
                onChange={(e) => set({ phone: digits(11)(e.target.value), phoneCheckId: undefined })}
                hint="Their sign-in codes go here."
              />
              <Field label="Email (optional)" placeholder="name@example.com" type="email" value={d.email} onChange={(e) => set({ email: e.target.value })} />
              <Field full label="Residential address" placeholder="Street, area, LGA" value={d.address} onChange={(e) => set({ address: e.target.value })} />
            </div>
            <SelectField label="State" value={d.state} onChange={(state) => set({ state })} placeholder="Select a state" options={NIGERIAN_STATES} />
            <PhoneCheckBox phone={d.phone} confirmedId={d.phoneCheckId ?? null} onConfirmed={(id) => set({ phoneCheckId: id ?? undefined })} />
          </>
        )}

        {step === 2 && (
          <div className="grid gap-4 md:grid-cols-2">
            <BioCard
              label="Palm vein"
              icon={Hand}
              help="Ask the customer to hold their right palm flat, 5 cm above the scanner, until it beeps."
              bio={palm}
              done={Boolean(d.palmVeinTemplate)}
              quality={qual(palm)}
              onCapture={() => void capture("palm")}
            />
            <BioCard
              label="Face"
              icon={ScanFace}
              help="Face the camera in good light. Remove glasses and caps."
              bio={face}
              done={Boolean(d.faceTemplate)}
              quality={qual(face)}
              onCapture={() => void capture("face")}
            />
          </div>
        )}

        {step === 3 && (
          <>
            <ReviewRows
              rows={[
                ["Full name", d.fullName],
                ["Date of birth", d.dateOfBirth],
                ["Gender", d.gender ? d.gender[0].toUpperCase() + d.gender.slice(1) : ""],
                [
                  "NIN",
                  `•••••••${d.nin.slice(-4)} · ${v?.status === "verified" ? (v.simulated ? "verified (simulated)" : "verified") : "not verified"}`,
                ],
                ["BVN", d.bvn ? `•••••••${d.bvn.slice(-4)}` : "Not provided"],
                ["Phone", d.phone],
                ["Email", d.email || "—"],
                ["Address", d.address],
                ["State", d.state],
                ["Palm", d.palmVeinTemplate ? `Captured · ${qual(palm) || "ok"}` : "—"],
                ["Face", d.faceTemplate ? `Captured · ${qual(face) || "ok"}` : "—"],
                ["Registered by", user?.fullName || "You"],
              ]}
            />
            <InfoBox>
              The customer signs in to the app with their phone number and an SMS code. Their account stays in Pending review until an admin checks the NIN match and
              biometrics.
            </InfoBox>
          </>
        )}

        {step === 4 && result && (
          <DoneCard
            title={`${d.fullName.trim().split(/\s+/)[0]} is registered`}
            actions={
              <>
                <Link to={customerPath(pathname, result.customerId)} className="flex h-10 items-center rounded-[10px] border border-line px-4 font-semibold">
                  Open customer
                </Link>
                <button type="button" onClick={again} className="flex h-10 items-center rounded-[10px] bg-brand px-4 font-bold text-brand-ink">
                  Register another
                </button>
              </>
            }
          >
            Customer ID <span className="font-mono text-fg">{result.customerId.slice(0, 8).toUpperCase()}</span>.{" "}
            {result.requiresAdminVerification
              ? "They're in Pending review. Once an admin approves them, they're told by SMS and sign in with their phone number."
              : "They're active and have been told by SMS. They sign in with their phone number and an SMS code."}
            {result.ninVerificationMode === "simulated" && " The NIN check was simulated, so it's flagged for a re-check once live lookups are on."}
          </DoneCard>
        )}

        {err && <FormError>{err}</FormError>}
        {step < 4 && (
          <StepNav
            canBack={step > 0}
            onBack={() => setStep(step - 1)}
            onNext={() => void next()}
            nextLabel={busy ? "Submitting…" : step === 3 ? "Submit registration" : "Continue"}
            busy={busy || checking}
          />
        )}
      </div>
    </div>
  );
}

function BioCard({
  label,
  icon: Icon,
  help,
  bio,
  done,
  quality,
  onCapture,
}: {
  label: string;
  icon: LucideIcon;
  help: string;
  bio: Bio;
  done: boolean;
  quality: string;
  onCapture: () => void;
}) {
  const status = bio.scanning ? "Scanning…" : done ? "Captured" : "Not captured";
  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-line p-[18px]">
      <div className="flex items-center gap-2.5">
        <div className="flex-1 font-bold">{label}</div>
        <div className={clsx("text-xs font-semibold", done ? "text-brand-text" : bio.scanning ? "text-warn" : "text-muted")}>{status}</div>
      </div>
      <div className="relative flex h-[190px] items-center justify-center overflow-hidden rounded-[14px] bg-[linear-gradient(160deg,#0a7a5a,#022c22)] text-[#33E0B5]">
        <Icon size={72} strokeWidth={1.2} aria-hidden="true" />
        {bio.scanning && <div className="absolute left-[10%] right-[10%] h-0.5 animate-scan-sweep bg-[#33E0B5] shadow-[0_0_12px_#33E0B5]" />}
        {done && !bio.scanning && quality && (
          <div className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/35 px-[9px] py-1 text-xs font-semibold text-[#fff]">✓ Quality {quality}</div>
        )}
      </div>
      <div className="text-[13px] leading-[1.45] text-muted">{help}</div>
      {bio.error && <div className="text-[13px] text-fail">{bio.error}</div>}
      {bio.simulated && <div className="text-[13px] text-warn">Simulated capture: no device attached. Not valid for a live enrolment.</div>}
      <button
        type="button"
        onClick={onCapture}
        disabled={bio.scanning}
        className={clsx(
          "flex h-10 items-center justify-center gap-2 rounded-[10px] border font-bold disabled:opacity-60",
          done ? "border-line text-fg" : "border-brand bg-brand text-brand-ink",
        )}
      >
        {done ? <RotateCcw size={16} aria-hidden="true" /> : <Scan size={16} aria-hidden="true" />}
        {done ? "Recapture" : bio.scanning ? "Scanning…" : "Start capture"}
      </button>
    </div>
  );
}
