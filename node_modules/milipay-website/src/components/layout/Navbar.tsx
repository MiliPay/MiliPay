import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown } from 'lucide-react';
import { cn } from '../ui/FadeIn';

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const navItems = [
    { name: 'Home', path: '/' },
    { name: 'Customers', path: '/customers' },
    { name: 'Merchants', path: '/merchants' },
    { name: 'Agents', path: '/agents' },
    { name: 'Company', path: '/about' },
  ];

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b',
        isScrolled
          ? 'bg-[#020617]/95 backdrop-blur-md border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.5)] py-3'
          : 'bg-transparent border-transparent py-6'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        
        {/* Logo */}
        <Link to="/" className="flex items-center group relative h-12 w-32 -ml-2">
          <img src="/logo-main.png" alt="MiliPay Logo" className="absolute top-1/2 -translate-y-1/2 left-0 h-28 w-auto object-contain scale-125 origin-left" />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-8">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  'text-sm font-medium transition-all duration-200',
                  isActive ? 'text-emerald-400' : 'text-slate-300 hover:text-white'
                )}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden lg:flex items-center gap-4">
          <div className="relative group">
            <button className="flex items-center gap-2 text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-full transition-all shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:shadow-[0_0_25px_rgba(16,185,129,0.6)]">
              Get Started
              <ChevronDown className="w-4 h-4 transition-transform group-hover:rotate-180" />
            </button>
            <div className="absolute top-full right-0 mt-2 w-56 bg-[#0f172a]/95 backdrop-blur-xl rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.5)] border border-white/10 py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all transform origin-top-right scale-95 group-hover:scale-100">
              <Link to="/customers" className="block px-5 py-2.5 text-sm text-slate-300 hover:text-emerald-400 hover:bg-white/5">
                As a Customer
              </Link>
              <Link to="/merchants" className="block px-5 py-2.5 text-sm text-slate-300 hover:text-emerald-400 hover:bg-white/5">
                As a Merchant
              </Link>
              <Link to="/agents" className="block px-5 py-2.5 text-sm text-slate-300 hover:text-emerald-400 hover:bg-white/5">
                Become an Agent
              </Link>
            </div>
          </div>
        </div>

        {/* Mobile Toggle */}
        <button
          className="lg:hidden p-2 -mr-2 text-slate-300 hover:bg-white/5 rounded-xl transition-colors"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden absolute top-full left-0 right-0 bg-[#0f172a] border-b border-white/10 shadow-2xl px-4 py-4 flex flex-col gap-2">
          {navItems.map((item) => (
            <Link
              key={item.name}
              to={item.path}
              className={cn(
                'px-4 py-3 text-sm font-medium rounded-xl transition-colors',
                location.pathname === item.path
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-slate-300 hover:bg-white/5'
              )}
            >
              {item.name}
            </Link>
          ))}
          <div className="h-px bg-white/10 my-2" />
          <Link
            to="/customers"
            className="px-4 py-3 text-sm font-bold bg-emerald-500 text-white text-center rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.3)]"
          >
            Get Started
          </Link>
        </div>
      )}
    </header>
  );
}
