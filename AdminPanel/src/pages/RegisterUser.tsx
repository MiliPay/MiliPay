import React, { useState } from 'react';
import { Fingerprint, CheckCircle2 } from 'lucide-react';

export default function RegisterUser() {
  const [form, setForm] = useState({ name: '', phone: '', bvn: '', nin: '' });
  const [isScanning, setIsScanning] = useState(false);
  const [isScanned, setIsScanned] = useState(false);

  const handleScan = () => {
    setIsScanning(true);
    // Simulate biometric scan
    setTimeout(() => {
      setIsScanning(false);
      setIsScanned(true);
    }, 2000);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone || !form.bvn) {
      alert('Please fill in all required fields.');
      return;
    }
    if (!isScanned) {
      alert('Biometric capture is required.');
      return;
    }
    alert('User registered and sent to Firebase securely.');
    setForm({ name: '', phone: '', bvn: '', nin: '' });
    setIsScanned(false);
  };

  return (
    <div className="p-6 md:p-10 pb-24 md:pb-10 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Register New User</h1>
        <p className="text-biopay-light/60">Capture user details and register their biometric signature.</p>
      </div>

      <div className="glass-panel p-6 md:p-10 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden">
        {/* Subtle glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-biopay-teal rounded-full blur-[100px] opacity-10 pointer-events-none"></div>

        <form onSubmit={handleRegister} className="flex flex-col gap-6 relative z-10">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-white/70 ml-1">Full Name *</label>
              <input 
                type="text" 
                placeholder="John Doe" 
                value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-white/30 focus:outline-none focus:border-biopay-teal/50 focus:ring-1 focus:ring-biopay-teal/50 transition-all"
              />
            </div>
            
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-white/70 ml-1">Phone Number *</label>
              <input 
                type="tel" 
                placeholder="08012345678" 
                value={form.phone}
                onChange={e => setForm({...form, phone: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-white/30 focus:outline-none focus:border-biopay-teal/50 focus:ring-1 focus:ring-biopay-teal/50 transition-all"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-white/70 ml-1">BVN (Bank Verification Number) *</label>
              <input 
                type="text" 
                placeholder="12345678901" 
                value={form.bvn}
                onChange={e => setForm({...form, bvn: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-white/30 focus:outline-none focus:border-biopay-teal/50 focus:ring-1 focus:ring-biopay-teal/50 transition-all"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-white/70 ml-1">NIN (Optional)</label>
              <input 
                type="text" 
                placeholder="National ID" 
                value={form.nin}
                onChange={e => setForm({...form, nin: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-white/30 focus:outline-none focus:border-biopay-teal/50 focus:ring-1 focus:ring-biopay-teal/50 transition-all"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="text-sm font-medium text-white/70 ml-1 block mb-3">Biometric Capture *</label>
            <button
              type="button"
              onClick={handleScan}
              className={`w-full h-40 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-all ${
                isScanned 
                  ? 'border-emerald-500 bg-emerald-500/10' 
                  : isScanning 
                    ? 'border-biopay-teal bg-biopay-teal/10' 
                    : 'border-white/20 bg-white/5 hover:border-biopay-teal/50 hover:bg-white/10'
              }`}
            >
              {isScanned ? (
                <>
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-2" />
                  <span className="text-emerald-500 font-medium">Fingerprint Captured Successfully</span>
                </>
              ) : isScanning ? (
                <>
                  <Fingerprint className="w-12 h-12 text-biopay-teal mb-2 animate-pulse" />
                  <span className="text-biopay-teal font-medium">Scanning biometric data...</span>
                </>
              ) : (
                <>
                  <Fingerprint className="w-12 h-12 text-white/40 mb-2" />
                  <span className="text-white/60 font-medium">Click to initialize fingerprint scanner</span>
                </>
              )}
            </button>
          </div>

          <button 
            type="submit"
            className="w-full py-4 mt-6 bg-biopay-teal hover:bg-biopay-dark transition-colors rounded-xl text-white font-semibold text-lg shadow-[0_4px_14px_rgba(20,184,166,0.25)]"
          >
            Complete Registration
          </button>
        </form>
      </div>
    </div>
  );
}
