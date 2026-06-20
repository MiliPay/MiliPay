import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, UserPlus, LineChart, ShieldCheck } from 'lucide-react';

export default function Onboarding() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background Decorators */}
      <div className="absolute top-[-100px] left-[-100px] w-96 h-96 bg-biopay-teal rounded-full blur-[120px] opacity-20"></div>
      <div className="absolute bottom-[-100px] right-[-100px] w-96 h-96 bg-biopay-navy rounded-full blur-[120px] opacity-40"></div>
      
      <div className="glass-panel p-10 md:p-14 rounded-3xl w-[90%] max-w-lg flex flex-col items-center relative z-10">
        <div className="w-24 h-24 rounded-full bg-biopay-teal/10 flex items-center justify-center border border-biopay-teal/30 mb-8">
          <Fingerprint className="text-biopay-teal w-12 h-12" />
        </div>
        
        <h1 className="text-3xl font-bold text-white mb-3">BioPay Admin</h1>
        <p className="text-biopay-light/70 text-center mb-8 leading-relaxed">
          Securely manage agents, monitor transactions, and onboard new users with our state-of-the-art biometric platform.
        </p>

        <div className="w-full flex flex-col gap-4 mb-10">
          <FeatureItem icon={<UserPlus className="text-biopay-teal" />} text="User Registration" />
          <FeatureItem icon={<LineChart className="text-biopay-teal" />} text="Real-time Monitoring" />
          <FeatureItem icon={<ShieldCheck className="text-biopay-teal" />} text="Access Control" />
        </div>

        <button 
          onClick={() => navigate('/login')}
          className="w-full py-4 bg-biopay-teal hover:bg-biopay-dark transition-colors rounded-full text-white font-semibold text-lg shadow-[0_0_20px_rgba(20,184,166,0.3)]"
        >
          Get Started
        </button>
      </div>
    </div>
  );
}

function FeatureItem({ icon, text }: { icon: React.ReactNode, text: string }) {
  return (
    <div className="flex items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/5">
      {icon}
      <span className="font-medium text-white/90">{text}</span>
    </div>
  );
}
