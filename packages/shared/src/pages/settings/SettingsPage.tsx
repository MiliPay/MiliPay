import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { supabase } from "@milipay/shared/lib/supabase";
import { Card } from "@milipay/shared/components/ui/Card";
import { Input } from "@milipay/shared/components/ui/Input";
import { Button } from "@milipay/shared/components/ui/Button";
import { formatNaira, formatDate } from "@milipay/shared/lib/utils/format";
import {
  Check,
  ShieldCheck,
  AlertCircle,
  KeyRound,
  LogOut,
  Sliders,
  TrendingUp,
  Sparkles,
  Zap,
  Tv,
  Wifi,
  RotateCcw,
  Save,
  CheckCircle2,
} from "lucide-react";
import { LogoutModal } from "@milipay/shared/components/layout/LogoutModal";

interface VtuMarginSettings {
  data_surcharge_ngn: number;
  cable_surcharge_ngn: number;
  power_convenience_fee_ngn: number;
  airtime_surcharge_percent: number;
  updated_at?: string;
  updated_by?: string;
}

const DEFAULT_VTU_SETTINGS: VtuMarginSettings = {
  data_surcharge_ngn: 25.00,
  cable_surcharge_ngn: 30.00,
  power_convenience_fee_ngn: 0.00,
  airtime_surcharge_percent: 0.00,
};

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  // VTU Margin Settings State
  const [vtuSettings, setVtuSettings] = useState<VtuMarginSettings>(DEFAULT_VTU_SETTINGS);
  const [isLoadingVtuSettings, setIsLoadingVtuSettings] = useState(false);
  const [isSavingVtuSettings, setIsSavingVtuSettings] = useState(false);
  const [vtuSuccessMsg, setVtuSuccessMsg] = useState<string | null>(null);
  const [vtuErrorMsg, setVtuErrorMsg] = useState<string | null>(null);

  // Load VTU margin settings on mount if admin
  useEffect(() => {
    if (!isAdmin) return;

    const loadSettings = async () => {
      setIsLoadingVtuSettings(true);
      try {
        // 1. Try local storage first for instant render
        const cached = localStorage.getItem("milipay_vtu_settings");
        if (cached) {
          try {
            setVtuSettings(JSON.parse(cached));
          } catch (_) {}
        }

        // 2. Try Supabase table query
        const { data: dbData, error: dbErr } = await supabase
          .from("vtu_settings")
          .select("*")
          .eq("id", "default")
          .maybeSingle();

        if (!dbErr && dbData) {
          const loaded: VtuMarginSettings = {
            data_surcharge_ngn: Number(dbData.data_surcharge_ngn) ?? 25,
            cable_surcharge_ngn: Number(dbData.cable_surcharge_ngn) ?? 30,
            power_convenience_fee_ngn: Number(dbData.power_convenience_fee_ngn) ?? 0,
            airtime_surcharge_percent: Number(dbData.airtime_surcharge_percent) ?? 0,
            updated_at: dbData.updated_at,
            updated_by: dbData.updated_by,
          };
          setVtuSettings(loaded);
          localStorage.setItem("milipay_vtu_settings", JSON.stringify(loaded));
          return;
        }

        // 3. Try edge function get_settings if DB table query had an issue
        const { data: edgeData } = await supabase.functions.invoke("vtu-service", {
          body: { action: "get_settings" },
        });
        if (edgeData?.success && edgeData?.settings) {
          setVtuSettings((prev) => ({
            ...prev,
            ...edgeData.settings,
          }));
          localStorage.setItem("milipay_vtu_settings", JSON.stringify(edgeData.settings));
        }
      } catch (err: any) {
        console.warn("Could not fetch remote VTU settings:", err);
      } finally {
        setIsLoadingVtuSettings(false);
      }
    };

    loadSettings();
  }, [isAdmin]);

  const handleSaveVtuSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingVtuSettings(true);
    setVtuSuccessMsg(null);
    setVtuErrorMsg(null);

    const payload = {
      data_surcharge_ngn: Math.max(0, Number(vtuSettings.data_surcharge_ngn) || 0),
      cable_surcharge_ngn: Math.max(0, Number(vtuSettings.cable_surcharge_ngn) || 0),
      power_convenience_fee_ngn: Math.max(0, Number(vtuSettings.power_convenience_fee_ngn) || 0),
      airtime_surcharge_percent: Math.max(0, Number(vtuSettings.airtime_surcharge_percent) || 0),
    };

    try {
      // Single authoritative path. Writing the table directly from the browser
      // no longer works (and should not): the Edge Function verifies the caller
      // is an administrator before touching retail pricing.
      const { data, error } = await supabase.functions.invoke("vtu-service", {
        body: { action: "update_settings", ...payload },
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || "Margin settings were not saved.");
      }

      const saved = { ...payload, ...data.settings };
      setVtuSettings(saved);
      localStorage.setItem("milipay_vtu_settings", JSON.stringify(saved));

      setVtuSuccessMsg("VTU profit margins updated. Customer apps will pick up the new pricing within 10 minutes.");
      setTimeout(() => setVtuSuccessMsg(null), 6000);
    } catch (err: any) {
      console.error("Failed to update VTU settings:", err);
      setVtuErrorMsg(err?.message || "Could not save margin settings. Your changes were not applied.");
    } finally {
      setIsSavingVtuSettings(false);
    }
  };

  const applyPreset = (preset: {
    data: number;
    cable: number;
    power: number;
    airtime: number;
  }) => {
    setVtuSettings((prev) => ({
      ...prev,
      data_surcharge_ngn: preset.data,
      cable_surcharge_ngn: preset.cable,
      power_convenience_fee_ngn: preset.power,
      airtime_surcharge_percent: preset.airtime,
    }));
  };

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
    <div className="p-4 sm:p-6 md:p-10 max-w-4xl mx-auto space-y-6 sm:space-y-8 animate-rise-in">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-display font-bold text-ink">Account &amp; Security Settings</h1>
        <p className="text-ink-muted text-xs sm:text-sm mt-1">Manage your staff profile, credentials, security preferences, and ecosystem margin parameters.</p>
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

        {/* VTU & Telecom Surcharge Profit Margin Engine (Admin & Super Admin Exclusive) */}
        {isAdmin && (
          <Card raised className="p-4 sm:p-6 border border-signal/20 bg-ledger-raised/70 relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-signal/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-display font-semibold text-ink flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-signal-bright" />
                  VTU &amp; Telecom Margin Engine
                </h2>
                <p className="text-xs text-ink-muted mt-1">
                  Adjust active retail profit margins, markup surcharges, and convenience fees applied across customer mobile app recharges in real-time.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-mono text-signal-bright bg-signal/15 px-3 py-1 rounded-full border border-signal/30 self-start sm:self-auto shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
                Live Dynamic Markup
              </span>
            </div>

            {/* Quick Margin Presets */}
            <div className="mb-6 p-3 bg-ledger rounded-xl border border-white/[0.04]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-ink-muted flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-signal-bright" />
                  Quick Margin Presets:
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => applyPreset({ data: 25, cable: 30, power: 0, airtime: 0 })}
                    className="text-[11px] font-mono font-medium px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-ink border border-white/[0.06] transition-colors"
                  >
                    Recommended Conservative (₦25 / ₦30 / ₦0)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset({ data: 35, cable: 50, power: 50, airtime: 1 })}
                    className="text-[11px] font-mono font-medium px-2.5 py-1 rounded-lg bg-signal/10 hover:bg-signal/20 text-signal-bright border border-signal/25 transition-colors"
                  >
                    Growth Retail (₦35 / ₦50 / ₦50 / 1%)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset({ data: 0, cable: 0, power: 0, airtime: 0 })}
                    className="text-[11px] font-mono font-medium px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-ink-muted border border-white/[0.06] transition-colors"
                  >
                    Zero Markup (Cashback Only)
                  </button>
                </div>
              </div>
            </div>

            {vtuSuccessMsg && (
              <div className="mb-4 p-3.5 bg-status-ok/10 border border-status-ok/30 rounded-xl text-xs sm:text-sm text-status-ok flex items-start gap-2.5 animate-rise-in">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{vtuSuccessMsg}</span>
              </div>
            )}

            {vtuErrorMsg && (
              <div className="mb-4 p-3.5 bg-status-fail/10 border border-status-fail/30 rounded-xl text-xs sm:text-sm text-status-fail flex items-start gap-2.5 animate-rise-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{vtuErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveVtuSettings} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Data Surcharge */}
                <div className="space-y-1.5 p-3.5 bg-ledger/80 rounded-xl border border-white/[0.05]">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
                      <Wifi className="w-3.5 h-3.5 text-signal-bright" />
                      Data Bundle Markup (₦)
                    </label>
                    <span className="text-[10px] font-mono text-ink-faint uppercase">Per Bundle Vend</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted font-mono text-sm">₦</span>
                    <input
                      type="number"
                      min="0"
                      max="500"
                      step="1"
                      value={vtuSettings.data_surcharge_ngn}
                      onChange={(e) =>
                        setVtuSettings((prev) => ({
                          ...prev,
                          data_surcharge_ngn: Math.max(0, parseFloat(e.target.value) || 0),
                        }))
                      }
                      className="w-full pl-8 pr-3 py-2 bg-ledger-raised border border-white/[0.08] focus:border-signal/50 focus:ring-1 focus:ring-signal/30 rounded-lg text-ink font-mono text-sm transition-all"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-ink-muted leading-tight">
                    Flat fee added to wholesale API pricing across MTN, Airtel, Glo &amp; 9mobile data.
                  </p>
                </div>

                {/* Cable TV Surcharge */}
                <div className="space-y-1.5 p-3.5 bg-ledger/80 rounded-xl border border-white/[0.05]">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
                      <Tv className="w-3.5 h-3.5 text-signal-bright" />
                      Cable TV Surcharge (₦)
                    </label>
                    <span className="text-[10px] font-mono text-ink-faint uppercase">Per Bouquet</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted font-mono text-sm">₦</span>
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      step="1"
                      value={vtuSettings.cable_surcharge_ngn}
                      onChange={(e) =>
                        setVtuSettings((prev) => ({
                          ...prev,
                          cable_surcharge_ngn: Math.max(0, parseFloat(e.target.value) || 0),
                        }))
                      }
                      className="w-full pl-8 pr-3 py-2 bg-ledger-raised border border-white/[0.08] focus:border-signal/50 focus:ring-1 focus:ring-signal/30 rounded-lg text-ink font-mono text-sm transition-all"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-ink-muted leading-tight">
                    Platform fee on DStv, GOtv, and StarTimes bouquet activations &amp; renewals.
                  </p>
                </div>

                {/* Electricity Convenience Fee */}
                <div className="space-y-1.5 p-3.5 bg-ledger/80 rounded-xl border border-white/[0.05]">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-signal-bright" />
                      Electricity Convenience Fee (₦)
                    </label>
                    <span className="text-[10px] font-mono text-ink-faint uppercase">Per Meter Vend</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted font-mono text-sm">₦</span>
                    <input
                      type="number"
                      min="0"
                      max="500"
                      step="1"
                      value={vtuSettings.power_convenience_fee_ngn}
                      onChange={(e) =>
                        setVtuSettings((prev) => ({
                          ...prev,
                          power_convenience_fee_ngn: Math.max(0, parseFloat(e.target.value) || 0),
                        }))
                      }
                      className="w-full pl-8 pr-3 py-2 bg-ledger-raised border border-white/[0.08] focus:border-signal/50 focus:ring-1 focus:ring-signal/30 rounded-lg text-ink font-mono text-sm transition-all"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-ink-muted leading-tight">
                    Convenience fee for generating 20-digit STS Disco tokens (prepaid &amp; postpaid).
                  </p>
                </div>

                {/* Airtime Surcharge % */}
                <div className="space-y-1.5 p-3.5 bg-ledger/80 rounded-xl border border-white/[0.05]">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-signal-bright" />
                      Airtime Surcharge (%)
                    </label>
                    <span className="text-[10px] font-mono text-ink-faint uppercase">Top-up Markup</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={vtuSettings.airtime_surcharge_percent}
                      onChange={(e) =>
                        setVtuSettings((prev) => ({
                          ...prev,
                          airtime_surcharge_percent: Math.max(0, parseFloat(e.target.value) || 0),
                        }))
                      }
                      className="w-full px-3 py-2 bg-ledger-raised border border-white/[0.08] focus:border-signal/50 focus:ring-1 focus:ring-signal/30 rounded-lg text-ink font-mono text-sm transition-all"
                      required
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted font-mono text-sm">%</span>
                  </div>
                  <p className="text-[11px] text-ink-muted leading-tight">
                    Optional percentage markup on airtime. MiliPay also retains 3% to 4% telecom wallet cashback.
                  </p>
                </div>
              </div>

              {/* Live Retail Impact Simulator */}
              <div className="p-4 bg-ledger rounded-xl border border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-signal-bright" />
                    Live Margin Impact Simulator (Customer Preview)
                  </span>
                  <span className="text-[10px] font-mono text-status-ok bg-status-ok/10 px-2 py-0.5 rounded border border-status-ok/20">
                    Calculated in Real-Time
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Simulation 1: MTN Data */}
                  <div className="p-3 bg-ledger-raised/60 rounded-lg border border-white/[0.04] space-y-1.5 text-xs">
                    <div className="font-semibold text-ink flex items-center justify-between">
                      <span>MTN 1.5GB Data (30d)</span>
                      <span className="text-[10px] text-ink-muted">30 Days</span>
                    </div>
                    <div className="space-y-1 text-ink-muted text-[11px] font-mono pt-1">
                      <div className="flex justify-between">
                        <span>Wholesale Cost:</span>
                        <span>₦1,000.00</span>
                      </div>
                      <div className="flex justify-between text-signal-bright">
                        <span>Configured Markup:</span>
                        <span>+{formatNaira(vtuSettings.data_surcharge_ngn)}</span>
                      </div>
                      <div className="flex justify-between text-ink font-bold pt-1 border-t border-white/[0.06]">
                        <span>Customer Debited:</span>
                        <span>{formatNaira(1000 + Number(vtuSettings.data_surcharge_ngn))}</span>
                      </div>
                      <div className="flex justify-between text-status-ok text-[10px]">
                        <span>Est. Net Revenue:</span>
                        <span>{formatNaira(Number(vtuSettings.data_surcharge_ngn) + 30.00)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Simulation 2: Cable TV */}
                  <div className="p-3 bg-ledger-raised/60 rounded-lg border border-white/[0.04] space-y-1.5 text-xs">
                    <div className="font-semibold text-ink flex items-center justify-between">
                      <span>DStv Padi Bouquet</span>
                      <span className="text-[10px] text-ink-muted">1 Month</span>
                    </div>
                    <div className="space-y-1 text-ink-muted text-[11px] font-mono pt-1">
                      <div className="flex justify-between">
                        <span>Wholesale Cost:</span>
                        <span>₦3,300.00</span>
                      </div>
                      <div className="flex justify-between text-signal-bright">
                        <span>Configured Markup:</span>
                        <span>+{formatNaira(vtuSettings.cable_surcharge_ngn)}</span>
                      </div>
                      <div className="flex justify-between text-ink font-bold pt-1 border-t border-white/[0.06]">
                        <span>Customer Debited:</span>
                        <span>{formatNaira(3300 + Number(vtuSettings.cable_surcharge_ngn))}</span>
                      </div>
                      <div className="flex justify-between text-status-ok text-[10px]">
                        <span>Est. Net Revenue:</span>
                        <span>{formatNaira(Number(vtuSettings.cable_surcharge_ngn) + 49.50)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Simulation 3: Electricity */}
                  <div className="p-3 bg-ledger-raised/60 rounded-lg border border-white/[0.04] space-y-1.5 text-xs">
                    <div className="font-semibold text-ink flex items-center justify-between">
                      <span>Ikeja Electric (Prepaid)</span>
                      <span className="text-[10px] text-ink-muted">20-digit STS</span>
                    </div>
                    <div className="space-y-1 text-ink-muted text-[11px] font-mono pt-1">
                      <div className="flex justify-between">
                        <span>Base Token Vend:</span>
                        <span>₦5,000.00</span>
                      </div>
                      <div className="flex justify-between text-signal-bright">
                        <span>Convenience Fee:</span>
                        <span>+{formatNaira(vtuSettings.power_convenience_fee_ngn)}</span>
                      </div>
                      <div className="flex justify-between text-ink font-bold pt-1 border-t border-white/[0.06]">
                        <span>Customer Debited:</span>
                        <span>{formatNaira(5000 + Number(vtuSettings.power_convenience_fee_ngn))}</span>
                      </div>
                      <div className="flex justify-between text-status-ok text-[10px]">
                        <span>Est. Net Revenue:</span>
                        <span>{formatNaira(Number(vtuSettings.power_convenience_fee_ngn) + 60.00)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons & Audit Info */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
                <div className="text-xs text-ink-faint text-center sm:text-left">
                  {vtuSettings.updated_at && (
                    <span>
                      Last synchronized: {formatDate(vtuSettings.updated_at)} • Logged by{" "}
                      <strong className="text-ink-muted">{vtuSettings.updated_by || "Admin"}</strong>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <Button
                    type="submit"
                    isLoading={isSavingVtuSettings}
                    disabled={isSavingVtuSettings || isLoadingVtuSettings}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl gap-2 font-medium"
                  >
                    <Save className="w-4 h-4" />
                    Save Margin Configuration
                  </Button>
                </div>
              </div>
            </form>
          </Card>
        )}

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