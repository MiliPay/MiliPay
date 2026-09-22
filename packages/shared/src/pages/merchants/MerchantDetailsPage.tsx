import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Cpu,
  CreditCard,
  UserCheck,
  ShieldCheck,
  ShieldAlert,
  Plus,
  CheckCircle2,
  Percent,
  Receipt,
  ExternalLink,
  TrendingUp,
  ArrowDownRight,
  Mail,
  Calendar,
  RefreshCw,
  Trash2,
  Ban,
} from "lucide-react";

import { Button } from "@milipay/shared/components/ui/Button";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { Modal } from "@milipay/shared/components/ui/Modal";
import { Input } from "@milipay/shared/components/ui/Input";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import {
  fetchMerchantById,
  fetchMerchantTransactions,
  updateMerchantStatus,
  updateMerchantFee,
  blacklistMerchant,
  deleteMerchant,
  toggleTerminalActive,
  bindNewTerminal,
  HARDWARE_MODELS,
} from "@milipay/shared/features/merchants/merchantService";
import type { Merchant, POSTerminal, MerchantTransaction } from "@milipay/shared/types";
import { TerminalDetailsModal } from "./TerminalDetailsModal";

export default function MerchantDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isAgent = user?.role === "agent";

  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [terminals, setTerminals] = useState<POSTerminal[]>([]);
  const [transactions, setTransactions] = useState<MerchantTransaction[]>([]);
  const [selectedTerminal, setSelectedTerminal] = useState<POSTerminal | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Fee modal state
  const [isFeeModalOpen, setIsFeeModalOpen] = useState(false);
  const [newFee, setNewFee] = useState(1.50);

  // Bind terminal modal state
  const [isBindModalOpen, setIsBindModalOpen] = useState(false);
  const [newTid, setNewTid] = useState("");
  const [newSerial, setNewSerial] = useState("");
  const [newModel, setNewModel] = useState("HFSecurity HP605PV");
  const [bindError, setBindError] = useState<string | null>(null);

  // Delete merchant modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      // Field agents are strictly restricted from querying transaction records
      if (isAgent) {
        const res = await fetchMerchantById(id);
        setMerchant(res.merchant);
        setTerminals(res.terminals);
        setTransactions([]);
        setNewFee(res.merchant.platformFeePercent);
      } else {
        const [res, txList] = await Promise.all([
          fetchMerchantById(id),
          fetchMerchantTransactions(id),
        ]);
        setMerchant(res.merchant);
        setTerminals(res.terminals);
        setTransactions(txList);
        setNewFee(res.merchant.platformFeePercent);
      }
    } catch (err) {
      console.error("Failed to load merchant:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id, isAgent]);

  const handleToggleStatus = async () => {
    if (!merchant) return;
    const nextStatus = merchant.status === "active" ? "suspended" : "active";
    try {
      setActionLoading(true);
      await updateMerchantStatus(merchant.id, nextStatus);
      setMerchant((prev) => (prev ? { ...prev, status: nextStatus } : null));
    } catch (err) {
      console.error("Failed to update merchant status:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleBlacklist = async () => {
    if (!merchant) return;
    const isCurrentlyBlacklisted = merchant.status === "blacklisted";
    try {
      setActionLoading(true);
      await blacklistMerchant(merchant.id, !isCurrentlyBlacklisted);
      setMerchant((prev) =>
        prev ? { ...prev, status: isCurrentlyBlacklisted ? "active" : "blacklisted" } : null
      );
      if (!isCurrentlyBlacklisted) {
        setTerminals((prev) => prev.map((t) => ({ ...t, isActive: false })));
      }
    } catch (err: any) {
      console.error("Failed to toggle blacklist:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteMerchant = async () => {
    if (!merchant) return;
    if (deleteConfirmInput.trim() !== merchant.businessName.trim()) {
      setDeleteError(`Please type "${merchant.businessName}" exactly to confirm deletion.`);
      return;
    }

    try {
      setActionLoading(true);
      setDeleteError(null);
      await deleteMerchant(merchant.id);
      setIsDeleteModalOpen(false);
      navigate("/dashboard/merchants");
    } catch (err: any) {
      console.error("Failed to delete merchant:", err);
      setDeleteError(err.message || "Failed to delete merchant account");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveFee = async () => {
    if (!merchant) return;
    try {
      setActionLoading(true);
      await updateMerchantFee(merchant.id, newFee);
      setMerchant((prev) => (prev ? { ...prev, platformFeePercent: newFee } : null));
      setIsFeeModalOpen(false);
    } catch (err) {
      console.error("Failed to update fee:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleTerminal = async (term: POSTerminal) => {
    try {
      const nextActive = !term.isActive;
      await toggleTerminalActive(term.id, nextActive);
      setTerminals((prev) =>
        prev.map((t) => (t.id === term.id ? { ...t, isActive: nextActive } : t))
      );
      if (selectedTerminal && selectedTerminal.id === term.id) {
        setSelectedTerminal((prev) => (prev ? { ...prev, isActive: nextActive } : null));
      }
    } catch (err) {
      console.error("Failed to toggle terminal active state:", err);
    }
  };

  const handleBindTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchant || !newTid || !newSerial) {
      setBindError("Terminal ID and Serial Number are required");
      return;
    }

    try {
      setActionLoading(true);
      setBindError(null);
      const created = await bindNewTerminal({
        merchantId: merchant.id,
        terminalId: newTid,
        deviceSerialNumber: newSerial,
        deviceModel: newModel,
      });
      setTerminals((prev) => [created, ...prev]);
      setIsBindModalOpen(false);
      setNewTid("");
      setNewSerial("");
    } catch (err: any) {
      setBindError(err.message || "Failed to pair terminal");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12">
        <LoadingState title="Loading Profile" description="Retrieving merchant account details..." />
      </div>
    );
  }


  if (!merchant) {
    return (
      <div className="p-10 text-center">
        <h2 className="text-xl font-bold text-white mb-2">Merchant Not Found</h2>
        <Button variant="secondary" onClick={() => navigate("/dashboard/merchants")}>
          Back to Directory
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto animate-rise-in space-y-8">
      {/* Back button & Title bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button
            onClick={() => navigate("/dashboard/merchants")}
            className="flex items-center gap-2 text-xs font-semibold text-ink-muted hover:text-white uppercase tracking-wider mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Merchants
          </button>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-bold text-ink">{merchant.businessName}</h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                merchant.status === "active"
                  ? "bg-status-ok/10 text-status-ok border border-status-ok/20"
                  : merchant.status === "blacklisted"
                  ? "bg-status-fail/20 text-status-fail border border-status-fail/40"
                  : "bg-status-warn/10 text-status-warn border border-status-warn/20"
              }`}
            >
              {merchant.status === "active"
                ? "Active"
                : merchant.status === "blacklisted"
                ? "Blacklisted"
                : "Suspended"}
            </span>
          </div>
          <p className="text-sm text-ink-muted mt-1 font-mono">
            Merchant ID: {merchant.id}
          </p>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="secondary" onClick={() => setIsFeeModalOpen(true)}>
              <Percent className="w-4 h-4 mr-1.5" />
              Fee ({merchant.platformFeePercent}%)
            </Button>

            {merchant.status !== "blacklisted" && (
              <Button
                variant={merchant.status === "active" ? "secondary" : "primary"}
                onClick={handleToggleStatus}
                disabled={actionLoading}
                className={
                  merchant.status === "active"
                    ? "hover:border-status-warn/40 hover:text-status-warn"
                    : ""
                }
              >
                {merchant.status === "active" ? (
                  <>
                    <ShieldAlert className="w-4 h-4 mr-1.5 text-status-warn" /> Suspend
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 mr-1.5" /> Reactivate
                  </>
                )}
              </Button>
            )}

            <Button
              variant={merchant.status === "blacklisted" ? "primary" : "secondary"}
              onClick={handleToggleBlacklist}
              disabled={actionLoading}
              className={
                merchant.status === "blacklisted"
                  ? ""
                  : "hover:border-status-fail/50 hover:text-status-fail"
              }
            >
              {merchant.status === "blacklisted" ? (
                <>
                  <ShieldCheck className="w-4 h-4 mr-1.5" /> Remove from Blacklist
                </>
              ) : (
                <>
                  <Ban className="w-4 h-4 mr-1.5 text-status-fail" /> Blacklist
                </>
              )}
            </Button>

            <Button
              variant="secondary"
              onClick={() => {
                setDeleteConfirmInput("");
                setDeleteError(null);
                setIsDeleteModalOpen(true);
              }}
              disabled={actionLoading}
              className="border-status-fail/30 text-status-fail hover:bg-status-fail/10 hover:border-status-fail"
            >
              <Trash2 className="w-4 h-4 mr-1.5" /> Delete
            </Button>
          </div>
        )}
      </div>

      {/* Registration & Audit Trail Banner */}
      <div className="bg-ledger-raised border border-white/[0.06] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-signal/10 flex items-center justify-center shrink-0">
            <UserCheck className="w-4 h-4 text-signal-bright" />
          </div>
          <div>
            <span className="text-ink-muted text-[11px] uppercase tracking-wider block font-semibold">
              Onboarding Audit Trail
            </span>
            <span className="text-white font-medium">
              Registered by <strong className="text-signal-bright font-semibold">{merchant.onboardedByName || "MiliPay Staff"}</strong>
              {merchant.onboardedByEmail && (
                <span className="text-ink-muted font-mono ml-1">({merchant.onboardedByEmail})</span>
              )}
              {merchant.onboardedByRole && (
                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-signal/10 text-signal border border-signal/20 font-mono uppercase">
                  {merchant.onboardedByRole}
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5 text-ink-muted text-xs border-t md:border-t-0 pt-2 md:pt-0 border-white/[0.05]">
          {merchant.email && (
            <div className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-ink-faint" />
              <span className="font-mono text-ink">{merchant.email}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-ink-faint" />
            <span className="font-mono">
              Enrolled on {new Date(merchant.createdAt).toLocaleDateString("en-NG", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Grid: 3 Profile Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Business Card */}
        <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-white/[0.05]">
            <div className="w-9 h-9 rounded-xl bg-signal/10 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-signal-bright" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Store Information</h3>
              <p className="text-xs text-ink-muted">Commercial registration</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-ink-muted block mb-0.5">Category:</span>
              <span className="font-semibold text-white uppercase tracking-wider bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
                {merchant.category}
              </span>
            </div>
            <div>
              <span className="text-ink-muted block mb-0.5">Store Address:</span>
              <span className="text-white font-medium">{merchant.address}</span>
            </div>
            <div>
              <span className="text-ink-muted block mb-0.5">State:</span>
              <span className="text-white font-medium">{merchant.state}</span>
            </div>
            <div>
              <span className="text-ink-muted block mb-0.5">CAC / RC Number:</span>
              <span className="text-white font-mono">{merchant.cacRcNumber || "Sole Proprietor"}</span>
            </div>
          </div>
        </div>

        {/* Settlement Account Card */}
        <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-white/[0.05]">
            <div className="w-9 h-9 rounded-xl bg-status-ok/10 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-status-ok" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Mono Settlement Rail</h3>
              <p className="text-xs text-ink-muted">DirectPay NIBSS bank account</p>
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
              <span className="text-ink-muted block mb-0.5">NUBAN Account:</span>
              <span className="text-signal-bright font-mono font-bold text-sm">
                {merchant.settlementAccountNumber}
              </span>
            </div>
            <div>
              <span className="text-ink-muted block mb-0.5">Account Holder Name:</span>
              <span className="text-white font-medium">{merchant.settlementAccountName}</span>
            </div>
            <div>
              <span className="text-ink-muted block mb-0.5">Mono Sub-Account ID:</span>
              <span className="text-ink-muted font-mono text-[11px] truncate block">
                {merchant.monoSubaccountId || "mono_sub_active"}
              </span>
            </div>
          </div>
        </div>

        {/* Director Card */}
        <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-white/[0.05]">
            <div className="w-9 h-9 rounded-xl bg-status-info/10 flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-status-info" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Director & Contact</h3>
              <p className="text-xs text-ink-muted">Authorized signatory</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-ink-muted block mb-0.5">Full Name:</span>
              <span className="font-semibold text-white">{merchant.directorName}</span>
            </div>
            <div>
              <span className="text-ink-muted block mb-0.5">Phone Number:</span>
              <span className="text-white font-mono">{merchant.directorPhone}</span>
            </div>
            <div>
              <span className="text-ink-muted block mb-0.5">BVN Status:</span>
              <span className="text-status-ok font-mono flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Verified & Tokenized
              </span>
            </div>
            <div>
              <span className="text-ink-muted block mb-0.5">Settlement Rule:</span>
              <span className="text-white font-mono">
                {merchant.settlementSchedule === "instant" ? "Instant (T+0)" : "Daily Batch (EOD)"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Assigned POS Hardware Fleet */}
      <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-white/[0.05] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-signal/10 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-signal-bright" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Assigned POS Terminals</h3>
              <p className="text-xs text-ink-muted">
                HFSecurity palm vein terminals paired with this merchant's settlement account
              </p>
            </div>
          </div>

          <Button variant="secondary" onClick={() => setIsBindModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Pair New Terminal
          </Button>
        </div>

        {terminals.length === 0 ? (
          <div className="p-10 text-center">
            <Cpu className="w-8 h-8 text-ink-faint mx-auto mb-3" />
            <p className="text-sm text-ink-muted mb-4">No POS hardware currently bound to this merchant.</p>
            <Button variant="secondary" onClick={() => setIsBindModalOpen(true)}>
              Pair First Terminal
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.02] border-b border-white/[0.06] text-xs font-semibold text-ink-muted uppercase tracking-wider font-mono">
                <tr>
                  <th className="py-4 px-6">Terminal ID</th>
                  <th className="py-4 px-6">Hardware Model</th>
                  <th className="py-4 px-6">Device Serial Number</th>
                  <th className="py-4 px-6">Assigned By (Audit)</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6 text-right">Hardware Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {terminals.map((t) => (
                  <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 px-6">
                      <button
                        onClick={() => setSelectedTerminal(t)}
                        className="font-mono font-bold text-signal-bright hover:text-white transition-colors flex items-center gap-1.5 group text-left"
                        title="Click to view full terminal details & transactions"
                      >
                        <span>{t.terminalId}</span>
                        <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                      </button>
                    </td>
                    <td className="py-4 px-6 font-medium text-white">
                      {t.deviceModel}
                    </td>
                    <td className="py-4 px-6 font-mono text-ink-muted text-xs">
                      {t.deviceSerialNumber}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-signal shrink-0" />
                        <div className="text-xs">
                          <span className="text-white font-medium block">
                            {t.assignedByName || "MiliPay Staff"}
                          </span>
                          {t.assignedByRole && (
                            <span className="text-[10px] text-ink-muted block uppercase font-mono tracking-wider">
                              {t.assignedByRole}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          t.isActive
                            ? "bg-status-ok/10 text-status-ok border border-status-ok/20"
                            : "bg-status-fail/10 text-status-fail border border-status-fail/20"
                        }`}
                      >
                        {t.isActive ? "Authorized" : "Blacklisted / Deactivated"}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right space-x-2">
                      <Button
                        variant="ghost"
                        onClick={() => setSelectedTerminal(t)}
                        className="text-xs py-1.5 px-2.5 text-ink-muted hover:text-white"
                      >
                        {isAgent ? "Hardware Specs" : "Transactions"}
                      </Button>
                      {!isAgent && (
                        <Button
                          variant={t.isActive ? "secondary" : "primary"}
                          onClick={() => handleToggleTerminal(t)}
                          className="text-xs py-1.5 px-3"
                        >
                          {t.isActive ? "Lockdown" : "Reauthorize"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* For Agents: Field Audit Summary (Gated from financial transaction records) */}
      {isAgent ? (
        <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl p-6 shadow-xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-signal/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-signal-bright" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">Financial Privacy Gating Active</h3>
            <p className="text-xs text-ink-muted mt-0.5">
              Store sales volumes, biometric debit transactions, and bank split fee breakdowns for {merchant.businessName} are restricted to Central Administrators. Field Agents are authorized for physical store onboarding and hardware provisioning only.
            </p>
          </div>
        </div>
      ) : (
        /* Store Transactions & Payouts Ledger */
        <div className="bg-ledger-raised border border-white/[0.06] rounded-2xl overflow-hidden shadow-xl space-y-6">
          <div className="p-6 border-b border-white/[0.05] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-status-ok/10 flex items-center justify-center">
                <Receipt className="w-4 h-4 text-status-ok" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Store Transactions & Settlements</h3>
                <p className="text-xs text-ink-muted">
                  DirectPay biometric sales and fee breakdowns across all terminals
                </p>
              </div>
            </div>

            <button
              onClick={() => loadData()}
              className="text-xs text-ink-muted hover:text-white flex items-center gap-1.5 transition-colors self-start md:self-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh Transactions
            </button>
          </div>

          {/* Transaction KPIs */}
          <div className="px-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
              <div className="flex items-center justify-between text-ink-muted mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Gross Sales Volume</span>
                <TrendingUp className="w-3.5 h-3.5 text-signal" />
              </div>
              <div className="text-xl font-bold font-data text-white">
                &#8358;{transactions.reduce((s, t) => s + (t.status === "success" ? t.amount : 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-ink-muted mt-0.5 font-mono">Total debited via palm scans</p>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
              <div className="flex items-center justify-between text-ink-muted mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Platform Take-Rate ({merchant.platformFeePercent}%)</span>
                <Percent className="w-3.5 h-3.5 text-ink-faint" />
              </div>
              <div className="text-xl font-bold font-data text-ink-muted">
                &#8358;{transactions.reduce((s, t) => s + (t.status === "success" ? t.platformFee : 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-ink-muted mt-0.5 font-mono">MiliPay platform commission</p>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
              <div className="flex items-center justify-between text-ink-muted mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Net Settled to Merchant</span>
                <ArrowDownRight className="w-3.5 h-3.5 text-status-ok" />
              </div>
              <div className="text-xl font-bold font-data text-status-ok">
                &#8358;{transactions.reduce((s, t) => s + (t.status === "success" ? t.netPayout : 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-status-ok mt-0.5 font-mono">DirectPay NIBSS bank payouts</p>
            </div>
          </div>

          {/* Transactions Table */}
          {transactions.length === 0 ? (
            <div className="p-10 text-center">
              <Receipt className="w-8 h-8 text-ink-faint mx-auto mb-3" />
              <p className="text-sm text-white font-medium">No Transactions Found</p>
              <p className="text-xs text-ink-muted mt-1">
                No payments have been recorded for {merchant.businessName} yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.02] border-b border-white/[0.06] font-mono text-[11px] text-ink-muted uppercase">
                  <tr>
                    <th className="py-3 px-6">Reference</th>
                    <th className="py-3 px-6">Terminal</th>
                    <th className="py-3 px-6">Gross Amount</th>
                    <th className="py-3 px-6">Platform Fee</th>
                    <th className="py-3 px-6">Net Payout</th>
                    <th className="py-3 px-6">Status</th>
                    <th className="py-3 px-6 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {transactions.map((tx) => {
                    const matchingTerminal = terminals.find((term) => term.terminalId === tx.terminalId);
                    return (
                      <tr key={tx.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 px-6 font-mono text-signal-bright font-medium">
                          {tx.reference}
                        </td>
                        <td className="py-3.5 px-6">
                          {tx.terminalId ? (
                            <button
                              onClick={() => {
                                if (matchingTerminal) setSelectedTerminal(matchingTerminal);
                              }}
                              className="font-mono text-white hover:text-signal transition-colors underline decoration-dotted text-left"
                              title="View terminal history"
                            >
                              {tx.terminalId}
                            </button>
                          ) : (
                            <span className="text-ink-muted font-mono">Direct</span>
                          )}
                        </td>
                        <td className="py-3.5 px-6 font-bold font-data text-white">
                          &#8358;{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-6 font-data text-ink-muted">
                          &#8358;{tx.platformFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-6 font-bold font-data text-status-ok">
                          &#8358;{tx.netPayout.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-6">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              tx.status === "success"
                                ? "bg-status-ok/10 text-status-ok border border-status-ok/20"
                                : "bg-status-fail/10 text-status-fail border border-status-fail/20"
                            }`}
                          >
                            {tx.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-right font-mono text-ink-muted text-[11px]">
                          {new Date(tx.timestamp).toLocaleString("en-NG", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Adjust Fee Modal */}
      <Modal
        isOpen={isFeeModalOpen}
        onClose={() => setIsFeeModalOpen(false)}
        title="Adjust Platform Fee"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Configure the MiliPay platform take-rate percentage for customer palm debits at{" "}
            <span className="text-white font-semibold">{merchant.businessName}</span>.
          </p>

          <div>
            <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">
              Platform Fee (%)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.05"
                min="0"
                max="10"
                value={newFee}
                onChange={(e) => setNewFee(parseFloat(e.target.value) || 0)}
                className="w-full rounded bg-white/[0.03] border border-ledger-line2 px-4 py-3 text-[15px] text-ink font-mono outline-none focus:border-signal/60"
              />
              <span className="absolute right-4 top-3.5 text-xs text-ink-muted font-mono">%</span>
            </div>
            <p className="text-xs text-ink-faint mt-1.5">
              Example: A ₦10,000 grocery debit yields ₦{(10000 * (newFee / 100)).toFixed(0)} MiliPay
              fee and ₦{(10000 * (1 - newFee / 100)).toFixed(0)} to the merchant.
            </p>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsFeeModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveFee} disabled={actionLoading}>
              Save New Take-Rate
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bind Terminal Modal */}
      <Modal
        isOpen={isBindModalOpen}
        onClose={() => setIsBindModalOpen(false)}
        title="Pair New POS Terminal"
      >
        <form onSubmit={handleBindTerminal} className="space-y-4">
          <p className="text-sm text-ink-muted">
            Bind an additional HFSecurity terminal to{" "}
            <span className="text-white font-semibold">{merchant.businessName}</span>.
          </p>

          {bindError && (
            <div className="p-3 rounded-lg bg-status-fail/10 border border-status-fail/20 text-xs text-status-fail">
              {bindError}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">
              Hardware Model
            </label>
            <select
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              className="w-full rounded bg-white/[0.03] border border-ledger-line2 px-4 py-3 text-[15px] text-ink outline-none focus:border-signal/60"
            >
              {HARDWARE_MODELS.map((m) => (
                <option key={m.value} value={m.value} className="bg-ledger text-ink">
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Terminal ID (TID)"
            required
            mono
            placeholder="e.g. TID-HP605-0042"
            value={newTid}
            onChange={(e) => setNewTid(e.target.value)}
          />

          <Input
            label="Device Serial Number (Barcode SN)"
            required
            mono
            placeholder="e.g. SN-89382109"
            value={newSerial}
            onChange={(e) => setNewSerial(e.target.value)}
          />

          <div className="pt-4 flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => setIsBindModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={actionLoading}>
              {actionLoading ? "Pairing..." : "Pair Terminal"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Merchant Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Confirm Merchant Deletion"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-status-fail/10 border border-status-fail/20 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-status-fail shrink-0 mt-0.5" />
            <div className="text-xs text-status-fail leading-relaxed">
              <strong className="font-bold block mb-1">Permanent Administrative Action</strong>
              This removes the store profile, deletes its POS terminals and revokes the merchant's portal login. Past transactions are kept, with the store's name, but are no longer linked to a merchant record. It cannot be undone.
            </div>
          </div>

          {deleteError && (
            <div className="p-3 rounded-lg bg-status-fail/10 border border-status-fail/20 text-xs text-status-fail">
              {deleteError}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">
              Type <span className="text-white font-mono font-bold select-all">{merchant.businessName}</span> to confirm:
            </label>
            <Input
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              placeholder={merchant.businessName}
              required
            />
          </div>

          <div className="pt-3 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleDeleteMerchant}
              disabled={actionLoading || deleteConfirmInput.trim() !== merchant.businessName.trim()}
              className="bg-status-fail hover:bg-status-fail/90 text-white"
            >
              {actionLoading ? "Deleting..." : "Permanently Delete Merchant"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Terminal Details & Transactions Modal */}
      <TerminalDetailsModal
        terminal={selectedTerminal}
        isOpen={!!selectedTerminal}
        onClose={() => setSelectedTerminal(null)}
        onToggleActive={!isAgent ? handleToggleTerminal : undefined}
      />
    </div>
  );
}
