import { useState } from "react";
import { Search, AlertCircle, Clock, ShieldCheck, Activity } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@milipay/shared/components/ui/Button";

export function SupportDashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // In a real app, we'd navigate to a search results page or directly to the user if exact match
      navigate(`/customers/cus_1001`);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-ledger min-h-screen">
      <div className="max-w-5xl mx-auto p-8 space-y-10 pb-32">
        
        {/* Header Section */}
        <div className="text-center space-y-3 mt-10">
          <div className="w-16 h-16 bg-status-info/10 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[inset_0_0_20px_rgba(59,130,246,0.2)]">
            <Search className="w-8 h-8 text-status-info" />
          </div>
          <h1 className="text-4xl font-display text-ink tracking-tight">Global Customer Lookup</h1>
          <p className="text-ink-muted text-lg max-w-xl mx-auto">
            Search across the MiliPay network by NIN, Phone Number, or full name to assist customers.
          </p>
        </div>

        {/* Big Search Bar */}
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSearch} className="relative group">
            <div className="absolute inset-0 bg-status-info/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative flex items-center bg-white/[0.02] border border-white/[0.1] rounded-2xl p-2 backdrop-blur-xl transition-all focus-within:border-status-info/50 focus-within:bg-white/[0.04]">
              <div className="pl-4">
                <Search className="w-6 h-6 text-ink-muted group-focus-within:text-status-info transition-colors" />
              </div>
              <input
                type="text"
                className="flex-1 bg-transparent border-none px-4 py-4 text-lg text-ink placeholder-ink-faint outline-none font-display"
                placeholder="Enter NIN, Phone, or Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <Button type="submit" className="bg-status-info hover:bg-blue-400 text-white rounded-xl px-8 h-12 text-base shadow-[0_0_15px_rgba(59,130,246,0.3)] border border-blue-400/50">
                Search
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
              <span className="text-3xl font-display text-ink">124</span>
            </div>
          </div>
          
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl">
            <div className="w-10 h-10 rounded-full bg-status-warning/10 flex items-center justify-center mb-4 border border-status-warning/20">
              <Clock className="w-5 h-5 text-status-warning" />
            </div>
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider">Avg Resolution</h3>
            <div className="mt-2">
              <span className="text-3xl font-display text-ink">4.2h</span>
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl">
            <div className="w-10 h-10 rounded-full bg-status-ok/10 flex items-center justify-center mb-4 border border-status-ok/20">
              <ShieldCheck className="w-5 h-5 text-status-ok" />
            </div>
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider">KYC Escalations</h3>
            <div className="mt-2">
              <span className="text-3xl font-display text-ink">18</span>
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

      </div>
    </div>
  );
}
