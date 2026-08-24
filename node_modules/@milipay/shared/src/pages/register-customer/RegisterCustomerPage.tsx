import { useState } from "react";
import { Check, Lock, ShieldAlert, Copy, Clock, Smartphone } from "lucide-react";
import { Input } from "@milipay/shared/components/ui/Input";
import { Select } from "@milipay/shared/components/ui/Select";
import { Button } from "@milipay/shared/components/ui/Button";
import { Card } from "@milipay/shared/components/ui/Card";
import { MultiFingerSelector, type FingerName } from "@milipay/shared/components/ui/MultiFingerSelector";
import { StepProgress } from "@milipay/shared/components/ui/StepProgress";
import { NIGERIAN_STATES } from "@milipay/shared/lib/constants";
import { validateCustomerDraft, type FieldError } from "@milipay/shared/lib/utils/validation";
import { registerCustomer } from "@milipay/shared/features/customers/api";
import { EMPTY_CUSTOMER_DRAFT, type CustomerDraft, type CustomerRegistrationResult } from "@milipay/shared/types";

const STEPS = [
  { id: 1, label: "Personal" },
  { id: 2, label: "Identity" },
  { id: 3, label: "Biometric" },
  { id: 4, label: "Contact" },
  { id: 5, label: "Review" },
];

export default function RegisterCustomerPage() {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<CustomerDraft>(EMPTY_CUSTOMER_DRAFT);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationResult, setRegistrationResult] = useState<CustomerRegistrationResult | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  function errorFor(field: string) {
    return errors.find((e) => e.field === field)?.message;
  }

  function update<K extends keyof CustomerDraft>(key: K, value: CustomerDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function fieldsForStep(s: number): (keyof CustomerDraft)[] {
    switch (s) {
      case 1:
        return ["fullName", "dateOfBirth", "gender"];
      case 2:
        return ["nin"];
      case 3:
        return ["capturedFingers"];
      case 4:
        return ["phone", "email", "address", "state"];
      default:
        return [];
    }
  }

  function handleNext() {
    const allErrors = validateCustomerDraft(draft);
    const relevant = allErrors.filter((e) => fieldsForStep(step).includes(e.field as keyof CustomerDraft));
    setErrors(relevant);
    if (relevant.length > 0) return;
    setStep((s) => Math.min(s + 1, 5));
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
    setCopiedPassword(false);
  }

  const copyPassword = async (pass: string) => {
    try {
      await navigator.clipboard.writeText(pass);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2500);
    } catch (_) {}
  };

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
                Biometric templates and NIN identity data have been uploaded to the network. An administrator will review and verify this enrollment. Once approved, the login password will be dispatched to <strong className="text-white">{draft.phone}</strong> via SMS.
              </p>
            </div>
          ) : (
            <div className="mb-8 rounded-xl border border-white/[0.08] bg-ledger-line/50 p-5 text-left space-y-4">
              <div className="flex items-center gap-2 text-signal-bright text-xs font-semibold uppercase tracking-wider">
                <Smartphone className="w-4 h-4" />
                SMS Credentials Dispatched
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">
                The customer account is active and can log into the MiliPay Mobile App with their phone number. An SMS notification has been sent.
              </p>

              {registrationResult.tempPassword && (
                <div className="p-3 bg-ledger rounded-lg border border-signal/30 flex items-center justify-between gap-3">
                  <div>
                    <span className="block text-[10px] text-ink-faint uppercase font-semibold">Generated Temporary Password</span>
                    <code className="font-mono text-sm font-bold text-signal-bright">{registrationResult.tempPassword}</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyPassword(registrationResult.tempPassword!)}
                    className="flex items-center gap-1 text-xs font-semibold text-ink hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded transition-colors"
                  >
                    {copiedPassword ? <Check className="w-3.5 h-3.5 text-status-ok" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedPassword ? "Copied" : "Copy"}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mb-8 rounded-lg border border-ledger-line bg-ledger-raised p-5 text-left">
            <p className="mb-3 text-[11px] font-display font-semibold uppercase tracking-wide text-ink-faint">
              What happens next
            </p>
            {[
              "Password sent via SMS within 24 hours",
              "Customer logs in with phone number + password",
              "Customer creates their 4–5 digit transaction PIN",
              "Account linked to up to 5 bank accounts via Mono",
              "Customer can transact at any registered POS terminal",
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

      <div className="mx-auto max-w-xl px-6 py-8 pb-36">
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
              onChange={(e) => update("nin", e.target.value)}
              error={errorFor("nin")}
              hint="Found on NIN slip or National ID card"
            />
          </div>
        )}

        {step === 3 && (
          <div className="animate-rise-in">
            <h2 className="mb-1.5 font-display text-xl font-bold text-ink">Biometric capture</h2>
            <p className="mb-5 text-sm text-ink-muted">
              Select 4 fingers (at least 2 from the left hand) and capture them securely.
            </p>

            <div className="mb-8 flex gap-3 rounded-lg border border-signal/25 bg-signal/[0.06] px-4 py-3">
              <Lock className="h-4 w-4 shrink-0 text-signal-bright" />
              <p className="text-xs leading-relaxed text-ink-muted">
                Fingerprint data is encrypted before transmission. The raw biometric is never stored —
                only the encrypted template is retained on our servers.
              </p>
            </div>

            <div className="py-6">
              <MultiFingerSelector 
                selectedFingers={draft.capturedFingers as FingerName[]}
                onChange={(fingers) => update("capturedFingers", fingers)}
                onScanComplete={() => {}}
                error={errorFor("fingerprint")}
              />
            </div>
          </div>
        )}

        {step === 4 && (
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

        {step === 5 && (
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
            </ReviewSection>

            <ReviewSection title="Biometric">
              <ReviewRow
                label="Fingers"
                value={draft.capturedFingers.length === 4 ? draft.capturedFingers.join(", ") : "Not completed"}
              />
            </ReviewSection>

            <ReviewSection title="Contact">
              <ReviewRow label="Phone" value={draft.phone} mono />
              <ReviewRow label="Email" value={draft.email || "—"} />
              <ReviewRow label="Address" value={draft.address} />
              <ReviewRow label="State" value={draft.state} />
            </ReviewSection>

            {draft.capturedFingers.length !== 4 && (
              <div className="mb-2 flex gap-3 rounded-lg border border-status-fail/30 bg-status-fail/10 px-4 py-3">
                <ShieldAlert className="h-4 w-4 shrink-0 text-status-fail" />
                <p className="text-xs text-status-fail">
                  Incomplete fingerprint capture. Go back to step 3 to complete biometric registration.
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
            {step < 5 ? (
              <Button onClick={handleNext}>Continue →</Button>
            ) : (
              <Button
                isLoading={isSubmitting}
                disabled={draft.capturedFingers.length !== 4}
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