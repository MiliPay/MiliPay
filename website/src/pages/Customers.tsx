import { FadeIn } from '../components/ui/FadeIn';
import { Fingerprint, Landmark, ArrowRight, ShieldCheck, Lock, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Customers() {
  return (
    <div className="overflow-hidden">
      {/* Hero Section */}
      <section className="pt-20 pb-16 bg-gradient-to-b from-primary-light/50 to-white text-center">
        <div className="max-w-4xl mx-auto px-4">
          <FadeIn>
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-6">
              Your Banks, United.
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-10">
              Link up to 3 of your bank accounts to your unique fingerprint. Never worry about forgotten cards or carrying cash to the supermarket again.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* Account Linking Visualization */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-4">
          <FadeIn delay={200} className="relative">
            <div className="bg-gray-50 rounded-3xl p-8 md:p-12 border border-gray-100 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl"></div>
              
              <div className="flex flex-col md:flex-row items-center justify-between gap-12 relative z-10">
                <div className="flex-1 space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900">Your Unified Financial App</h2>
                  <p className="text-gray-600">
                    After registering at an agent, you'll receive a password via SMS. Log in, secure your app with FaceID, and choose your 4-digit payment PIN. Then, link up to 3 bank accounts.
                  </p>
                  <ul className="space-y-3">
                    <li className="flex items-center gap-3 text-sm text-gray-700">
                      <Smartphone className="w-5 h-5 text-primary" /> View balances and account numbers only
                    </li>
                    <li className="flex items-center gap-3 text-sm text-gray-700">
                      <Lock className="w-5 h-5 text-primary" /> Bank-grade encryption ensures safety
                    </li>
                    <li className="flex items-center gap-3 text-sm text-gray-700">
                      <ShieldCheck className="w-5 h-5 text-primary" /> BioPay never holds your money
                    </li>
                  </ul>
                </div>

                <div className="flex-1 w-full max-w-sm">
                  <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-gray-900">Linked Accounts</span>
                      <span className="text-xs text-gray-500 font-medium">2 / 3 Used</span>
                    </div>

                    <div className="border border-green-200 bg-green-50 rounded-xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Landmark className="w-6 h-6 text-green-600" />
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">Guaranty Trust Bank</p>
                          <p className="text-xs text-gray-500">Balance: ₦45,000</p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-md">Default</span>
                    </div>

                    <div className="border border-gray-100 bg-white rounded-xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Landmark className="w-6 h-6 text-gray-400" />
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">First Bank</p>
                          <p className="text-xs text-gray-500">Balance: ₦12,400</p>
                        </div>
                      </div>
                    </div>
                    
                    <button className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 font-medium text-sm hover:border-primary hover:text-primary transition-colors">
                      + Link Third Account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-20 bg-gray-900 text-center">
        <div className="max-w-3xl mx-auto px-4">
          <FadeIn>
            <h2 className="text-3xl font-bold text-white mb-6">Ready to go cardless?</h2>
            <p className="text-gray-400 mb-10">Visit any registered BioPay agent to securely enroll your fingerprint, drop your phone number, and receive your login password.</p>
            <Link to="/agents" className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold px-8 py-4 rounded-xl transition-all shadow-[0_4px_20px_rgba(14,173,105,0.3)]">
              Find an Agent Near You <ArrowRight className="w-5 h-5" />
            </Link>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
