import { useState } from "react";
import {
  Check, Lock, ShieldAlert, Clock, Smartphone, CheckCircle,
  ScanFace, BadgeCheck, Loader2, XCircle, AlertTriangle,
} from "lucide-react";
import { Input } from "@milipay/shared/components/ui/Input";
import { Select } from "@milipay/shared/components/ui/Select";
import { Button } from "@milipay/shared/components/ui/Button";
import { Card } from "@milipay/shared/components/ui/Card";
import { StepProgress } from "@milipay/shared/components/ui/StepProgress";
import { NIGERIAN_STATES } from "@milipay/shared/lib/constants";
import { validateCustomerDraft, type FieldError } from "@milipay/shared/lib/utils/validation";
import { registerCustomer, verifyCustomerIdentity } from "@milipay/shared/features/customers/api";
import {
  EMPTY_CUSTOMER_DRAFT,
  type CustomerDraft,
  type CustomerRegistrationResult,
  type IdentityVerificationResult,
} from "@milipay/shared/types";
import {
  registerPalm,
  PalmCaptureError,
  type PalmEnrolment,
} from "@milipay/shared/features/biometrics/palmScanner";
import { captureFaceTemplate, FaceCaptureError } from "@milipay/shared/features/biometrics/faceScanner";

const STEPS = [
  { id: 1, label: "Personal" },
  { id: 2, label: "Identity" },
  { id: 3, label: "Palm" },
  { id: 4, label: "Face" },
  { id: 5, label: "Contact" },
  { id: 6, label: "Review" },
];

