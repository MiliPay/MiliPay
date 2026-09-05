import { motion } from 'framer-motion';
import { Store, CreditCard, LineChart, ShieldCheck } from 'lucide-react';

export function Merchants() {
  return (
    <section className="relative py-24 bg-[#050b1a] text-white overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-4xl md:text-5xl font-extrabold mb-6">For Merchants</h2>
            <p className="text-xl text-slate-400 mb-8 leading-relaxed">
              Accept payments faster than a card tap. Eliminate fraud, reduce chargebacks, and give your customers a magical checkout experience.
            </p>
            
            <div className="space-y-6">
              {[
                { icon: Store, text: "Free specialized POS hardware" },
                { icon: LineChart, text: "Real-time analytics and instant settlement" },
                { icon: ShieldCheck, text: "Zero fraud liability on biometric scans" },
                { icon: CreditCard, text: "Lower fees than traditional card networks" }
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                    <item.icon className="text-emerald-400" size={20} />
                  </div>
                  <span className="text-lg text-slate-200 font-medium">{item.text}</span>
                </div>
              ))}
            </div>

            <button className="mt-10 px-8 py-4 bg-emerald-500 hover:bg-emerald-600 rounded-full font-bold text-lg transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              Become a Merchant
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="aspect-square rounded-[40px] bg-gradient-to-br from-white/10 to-white/5 border border-white/10 backdrop-blur-2xl p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&q=80')] opacity-20 mix-blend-overlay bg-cover bg-center" />
              {/* Mockup UI Inside */}
              <div className="relative h-full w-full rounded-2xl bg-[#020617] border border-white/10 shadow-2xl flex flex-col items-center justify-center p-8">
                 <div className="w-24 h-24 rounded-full bg-emerald-500/20 animate-pulse flex items-center justify-center mb-6">
                    <Store className="text-emerald-400" size={40} />
                 </div>
                 <h3 className="text-2xl font-bold text-white mb-2">Scan Palm to Pay</h3>
                 <p className="text-emerald-400 text-3xl font-mono mb-8">₦ 12,500.00</p>
                 <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="w-2/3 h-full bg-emerald-500 rounded-full" />
                 </div>
                 <p className="text-slate-500 mt-4 text-sm uppercase tracking-widest">Awaiting Biometrics...</p>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
