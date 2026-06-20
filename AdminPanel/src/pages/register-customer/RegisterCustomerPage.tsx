import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FingerprintScanner } from "@/components/ui/FingerprintScanner";
import { NIGERIAN_STATES } from "@/lib/constants";
import { validateCustomerDraft, type FieldError } from "@/lib/utils/validation";
import { registerCustomer } from "@/features/customers/api";
import { EMPTY_CUSTOMER_DRAFT, type CustomerDraft } from "@/types";

type ScanState = "idle" | "scanning" | "captured";

export default function RegisterCustomerPage() {
  const [draft, setDraft] = useState<CustomerDraft>(EMPTY_CUSTOMER_DRAFT);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);

  function errorFor(field: string) {
    return errors.find((e) => e.field === field)?.message;
  }

  function update<K extends keyof CustomerDraft>(key: K, value: CustomerDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleScan() {
    setScanState("scanning");
    setTimeout(() => {
      setScanState("captured");
      update("fingerprintCaptured", true);
    }, 2200);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationErrors = validateCustomerDraft(draft);
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;

    setIsSubmitting(true);
    try {
      const result = await registerCustomer(draft);
      setSuccessId(result.customerId);
    } catch (err) {
      setErrors([{ field: "form", message: err instanceof Error ? err.message : "Registration failed." }]);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleRegisterAnother() {
    setDraft(EMPTY_CUSTOMER_DRAFT);
    setScanState("idle");
    setErrors([]);
    setSuccessId(null);
  }

  if (successId) {
    return (
      <div className="p-6 md:p-10 max-w-2xl mx-auto animate-rise-in">
        <Card raised className="p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-status-ok/10 border border-status-ok/40 flex items-center justify-center mx-auto mb-5">
            <span className="text-status-ok text-xl">✓</span>
          </div>
          <h1 className="text-xl font-display font-bold text-ink mb-2">Customer registered</h1>
          <p className="text-ink-muted text-sm mb-1">
            <span className="font-data text-ink">{successId}</span>
          </p>
          <p className="text-ink-muted text-sm mb-8">
            {draft.fullName} will receive a password by SMS within 24 hours.
          </p>
          <Button onClick={handleRegisterAnother}>Register another customer</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto animate-rise-in">
      <header className="mb-8">
        <h1 className="text-2xl font-display font-bold text-ink mb-1">Register a customer</h1>
        <p className="text-ink-muted text-sm">Capture their details and fingerprint to create an account.</p>
      </header>

      <Card raised className="p-6 md:p-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Input
              label="Full name"
              required
              placeholder="Adeola Okafor"
              value={draft.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              error={errorFor("fullName")}
            />
            <Input
              label="Phone number"
              required
              mono
              placeholder="08012345678"
              value={draft.phone}
              onChange={(e) => update("phone", e.target.value)}
              error={errorFor("phone")}
            />
            <Input
              label="BVN"
              required
              mono
              maxLength={11}
              placeholder="12345678901"
              value={draft.bvn}
              onChange={(e) => update("bvn", e.target.value)}
              error={errorFor("bvn")}
              hint="11-digit Bank Verification Number"
            />
            <Input
              label="NIN"
              mono
              maxLength={11}
              placeholder="12345678901"
              value={draft.nin}
              onChange={(e) => update("nin", e.target.value)}
              error={errorFor("nin")}
              hint="Optional — National Identification Number"
            />
            <Input
              label="Email"
              type="email"
              placeholder="adeola@example.com"
              value={draft.email}
              onChange={(e) => update("email", e.target.value)}
              error={errorFor("email")}
            />
            <Select
              label="State"
              required
              options={NIGERIAN_STATES}
              value={draft.state}
              onChange={(e) => update("state", e.target.value)}
              error={errorFor("state")}
            />
          </div>

          <Input
            label="Residential address"
            required
            placeholder="House number, street, area"
            value={draft.address}
            onChange={(e) => update("address", e.target.value)}
            error={errorFor("address")}
          />

          <div className="border-t border-ledger-line pt-6">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-4">
              Fingerprint <span className="text-status-warn">*</span>
            </p>
            <div className="flex items-center gap-5">
              <FingerprintScanner state={scanState} onScan={handleScan} size="lg" />
              <div>
                <p
                  className={`font-display font-semibold text-sm mb-1 ${
                    scanState === "captured"
                      ? "text-status-ok"
                      : scanState === "scanning"
                      ? "text-signal-bright"
                      : "text-ink"
                  }`}
                >
                  {scanState === "captured"
                    ? "Fingerprint captured"
                    : scanState === "scanning"
                    ? "Scanning…"
                    : "Tap to scan fingerprint"}
                </p>
                <p className="text-xs text-ink-faint max-w-xs">
                  Encrypted on capture. The raw image is never stored or transmitted.
                </p>
              </div>
            </div>
            {errorFor("fingerprint") && (
              <p className="text-xs text-status-fail mt-3">{errorFor("fingerprint")}</p>
            )}
          </div>

          {errorFor("form") && (
            <div className="bg-status-fail/10 border border-status-fail/30 rounded px-4 py-3">
              <p className="text-sm text-status-fail">{errorFor("form")}</p>
            </div>
          )}

          <Button type="submit" size="lg" isLoading={isSubmitting} className="w-full">
            {isSubmitting ? "Registering…" : "Register customer"}
          </Button>
        </form>
      </Card>
    </div>
  );
}