export default function RegisterCustomerPage() {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<CustomerDraft>(EMPTY_CUSTOMER_DRAFT);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationResult, setRegistrationResult] = useState<CustomerRegistrationResult | null>(null);
  const [isVerifyingNin, setIsVerifyingNin] = useState(false);

  function errorFor(field: string) {
    return errors.find((e) => e.field === field)?.message;
  }

  function update<K extends keyof CustomerDraft>(key: K, value: CustomerDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function fieldsForStep(s: number): string[] {
    switch (s) {
      case 1:
        return ["fullName", "dateOfBirth", "gender"];
      case 2:
        return ["nin", "bvn"];
      case 3:
        return ["palmVein"];
      case 4:
        return ["face"];
      case 5:
        return ["phone", "email", "address", "state"];
      default:
        return [];
    }
  }

  /**
   * Run the NIN check before leaving the identity step so the agent finds out
   * here, with the customer in front of them, rather than after submitting.
   * The server re-runs this on submit, so a pass here is not a free pass.
   */
  async function verifyNin(): Promise<boolean> {
    setIsVerifyingNin(true);
    try {
      const result = await verifyCustomerIdentity({
        idType: "nin",
        idNumber: draft.nin.trim(),
        claimedName: draft.fullName.trim(),
      });
      update("ninVerification", result);

      if (result.status === "failed") {
        setErrors([{ field: "nin", message: result.failureReason ?? "This NIN could not be verified." }]);
        return false;
      }
      // "unavailable" is not a rejection — the provider was unreachable. The
      // enrolment continues and the administrator sees the unverified state.
      return true;
    } catch (err) {
      setErrors([{ field: "nin", message: err instanceof Error ? err.message : "Identity check failed." }]);
      return false;
    } finally {
      setIsVerifyingNin(false);
    }
  }

  async function handleNext() {
    const allErrors = validateCustomerDraft(draft);
    const relevant = allErrors.filter((e) => fieldsForStep(step).includes(e.field));
    setErrors(relevant);
    if (relevant.length > 0) return;

    if (step === 2 && draft.ninVerification?.status !== "verified") {
      const ok = await verifyNin();
      if (!ok) return;
    }

    setStep((s) => Math.min(s + 1, 6));
  }

  async function handleSubmit() {
    const allErrors = validateCustomerDraft(draft);
    setErrors(allErrors);
    if (allErrors.length > 0) return;

    setIsSubmitting(true);
    try {
      const result = await registerCustomer(draft);
      setRegistrationResult(result);
    } catch (err) {
      setErrors([{ field: "form", message: err instanceof Error ? err.message : "Registration failed." }]);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleRegisterAnother() {
    setStep(1);
    setDraft(EMPTY_CUSTOMER_DRAFT);
    setErrors([]);
    setRegistrationResult(null);
  }

  // ── Success screen ──────────────────────────────────────────
  if (registrationResult) {
    const isPending = registrationResult.requiresAdminVerification;

    return (
      <div className="flex min-h-screen items-center justify-center bg-ledger p-6">
        <Card raised className="w-full max-w-lg p-8 md:p-10 text-center animate-rise-in">
          <div className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border ${
            isPending ? "border-status-warning bg-status-warning/10 text-status-warning" : "border-status-ok bg-status-ok/10 text-status-ok"
          }`}>
            {isPending ? <Clock className="h-8 w-8 stroke-[2.5]" /> : <Check className="h-8 w-8 stroke-[3]" />}
          </div>

          <h1 className="mb-2 font-display text-2xl font-bold text-ink">
            {isPending ? "Enrollment Submitted" : "Customer Enrolled & Active"}
          </h1>

          <p className="mb-1 text-sm text-ink-muted">
            <span className="font-semibold text-white">{draft.fullName}</span> ({draft.phone})
          </p>
          <p className="mb-6 text-xs text-ink-faint font-data">ID: {registrationResult.customerId}</p>

          {isPending ? (
            <div className="mb-8 rounded-xl border border-status-warning/25 bg-status-warning/5 p-5 text-left space-y-3">
              <div className="flex items-center gap-2 text-status-warning text-xs font-semibold uppercase tracking-wider">
                <Clock className="w-4 h-4" />
                Pending Admin KYC Verification
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">
                Biometric templates and NIN identity data have been uploaded to the network. An administrator will review and verify this enrollment. Once approved, a one-time password is sent to <strong className="text-white">{draft.phone}</strong> on WhatsApp, falling back to SMS.
              </p>
            </div>
          ) : (
            <div className="mb-8 rounded-xl border border-white/[0.08] bg-ledger-line/50 p-5 text-left space-y-4">
              <div className="flex items-center gap-2 text-signal-bright text-xs font-semibold uppercase tracking-wider">
                <Smartphone className="w-4 h-4" />
                Credentials sent to the customer
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">
                A one-time password has been sent to <strong className="text-white">{draft.phone}</strong>.
                The customer signs in to the MiliPay app with their phone number and that password.
              </p>
            </div>
          )}

          <div className="mb-6 rounded-xl border border-white/[0.08] bg-ledger-line/40 p-4 text-left flex gap-3">
            <Lock className="h-4 w-4 shrink-0 text-ink-faint mt-0.5" />
            <p className="text-xs leading-relaxed text-ink-muted">
              The password is never shown here. It goes to the customer&apos;s phone and
              nowhere else. If it does not arrive, an administrator can reissue it from
              the customer&apos;s profile.
            </p>
          </div>

          {registrationResult.ninVerificationMode === "simulated" && (
            <div className="mb-6 rounded-xl border border-status-warn/30 bg-status-warn/10 p-4 text-left flex gap-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-status-warn mt-0.5" />
              <p className="text-xs leading-relaxed text-ink-muted">
                <strong className="text-status-warn">NIN check was simulated.</strong> No
                government database was contacted. This enrolment is flagged and will need
                re-verification once live identity lookups are switched on.
              </p>
            </div>
          )}

          <div className="mb-8 rounded-lg border border-ledger-line bg-ledger-raised p-5 text-left">
            <p className="mb-3 text-[11px] font-display font-semibold uppercase tracking-wide text-ink-faint">
              What happens next
            </p>
            {[
              "One-time password sent by WhatsApp, or SMS if that fails",
              "Customer logs in with their phone number and that password",
              "They must change the password before anything else",
              "They set a 4-digit PIN, then enable fingerprint unlock",
              "They link a bank account — confirmed by fingerprint or PIN",
            ].map((item, i) => (
              <div key={item} className="mb-2 flex items-start gap-3 last:mb-0">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-signal/15 text-[11px] font-bold text-signal-bright">
                  {i + 1}
                </span>
                <p className="text-sm text-ink-muted">{item}</p>
              </div>
            ))}
          </div>

          <Button size="lg" className="w-full" onClick={handleRegisterAnother}>
            Register another customer
          </Button>
        </Card>
      </div>
    );
  }

  // ── Wizard ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-ledger">
      <StepProgress steps={STEPS} current={step} />

      <div className="mx-auto max-w-xl px-4 sm:px-6 py-6 sm:py-8 pb-36">
        {step === 1 && (
          <div className="animate-rise-in">
            <h2 className="mb-1.5 font-display text-xl font-bold text-ink">Personal information</h2>
            <p className="mb-7 text-sm text-ink-muted">Enter the customer's basic details.</p>

            <Input
              label="Full name"
              required
              placeholder="Adeola Okafor"
              value={draft.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              error={errorFor("fullName")}
            />
            <div className="mt-5">
              <Input
                label="Date of birth"
                type="date"
                required
                value={draft.dateOfBirth}
                onChange={(e) => update("dateOfBirth", e.target.value)}
                error={errorFor("dateOfBirth")}
              />
            </div>
            <div className="mt-5">
              <Select
                label="Gender"
                required
                placeholder="Select gender"
                options={["Male", "Female"]}
                value={draft.gender ? draft.gender.charAt(0).toUpperCase() + draft.gender.slice(1) : ""}
                onChange={(e) => update("gender", e.target.value.toLowerCase() as CustomerDraft["gender"])}
                error={errorFor("gender")}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-rise-in">
            <h2 className="mb-1.5 font-display text-xl font-bold text-ink">Identity verification</h2>
            <p className="mb-5 text-sm text-ink-muted">
              NIN is required by the CBN for financial identity verification.
            </p>

            <div className="mb-6 flex gap-3 rounded-lg border border-status-warn/30 bg-status-warn/10 px-4 py-3">
              <ShieldAlert className="h-4 w-4 shrink-0 text-status-warn" />
              <p className="text-xs leading-relaxed text-ink-muted">
                Ensure the customer is physically present. Confirm the number matches their original ID document.
              </p>
            </div>

            <Input
              label="National Identification Number (NIN)"
              required
              mono
              maxLength={11}
              placeholder="12345678901"
              value={draft.nin}
              onChange={(e) => {
                update("nin", e.target.value);
                // Editing the number invalidates the check that was run on it.
                if (draft.ninVerification) update("ninVerification", undefined);
              }}
              error={errorFor("nin")}
              hint="Checked against the identity service when you continue"
            />

            <div className="mt-5">
              <Input
                label="Bank Verification Number (BVN)"
                mono
                maxLength={11}
                placeholder="12345678901"
                value={draft.bvn}
                onChange={(e) => update("bvn", e.target.value)}
                error={errorFor("bvn")}
                hint="Optional — required later for Tier 3"
              />
            </div>

            <NinVerificationNotice result={draft.ninVerification} isChecking={isVerifyingNin} />
          </div>
        )}

        {step === 3 && (
          <div className="animate-rise-in">
            <h2 className="mb-1.5 font-display text-xl font-bold text-ink">Palm Vein Capture</h2>
            <p className="mb-5 text-sm text-ink-muted">
              Connect the HFSecurity VP930Pro scanner and capture the customer's palm vein pattern.
            </p>

            <div className="mb-8 flex gap-3 rounded-lg border border-signal/25 bg-signal/[0.06] px-4 py-3">
              <Lock className="h-4 w-4 shrink-0 text-signal-bright" />
              <p className="text-xs leading-relaxed text-ink-muted">
                Palm Vein data is encrypted before transmission. The raw infrared image is never stored —
                only the secured hash template is retained on our servers.
              </p>
            </div>

            <div className="py-6">
              <PalmVeinScanner
                template={draft.palmVeinTemplate}
                onCapture={(enrolment) => {
                  // Both are kept: the legacy string keeps
                  // customers.palm_vein_template populated through the
                  // cutover, the full record is what palm_templates stores.
                  update("palmVeinTemplate", enrolment.template);
                  update("palmEnrolment", enrolment);
                }}
                error={errorFor("palmVein")}
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="animate-rise-in">
            <h2 className="mb-1.5 font-display text-xl font-bold text-ink">Facial Capture</h2>
            <p className="mb-5 text-sm text-ink-muted">
              Capture the customer&apos;s face with the enrolment device&apos;s camera.
            </p>

            <div className="mb-8 flex gap-3 rounded-lg border border-signal/25 bg-signal/[0.06] px-4 py-3">
              <Lock className="h-4 w-4 shrink-0 text-signal-bright" />
              <p className="text-xs leading-relaxed text-ink-muted">
                Only the feature template is kept — the photograph itself is never stored.
                The SDK rejects a printed photo or a screen, so the customer must be present.
              </p>
            </div>

            <div className="py-6">
              <FaceScanner
                template={draft.faceTemplate}
                onCapture={(hash) => update("faceTemplate", hash)}
                error={errorFor("face")}
              />
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="animate-rise-in">
            <h2 className="mb-1.5 font-display text-xl font-bold text-ink">Contact details</h2>
            <p className="mb-7 text-sm text-ink-muted">
              The phone number becomes the customer's login ID and receives their password by SMS.
            </p>

            <Input
              label="Phone number"
              required
              mono
              placeholder="08012345678"
              value={draft.phone}
              onChange={(e) => update("phone", e.target.value)}
              error={errorFor("phone")}
              hint="Must be a Nigerian number"
            />
            <div className="mt-5">
              <Input
                label="Email address"
                type="email"
                placeholder="adeola@example.com"
                value={draft.email}
                onChange={(e) => update("email", e.target.value)}
                error={errorFor("email")}
                hint="Optional — for account recovery"
              />
            </div>
            <div className="mt-5">
              <Input
                label="Residential address"
                required
                placeholder="House number, street, area"
                value={draft.address}
                onChange={(e) => update("address", e.target.value)}
                error={errorFor("address")}
              />
            </div>
            <div className="mt-5">
              <Select
                label="State"
                required
                options={NIGERIAN_STATES}
                value={draft.state}
                onChange={(e) => update("state", e.target.value)}
                error={errorFor("state")}
              />
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="animate-rise-in">
            <h2 className="mb-1.5 font-display text-xl font-bold text-ink">Review &amp; submit</h2>
            <p className="mb-6 text-sm text-ink-muted">
              Confirm everything is correct. This creates the customer's account.
            </p>

            <ReviewSection title="Personal">
              <ReviewRow label="Full name" value={draft.fullName} />
              <ReviewRow label="Date of birth" value={draft.dateOfBirth} />
              <ReviewRow label="Gender" value={draft.gender ? draft.gender[0].toUpperCase() + draft.gender.slice(1) : ""} />
            </ReviewSection>

            <ReviewSection title="Identity">
              <ReviewRow label="NIN" value={draft.nin ? `••••${draft.nin.slice(-4)}` : ""} mono />
              <ReviewRow label="BVN" value={draft.bvn ? `••••${draft.bvn.slice(-4)}` : "—"} mono />
              <ReviewRow
                label="NIN check"
                value={
                  draft.ninVerification?.status === "verified"
                    ? draft.ninVerification.simulated
                      ? "Verified (simulated)"
                      : "Verified"
                    : draft.ninVerification?.status === "unavailable"
                    ? "Service unavailable"
                    : "Not checked"
                }
              />
            </ReviewSection>

            <ReviewSection title="Biometric">
              <ReviewRow
                label="Palm Vein"
                value={draft.palmVeinTemplate ? "Captured Successfully" : "Not completed"}
              />
              <ReviewRow
                label="Face"
                value={draft.faceTemplate ? "Captured Successfully" : "Not completed"}
              />
            </ReviewSection>

            <ReviewSection title="Contact">
              <ReviewRow label="Phone" value={draft.phone} mono />
              <ReviewRow label="Email" value={draft.email || "—"} />
              <ReviewRow label="Address" value={draft.address} />
              <ReviewRow label="State" value={draft.state} />
            </ReviewSection>

            {!draft.palmVeinTemplate && (
              <div className="mb-2 flex gap-3 rounded-lg border border-status-fail/30 bg-status-fail/10 px-4 py-3">
                <ShieldAlert className="h-4 w-4 shrink-0 text-status-fail" />
                <p className="text-xs text-status-fail">
                  Incomplete biometric capture. Go back to step 3 to complete Palm Vein registration.
                </p>
              </div>
            )}
            {!draft.faceTemplate && (
              <div className="mb-2 flex gap-3 rounded-lg border border-status-fail/30 bg-status-fail/10 px-4 py-3">
                <ShieldAlert className="h-4 w-4 shrink-0 text-status-fail" />
                <p className="text-xs text-status-fail">
                  Incomplete facial capture. Go back to step 4 to complete it.
                </p>
              </div>
            )}
            {errorFor("form") && (
              <div className="mb-2 rounded-lg border border-status-fail/30 bg-status-fail/10 px-4 py-3">
                <p className="text-xs text-status-fail">{errorFor("form")}</p>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between gap-3">
          {step > 1 && (
            <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
              ← Back
            </Button>
          )}
          <div className="ml-auto">
            {step < 6 ? (
              <Button onClick={handleNext} isLoading={isVerifyingNin}>
                {isVerifyingNin ? "Checking NIN…" : "Continue →"}
              </Button>
            ) : (
              <Button
                isLoading={isSubmitting}
                disabled={!draft.palmVeinTemplate || !draft.faceTemplate}
                onClick={handleSubmit}
              >
                {isSubmitting ? "Registering…" : "Submit registration →"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PalmVeinScanner({
  template,
  onCapture,
  error
}: {
  template?: string;
  onCapture: (enrolment: PalmEnrolment) => void;
  error?: string;
}) {
  const [isScanning, setIsScanning] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [wasSimulated, setWasSimulated] = useState(false);

  const startScan = async () => {
    setIsScanning(true);
    setCaptureError(null);
    try {
      // registerPalm, not extractPalmFeatures: enrolment goes through the
      // SDK's strict RegisterPalm gates, which is what makes the template good
      // enough to match against for the life of the account.
      const enrolment = await registerPalm();
      setWasSimulated(enrolment.simulated);
      onCapture(enrolment);
    } catch (err) {
      setCaptureError(
        err instanceof PalmCaptureError ? err.message : "Palm capture failed. Please try again."
      );
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-8">
      <style>{`
        @keyframes scan-vertical {
          0% { top: 10%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 90%; opacity: 0; }
        }
      `}</style>

      <div className="relative w-64 h-64 flex items-center justify-center rounded-2xl border border-signal/20 overflow-hidden bg-[#0A0D14] shadow-[inset_0_0_50px_rgba(33,219,154,0.08)]">

        {/* Futuristic Grid Background */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
             style={{
               backgroundImage: `linear-gradient(#0bc298 1px, transparent 1px), linear-gradient(90deg, #0bc298 1px, transparent 1px)`,
               backgroundSize: '16px 16px',
               backgroundPosition: 'center'
             }}
        />

        {/* Custom 90% Carbon Copy SVG (No Brackets, No Baked Line) */}
        <svg
          className={`w-56 h-56 transition-all duration-700 z-10 ${
            template ? 'text-status-ok drop-shadow-[0_0_12px_rgba(33,219,154,0.8)] scale-95' : isScanning ? 'text-signal-bright drop-shadow-[0_0_15px_rgba(33,219,154,0.9)] scale-100' : 'text-signal/40 drop-shadow-[0_0_5px_rgba(33,219,154,0.2)] scale-100'
          }`}
          viewBox="0 0 100 100"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Group that clips internal details to stay inside the hand */}
          <g clipPath="url(#hand-clip)">

            {/* Binary Code in Fingers */}
            <g fontSize="3.5" fontFamily="monospace" fill="currentColor" stroke="none" textAnchor="middle" className={isScanning ? "animate-pulse" : ""}>
              {/* Index */}
              <text x="36.5" y="36">10</text>
              <text x="36.5" y="40">01</text>
              <text x="36.5" y="44">11</text>
              <text x="36.5" y="48">00</text>

              {/* Middle */}
              <text x="45.5" y="21">11</text>
              <text x="45.5" y="25">00</text>
              <text x="45.5" y="29">10</text>
              <text x="45.5" y="33">01</text>
              <text x="45.5" y="37">11</text>
              <text x="45.5" y="41">00</text>
              <text x="45.5" y="45">10</text>
              <text x="45.5" y="49">01</text>

              {/* Ring */}
              <text x="54.5" y="26">01</text>
              <text x="54.5" y="30">10</text>
              <text x="54.5" y="34">00</text>
              <text x="54.5" y="38">11</text>
              <text x="54.5" y="42">01</text>
              <text x="54.5" y="46">10</text>
              <text x="54.5" y="50">00</text>

              {/* Pinky */}
              <text x="63.5" y="41">10</text>
              <text x="63.5" y="45">01</text>
              <text x="63.5" y="49">11</text>
            </g>

            {/* Binary Code in Upper Palm */}
            <g fontSize="4" fontFamily="monospace" fill="currentColor" stroke="none" textAnchor="middle" opacity="0.9" className={isScanning ? "animate-pulse delay-75" : ""}>
              <text x="45" y="55">01001101</text>
              <text x="48" y="60">11100010</text>
              <text x="50" y="65">001110</text>
            </g>

            {/* Thumb Swirls (Concentric arcs) */}
            <path d="M 33 69 A 6 6 0 0 1 39 75" strokeWidth="1.2" />
            <path d="M 29 65 A 11 11 0 0 1 43 77" strokeWidth="1.2" />
            <path d="M 26 60 A 16 16 0 0 1 47 79" strokeWidth="1.2" />
            <path d="M 23 55 A 21 21 0 0 1 51 81" strokeWidth="1.2" />

            {/* Pinky Base Lines */}
            <path d="M 67 62 A 20 20 0 0 0 52 82" strokeWidth="1.2" />
            <path d="M 67 67 A 15 15 0 0 0 55 83" strokeWidth="1.2" />
            <path d="M 67 72 A 10 10 0 0 0 58 84" strokeWidth="1.2" />
            <path d="M 67 77 A 5 5 0 0 0 61 85" strokeWidth="1.2" />

            {/* Wrist lines */}
            <path d="M 45 88 L 45 95" strokeWidth="1.5" />
            <path d="M 50 89 L 50 95" strokeWidth="1.5" />
            <path d="M 55 88 L 55 95" strokeWidth="1.5" />
          </g>

          {/* Master Hand Outline */}
          <path
            id="hand-outline-path"
            d="M 40 95
               C 40 80, 35 70, 16 57
               A 4 4 0 0 1 20 50
               L 33 60
               L 33 32
               A 3.5 3.5 0 0 1 40 32
               L 40 52
               L 42 52
               L 42 17
               A 3.5 3.5 0 0 1 49 17
               L 49 52
               L 51 52
               L 51 22
               A 3.5 3.5 0 0 1 58 22
               L 58 52
               L 60 52
               L 60 37
               A 3.5 3.5 0 0 1 67 37
               L 67 65
               C 67 80, 62 85, 62 95
               Z"
            strokeWidth="2"
          />

          <defs>
            <clipPath id="hand-clip">
              <use href="#hand-outline-path" />
            </clipPath>
          </defs>
        </svg>

        {/* The sweeping laser beam (only visible when scanning) */}
        {isScanning && (
          <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
            <div className="w-[85%] mx-auto h-[4px] rounded-full bg-[#1e5eb3] shadow-[0_0_12px_3px_rgba(30,94,179,0.7)]"
                 style={{
                   animation: 'scan-vertical 1.5s linear infinite alternate',
                   position: 'absolute',
                   left: '7.5%'
                 }}
            />
          </div>
        )}

        {/* Success overlay */}
        {template && !isScanning && (
          <div className="absolute inset-0 flex items-center justify-center z-30 transition-all duration-300 backdrop-blur-[2px] bg-ledger/30">
            <div className="bg-ledger/90 p-4 rounded-full shadow-2xl border border-status-ok/30">
              <CheckCircle className="w-12 h-12 text-status-ok" />
            </div>
          </div>
        )}
      </div>

      <div className="text-center space-y-4">
        <Button
          variant={template ? "secondary" : "primary"}
          onClick={startScan}
          disabled={isScanning}
          className="w-56"
        >
          {isScanning ? "Scanning Infrared..." : template ? "Recapture Palm" : "Start Hardware Scan"}
        </Button>

        <div className="min-h-[1rem] space-y-2">
          {(captureError || error) && !isScanning && (
            <p className="text-xs text-status-fail font-semibold uppercase tracking-wide">
              {captureError ?? error}
            </p>
          )}
          {isScanning && (
            <p className="text-xs text-signal-bright animate-pulse font-data uppercase tracking-widest">
              Connecting to VP930Pro...
            </p>
          )}
          {wasSimulated && !isScanning && (
            <p className="text-xs text-status-warn font-semibold uppercase tracking-wide">
              Simulated capture — no scanner attached. Not valid for a live enrollment.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Outcome of the pre-submit NIN check.
 *
 * "Verified (simulated)" is worded so nobody mistakes it for a real match —
 * a simulated pass is a placeholder until live lookups are switched on.
 */
function NinVerificationNotice({
  result,
  isChecking,
}: {
  result?: IdentityVerificationResult;
  isChecking: boolean;
}) {
  if (isChecking) {
    return (
      <div className="mt-5 flex items-center gap-3 rounded-lg border border-signal/25 bg-signal/[0.06] px-4 py-3">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-signal-bright" />
        <p className="text-xs text-ink-muted">Checking this NIN…</p>
      </div>
    );
  }

  if (!result) return null;

  if (result.status === "failed") {
    return (
      <div className="mt-5 flex gap-3 rounded-lg border border-status-fail/30 bg-status-fail/10 px-4 py-3">
        <XCircle className="h-4 w-4 shrink-0 text-status-fail" />
        <div>
          <p className="text-xs font-semibold text-status-fail">NIN could not be verified</p>
          <p className="mt-1 text-xs text-ink-muted">{result.failureReason}</p>
        </div>
      </div>
    );
  }

  if (result.status === "unavailable") {
    return (
      <div className="mt-5 flex gap-3 rounded-lg border border-status-warn/30 bg-status-warn/10 px-4 py-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-status-warn" />
        <div>
          <p className="text-xs font-semibold text-status-warn">Identity service unavailable</p>
          <p className="mt-1 text-xs text-ink-muted">
            You can continue — the enrolment will be marked unverified for the administrator
            to review. {result.failureReason}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`mt-5 flex gap-3 rounded-lg border px-4 py-3 ${
        result.simulated
          ? "border-status-warn/30 bg-status-warn/10"
          : "border-status-ok/30 bg-status-ok/10"
      }`}
    >
      <BadgeCheck
        className={`h-4 w-4 shrink-0 ${result.simulated ? "text-status-warn" : "text-status-ok"}`}
      />
      <div>
        <p
          className={`text-xs font-semibold ${
            result.simulated ? "text-status-warn" : "text-status-ok"
          }`}
        >
          {result.simulated ? "Verified — SIMULATED" : "NIN verified"}
        </p>
        {result.matchedName && (
          <p className="mt-1 text-xs text-ink-muted">Name on record: {result.matchedName}</p>
        )}
        {result.simulated && (
          <p className="mt-1 text-xs text-ink-muted">
            No government database was contacted. This enrolment is flagged for
            re-verification once live lookups are enabled.
          </p>
        )}
      </div>
    </div>
  );
}

function FaceScanner({
  template,
  onCapture,
  error,
}: {
  template?: string;
  onCapture: (hash: string) => void;
  error?: string;
}) {
  const [isScanning, setIsScanning] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [wasSimulated, setWasSimulated] = useState(false);

  const startScan = async () => {
    setIsScanning(true);
    setCaptureError(null);
    try {
      const capture = await captureFaceTemplate();
      setWasSimulated(capture.simulated);
      onCapture(capture.template);
    } catch (err) {
      setCaptureError(
        err instanceof FaceCaptureError ? err.message : "Facial capture failed. Please try again."
      );
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-8">
      <style>{`
        @keyframes face-sweep {
          0% { transform: translateY(-40%); opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { transform: translateY(40%); opacity: 0; }
        }
      `}</style>

      <div className="relative flex h-64 w-64 items-center justify-center overflow-hidden rounded-2xl border border-signal/20 bg-[#0A0D14] shadow-[inset_0_0_50px_rgba(33,219,154,0.08)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(#0bc298 1px, transparent 1px), linear-gradient(90deg, #0bc298 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
        />

        <ScanFace
          className={`z-10 h-40 w-40 transition-all duration-700 ${
            template
              ? "scale-95 text-status-ok drop-shadow-[0_0_12px_rgba(33,219,154,0.8)]"
              : isScanning
              ? "text-signal-bright drop-shadow-[0_0_15px_rgba(33,219,154,0.9)]"
              : "text-signal/40"
          }`}
          strokeWidth={1.1}
        />

        {/* Corner reticle */}
        <div className="pointer-events-none absolute inset-8 z-0">
          {["left-0 top-0 border-l-2 border-t-2", "right-0 top-0 border-r-2 border-t-2",
            "left-0 bottom-0 border-l-2 border-b-2", "right-0 bottom-0 border-r-2 border-b-2"].map((pos) => (
            <div key={pos} className={`absolute h-6 w-6 border-signal/50 ${pos}`} />
          ))}
        </div>

        {isScanning && (
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
            <div
              className="mx-auto h-[3px] w-[80%] rounded-full bg-[#1e5eb3] shadow-[0_0_12px_3px_rgba(30,94,179,0.7)]"
              style={{
                animation: "face-sweep 1.6s ease-in-out infinite alternate",
                position: "absolute",
                top: "50%",
                left: "10%",
              }}
            />
          </div>
        )}

        {template && !isScanning && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-ledger/30 backdrop-blur-[2px] transition-all duration-300">
            <div className="rounded-full border border-status-ok/30 bg-ledger/90 p-4 shadow-2xl">
              <CheckCircle className="h-12 w-12 text-status-ok" />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4 text-center">
        <Button
          variant={template ? "secondary" : "primary"}
          onClick={startScan}
          disabled={isScanning}
          className="w-56"
        >
          {isScanning ? "Capturing…" : template ? "Recapture Face" : "Start Face Capture"}
        </Button>

        <div className="min-h-[1rem] space-y-2">
          {(captureError || error) && !isScanning && (
            <p className="text-xs font-semibold uppercase tracking-wide text-status-fail">
              {captureError ?? error}
            </p>
          )}
          {isScanning && (
            <p className="animate-pulse font-data text-xs uppercase tracking-widest text-signal-bright">
              Checking liveness…
            </p>
          )}
          {wasSimulated && !isScanning && (
            <p className="text-xs font-semibold uppercase tracking-wide text-status-warn">
              Simulated capture — no camera attached. Not valid for a live enrolment.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-lg border border-ledger-line bg-ledger-raised px-5 py-4">
      <p className="mb-2 text-[11px] font-display font-bold uppercase tracking-wide text-signal-bright">
        {title}
      </p>
      {children}
    </div>
  );
}

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-ledger-line py-2.5 last:border-b-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</span>
      <span className={`text-sm text-ink ${mono ? "font-data" : ""}`}>
        {value || <span className="italic text-ink-faint">Not provided</span>}
      </span>
    </div>
  );
}