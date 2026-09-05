import { motion } from 'framer-motion';
import { Users, Shield, Zap } from 'lucide-react';

export function Customers() {
  return (
    <section className="relative py-24 bg-[#020617] text-white overflow-hidden">
      {/* Background glowing orbs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <h2 className="text-4xl md:text-5xl font-extrabold mb-6">For Customers</h2>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            Your body is your bank. Experience the fastest, most secure way to pay, transfer, and manage your money without ever reaching for your wallet.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: Shield,
              title: "Unhackable Security",
              desc: "Palm vein patterns are internal and unique to you. They cannot be skimmed, stolen, or spoofed like fingerprints or passwords."
            },
            {
              icon: Zap,
              title: "Milliseconds Fast",
              desc: "Just hover your hand. MiliPay authenticates and processes your payment in under a second. No phones, no cards, no waiting."
            },
            {
              icon: Users,
              title: "Zero Setup Hassle",
              desc: "Register once at any certified MiliPay Agent. Link your existing bank accounts instantly via Open Banking and you're good to go."
            }
          ].map((feature, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.2 }}
              className="p-8 rounded-[32px] bg-white/5 border border-white/10 backdrop-blur-xl hover:bg-white/10 transition-colors"
            >
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center mb-6 border border-emerald-500/30">
                <feature.icon className="text-emerald-400" size={28} />
              </div>
              <h3 className="text-2xl font-bold mb-4">{feature.title}</h3>
              <p className="text-slate-400 leading-relaxed">
                {feature.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
