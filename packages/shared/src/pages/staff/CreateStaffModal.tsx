import React, { useState } from "react";
import { Modal } from "@milipay/shared/components/ui/Modal";
import { Input } from "@milipay/shared/components/ui/Input";
import { Select } from "@milipay/shared/components/ui/Select";
import { Button } from "@milipay/shared/components/ui/Button";
import { createStaffMember } from "@milipay/shared/features/staff/api";
import { NIGERIAN_STATES } from "@milipay/shared/lib/constants";
import type { Role, CreatedStaffResult } from "@milipay/shared/types";
import { Check, Copy, KeyRound, ExternalLink, ShieldAlert } from "lucide-react";

interface CreateStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}


export function CreateStaffModal({ isOpen, onClose, onSuccess }: CreateStaffModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Retained so copyToClipboard can keep signalling; the password itself is no
  // longer rendered, so the flag has no reader.
  const [, setCopiedPassword] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [createdResult, setCreatedResult] = useState<CreatedStaffResult | null>(null);

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    nin: "",
    role: "agent" as Role,
    state: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleReset = () => {
    setFormData({
      fullName: "",
      email: "",
      phone: "",
      nin: "",
      role: "agent",
      state: "",
    });
    setCreatedResult(null);
    setError(null);
    setCopiedPassword(false);
    setCopiedAll(false);
  };

  const handleModalClose = () => {
    if (createdResult) {
      onSuccess();
    }
    handleReset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    // Validate NIN
    const cleanNin = formData.nin.replace(/\D/g, "");
    if (cleanNin.length !== 11) {
      setError("National Identification Number (NIN) must be exactly 11 digits.");
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await createStaffMember({
        fullName: formData.fullName.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        nin: cleanNin,
        role: formData.role,
        state: formData.role === "agent" ? formData.state : undefined,
      });

      setCreatedResult(result);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to create staff member");
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = async (text: string, isFullMemo = false) => {
    try {
      await navigator.clipboard.writeText(text);
      if (isFullMemo) {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2500);
      } else {
        setCopiedPassword(true);
        setTimeout(() => setCopiedPassword(false), 2500);
      }
    } catch (err) {
      console.error("Clipboard copy failed", err);
    }
  };

  const getFullOnboardingMemo = () => {
    if (!createdResult) return "";
    return `MiliPay Staff Onboarding Credentials
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name: ${createdResult.profile.fullName}
Role: ${createdResult.profile.role.toUpperCase()} ${createdResult.profile.state ? `(${createdResult.profile.state} State)` : ""}
Email: ${createdResult.profile.email}
Phone: ${createdResult.profile.phone}
NIN: •••••••${createdResult.profile.ninLast4}

Portal Access:
URL: ${createdResult.portalUrl} (${createdResult.portalName})

IMPORTANT:
A one-time password has been sent to your phone. Log in to your portal with your
email address and that password. You will be asked to change it immediately.
━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={handleModalClose} 
      title={createdResult ? "Staff Credentials Handover" : "Register New Staff Member"}
    >
      {createdResult ? (
        // ── Credential Handover View ──────────────────────────────
        <div className="space-y-6 animate-rise-in">
          <div className="flex items-center gap-3 p-4 bg-status-ok/10 border border-status-ok/30 rounded-xl">
            <div className="w-10 h-10 rounded-full bg-status-ok/20 flex items-center justify-center text-status-ok shrink-0">
              <Check className="w-5 h-5 stroke-[3]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Staff Member Successfully Enrolled</p>
              <p className="text-xs text-ink-muted">
                Account created with <span className="font-semibold text-signal-bright capitalize">{createdResult.profile.role}</span> permissions.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-ledger-line/50 p-4 space-y-3">
            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.05]">
              <span className="text-xs text-ink-muted uppercase font-semibold">Staff Name</span>
              <span className="text-sm font-medium text-white">{createdResult.profile.fullName}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.05]">
              <span className="text-xs text-ink-muted uppercase font-semibold">Email (Login ID)</span>
              <span className="text-sm font-data text-signal-bright">{createdResult.profile.email}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.05]">
              <span className="text-xs text-ink-muted uppercase font-semibold">Phone</span>
              <span className="text-sm font-data text-white">{createdResult.profile.phone}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.05]">
              <span className="text-xs text-ink-muted uppercase font-semibold">NIN (Verified)</span>
              <span className="text-sm font-data text-white">••••••••{createdResult.profile.ninLast4}</span>
            </div>
            {createdResult.profile.state && (
              <div className="flex justify-between items-center py-1.5 border-b border-white/[0.05]">
                <span className="text-xs text-ink-muted uppercase font-semibold">Assigned State</span>
                <span className="text-sm font-medium text-white">{createdResult.profile.state}</span>
              </div>
            )}
            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.05]">
              <span className="text-xs text-ink-muted uppercase font-semibold">Designated Portal</span>
              <a 
                href={createdResult.portalUrl} 
                target="_blank" 
                rel="noreferrer"
                className="text-xs font-semibold text-signal-bright hover:underline flex items-center gap-1"
              >
                {createdResult.portalName} ({createdResult.portalUrl})
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Credential delivery */}
            <div className="pt-2">
              <span className="block text-xs text-ink-muted uppercase font-semibold mb-1.5">
                One-time password
              </span>
              <div className={`p-3 rounded-lg border text-xs ${
                createdResult.delivered
                  ? "bg-status-ok/10 border-status-ok/25 text-status-ok"
                  : "bg-status-fail/10 border-status-fail/25 text-status-fail"
              }`}>
                {createdResult.message}
              </div>
            </div>
          </div>

          <div className="p-3.5 bg-status-info/10 border border-status-info/25 rounded-lg flex items-start gap-2.5 text-xs text-ink-muted">
            <KeyRound className="w-4 h-4 text-status-info shrink-0 mt-0.5" />
            <p>
              The password is never shown here — it goes to the staff member&apos;s phone
              and nowhere else. They will be asked to change it on first login to the{" "}
              {createdResult.portalName}.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => copyToClipboard(getFullOnboardingMemo(), true)}
            >
              {copiedAll ? <Check className="w-4 h-4 mr-2 text-status-ok" /> : <Copy className="w-4 h-4 mr-2" />}
              {copiedAll ? "Onboarding Memo Copied!" : "Copy Full Credentials"}
            </Button>
            <Button
              type="button"
              variant="primary"
              className="flex-1"
              onClick={handleModalClose}
            >
              Done &amp; Close
            </Button>
          </div>
        </div>
      ) : (
        // ── Registration Form View ────────────────────────────────
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-status-fail/10 border border-status-fail/30 rounded-lg text-sm text-status-fail flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <Input 
              label="Full Legal Name" 
              name="fullName"
              placeholder="e.g. Adewale Okafor"
              value={formData.fullName}
              onChange={handleChange}
              required 
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input 
                label="Email Address" 
                name="email"
                type="email"
                placeholder="name@milipay.ng"
                value={formData.email}
                onChange={handleChange}
                required 
              />
              <Input 
                label="Phone Number" 
                name="phone"
                placeholder="08012345678"
                mono
                value={formData.phone}
                onChange={handleChange}
                required 
              />
            </div>

            {/* NIN Input Field */}
            <div>
              <Input 
                label="National Identification Number (NIN)" 
                name="nin"
                mono
                maxLength={11}
                placeholder="12345678901"
                value={formData.nin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  setFormData(prev => ({ ...prev, nin: val }));
                }}
                required 
                hint="11 digits required for identity and security vetting"
              />
            </div>

            {/* Role Selection */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wide">
                Staff Role <span className="text-status-warn">*</span>
              </label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="w-full bg-ledger-line border border-white/[0.08] rounded px-4 py-3 text-ink focus:outline-none focus:border-signal/50 focus:ring-1 focus:ring-signal/50 transition-colors appearance-none"
                required
              >
                <option value="agent">Field Agent (Biometric Enrollment)</option>
                <option value="support">Service &amp; Support Staff (Disputes &amp; Help Desk)</option>
                <option value="admin">Administrator (Console Access)</option>
              </select>
            </div>

            {/* Assigned State (for Agents) */}
            {formData.role === "agent" && (
              <Select
                label="Assigned State"
                name="state"
                placeholder="Select assigned territory"
                options={NIGERIAN_STATES}
                value={formData.state}
                onChange={handleChange}
                required
              />
            )}

            {/* Credential notice */}
            <div className="p-3.5 bg-signal/5 border border-signal/20 rounded-xl flex items-start gap-2.5">
              <KeyRound className="w-4 h-4 text-signal-bright shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed text-ink-muted">
                A one-time password is generated on the server and sent to the phone
                number above on WhatsApp, falling back to SMS. It is not shown to you,
                and the staff member must change it on first login.
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-white/[0.05]">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Enroll Staff Member
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
