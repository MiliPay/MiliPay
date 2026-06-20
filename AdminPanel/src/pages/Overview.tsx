import React from 'react';
import { Users, CreditCard, TrendingUp, Activity } from 'lucide-react';

export default function Overview() {
  return (
    <div className="p-6 md:p-10 pb-24 md:pb-10 max-w-7xl mx-auto">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard Overview</h1>
        <p className="text-biopay-light/60">Monitor your system performance and daily metrics.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard title="Total Users" value="21,489" icon={<Users />} change="+6.2%" color="bg-biopay-teal" textColor="text-biopay-teal" />
        <StatCard title="Transactions" value="14,912" icon={<CreditCard />} change="+12.5%" color="bg-blue-500" textColor="text-blue-400" />
        <StatCard title="Revenue (MTD)" value="$289,350" icon={<TrendingUp />} change="+15%" color="bg-purple-500" textColor="text-purple-400" />
        <StatCard title="System Health" value="99.98%" icon={<Activity />} change="Operational" color="bg-emerald-500" textColor="text-emerald-400" />
      </div>

      <div>
        <h2 className="text-xl font-bold text-white mb-6">Recent Activity</h2>
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
          <div className="flex flex-col">
            <ActivityRow user="Alex Chen" amount="$20.00" status="Success" time="10:03:30 AM" />
            <ActivityRow user="Sarah Smith" amount="$150.00" status="Success" time="09:45:12 AM" />
            <ActivityRow user="John Doe" amount="$45.00" status="Failed" time="09:12:05 AM" />
            <ActivityRow user="Lana Rhodes" amount="$24.00" status="Success" time="08:30:00 AM" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, change, color, textColor }: { title: string, value: string, icon: React.ReactNode, change: string, color: string, textColor: string }) {
  return (
    <div className="glass-panel p-6 rounded-2xl border border-white/5 relative overflow-hidden group hover:border-white/10 transition-colors">
      <div className={`absolute top-0 right-0 w-32 h-32 ${color} rounded-full blur-[80px] opacity-20 group-hover:opacity-30 transition-opacity`}></div>
      <div className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-6 ${textColor}`}>
        {icon}
      </div>
      <h3 className="text-3xl font-bold text-white mb-1">{value}</h3>
      <div className="flex justify-between items-end">
        <p className="text-sm text-biopay-light/60 font-medium">{title}</p>
        <span className={`text-xs font-semibold px-2 py-1 rounded-md bg-white/5 ${change === 'Failed' ? 'text-red-400' : 'text-emerald-400'}`}>
          {change}
        </span>
      </div>
    </div>
  );
}

function ActivityRow({ user, amount, status, time }: { user: string, amount: string, status: string, time: string }) {
  const isSuccess = status === 'Success';
  return (
    <div className="flex items-center justify-between p-5 border-b border-white/5 hover:bg-white/[0.02] transition-colors last:border-b-0">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-biopay-teal/20 flex items-center justify-center border border-biopay-teal/30">
          <span className="text-biopay-teal font-bold">{user.charAt(0)}</span>
        </div>
        <div>
          <p className="font-semibold text-white">{user}</p>
          <p className="text-xs text-white/50">{time}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-bold text-white">{amount}</p>
        <p className={`text-xs font-semibold ${isSuccess ? 'text-emerald-400' : 'text-red-400'}`}>{status}</p>
      </div>
    </div>
  );
}
