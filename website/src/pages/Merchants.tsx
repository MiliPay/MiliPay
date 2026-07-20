import { FadeIn } from '../components/ui/FadeIn';
import { Store, ShieldAlert, Zap, Banknote } from 'lucide-react';

export function Merchants() {
  return (
    <div className="overflow-hidden">
      {/* Hero Section */}
      <section className="pt-20 pb-16 bg-white text-center border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <FadeIn>
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Store className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-6">
              The Checkout Experience, Redefined.
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-10">
              Perfect for supermarkets, restaurants, and retail stores. We integrate our biometric payment scanners directly into your existing checkout system. Customers pay with their fingerprint and a 4-digit PIN. No physical cards required.
            </p>
            <button className="bg-gray-900 hover:bg-gray-800 text-white font-bold px-8 py-4 rounded-xl transition-all">
              Request Retail Integration
            </button>
          </FadeIn>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            <FadeIn delay={100} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
              <ShieldAlert className="w-8 h-8 text-red-500 mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-3">Zero Fraud Liability</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Because every transaction is authorized by a live fingerprint and PIN at your physical store, "I didn't make this purchase" chargebacks are mathematically eliminated.
              </p>
            </FadeIn>
            
            <FadeIn delay={200} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
              <Banknote className="w-8 h-8 text-green-500 mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-3">Seamless Integration</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                We provide the biometric scanner hardware. It plugs seamlessly into your existing supermarket or restaurant payment ecosystem.
              </p>
            </FadeIn>

            <FadeIn delay={300} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
              <Zap className="w-8 h-8 text-amber-500 mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-3">Instant Settlement</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                No more waiting T+1 or T+2 for your funds. BioPay settles directly into your designated corporate account instantly.
              </p>
            </FadeIn>
          </div>
        </div>
      </section>
      
      {/* POS Preview */}
      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <FadeIn>
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Designed for High-Volume Retail</h2>
            <p className="text-gray-600 max-w-2xl mx-auto mb-10">
              Our hardware scanners are built for speed. Process queues at your supermarket faster than traditional chip-and-pin card insertions.
            </p>
            <div className="bg-gray-100 aspect-video max-w-3xl mx-auto rounded-3xl flex items-center justify-center border border-gray-200">
              <span className="text-gray-400 font-medium">[ Retail Scanner Render ]</span>
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
