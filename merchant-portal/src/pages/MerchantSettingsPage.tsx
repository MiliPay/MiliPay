import { useEffect, useState } from "react";
import {
  Building2,
  CreditCard,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Lock,
} from "lucide-react";
import { Button } from "@milipay/shared/components/ui/Button";
import { Input } from "@milipay/shared/components/ui/Input";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { supabase } from "@milipay/shared/lib/supabase";
import { fetchCurrentMerchantProfile } from "@milipay/shared/features/merchants/merchantService";
import type { Merchant } from "@milipay/shared/types";

export default function MerchantSettingsPage() {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState(true);

  // Change password state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const profile = await fetchCurrentMerchantProfile();
      setMerchant(profile.merchant);
    } catch (err) {
      console.error("Failed to load merchant profile:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters long");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    try {
      setIsUpdatingPassword(true);
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setPasswordSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordError(err.message || "Failed to update password");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12">
        <LoadingState title="Loading Settings" description="Retrieving store account specifications..." />
      </div>
    );
  }

  if (!merchant) {
    return (
      <div className="p-10 text-center text-ink-muted">
        Store profile could not be loaded.
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8 animate-rise-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-5 h-5 text-signal-bright" />
          <span className="text-xs font-semibold uppercase tracking-wider text-signal-bright font-mono">
            Store Profile & Settlement
          </span>
        </div>
        <h1 className="font-display text-3xl font-bold text-white tracking-tight">
          Store Information & Security
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Review verified business records, Mono settlement accounts, and manage portal access credentials.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Business Store Information */}
        <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-white/[0.05]">
            <div className="w-9 h-9 rounded-xl bg-signal/10 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-signal-bright" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Registered Business Profile</h3>
              <p className="text-xs text-ink-muted">KYB Verified commercial identity</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-ink-muted block mb-0.5">Store Business Name:</span>
              <span className="font-bold text-white text-sm">{merchant.businessName}</span>
            </div>
            <div>
              <span className="text-ink-muted block mb-0.5">Industry Category:</span>
              <span className="inline-block px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-white font-medium uppercase font-mono">
                {merchant.category}
              </span>
            </div>
            <div>
              <span className="text-ink-muted block mb-0.5">Physical Store Address:</span>
              <span className="text-white font-medium">{merchant.address}, {merchant.state}</span>
            </div>
            <div>
              <span className="text-ink-muted block mb-0.5">CAC / RC Number:</span>
              <span className="text-white font-mono">{merchant.cacRcNumber || "Registered Sole Trader"}</span>
            </div>
            <div>
              <span className="text-ink-muted block mb-0.5">Onboarded Audit:</span>
              <span className="text-signal-bright font-mono">
                Registered by {merchant.onboardedByName} ({merchant.onboardedByRole || "Field Agent"})
              </span>
            </div>
          </div>
        </div>

        {/* Mono Settlement Rail */}
        <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-white/[0.05]">
            <div className="w-9 h-9 rounded-xl bg-status-ok/10 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-status-ok" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Mono DirectPay Settlement Rail</h3>
              <p className="text-xs text-ink-muted">Automated bank disbursements</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-ink-muted block mb-0.5">Settlement Bank:</span>
              <span className="font-semibold text-white flex items-center gap-1.5">
                {merchant.settlementBankName}
                <CheckCircle2 className="w-3.5 h-3.5 text-status-ok" />
              </span>
            </div>
            <div>
              <span className="text-ink-muted block mb-0.5">NUBAN Account Number:</span>
              <span className="text-signal-bright font-mono font-bold text-base">
                {merchant.settlementAccountNumber}
              </span>
            </div>
            <div>
              <span className="text-ink-muted block mb-0.5">Verified Account Name:</span>
              <span className="text-white font-medium">{merchant.settlementAccountName}</span>
            </div>
            <div className="pt-2 border-t border-white/[0.04] flex justify-between">
              <div>
                <span className="text-ink-muted block mb-0.5">Settlement Rule:</span>
                <span className="text-white font-mono capitalize">{merchant.settlementSchedule} (T+0)</span>
              </div>
              <div>
                <span className="text-ink-muted block mb-0.5">Platform Take-Rate:</span>
                <span className="text-status-info font-mono font-bold">{merchant.platformFeePercent}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Security & Password Change */}
      <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-white/[0.05]">
          <div className="w-9 h-9 rounded-xl bg-signal/10 flex items-center justify-center">
            <KeyRound className="w-4 h-4 text-signal-bright" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">Portal Access & Password</h3>
            <p className="text-xs text-ink-muted">Update your default temporary login password to a secure permanent secret</p>
          </div>
        </div>

        {passwordSuccess && (
          <div className="p-3.5 rounded-xl bg-status-ok/10 border border-status-ok/20 flex items-center gap-2 text-xs text-status-ok">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Password successfully updated. Please use your new password for subsequent logins.</span>
          </div>
        )}

        {passwordError && (
          <div className="p-3.5 rounded-xl bg-status-fail/10 border border-status-fail/20 flex items-center gap-2 text-xs text-status-fail">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{passwordError}</span>
          </div>
        )}

        <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-md">
          <Input
            label="New Password"
            type="password"
            required
            placeholder="At least 8 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />

          <Input
            label="Confirm New Password"
            type="password"
            required
            placeholder="Re-enter password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          <Button variant="primary" type="submit" disabled={isUpdatingPassword}>
            <Lock className="w-4 h-4 mr-1.5" />
            {isUpdatingPassword ? "Updating Password..." : "Update Password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
