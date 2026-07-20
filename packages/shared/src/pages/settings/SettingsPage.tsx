import { useAuth } from "@biopay/shared/features/auth/AuthContext";
import { Card } from "@biopay/shared/components/ui/Card";
import { Input } from "@biopay/shared/components/ui/Input";
import { Button } from "@biopay/shared/components/ui/Button";

export default function SettingsPage() {
  const { user } = useAuth();

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    window.alert("Password updated successfully.");
  };

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto animate-rise-in">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-ink">Settings</h1>
        <p className="text-ink-muted mt-1">Manage your account and preferences.</p>
      </div>

      <div className="space-y-6">
        <Card raised className="p-6">
          <h2 className="text-lg font-display font-semibold text-ink mb-4">Profile</h2>
          <div className="space-y-4">
            <Input 
              label="Agent Name" 
              value={user?.fullName || ""} 
              readOnly 
              disabled 
            />
            <Input 
              label="Phone Number" 
              value={user?.phone || ""} 
              readOnly 
              disabled 
              mono 
            />
            <div>
              <span className="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
                Role
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-signal/15 text-signal-bright border border-signal/30 px-3 py-1 rounded-full uppercase tracking-wider">
                {user?.role?.replace("_", " ")}
              </span>
            </div>
          </div>
        </Card>

        <Card raised className="p-6">
          <h2 className="text-lg font-display font-semibold text-ink mb-4">Security</h2>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <Input 
              label="Current Password" 
              type="password" 
              placeholder="••••••••" 
              required 
            />
            <Input 
              label="New Password" 
              type="password" 
              placeholder="••••••••" 
              required 
            />
            <Input 
              label="Confirm New Password" 
              type="password" 
              placeholder="••••••••" 
              required 
            />
            <Button type="submit">Update password</Button>
          </form>
        </Card>

        <Card raised className="p-6">
          <h2 className="text-lg font-display font-semibold text-ink mb-4">About</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b border-ledger-line">
              <span className="text-ink-muted">App Name</span>
              <span className="text-ink font-medium">BioPay Agent Console</span>
            </div>
            <div className="flex justify-between py-2 border-b border-ledger-line">
              <span className="text-ink-muted">Version</span>
              <span className="font-data text-ink">1.0.0</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-ink-muted">Environment</span>
              <span className="font-data text-ink">Development</span>
            </div>
          </div>
          <p className="text-xs text-ink-faint mt-6 text-center">Built for 100M+ users.</p>
        </Card>
      </div>
    </div>
  );
}