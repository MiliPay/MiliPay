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

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const navItems = [
    { name: 'Home', path: '/' },
    { name: 'Technology', path: '/customers' },
    { name: 'For Merchants', path: '/merchants' },
    { name: 'Trust & Identity', path: '/agents' },
    { name: 'Company', path: '/about' },
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
        <Link to="/" className="flex items-center group relative h-12 w-32 -ml-2">
          <img src="/main.png" alt="MiliPay Logo" className="absolute top-1/2 -translate-y-1/2 left-0 h-28 w-auto object-contain scale-125 origin-left" />
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
              <Link to="/about" className="block px-5 py-2.5 text-sm text-gray-600 hover:text-primary hover:bg-primary-light">
                Partner with Us
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
          <Link
            to="/about"
            className="px-4 py-3 text-sm font-semibold bg-primary text-white text-center rounded-xl"
          >
            Partner with Us
          </Link>
        </div>
      )}
    </header>
  );
}
