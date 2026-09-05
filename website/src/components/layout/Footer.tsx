import { Link } from 'react-router-dom';
import { Twitter, Linkedin, Github } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-[#020617] text-white pt-20 pb-10 border-t border-white/5 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          
          <div className="md:col-span-1 space-y-4">
            <Link to="/" className="flex items-center group mb-4 relative h-12 w-32 -ml-2">
              <img src="/logo-main.png" alt="MiliPay Logo" className="absolute top-1/2 -translate-y-1/2 left-0 h-28 w-auto object-contain scale-125 origin-left" />
            </Link>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
              Africa's most secure biometric payment infrastructure. We connect identity directly to bank ledgers, eliminating card networks and fraud.
            </p>
            <div className="flex items-center gap-4 pt-2">
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:border-emerald-400/50 transition-all">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:border-emerald-400/50 transition-all">
                <Linkedin className="w-4 h-4" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:border-emerald-400/50 transition-all">
                <Github className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-4 text-white">Product</h3>
            <ul className="space-y-3">
              <li><Link to="/customers" className="text-slate-400 hover:text-emerald-400 transition-colors text-sm">Technology</Link></li>
              <li><Link to="/merchants" className="text-slate-400 hover:text-emerald-400 transition-colors text-sm">For Merchants</Link></li>
              <li><Link to="/agents" className="text-slate-400 hover:text-emerald-400 transition-colors text-sm">Trust & Identity Network</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4 text-white">Company</h3>
            <ul className="space-y-3">
              <li><Link to="/about" className="text-slate-400 hover:text-emerald-400 transition-colors text-sm">About Us</Link></li>
              <li><a href="#" className="text-slate-400 hover:text-emerald-400 transition-colors text-sm">Careers</a></li>
              <li><a href="#" className="text-slate-400 hover:text-emerald-400 transition-colors text-sm">Press</a></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4 text-white">Legal</h3>
            <ul className="space-y-3">
              <li><a href="#" className="text-slate-400 hover:text-emerald-400 transition-colors text-sm">Privacy Policy</a></li>
              <li><a href="#" className="text-slate-400 hover:text-emerald-400 transition-colors text-sm">Terms of Service</a></li>
              <li><a href="#" className="text-slate-400 hover:text-emerald-400 transition-colors text-sm">Security</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-white/5 text-center flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            &copy; {new Date().getFullYear()} MiliPay Technologies. All rights reserved.
          </p>
          <div className="flex items-center gap-2 text-sm text-slate-500 bg-white/5 px-4 py-2 rounded-full border border-white/5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,1)]"></span>
            All Systems Operational
          </div>
        </div>
      </div>
    </footer>
  );
}
