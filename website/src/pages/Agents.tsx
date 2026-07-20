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
              Build your business as a BioPay Agent.
            </h1>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-10">
              Join our network of thousands of agents across Nigeria. Earn steady commissions by onboarding customers and capturing their biometric identities into the BioPay ecosystem.
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
              <p className="text-gray-600 text-sm">Receive your BioPay Agent tablet and biometric scanner setup.</p>
            </FadeIn>
            
            <FadeIn delay={200} className="text-center p-6">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-100">
                <TrendingUp className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">2. Enroll Customers</h3>
              <p className="text-gray-600 text-sm">Verify NINs and capture fingerprints securely for new customers in your community.</p>
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
    </div>
  );
}
