import { FadeIn } from '../components/ui/FadeIn';
import { Users, Briefcase, TrendingUp, Award } from 'lucide-react';

export function Agents() {
  return (
    <div className="overflow-hidden">
      {/* Hero Section */}
      <section className="pt-20 pb-16 bg-gray-900 text-center text-white">
        <div className="max-w-4xl mx-auto px-4">
          <FadeIn>
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Users className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold mb-6">
              The Frontline of Identity Assurance.
            </h1>
            <p className="text-lg text-gray-400 max-w-3xl mx-auto mb-10 leading-relaxed">
              MiliPay agents form the foundation of our trusted network. Join as a certified agent to perform strict, in-person biometric capture and National Identity (NIN) verification, ensuring absolute security for every enrolled user. As an agent, you become the crucial human bridge connecting unbanked and banked citizens alike to the most secure financial infrastructure in Africa. Your diligence guarantees that synthetic fraud never enters our ecosystem.
            </p>
            <a href="http://localhost:5174/login" className="inline-block bg-primary hover:bg-primary-dark text-white font-bold px-8 py-4 rounded-xl transition-all shadow-[0_4px_20px_rgba(14,173,105,0.3)]">
              Agent Portal Login
            </a>
          </FadeIn>
        </div>
      </section>

      {/* Steps to Earn */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">How You Earn</h2>
          </FadeIn>
          <div className="grid md:grid-cols-3 gap-8">
            <FadeIn delay={100} className="text-center p-6">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100">
                <Briefcase className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">1. Get the Gear</h3>
              <p className="text-gray-600 text-sm">Receive your MiliPay Agent tablet and biometric scanner setup.</p>
            </FadeIn>
            
            <FadeIn delay={200} className="text-center p-6">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-100">
                <TrendingUp className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">2. Secure Enrollment</h3>
              <p className="text-gray-600 text-sm">Verify NINs against the NIMC database and capture multi-modal biometrics (Fingerprint + Palm print) under controlled conditions.</p>
            </FadeIn>

            <FadeIn delay={300} className="text-center p-6">
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-100">
                <Award className="w-8 h-8 text-amber-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">3. Earn Commissions</h3>
              <p className="text-gray-600 text-sm">Get paid instantly for every successful customer enrollment you complete.</p>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Agent Hardware Showcase */}
      <section className="py-20 bg-gray-50 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <FadeIn>
              <div className="rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.1)] overflow-hidden border border-gray-200">
                <img src="/images/agent_enrollment.png" alt="MiliPay Agent Enrollment Process" className="w-full h-auto object-cover hover:scale-105 transition-transform duration-700" />
              </div>
            </FadeIn>
            <FadeIn delay={200}>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Equipped for Absolute Trust</h2>
              <p className="text-gray-600 text-lg leading-relaxed mb-6">
                When you become a MiliPay agent, you are provided with our enterprise-grade biometric enrollment tablet. This is not a standard mobile device—it is a hardened, certified instrument capable of capturing ultra-high-resolution multi-modal biometrics (fingerprints and palm prints). 
              </p>
              <p className="text-gray-600 text-lg leading-relaxed">
                The hardware interfaces directly with the National Identity Management Commission (NIMC) database via our secure API. This ensures that every customer you onboard is verified against their official government records before their biometric template is securely hashed and stored in our decentralized vault.
              </p>
            </FadeIn>
          </div>
        </div>
      </section>
    </div>
  );
}
