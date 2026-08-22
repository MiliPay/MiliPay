import { ArrowLeft, User, ShieldCheck, Activity, Smartphone, CreditCard, ExternalLink } from "lucide-react";
import { Link, useParams } from "react-router-dom";

export function Customer360() {
  const { id } = useParams();

  // In a real app we would fetch the user details using `id`
  const mockCustomer = {
    id: id || "cus_1001",
    fullName: "Adeola Okafor",
    phone: "0801 234 5678",
    email: "adeola@example.com",
    nin: "45681190223",
    status: "Active",
    kycLevel: "Tier 3",
    registeredAt: "2026-06-18 09:00",
    registeredBy: "Agent #402 (Ikeja Terminal)",
  };

  return (
    <div className="flex-1 overflow-auto bg-ledger min-h-screen">
      <div className="max-w-5xl mx-auto p-8 space-y-8 pb-32">
        
        {/* Back navigation */}
        <div>
          <Link to="/" className="inline-flex items-center gap-2 text-ink-muted hover:text-ink transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to Search</span>
          </Link>
        </div>

        {/* Profile Header */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-8 backdrop-blur-xl flex flex-col md:flex-row gap-8 items-start md:items-center justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-status-info/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          
          <div className="flex items-center gap-6 relative z-10">
            <div className="w-20 h-20 rounded-full bg-status-info/10 border border-status-info/30 flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.15)]">
              <User className="w-10 h-10 text-status-info" />
            </div>
            <div>
              <h1 className="text-3xl font-display text-ink tracking-tight">{mockCustomer.fullName}</h1>
              <div className="flex items-center gap-4 mt-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-status-ok/10 text-status-ok border border-status-ok/20">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {mockCustomer.status}
                </span>
                <span className="text-sm text-ink-muted font-mono">{mockCustomer.phone}</span>
                <span className="text-sm text-ink-muted font-mono">{mockCustomer.nin}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-4 relative z-10">
            <button className="px-4 py-2 rounded-xl bg-status-fail/10 text-status-fail border border-status-fail/20 text-sm font-medium hover:bg-status-fail/20 transition-colors">
              Suspend Account
            </button>
            <button className="px-4 py-2 rounded-xl bg-white/[0.05] border border-white/[0.1] text-ink text-sm font-medium hover:bg-white/[0.1] transition-colors">
              Reset PIN / Password
            </button>
          </div>
        </div>

        {/* 360 Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Column 1: Details */}
          <div className="md:col-span-1 space-y-6">
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl">
              <h2 className="text-lg font-medium text-ink flex items-center gap-2 mb-4">
                <User className="w-5 h-5 text-ink-muted" />
                Enrollment Details
              </h2>
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-ink-muted mb-1">Email Address</dt>
                  <dd className="font-medium text-ink">{mockCustomer.email}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted mb-1">KYC Level</dt>
                  <dd className="font-medium text-ink">{mockCustomer.kycLevel}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted mb-1">Registration Date</dt>
                  <dd className="font-medium text-ink">{mockCustomer.registeredAt}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted mb-1">Registered By</dt>
                  <dd className="font-medium text-status-info flex items-center gap-1 cursor-pointer hover:underline">
                    {mockCustomer.registeredBy}
                    <ExternalLink className="w-3 h-3" />
                  </dd>
                </div>
              </dl>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl">
              <h2 className="text-lg font-medium text-ink flex items-center gap-2 mb-4">
                <Smartphone className="w-5 h-5 text-ink-muted" />
                Linked Devices
              </h2>
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">iPhone 14 Pro</p>
                    <p className="text-xs text-ink-muted">Last active: 2 hours ago</p>
                  </div>
                  <button className="text-xs text-status-fail hover:underline">Revoke</button>
                </div>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">Chrome on Windows</p>
                    <p className="text-xs text-ink-muted">Last active: 4 days ago</p>
                  </div>
                  <button className="text-xs text-status-fail hover:underline">Revoke</button>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2 & 3: Transactions & Activity */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 backdrop-blur-xl h-full">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-medium text-ink flex items-center gap-2">
                  <Activity className="w-5 h-5 text-ink-muted" />
                  Recent Transactions
                </h2>
                <button className="text-sm text-status-info hover:text-blue-400 transition-colors">
                  View Full Statement
                </button>
              </div>

              <div className="space-y-4">
                {[
                  { id: "TXN-001", type: "Transfer to Bank", amount: "-₦45,000", status: "Success", date: "Today, 10:24 AM", color: "text-ink" },
                  { id: "TXN-002", type: "Airtime Topup", amount: "-₦2,000", status: "Failed", date: "Yesterday, 14:10 PM", color: "text-ink" },
                  { id: "TXN-003", type: "Received from OPay", amount: "+₦150,000", status: "Success", date: "Jun 14, 09:00 AM", color: "text-status-ok" },
                  { id: "TXN-004", type: "POS Withdrawal", amount: "-₦10,000", status: "Success", date: "Jun 12, 16:45 PM", color: "text-ink" },
                ].map((txn) => (
                  <div key={txn.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.01] border border-white/[0.02] hover:bg-white/[0.03] transition-colors cursor-pointer group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-white/[0.05] flex items-center justify-center">
                        <CreditCard className="w-4 h-4 text-ink-muted" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-ink group-hover:text-status-info transition-colors">{txn.type}</p>
                        <p className="text-xs text-ink-muted font-mono">{txn.id} • {txn.date}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-display ${txn.color}`}>{txn.amount}</p>
                      <p className={`text-xs ${txn.status === "Success" ? "text-status-ok" : "text-status-fail"}`}>
                        {txn.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
