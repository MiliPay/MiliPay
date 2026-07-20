import { Link } from 'react-router-dom';
import { Fingerprint, CreditCard, ShieldCheck, ArrowRight, Wallet, CheckCircle2 } from 'lucide-react';
import { FadeIn } from '../components/ui/FadeIn';

import { Customers } from './Customers';
import { Merchants } from './Merchants';
import { Agents } from './Agents';
import { About } from './About';

export function Home() {
  return (
    <div className="overflow-hidden">
      {/* Hero Section */}
      <section className="relative pt-20 pb-20 lg:pt-32 lg:pb-28 bg-gradient-to-br from-primary-light via-[#e8f5e9] to-[#e3f2fd]">
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-primary/10 blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-[380px] h-[380px] rounded-full bg-accent/8 blur-3xl pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            
            <FadeIn>
              <div className="mb-5 inline-flex items-center gap-2 bg-primary/10 border border-primary/25 text-primary-dark text-xs font-semibold px-3.5 py-1.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot"></span>
                The Next Generation Payment Network
              </div>
              
              <h1 className="text-[clamp(2.2rem,5vw,3.5rem)] font-extrabold leading-[1.15] tracking-tight text-gray-900 mb-6">
                Your Finger is<br />
                <span className="relative inline-block text-primary">
                  Your New Debit Card
                  <span className="absolute bottom-0.5 left-0 right-0 h-1 bg-gradient-to-r from-primary to-accent rounded-sm opacity-30"></span>
                </span>
              </h1>
              
              <p className="text-lg text-gray-600 mb-8 max-w-lg leading-relaxed">
                BioPay replaces Verve and Mastercard. We don't hold your money—we simply link up to 3 of your existing bank accounts to your fingerprint. Pay at supermarkets and restaurants with just a touch and your 4-digit PIN.
              </p>

              <div className="flex flex-wrap gap-4">
                <Link to="/customers" className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold text-sm px-7 py-3.5 rounded-xl transition-all shadow-[0_4px_20px_rgba(14,173,105,0.35)] hover:-translate-y-0.5">
                  See How it Works <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/merchants" className="inline-flex items-center justify-center gap-2 bg-white text-gray-700 font-semibold text-sm px-7 py-3.5 rounded-xl border-2 border-gray-200 hover:border-primary hover:text-primary transition-all hover:-translate-y-0.5">
                  For Supermarkets
                </Link>
              </div>
            </FadeIn>

            <FadeIn delay={200} className="relative hidden lg:block">
              {/* Abstract Illustration of the Gateway */}
              <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.08)] p-8 border border-gray-100">
                <div className="flex justify-between items-center mb-8 border-b border-gray-100 pb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Fingerprint className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">BioPay Gateway</h3>
                      <p className="text-xs text-green-600 font-medium tracking-wide">FINGERPRINT + PIN VERIFIED</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-display font-bold text-gray-900">₦12,500</p>
                    <p className="text-xs text-gray-400">Total at Shoprite</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Debit Source (Up to 3 Banks)</p>
                  
                  <div className="border-2 border-primary bg-primary/5 rounded-xl p-4 flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-orange-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">Guaranty Trust Bank</p>
                        <p className="text-xs text-gray-500">Savings •••• 0293</p>
                      </div>
                    </div>
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  </div>

                  <div className="border border-gray-100 rounded-xl p-4 flex items-center justify-between opacity-60">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                        <Wallet className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">Zenith Bank</p>
                        <p className="text-xs text-gray-500">Current •••• 5510</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating elements */}
              <div className="absolute -top-6 -right-6 bg-white rounded-xl shadow-lg p-3 flex items-center gap-3 animate-float border border-gray-50">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-900">100% Secure</p>
                  <p className="text-[10px] text-gray-500">No physical cards to steal</p>
                </div>
              </div>
            </FadeIn>

          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">How BioPay Works</h2>
            <p className="text-gray-500">A seamless integration between your unique fingerprint and your existing bank accounts.</p>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-8">
            <FadeIn delay={100} className="feature-card">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
                <Fingerprint className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">1. Register with an Agent</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Visit any verified BioPay agent with your NIN. They will capture your fingerprints and register your phone number into our secure network.
              </p>
            </FadeIn>

            <FadeIn delay={200} className="feature-card">
              <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mb-6">
                <CreditCard className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">2. Setup & Link Banks</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Receive your login password via SMS within 24 hours. Log into the app, set a custom 4-digit PIN, and securely link up to 3 of your bank accounts.
              </p>
            </FadeIn>

            <FadeIn delay={300} className="feature-card">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-6">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">3. Pay at Supermarkets</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                At checkout, scan your fingerprint on the merchant's BioPay scanner, input your 4-digit PIN, and the funds are instantly debited from your selected bank.
              </p>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Render Sub-pages inline for the complete home experience */}
      <div id="customers-section"><Customers /></div>
      <div id="merchants-section"><Merchants /></div>
      <div id="agents-section"><Agents /></div>
      <div id="about-section"><About /></div>
    </div>
  );
}
