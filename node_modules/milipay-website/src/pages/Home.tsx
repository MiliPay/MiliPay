import { Link } from 'react-router-dom';
import { Fingerprint, CreditCard, ShieldCheck, ArrowRight, CheckCircle2, Shield, Activity, Users, Lock } from 'lucide-react';
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
                Seed Stage Infrastructure
              </div>
              
              <h1 className="text-[clamp(2.2rem,5vw,3.5rem)] font-extrabold leading-[1.15] tracking-tight text-gray-900 mb-6">
                Authenticate the Person,<br />
                <span className="relative inline-block text-primary">
                  Not the Card
                  <span className="absolute bottom-0.5 left-0 right-0 h-1 bg-gradient-to-r from-primary to-accent rounded-sm opacity-30"></span>
                </span>
              </h1>
              
              <p className="text-lg text-gray-600 mb-8 max-w-lg leading-relaxed">
                MiliPay is a secure, non-custodial biometric gateway built for scale. We integrate directly with partner banks to authorize point-of-sale transactions via fingerprint and palm print, entirely eliminating card fraud, chargebacks, and checkout friction. Welcome to the future of financial identity.
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
              <div className="relative rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-hidden border border-gray-100 group">
                <img src="/images/hero_infrastructure.png" alt="MiliPay Secure Infrastructure" className="w-full h-auto object-cover scale-100 group-hover:scale-110 transition-transform duration-[1.5s]" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none"></div>
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
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">How MiliPay Works</h2>
            <p className="text-gray-500">A seamless integration between your unique fingerprint and your existing bank accounts.</p>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-8">
            <FadeIn delay={100} className="feature-card">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
                <Fingerprint className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">1. Agent-Mediated Enrollment</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Users are enrolled in-person by certified agents. We capture multi-modal biometrics and verify identity against national databases (NIMC) to eliminate synthetic fraud.
              </p>
            </FadeIn>

            <FadeIn delay={200} className="feature-card">
              <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mb-6">
                <CreditCard className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">2. Direct Bank Integration</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                MiliPay acts solely as an authentication layer. Users link their existing accounts, and all funds custody remains with regulated deposit-taking banks.
              </p>
            </FadeIn>

            <FadeIn delay={300} className="feature-card">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-6">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">3. Frictionless Settlement</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                At checkout, the merchant's MiliPay POS captures a live fingerprint and instantly routes a secure debit instruction to the partner bank for rapid settlement.
              </p>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* The MiliPay Advantage Section (From Project Document) */}
      <section className="py-24 bg-gray-50 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">The MiliPay Advantage</h2>
            <p className="text-gray-500">Built for trust, designed for speed. We are redefining the payment infrastructure of Nigeria without holding a single naira of your money.</p>
          </FadeIn>

          <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
            <FadeIn delay={100} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex gap-6 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex-shrink-0 flex items-center justify-center">
                <Shield className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Zero-Custody (Not a Wallet)</h3>
                <p className="text-gray-600 leading-relaxed text-sm">
                  We are an authentication layer, not a bank. MiliPay never holds your funds. We route payment instructions directly to your existing bank account, eliminating the friction of topping up a wallet or risking your deposits.
                </p>
              </div>
            </FadeIn>

            <FadeIn delay={200} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex gap-6 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex-shrink-0 flex items-center justify-center">
                <Activity className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Multi-Modal Biometrics</h3>
                <p className="text-gray-600 leading-relaxed text-sm">
                  Your fingerprint is the primary key. If that fails, our system seamlessly falls back to a palm print or a secure passcode. This multi-layered approach guarantees you can always complete your transaction.
                </p>
              </div>
            </FadeIn>

            <FadeIn delay={300} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex gap-6 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex-shrink-0 flex items-center justify-center">
                <Users className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Agent-Mediated Trust</h3>
                <p className="text-gray-600 leading-relaxed text-sm">
                  Identity assurance is critical. Every user is verified in person by a certified MiliPay agent who captures your National Identification Number (NIN) under controlled conditions, eliminating synthetic fraud.
                </p>
              </div>
            </FadeIn>

            <FadeIn delay={400} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex gap-6 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex-shrink-0 flex items-center justify-center">
                <Lock className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Bank-Grade Data Privacy</h3>
                <p className="text-gray-600 leading-relaxed text-sm">
                  We never store raw fingerprint images. Your biometrics are mathematically hashed into irreversible templates and heavily encrypted at rest, ensuring absolute privacy and security for all users.
                </p>
              </div>
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
