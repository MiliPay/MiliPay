import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Fingerprint, ChevronDown } from 'lucide-react';
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

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const navItems = [
    { name: 'Home', path: '/' },
    { name: 'For Customers', path: '/customers' },
    { name: 'For Merchants', path: '/merchants' },
    { name: 'For Agents', path: '/agents' },
    { name: 'About', path: '/about' },
  ];

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b',
        isScrolled
          ? 'bg-white/95 backdrop-blur-sm border-gray-100 shadow-sm py-3'
          : 'bg-white/80 backdrop-blur-sm border-transparent py-5'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Fingerprint className="w-6 h-6 text-primary" />
          </div>
          <span className="font-display font-bold text-2xl tracking-tight text-gray-900">
            BioPay
          </span>
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
                  'nav-link',
                  isActive && 'nav-link-active'
                )}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden lg:flex items-center gap-4">
          <a
            href="http://localhost:5175/login"
            className="text-sm font-semibold text-gray-600 hover:text-primary transition-colors px-4 py-2"
          >
            Sign In
          </a>
          <div className="relative group">
            <button className="flex items-center gap-2 text-sm font-semibold bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-xl transition-colors shadow-[0_4px_14px_rgba(14,173,105,0.25)]">
              Get Started
              <ChevronDown className="w-4 h-4 transition-transform group-hover:rotate-180" />
            </button>
            <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all transform origin-top-right scale-95 group-hover:scale-100">
              <Link to="/customers" className="block px-5 py-2.5 text-sm text-gray-600 hover:text-primary hover:bg-primary-light">
                As a Customer
              </Link>
              <Link to="/merchants" className="block px-5 py-2.5 text-sm text-gray-600 hover:text-primary hover:bg-primary-light">
                As a Merchant
              </Link>
              <hr className="my-1 border-gray-100" />
              <Link to="/agents" className="block px-5 py-2.5 text-sm text-gray-600 hover:text-primary hover:bg-primary-light">
                Become an Agent
              </Link>
            </div>
          </div>
        </div>

        {/* Mobile Toggle */}
        <button
          className="lg:hidden p-2 -mr-2 text-gray-600 hover:bg-gray-50 rounded-xl"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden absolute top-full left-0 right-0 bg-white border-b border-gray-100 shadow-lg px-4 py-4 flex flex-col gap-2">
          {navItems.map((item) => (
            <Link
              key={item.name}
              to={item.path}
              className={cn(
                'px-4 py-3 text-sm font-medium rounded-xl',
                location.pathname === item.path
                  ? 'bg-primary-light text-primary'
                  : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              {item.name}
            </Link>
          ))}
          <div className="h-px bg-gray-100 my-2" />
          <a
            href="http://localhost:5175/login"
            className="px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-xl"
          >
            Sign In
          </a>
          <Link
            to="/customers"
            className="px-4 py-3 text-sm font-semibold bg-primary text-white text-center rounded-xl"
          >
            Get Started
          </Link>
        </div>
      )}
    </header>
  );
}
