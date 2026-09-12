import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { supabase } from "@milipay/shared/lib/supabase";
import { Card } from "@milipay/shared/components/ui/Card";
import { Input } from "@milipay/shared/components/ui/Input";
import { Button } from "@milipay/shared/components/ui/Button";
import { Check, ShieldCheck, AlertCircle, KeyRound, LogOut } from "lucide-react";
import { LogoutModal } from "@milipay/shared/components/layout/LogoutModal";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess("Your password has been updated successfully.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err.message || "Failed to update password. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-2xl mx-auto space-y-6 sm:space-y-8 animate-rise-in">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-display font-bold text-ink">Account &amp; Security Settings</h1>
        <p className="text-ink-muted text-xs sm:text-sm mt-1">Manage your staff profile, credentials, and security preferences.</p>
      </div>

      <div className="space-y-6">
        <Card raised className="p-4 sm:p-6">
          <h2 className="text-lg font-display font-semibold text-ink mb-4 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-signal-bright" />
            Profile Information
          </h2>
          <div className="space-y-4">
            <Input 
              label="Full Name" 
              value={user?.fullName || ""} 
              readOnly 
              disabled 
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input 
                label="Email (Login ID)" 
                value={user?.email || ""} 
                readOnly 
                disabled 
                mono 
              />
              <Input 
                label="Phone Number" 
                value={user?.phone || ""} 
                readOnly 
                disabled 
                mono 
              />
            </div>
            <div>
              <span className="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
                Assigned Role
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-signal/15 text-signal-bright border border-signal/30 px-3 py-1 rounded-full uppercase tracking-wider">
                {user?.role?.replace("_", " ")}
              </span>
            </div>
          </div>
        </Card>

        <Card raised className="p-6">
          <h2 className="text-lg font-display font-semibold text-ink mb-2 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-signal-bright" />
            Change Password
          </h2>
          <p className="text-xs text-ink-muted mb-4">
            Update your temporary password to a permanent, secure password for your account.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-status-fail/10 border border-status-fail/30 rounded-lg text-sm text-status-fail flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-status-ok/10 border border-status-ok/30 rounded-lg text-sm text-status-ok flex items-start gap-2">
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <Input 
              label="New Password" 
              type="password" 
              placeholder="Minimum 8 characters" 
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required 
            />
            <Input 
              label="Confirm New Password" 
              type="password" 
              placeholder="Re-enter new password" 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required 
            />
            <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting}>
              Update Password
            </Button>
          </form>
        </Card>

        <Card raised className="p-4 sm:p-6">
          <h2 className="text-lg font-display font-semibold text-ink mb-4">Portal &amp; System Information</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b border-ledger-line">
              <span className="text-ink-muted">Active Portal</span>
              <span className="text-ink font-medium">
                {user?.role === "agent" 
                  ? "Field Agent Portal" 
                  : user?.role === "support" 
                  ? "Support Service Portal" 
                  : "Central Admin Panel"}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-ledger-line">
              <span className="text-ink-muted">Role Clearance</span>
              <span className="font-mono text-signal-bright font-medium capitalize">
                {user?.role === "agent" 
                  ? "Biometric Enrollment & Walk-ins" 
                  : user?.role === "support" 
                  ? "Digital Live Support Desk" 
                  : "Executive Administrator"}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-ledger-line">
              <span className="text-ink-muted">Version</span>
              <span className="font-data text-ink">v1.0.0</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-ink-muted">Environment</span>
              <span className="font-data text-status-ok flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-status-ok animate-pulse" />
                Live Production
              </span>
            </div>
          </div>
          <p className="text-xs text-ink-faint mt-6 text-center">MiliPay Ecosystem • Secured for 100M+ biometric payment transactions.</p>
        </Card>

        {/* Active Terminal Session & Sign Out Card */}
        <Card raised className="p-4 sm:p-6 border border-status-fail/20 bg-ledger-raised/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <h2 className="text-lg font-display font-semibold text-ink flex items-center gap-2">
              <LogOut className="w-5 h-5 text-status-fail" />
              Active Terminal Session
            </h2>
            <span className="inline-flex items-center gap-1.5 text-xs font-mono text-status-ok bg-status-ok/10 px-2.5 py-1 rounded-full border border-status-ok/20 self-start sm:self-auto">
              <span className="w-1.5 h-1.5 rounded-full bg-status-ok animate-pulse" />
              Encrypted TLS Session
            </span>
          </div>
          <p className="text-xs text-ink-muted mb-4 leading-relaxed">
            You are actively logged into this device as <strong className="text-ink">{user?.fullName || "Staff Member"}</strong> ({user?.email}).
            Terminating your session revokes local cryptographic tokens and purges cached biometric credentials from this terminal.
          </p>
          <div className="pt-1">
            <Button
              type="button"
              variant="danger"
              onClick={() => setIsLogoutModalOpen(true)}
              className="w-full sm:w-auto py-2.5 px-5 text-xs sm:text-sm rounded-xl gap-2 font-medium"
            >
              <LogOut className="w-4 h-4" />
              Sign Out of Terminal
            </Button>
          </div>
        </Card>
      </div>

      <LogoutModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={handleConfirmLogout}
        portalName={
          user?.role === "agent"
            ? "Field Agent Portal"
            : user?.role === "support"
            ? "Support Service Portal"
            : "Central Admin Panel"
        }
        user={user}
      />
    </div>
  );
}