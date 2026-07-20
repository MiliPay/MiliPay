import { Link } from 'react-router-dom';
import { Fingerprint, Twitter, Linkedin, Github } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-gray-900 text-white pt-20 pb-10 border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          
          <div className="md:col-span-1 space-y-4">
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
                <Fingerprint className="w-6 h-6 text-primary" />
              </div>
              <span className="font-display font-bold text-2xl tracking-tight">
                BioPay
              </span>
            </Link>
            <p className="text-gray-400 text-sm leading-relaxed max-w-xs">
              Nigeria's first biometric payment gateway. Link your accounts, pay with your fingerprint, and leave your cards at home.
            </p>
            <div className="flex items-center gap-4 pt-2">
              <a href="#" className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white hover:bg-primary transition-colors">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="#" className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white hover:bg-primary transition-colors">
                <Linkedin className="w-4 h-4" />
              </a>
              <a href="#" className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white hover:bg-primary transition-colors">
                <Github className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-4 text-white">Product</h3>
            <ul className="space-y-3">
              <li><Link to="/customers" className="text-gray-400 hover:text-primary transition-colors text-sm">For Customers</Link></li>
              <li><Link to="/merchants" className="text-gray-400 hover:text-primary transition-colors text-sm">For Merchants</Link></li>
              <li><Link to="/agents" className="text-gray-400 hover:text-primary transition-colors text-sm">Agent Network</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4 text-white">Company</h3>
            <ul className="space-y-3">
              <li><Link to="/about" className="text-gray-400 hover:text-primary transition-colors text-sm">About Us</Link></li>
              <li><a href="#" className="text-gray-400 hover:text-primary transition-colors text-sm">Careers</a></li>
              <li><a href="#" className="text-gray-400 hover:text-primary transition-colors text-sm">Press</a></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4 text-white">Legal</h3>
            <ul className="space-y-3">
              <li><a href="#" className="text-gray-400 hover:text-primary transition-colors text-sm">Privacy Policy</a></li>
              <li><a href="#" className="text-gray-400 hover:text-primary transition-colors text-sm">Terms of Service</a></li>
              <li><a href="#" className="text-gray-400 hover:text-primary transition-colors text-sm">Security</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-gray-800 text-center flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} BioPay Technologies. All rights reserved.
          </p>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            All Systems Operational
          </div>
        </div>
      </div>
    </footer>
  );
}
