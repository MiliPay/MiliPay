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
              Accept Payments with Absolute Certainty.
            </h1>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto mb-10 leading-relaxed">
              Built for high-volume retail, supermarkets, and enterprise merchants. MiliPay integrates certified biometric point-of-sale terminals directly into your checkout flow. Customers authenticate via fingerprint, routing funds directly from their bank to yours—eliminating card networks entirely. Our state-of-the-art hardware guarantees faster checkout times, zero network downtime during peak hours, and absolute cryptographic certainty for every transaction processed in your store.
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
              <h3 className="text-xl font-bold text-gray-900 mb-3">Zero Chargeback Liability</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Every transaction is cryptographically signed by a live fingerprint match at your physical location. Fraudulent "card-not-present" or "stolen card" chargebacks are mathematically eliminated.
              </p>
            </FadeIn>
            
            <FadeIn delay={200} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
              <Banknote className="w-8 h-8 text-green-500 mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-3">Hardware-Secured Checkout</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                We provide certified biometric POS hardware that plugs seamlessly into your existing retail ecosystem, ensuring end-to-end encryption from finger to bank.
              </p>
            </FadeIn>

            <FadeIn delay={300} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
              <Zap className="w-8 h-8 text-amber-500 mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-3">Instant Settlement</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                No more waiting T+1 or T+2 for your funds. MiliPay settles directly into your designated corporate account instantly.
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
            <p className="text-gray-600 max-w-3xl mx-auto mb-10 leading-relaxed">
              Our hardware scanners are built for speed and durability. Process queues at your supermarket faster than traditional chip-and-pin card insertions. With a sub-second matching algorithm, the MiliPay terminal securely hashes the fingerprint and encrypts the payload before it ever leaves your network. Say goodbye to 'Insufficient Funds' delays and network timeouts—our intelligent routing ensures immediate settlement directly to your corporate account.
            </p>
            <div className="max-w-3xl mx-auto rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-hidden border border-gray-200">
              <img src="/images/pos_scanner.png" alt="MiliPay POS Scanner" className="w-full h-auto object-cover hover:scale-105 transition-transform duration-700" />
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
