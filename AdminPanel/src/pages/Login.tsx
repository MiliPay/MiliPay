import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, KeyRound, Phone } from 'lucide-react';
import { useAuth, type Role } from '../AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock login logic - assigns role based on input for demonstration
    let role: Role = 'agent';
    if (phone === 'admin') role = 'admin';
    if (phone === 'super') role = 'super_admin';
    
    login(role);
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background Decorators */}
      <div className="absolute top-[-150px] right-[-50px] w-[500px] h-[500px] bg-biopay-teal rounded-full blur-[150px] opacity-10"></div>
      <div className="absolute bottom-[-150px] left-[-50px] w-[500px] h-[500px] bg-biopay-navy rounded-full blur-[150px] opacity-30"></div>
      
      <div className="glass-panel p-10 md:p-14 rounded-3xl w-[90%] max-w-md relative z-10">
        <div className="flex justify-center mb-8">
          <Shield className="text-biopay-teal w-16 h-16" />
        </div>
        
        <h1 className="text-2xl font-bold text-center text-white mb-2">Welcome Back</h1>
        <p className="text-center text-biopay-light/60 mb-8 text-sm">Enter your credentials to access the portal</p>

        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-biopay-light/80 ml-1">Phone Number / ID</label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-biopay-light/40" />
              <input 
                type="text" 
                placeholder="e.g. 08012345678" 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-white/30 focus:outline-none focus:border-biopay-teal/50 focus:ring-1 focus:ring-biopay-teal/50 transition-all"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-biopay-light/80 ml-1">Password</label>
            <div className="relative">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-biopay-light/40" />
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-white/30 focus:outline-none focus:border-biopay-teal/50 focus:ring-1 focus:ring-biopay-teal/50 transition-all"
              />
            </div>
          </div>

          <button 
            type="submit"
            className="w-full py-4 mt-4 bg-biopay-teal hover:bg-biopay-dark transition-colors rounded-xl text-white font-semibold shadow-[0_4px_14px_rgba(20,184,166,0.25)]"
          >
            Secure Login
          </button>
        </form>
      </div>
    </div>
  );
}
