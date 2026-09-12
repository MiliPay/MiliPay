import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Cpu,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldAlert,
  Building2,
  ExternalLink,
  UserCheck,
} from "lucide-react";

import { Button } from "@milipay/shared/components/ui/Button";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import {
  fetchAllTerminals,
  toggleTerminalActive,
} from "@milipay/shared/features/merchants/merchantService";
import type { POSTerminal } from "@milipay/shared/types";
import { TerminalDetailsModal } from "./TerminalDetailsModal";

export default function TerminalsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAgent = user?.role === "agent";

  const [terminals, setTerminals] = useState<POSTerminal[]>([]);
  const [selectedTerminal, setSelectedTerminal] = useState<POSTerminal | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadTerminals = async () => {
    try {
      setLoading(true);
      const data = await fetchAllTerminals();
      setTerminals(data);
    } catch (err) {
      console.error("Failed to load POS terminals:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTerminals();
  }, []);

  const handleToggleActive = async (term: POSTerminal) => {
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
      console.error("Failed to update terminal:", err);
    }
  };

  const filtered = terminals.filter((t) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      t.terminalId.toLowerCase().includes(s) ||
      t.deviceSerialNumber.toLowerCase().includes(s) ||
      (t.merchantName && t.merchantName.toLowerCase().includes(s)) ||
      t.deviceModel.toLowerCase().includes(s)
    );
  });

  const totalUnits = terminals.length;
  const activeUnits = terminals.filter((t) => t.isActive).length;
  const blacklistedUnits = terminals.filter((t) => !t.isActive).length;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto animate-rise-in space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-5 h-5 text-signal-bright" />
            <span className="text-xs font-semibold uppercase tracking-wider text-signal-bright">
              Biometric Hardware Fleet
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold text-ink">POS Terminals Management</h1>
          <p className="text-sm text-ink-muted mt-1">
            Track deployed HFSecurity HP605PV and VP930Pro palm vein scanners across all retail stores.
          </p>
        </div>

        <Button variant="secondary" onClick={loadTerminals}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh Fleet
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-ledger-raised border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Hardware Deployed</span>
            <Cpu className="w-4 h-4 text-signal-bright" />
          </div>
          <div className="text-2xl font-bold font-data text-white">{totalUnits}</div>
          <p className="text-xs text-ink-muted mt-1 font-mono">Provisioned devices in circulation</p>
        </div>

        <div className="bg-ledger-raised border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Authorized & Online</span>
            <ShieldCheck className="w-4 h-4 text-status-ok" />
          </div>
          <div className="text-2xl font-bold font-data text-white">{activeUnits}</div>
          <p className="text-xs text-status-ok mt-1 font-mono">Active payment processing units</p>
        </div>

        <div className="bg-ledger-raised border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Blacklisted / Stolen</span>
            <ShieldAlert className="w-4 h-4 text-status-fail" />
          </div>
          <div className="text-2xl font-bold font-data text-white">{blacklistedUnits}</div>
          <p className="text-xs text-status-fail mt-1 font-mono">Hardware lockdown enforced</p>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="bg-ledger-raised border border-white/[0.06] rounded-xl p-4 flex items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-ink-faint absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search by Terminal ID, Serial Number, or Merchant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/[0.03] border border-ledger-line2 rounded-lg text-sm text-ink outline-none focus:border-signal/60"
          />
        </div>
      </div>

      {/* Fleet Table */}
      <div className="bg-ledger-raised border border-white/[0.06] rounded-xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12">
            <LoadingState title="Loading Fleet" description="Querying hardware fleet inventory..." />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Cpu className="w-10 h-10 text-ink-faint mx-auto mb-3" />
            <h3 className="text-base font-bold text-white mb-1">No Terminals Found</h3>
            <p className="text-xs text-ink-muted">
              {search ? "No devices match your search query." : "No POS terminals have been registered yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.02] border-b border-white/[0.06] text-xs font-semibold text-ink-muted uppercase tracking-wider font-mono">
                <tr>
                  <th className="py-4 px-6">Terminal ID</th>
                  <th className="py-4 px-6">Assigned Merchant</th>
                  <th className="py-4 px-6">Hardware Model</th>
                  <th className="py-4 px-6">Serial Number</th>
                  <th className="py-4 px-6">Assigned By (Audit)</th>
                  <th className="py-4 px-6">Security State</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map((t) => (
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

                    <td className="py-4 px-6">
                      <button
                        onClick={() => navigate(`/dashboard/merchants/${t.merchantId}`)}
                        className="font-semibold text-white hover:text-signal transition-colors text-left flex items-center gap-1.5"
                      >
                        <Building2 className="w-3.5 h-3.5 text-ink-faint" />
                        {t.merchantName || "Unassigned"}
                      </button>
                    </td>

                    <td className="py-4 px-6">
                      <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-medium bg-white/[0.04] border border-white/[0.08] text-ink">
                        {t.deviceModel}
                      </span>
                    </td>

                    <td className="py-4 px-6 font-mono text-xs text-ink-muted">
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
                        {t.isActive ? "Authorized" : "Blacklisted / Disabled"}
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
                          onClick={() => handleToggleActive(t)}
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

      {/* Terminal Details & Transactions Modal */}
      <TerminalDetailsModal
        terminal={selectedTerminal}
        isOpen={!!selectedTerminal}
        onClose={() => setSelectedTerminal(null)}
        onToggleActive={!isAgent ? handleToggleActive : undefined}
      />
    </div>
  );
}
