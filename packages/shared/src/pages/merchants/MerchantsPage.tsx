import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Store,
  Plus,
  Building2,
  CheckCircle2,
  Cpu,
  Search,
  Filter,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
  UserCheck,
} from "lucide-react";
import { Button } from "@milipay/shared/components/ui/Button";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { ROUTES } from "@milipay/shared/lib/constants";
import { fetchMerchants, MERCHANT_CATEGORIES } from "@milipay/shared/features/merchants/merchantService";
import type { Merchant } from "@milipay/shared/types";

export default function MerchantsPage() {
  const navigate = useNavigate();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const loadMerchants = async () => {
    try {
      setLoading(true);
      const data = await fetchMerchants({
        search,
        category: selectedCategory,
        status: selectedStatus,
      });
      setMerchants(data);
    } catch (err) {
      console.error("Failed to load merchants:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMerchants();
  }, [selectedCategory, selectedStatus]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadMerchants();
  };

  const totalMerchants = merchants.length;
  const activeMerchants = merchants.filter((m) => m.status === "active").length;
  const totalTerminals = merchants.reduce((sum, m) => sum + (m.terminalCount || 0), 0);
  const activeTerminals = merchants.reduce((sum, m) => sum + (m.activeTerminalCount || 0), 0);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto animate-rise-in space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Store className="w-5 h-5 text-signal-bright" />
            <span className="text-xs font-semibold uppercase tracking-wider text-signal-bright">
              Enterprise Network
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold text-ink">Merchants & Terminals</h1>
          <p className="text-sm text-ink-muted mt-1">
            Monitor verified businesses, POS hardware allocations, and automated Mono settlements.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={loadMerchants}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="primary"
            onClick={() => navigate(ROUTES.registerMerchant || "/dashboard/register/merchant")}
          >
            <Plus className="w-4 h-4 mr-2" />
            Register Merchant
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-ledger-raised border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Merchants</span>
            <Building2 className="w-4 h-4 text-signal-bright" />
          </div>
          <div className="text-2xl font-bold font-data text-white">{totalMerchants}</div>
          <p className="text-xs text-status-ok mt-1 flex items-center gap-1 font-mono">
            <CheckCircle2 className="w-3 h-3" /> {activeMerchants} Active Partners
          </p>
        </div>

        <div className="bg-ledger-raised border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Deployed Terminals</span>
            <Cpu className="w-4 h-4 text-status-info" />
          </div>
          <div className="text-2xl font-bold font-data text-white">{totalTerminals}</div>
          <p className="text-xs text-ink-muted mt-1 font-mono">
            {activeTerminals} online / verified
          </p>
        </div>

        <div className="bg-ledger-raised border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Mono Settlement Rail</span>
            <ShieldCheck className="w-4 h-4 text-status-ok" />
          </div>
          <div className="text-2xl font-bold font-data text-white">DirectPay</div>
          <p className="text-xs text-status-ok mt-1 font-mono">100% Automated T+0 Split</p>
        </div>

        <div className="bg-ledger-raised border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Default Platform Fee</span>
            <Store className="w-4 h-4 text-signal" />
          </div>
          <div className="text-2xl font-bold font-data text-white">1.50%</div>
          <p className="text-xs text-ink-muted mt-1 font-mono">MiliPay Platform Take-Rate</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-ledger-raised border border-white/[0.06] rounded-xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-ink-faint absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search by store name or account..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/[0.03] border border-ledger-line2 rounded-lg text-sm text-ink outline-none focus:border-signal/60"
          />
        </form>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-ink-faint" />
            <span className="text-xs text-ink-muted uppercase tracking-wider font-semibold">
              Category:
            </span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-white/[0.03] border border-ledger-line2 text-xs rounded-lg px-3 py-1.5 text-ink outline-none"
            >
              <option value="all" className="bg-ledger">
                All Categories
              </option>
              {MERCHANT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value} className="bg-ledger">
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted uppercase tracking-wider font-semibold">
              Status:
            </span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-white/[0.03] border border-ledger-line2 text-xs rounded-lg px-3 py-1.5 text-ink outline-none"
            >
              <option value="all" className="bg-ledger">
                All Status
              </option>
              <option value="active" className="bg-ledger">
                Active
              </option>
              <option value="suspended" className="bg-ledger">
                Suspended
              </option>
              <option value="blacklisted" className="bg-ledger">
                Blacklisted
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* Merchants Table / Content */}
      <div className="bg-ledger-raised border border-white/[0.06] rounded-xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12">
            <LoadingState title="Loading Merchants" description="Retrieving registered retail partners..." />
          </div>
        ) : merchants.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/[0.08] flex items-center justify-center mx-auto mb-4">
              <Store className="w-6 h-6 text-ink-faint" />
            </div>
            <h3 className="text-lg font-bold text-ink mb-1">No Merchants Found</h3>
            <p className="text-sm text-ink-muted mb-6 max-w-sm mx-auto">
              No registered merchants match your current search or filters. Onboard a new business to get started.
            </p>
            <Button
              variant="primary"
              onClick={() => navigate(ROUTES.registerMerchant || "/dashboard/register/merchant")}
            >
              <Plus className="w-4 h-4 mr-2" />
              Register First Merchant
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.02] border-b border-white/[0.06] text-xs font-semibold text-ink-muted uppercase tracking-wider font-mono">
                <tr>
                  <th className="py-4 px-6">Business Name</th>
                  <th className="py-4 px-6">Category</th>
                  <th className="py-4 px-6">Settlement Bank & NUBAN</th>
                  <th className="py-4 px-6">POS Terminals</th>
                  <th className="py-4 px-6">Onboarded By (Audit)</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {merchants.map((merchant) => (
                  <tr
                    key={merchant.id}
                    className="hover:bg-white/[0.02] transition-colors cursor-pointer group"
                    onClick={() => navigate(`/dashboard/merchants/${merchant.id}`)}
                  >
                    <td className="py-4 px-6">
                      <div className="font-semibold text-white group-hover:text-signal transition-colors">
                        {merchant.businessName}
                      </div>
                      <div className="text-xs text-ink-muted mt-0.5">
                        {merchant.address}, {merchant.state}
                      </div>
                    </td>

                    <td className="py-4 px-6">
                      <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-medium uppercase tracking-wider bg-white/[0.04] border border-white/[0.08] text-ink">
                        {merchant.category}
                      </span>
                    </td>

                    <td className="py-4 px-6 font-mono">
                      <div className="text-xs text-white font-medium flex items-center gap-1.5">
                        {merchant.settlementBankName}
                        <ShieldCheck className="w-3.5 h-3.5 text-status-ok" />
                      </div>
                      <div className="text-xs text-ink-muted mt-0.5">
                        {merchant.settlementAccountNumber} • {merchant.settlementAccountName}
                      </div>
                    </td>

                    <td className="py-4 px-6 font-mono">
                      <div className="flex items-center gap-2">
                        <span className="text-signal-bright font-bold">
                          {merchant.terminalCount || 0}
                        </span>
                        <span className="text-xs text-ink-muted">terminals</span>
                      </div>
                    </td>

                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-signal shrink-0" />
                        <div className="text-xs">
                          <span className="text-white font-medium block">
                            {merchant.onboardedByName || "MiliPay Staff"}
                          </span>
                          {merchant.onboardedByRole && (
                            <span className="text-[10px] text-ink-muted block uppercase font-mono tracking-wider">
                              {merchant.onboardedByRole}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-6">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
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
                    </td>

                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/dashboard/merchants/${merchant.id}`);
                        }}
                        className="p-2 rounded-lg bg-white/[0.03] hover:bg-signal/10 hover:text-signal text-ink-muted transition-colors"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
