import { useState, useEffect } from "react";
import { Search, AlertCircle, Clock, ShieldCheck, Activity } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@milipay/shared/components/ui/Button";
import { fetchCustomers } from "@milipay/shared/features/customers/api";
import { fetchSupportTicketStats } from "@milipay/shared/features/support/api";
import { LiveChatQueue } from "@milipay/shared/components/support/LiveChatQueue";

export function SupportDashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [stats, setStats] = useState({ openComplaints: 0, escalations: 0, avgResolution: "N/A", isLoading: true });
  const navigate = useNavigate();

  useEffect(() => {
    fetchSupportTicketStats().then((data) => {
      setStats({ openComplaints: data.openComplaints, escalations: data.escalations, avgResolution: data.avgResolution, isLoading: false });
    });
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || isSearching) return;
    
    setIsSearching(true);
    try {
      const res = await fetchCustomers({ search: searchQuery.trim(), pageSize: 2 });
      if (res.items.length === 1) {
        // Direct hit, go straight to customer
        navigate(`/customers/${res.items[0].id}`);
      } else {
        // Multiple or zero hits, go to customers page with query
        navigate(`/customers?search=${encodeURIComponent(searchQuery.trim())}`);
      }
    } catch (err) {
      console.error(err);
      navigate(`/customers?search=${encodeURIComponent(searchQuery.trim())}`);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-ledger min-h-screen">
      <div className="max-w-5xl mx-auto p-8 space-y-10 pb-32">
        
        {/* Header Section */}
        <div className="text-center space-y-3 mt-10">
          <div className="w-16 h-16 bg-signal/10 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[inset_0_0_20px_rgba(0,200,150,0.2)]">
            <Search className="w-8 h-8 text-signal-bright" />
          </div>
          <h1 className="text-4xl font-display text-white tracking-tight">Global Customer Lookup</h1>
          <p className="text-ink-muted text-lg max-w-xl mx-auto">
            Search across the MiliPay network by NIN, Phone Number, or full name to assist customers.
          </p>
        </div>

        {/* Big Search Bar */}
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSearch} className="relative group">
            <div className="absolute inset-0 bg-signal/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative flex items-center bg-white/[0.02] border border-white/[0.1] rounded-2xl p-2 backdrop-blur-xl transition-all focus-within:border-signal/50 focus-within:bg-white/[0.04]">
              <div className="pl-4">
                <Search className="w-6 h-6 text-ink-muted group-focus-within:text-signal-bright transition-colors" />
              </div>
              <input
                type="text"
                className="flex-1 bg-transparent border-none px-4 py-4 text-lg text-white placeholder-ink-faint outline-none font-display"
                placeholder="Enter NIN, Phone, or Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <Button type="submit" disabled={isSearching} className="bg-signal hover:brightness-110 text-white rounded-xl px-8 h-12 text-base shadow-[0_0_15px_rgba(0,200,150,0.3)] border border-signal-bright/50">
                {isSearching ? "Searching..." : "Search"}
              </Button>
            </div>
          </form>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-10 border-t border-white/[0.05]">
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl">
            <div className="w-10 h-10 rounded-full bg-status-fail/10 flex items-center justify-center mb-4 border border-status-fail/20">
              <AlertCircle className="w-5 h-5 text-status-fail" />
            </div>
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider">Open Complaints</h3>
            <div className="mt-2">
              <span className="text-3xl font-display text-ink">{stats.isLoading ? "-" : stats.openComplaints}</span>
            </div>
          </div>
          
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl">
            <div className="w-10 h-10 rounded-full bg-status-warning/10 flex items-center justify-center mb-4 border border-status-warning/20">
              <Clock className="w-5 h-5 text-status-warning" />
            </div>
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider">Avg Resolution</h3>
            <div className="mt-2">
              <span className="text-3xl font-display text-ink">{stats.isLoading ? "-" : stats.avgResolution}</span>
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl">
            <div className="w-10 h-10 rounded-full bg-status-ok/10 flex items-center justify-center mb-4 border border-status-ok/20">
              <ShieldCheck className="w-5 h-5 text-status-ok" />
            </div>
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider">KYC Escalations</h3>
            <div className="mt-2">
              <span className="text-3xl font-display text-ink">{stats.isLoading ? "-" : stats.escalations}</span>
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl">
            <div className="w-10 h-10 rounded-full bg-signal/10 flex items-center justify-center mb-4 border border-signal/20">
              <Activity className="w-5 h-5 text-signal" />
            </div>
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider">Network Status</h3>
            <div className="mt-2">
              <span className="text-xl font-display text-status-ok">All Systems Go</span>
            </div>
          </div>
        </div>

        {/* Live Chat Queue Addition */}
        <div className="pt-6 h-[500px]">
           <LiveChatQueue routePrefix="/complaints" />
        </div>

      </div>
    </div>
  );
}
