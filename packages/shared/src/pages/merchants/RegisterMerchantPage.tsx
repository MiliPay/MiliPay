import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  UserCheck,
  CreditCard,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Store,
  ShieldCheck,
  Cpu,
  AlertCircle,
  Copy,
  Check,
  KeyRound,
  ExternalLink,
} from "lucide-react";
import { Button } from "@milipay/shared/components/ui/Button";
import { Input } from "@milipay/shared/components/ui/Input";
import { StepProgress } from "@milipay/shared/components/ui/StepProgress";
import { NIGERIAN_STATES, ROUTES } from "@milipay/shared/lib/constants";
import {
  MERCHANT_CATEGORIES,
  NIGERIAN_SETTLEMENT_BANKS,
  HARDWARE_MODELS,
  onboardMerchant,
  type OnboardMerchantResult,
} from "@milipay/shared/features/merchants/merchantService";
import type { MerchantCategory, MerchantDraft, SettlementSchedule } from "@milipay/shared/types";

const STEPS = [
  { id: 1, label: "Business Profile" },
  { id: 2, label: "Store Director" },
  { id: 3, label: "Settlement Account" },
  { id: 4, label: "POS Hardware" },
];

export default function RegisterMerchantPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);
  const [registeredResult, setRegisteredResult] = useState<OnboardMerchantResult | null>(null);

  const [draft, setDraft] = useState<MerchantDraft>({
    businessName: "",
    category: "supermarket",
    address: "",
    state: "Lagos",
    cacRcNumber: "",
    directorName: "",
    directorPhone: "",
    directorBvn: "",
    email: "",
    settlementBankName: "Guaranty Trust Bank (GTBank)",
    settlementBankCode: "058",
    settlementAccountNumber: "",
    settlementAccountName: "",
    platformFeePercent: 1.50,
    settlementSchedule: "instant",
    terminalId: `TID-HP605-${Math.floor(1000 + Math.random() * 9000)}`,
    deviceSerialNumber: `SN-HP605-${Date.now().toString().slice(-6)}`,
    deviceModel: "HFSecurity HP605PV",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateField = <K extends keyof MerchantDraft>(field: K, value: MerchantDraft[K]) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleBankChange = (bankName: string) => {
    const bank = NIGERIAN_SETTLEMENT_BANKS.find((b) => b.name === bankName);
    if (bank) {
      setDraft((prev) => ({
        ...prev,
        settlementBankName: bank.name,
        settlementBankCode: bank.code,
      }));
    }
  };

  const validateStep = (step: number): boolean => {
    const errs: Record<string, string> = {};

    if (step === 1) {
      if (!draft.businessName.trim()) errs.businessName = "Business name is required";
      if (!draft.address.trim()) errs.address = "Store address is required";
      if (!draft.state) errs.state = "State is required";
    }

    if (step === 2) {
      if (!draft.directorName.trim()) errs.directorName = "Director or manager name is required";
      if (!draft.directorPhone.trim()) {
        errs.directorPhone = "Phone number is required";
      } else if (!/^(0|\+?234)[789][01]\d{8}$/.test(draft.directorPhone.replace(/\s+/g, ""))) {
        errs.directorPhone = "Enter a valid Nigerian phone number";
      }
      if (!draft.email?.trim()) {
        errs.email = "Merchant portal email is required for login credentials";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
        errs.email = "Enter a valid email address";
      }
    }

    if (step === 3) {
      if (!draft.settlementBankName) errs.settlementBankName = "Select a settlement bank";
      if (!draft.settlementAccountNumber.trim()) {
        errs.settlementAccountNumber = "Account number is required";
      } else if (!/^\d{10}$/.test(draft.settlementAccountNumber.trim())) {
        errs.settlementAccountNumber = "NUBAN account number must be 10 digits";
      }
    }

    if (step === 4) {
      if (!draft.terminalId?.trim()) errs.terminalId = "Terminal ID is required";
      if (!draft.deviceSerialNumber?.trim()) errs.deviceSerialNumber = "Device serial number is required";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 4));
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(4)) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await onboardMerchant(draft);
      setRegisteredResult(result);
    } catch (err: any) {
      console.error("Merchant onboarding error:", err);
      setSubmitError(err.message || "Failed to onboard merchant. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (registeredResult) {
    // No local fabrication of credentials. If the Edge Function did not create
    // a login there is nothing to show, and the password never reaches here in
    // any case — it goes to the director's phone.
    const creds = registeredResult.credentials ?? null;

    const handleCopyCredentials = () => {
      if (!creds) return;
      const text = `MiliPay Merchant Portal\nStore: ${draft.businessName}\nPortal URL: ${creds.portalUrl}\nLogin Email: ${creds.email}\n\nA one-time password was sent to the director's phone. It must be changed on first sign-in.`;
      navigator.clipboard.writeText(text);
      setCopiedCreds(true);
      setTimeout(() => setCopiedCreds(false), 3000);
    };

    return (
      <div className="p-6 md:p-10 max-w-2xl mx-auto animate-rise-in">
        <div className="bg-ledger-raised border border-white/[0.08] rounded-2xl p-8 text-center shadow-2xl space-y-6">
          <div className="w-16 h-16 bg-status-ok/10 border border-status-ok/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-status-ok" />
          </div>

          <div>
            <h2 className="font-display text-2xl font-bold text-ink mb-1">
              Merchant Successfully Onboarded!
            </h2>
            <p className="text-sm text-ink-muted max-w-md mx-auto">
              <span className="text-white font-semibold">{draft.businessName}</span> has been
              provisioned on the MiliPay open banking rails.
            </p>
          </div>

          {/* Dedicated Merchant Portal Credentials Card */}
          {creds && (
            <div className="bg-signal/5 border border-signal/20 rounded-xl p-5 text-left space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-signal/15">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-signal-bright" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Merchant Dashboard Login Credentials
                  </span>
                </div>
                <Button
                  variant="secondary"
                  onClick={handleCopyCredentials}
                  className="text-xs py-1 px-2.5 h-auto border-signal/30 text-signal hover:bg-signal/10"
                >
                  {copiedCreds ? (
                    <>
                      <Check className="w-3 h-3 mr-1 text-status-ok" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 mr-1" /> Copy Credentials
                    </>
                  )}
                </Button>
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-ink-muted">Portal URL:</span>
                  <a
                    href={creds.portalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-signal-bright hover:underline flex items-center gap-1 font-semibold"
                  >
                    {creds.portalUrl}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-ink-muted">Username / Email:</span>
                  <span className="text-white font-bold">{creds.email}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-ink-muted">One-time password:</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded border ${
                      creds.delivered
                        ? "text-status-ok bg-status-ok/10 border-status-ok/20"
                        : "text-status-fail bg-status-fail/10 border-status-fail/20"
                    }`}
                  >
                    {creds.delivered
                      ? `Sent by ${creds.deliveryChannel ?? "message"}`
                      : "Delivery failed"}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-ink-muted pt-1">
                The password is not shown here — it goes to the director&apos;s phone and
                nowhere else. Give the store manager the portal URL and login email; they
                can then access sales reports, live palm transactions and their paired POS
                terminal.
              </p>
            </div>
          )}

          {/* Provisioning Summary Card */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 text-left space-y-3 font-mono text-xs">
            <div className="flex justify-between border-b border-white/[0.04] pb-2">
              <span className="text-ink-muted">Settlement Bank:</span>
              <span className="text-ink">{draft.settlementBankName}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.04] pb-2">
              <span className="text-ink-muted">NUBAN Account:</span>
              <span className="text-ink">{draft.settlementAccountNumber}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.04] pb-2">
              <span className="text-ink-muted">Paired POS Terminal:</span>
              <span className="text-signal-bright font-bold">
                {registeredResult.terminalId || draft.terminalId}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Platform Fee:</span>
              <span className="text-status-info">{draft.platformFeePercent}% per palm debit</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setRegisteredResult(null);
                setCurrentStep(1);
                setDraft((prev) => ({
                  ...prev,
                  businessName: "",
                  address: "",
                  directorName: "",
                  directorPhone: "",
                  email: "",
                  settlementAccountNumber: "",
                  terminalId: `TID-HP605-${Math.floor(1000 + Math.random() * 9000)}`,
                  deviceSerialNumber: `SN-HP605-${Date.now().toString().slice(-6)}`,
                }));
              }}
            >
              Onboard Another Merchant
            </Button>
            <Button
              variant="primary"
              onClick={() => navigate(ROUTES.merchants || "/dashboard/merchants")}
            >
              View Merchants Directory
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto animate-rise-in">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Store className="w-5 h-5 text-signal-bright" />
            <span className="text-xs font-semibold uppercase tracking-wider text-signal-bright">
              Merchant Acquisition
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold text-ink">Register Business Merchant</h1>
          <p className="text-sm text-ink-muted mt-1">
            Onboard a retail business, verify their settlement account with Mono, and pair POS hardware.
          </p>
        </div>
      </div>

      {/* Stepper Progress */}
      <div className="mb-10 bg-ledger-raised border border-white/[0.05] p-5 rounded-xl">
        <StepProgress current={currentStep} steps={STEPS} />
      </div>


      {submitError && (
        <div className="mb-6 p-4 rounded-xl border border-status-fail/30 bg-status-fail/[0.08] flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-status-fail shrink-0" />
          <p className="text-sm text-status-fail font-medium">{submitError}</p>
        </div>
      )}

      {/* Form Steps Card */}
      <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl p-6 md:p-8 shadow-xl">
        {/* Step 1: Business Profile */}
        {currentStep === 1 && (
          <div className="space-y-6 animate-rise-in">
            <div className="flex items-center gap-3 pb-4 border-b border-white/[0.05]">
              <div className="w-10 h-10 rounded-xl bg-signal/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-signal-bright" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink">Store & Business Details</h2>
                <p className="text-xs text-ink-muted">Basic identity and category of the commercial establishment</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <Input
                  label="Registered Business / Store Name"
                  required
                  placeholder="e.g. Ebeano Supermarket Lekki"
                  value={draft.businessName}
                  onChange={(e) => updateField("businessName", e.target.value)}
                  error={errors.businessName}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">
                  Business Category <span className="text-status-warn">*</span>
                </label>
                <select
                  value={draft.category}
                  onChange={(e) => updateField("category", e.target.value as MerchantCategory)}
                  className="w-full rounded bg-white/[0.03] border border-ledger-line2 px-4 py-3 text-[15px] text-ink outline-none focus:border-signal/60"
                >
                  {MERCHANT_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value} className="bg-ledger text-ink">
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">
                  State of Operation <span className="text-status-warn">*</span>
                </label>
                <select
                  value={draft.state}
                  onChange={(e) => updateField("state", e.target.value)}
                  className="w-full rounded bg-white/[0.03] border border-ledger-line2 px-4 py-3 text-[15px] text-ink outline-none focus:border-signal/60"
                >
                  {NIGERIAN_STATES.map((state) => (
                    <option key={state} value={state} className="bg-ledger text-ink">
                      {state}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <Input
                  label="Physical Store Address"
                  required
                  placeholder="e.g. Plot 14, Admiralty Way, Lekki Phase 1"
                  value={draft.address}
                  onChange={(e) => updateField("address", e.target.value)}
                  error={errors.address}
                />
              </div>

              <div>
                <Input
                  label="CAC / RC Registration Number"
                  placeholder="e.g. RC-1928472 (Optional for sole trader)"
                  mono
                  value={draft.cacRcNumber}
                  onChange={(e) => updateField("cacRcNumber", e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Store Director */}
        {currentStep === 2 && (
          <div className="space-y-6 animate-rise-in">
            <div className="flex items-center gap-3 pb-4 border-b border-white/[0.05]">
              <div className="w-10 h-10 rounded-xl bg-status-info/10 flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-status-info" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink">Store Manager / Director Identity</h2>
                <p className="text-xs text-ink-muted">Authorized contact for settlement notifications and KYB compliance</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <Input
                  label="Director / Store Manager Full Name"
                  required
                  placeholder="e.g. Olawale Babatunde Adeleke"
                  value={draft.directorName}
                  onChange={(e) => updateField("directorName", e.target.value)}
                  error={errors.directorName}
                />
              </div>

              <div className="md:col-span-2">
                <Input
                  label="Merchant Portal Login Email"
                  required
                  type="email"
                  placeholder="e.g. manager@supermarket.ng"
                  value={draft.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  error={errors.email}
                  hint="Used to generate login credentials for the merchant dashboard portal"
                />
              </div>

              <div>
                <Input
                  label="Contact Phone Number"
                  required
                  mono
                  placeholder="08031234567"
                  value={draft.directorPhone}
                  onChange={(e) => updateField("directorPhone", e.target.value)}
                  error={errors.directorPhone}
                  hint="Used for settlement SMS alerts"
                />
              </div>

              <div>
                <Input
                  label="Director BVN (Bank Verification Number)"
                  mono
                  placeholder="22212345678"
                  value={draft.directorBvn}
                  onChange={(e) => updateField("directorBvn", e.target.value)}
                  hint="Encrypted for commercial banking validation"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Settlement Bank Account */}
        {currentStep === 3 && (
          <div className="space-y-6 animate-rise-in">
            <div className="flex items-center gap-3 pb-4 border-b border-white/[0.05]">
              <div className="w-10 h-10 rounded-xl bg-status-ok/10 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-status-ok" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink">Settlement Bank Account (Mono Rail)</h2>
                <p className="text-xs text-ink-muted">Commercial bank where customer palm payments are settled</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">
                  Settlement Bank <span className="text-status-warn">*</span>
                </label>
                <select
                  value={draft.settlementBankName}
                  onChange={(e) => handleBankChange(e.target.value)}
                  className="w-full rounded bg-white/[0.03] border border-ledger-line2 px-4 py-3 text-[15px] text-ink outline-none focus:border-signal/60"
                >
                  {NIGERIAN_SETTLEMENT_BANKS.map((b) => (
                    <option key={b.code} value={b.name} className="bg-ledger text-ink">
                      {b.name} (Code: {b.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Input
                  label="10-Digit NUBAN Account Number"
                  required
                  mono
                  placeholder="0123456789"
                  maxLength={10}
                  value={draft.settlementAccountNumber}
                  onChange={(e) => updateField("settlementAccountNumber", e.target.value)}
                  error={errors.settlementAccountNumber}
                />
              </div>

              <div>
                <Input
                  label="Account Holder Name"
                  placeholder="e.g. Ebeano Enterprises Ltd"
                  value={draft.settlementAccountName}
                  onChange={(e) => updateField("settlementAccountName", e.target.value)}
                  hint="Verified via Mono Account Lookup API"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">
                  Platform Fee Take-Rate (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={draft.platformFeePercent}
                    onChange={(e) => updateField("platformFeePercent", parseFloat(e.target.value) || 0)}
                    className="w-full rounded bg-white/[0.03] border border-ledger-line2 px-4 py-3 text-[15px] text-ink font-mono outline-none focus:border-signal/60"
                  />
                  <span className="absolute right-4 top-3.5 text-xs text-ink-muted font-mono">%</span>
                </div>
                <p className="text-xs text-ink-faint mt-1">Default 1.50% MiliPay revenue fee</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">
                  Settlement Schedule
                </label>
                <select
                  value={draft.settlementSchedule}
                  onChange={(e) => updateField("settlementSchedule", e.target.value as SettlementSchedule)}
                  className="w-full rounded bg-white/[0.03] border border-ledger-line2 px-4 py-3 text-[15px] text-ink outline-none focus:border-signal/60"
                >
                  <option value="instant" className="bg-ledger text-ink">
                    Instant (T+0 per transaction debit)
                  </option>
                  <option value="daily_eod" className="bg-ledger text-ink">
                    Daily Batch (End of Day T+1 NIP Transfer)
                  </option>
                </select>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-status-ok/20 bg-status-ok/[0.04] flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-status-ok shrink-0" />
              <p className="text-xs text-ink-muted leading-relaxed">
                Settlements are powered by <span className="text-white font-semibold">Mono DirectPay</span>.
                Funds debit directly from the customer’s open banking account and split into the merchant’s
                account with zero card-scheme chargeback exposure.
              </p>
            </div>
          </div>
        )}

        {/* Step 4: POS Hardware Setup */}
        {currentStep === 4 && (
          <div className="space-y-6 animate-rise-in">
            <div className="flex items-center gap-3 pb-4 border-b border-white/[0.05]">
              <div className="w-10 h-10 rounded-xl bg-signal/10 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-signal-bright" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink">POS Hardware Binding</h2>
                <p className="text-xs text-ink-muted">Pair a physical palm vein scanner to this merchant store</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">
                  POS Hardware Model <span className="text-status-warn">*</span>
                </label>
                <select
                  value={draft.deviceModel}
                  onChange={(e) => updateField("deviceModel", e.target.value)}
                  className="w-full rounded bg-white/[0.03] border border-ledger-line2 px-4 py-3 text-[15px] text-ink outline-none focus:border-signal/60"
                >
                  {HARDWARE_MODELS.map((m) => (
                    <option key={m.value} value={m.value} className="bg-ledger text-ink">
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Input
                  label="Terminal ID (TID)"
                  required
                  mono
                  placeholder="e.g. TID-HP605-0012"
                  value={draft.terminalId}
                  onChange={(e) => updateField("terminalId", e.target.value)}
                  error={errors.terminalId}
                />
              </div>

              <div>
                <Input
                  label="Device Serial Number (SN)"
                  required
                  mono
                  placeholder="e.g. SN-893049102"
                  value={draft.deviceSerialNumber}
                  onChange={(e) => updateField("deviceSerialNumber", e.target.value)}
                  error={errors.deviceSerialNumber}
                  hint="Located on the back barcode of the terminal"
                />
              </div>
            </div>

            {/* Summary Review Card */}
            <div className="mt-4 p-5 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-signal-bright mb-3">
                Review & Verification Summary
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-ink-muted">Business:</span>{" "}
                  <span className="text-white font-medium">{draft.businessName || "—"}</span>
                </div>
                <div>
                  <span className="text-ink-muted">Category:</span>{" "}
                  <span className="text-white font-medium uppercase">{draft.category}</span>
                </div>
                <div>
                  <span className="text-ink-muted">Settlement:</span>{" "}
                  <span className="text-white font-medium">{draft.settlementBankName}</span>
                </div>
                <div>
                  <span className="text-ink-muted">Account:</span>{" "}
                  <span className="text-white font-mono">{draft.settlementAccountNumber || "—"}</span>
                </div>
                <div>
                  <span className="text-ink-muted">Terminal:</span>{" "}
                  <span className="text-signal-bright font-mono">{draft.terminalId}</span>
                </div>
                <div>
                  <span className="text-ink-muted">Take Rate:</span>{" "}
                  <span className="text-status-info font-mono">{draft.platformFeePercent}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="mt-8 pt-6 border-t border-white/[0.05] flex items-center justify-between">
          {currentStep > 1 ? (
            <Button variant="secondary" onClick={handleBack} disabled={isSubmitting}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>
          ) : (
            <div />
          )}

          {currentStep < 4 ? (
            <Button variant="primary" onClick={handleNext}>
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Onboarding via Mono..." : "Complete Merchant Registration"}
              <CheckCircle2 className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
