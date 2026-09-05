import { motion } from 'framer-motion';
import { Briefcase, ArrowRight, UserPlus, MapPin } from 'lucide-react';

export function Agents() {
  return (
    <section className="relative py-24 bg-[#020617] text-white overflow-hidden border-t border-white/5">
      <div className="absolute left-0 bottom-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <motion.h2 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-extrabold mb-6"
          >
            Become an Agent
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-xl text-slate-400 max-w-2xl mx-auto"
          >
            Join the MiliPay network. Onboard new users and earn commissions on every successful registration.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            { step: "01", icon: UserPlus, title: "Register Users", desc: "Use the agent app to scan new user palms and link their NIN." },
            { step: "02", icon: MapPin, title: "Build Your Hub", desc: "Become the go-to biometric financial center in your community." },
            { step: "03", icon: Briefcase, title: "Earn Daily", desc: "Get instant commissions credited to your agent wallet." }
          ].map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.15 }}
              className="relative p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-emerald-500/50 transition-colors group"
            >
              <div className="absolute top-6 right-6 text-4xl font-extrabold text-white/5 group-hover:text-emerald-500/10 transition-colors">
                {item.step}
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-6">
                <item.icon className="text-blue-400" size={24} />
              </div>
              <h3 className="text-xl font-bold mb-3">{item.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-16 text-center"
        >
          <button className="inline-flex items-center gap-2 px-8 py-4 bg-white/10 hover:bg-white/20 rounded-full font-bold text-lg transition-all border border-white/20">
            Apply Now
            <ArrowRight size={20} />
          </button>
        </motion.div>
      </div>
    </section>
  );
}
