import { useEffect, useState } from "react";
import { Plus, Clock, CheckCircle2, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@milipay/shared/components/ui/Button";
import { Input } from "@milipay/shared/components/ui/Input";
import { fetchCustomers } from "@milipay/shared/features/customers/api";
import type { Customer } from "@milipay/shared/types";

export function AgentDashboard() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCustomers().then((res) => {
      setCustomers(res.items);
      setIsLoading(false);
    });
  }, []);

  return (
    <div className="flex-1 overflow-auto bg-ledger min-h-screen">
      <div className="max-w-5xl mx-auto p-8 space-y-8 pb-32">
        
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display text-ink tracking-tight">Agent Dashboard</h1>
            <p className="text-ink-muted mt-1">Manage your terminal and registrations.</p>
          </div>
          <Link to="/register">
            <Button className="gap-2 bg-signal text-white hover:bg-signal-bright shadow-[0_0_20px_rgba(var(--color-signal),0.3)] border border-signal-bright/50">
              <Plus className="w-5 h-5" />
              New Registration
            </Button>
          </Link>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl">
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider">Today's Registrations</h3>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-display text-ink">14</span>
              <span className="text-sm text-status-ok flex items-center gap-1">
                ↑ 12%
              </span>
            </div>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl">
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider">Pending KYC</h3>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-display text-status-warning">3</span>
            </div>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl">
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider">Success Rate</h3>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-display text-ink">98.5%</span>
            </div>
          </div>
        </div>

        {/* Registration History */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl backdrop-blur-xl overflow-hidden">
          <div className="p-6 border-b border-white/[0.05] flex items-center justify-between">
            <h2 className="text-xl font-medium text-ink tracking-tight">Registration History</h2>
            <div className="w-64 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <Input
                placeholder="Search NIN or name..."
                className="pl-9 bg-white/[0.03] border-white/[0.05]"
              />
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.05] bg-white/[0.01]">
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Customer</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">NIN</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Date</th>
                  <th className="p-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-ink-muted">Loading history...</td>
                  </tr>
                ) : customers?.slice(0, 5).map((customer) => (
                  <tr key={customer.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-4">
                      <div className="font-medium text-ink">{customer.fullName}</div>
                      <div className="text-sm text-ink-muted">{customer.phone}</div>
                    </td>
                    <td className="p-4 font-mono text-sm text-ink-muted">*** {customer.ninLast4}</td>
                    <td className="p-4 text-sm text-ink-muted">Today, 2:45 PM</td>
                    <td className="p-4">
                      {customer.status === "active" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-status-ok/10 text-status-ok border border-status-ok/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approved
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-status-warning/10 text-status-warning border border-status-warning/20">
                          <Clock className="w-3.5 h-3.5" />
                          Pending KYC
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
