import { motion } from 'framer-motion';

export function About() {
  return (
    <section className="relative py-32 bg-[#050b1a] text-white overflow-hidden border-t border-white/5">
      
      <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
        <div className="relative h-16 w-48 mx-auto mb-10">
          <motion.img 
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            src="/logo-main.png" 
            alt="MiliPay" 
            className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 h-32 w-auto object-contain scale-125" 
          />
        </div>
        
        <motion.h2 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-4xl md:text-6xl font-extrabold mb-8 leading-tight"
        >
          Building the future of <br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Identity-driven Finance</span>.
        </motion.h2>

        <motion.p 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="text-xl text-slate-400 mb-12 leading-relaxed"
        >
          MiliPay is on a mission to eliminate financial friction. 
          By combining Open Banking with military-grade Palm Vein biometrics, we are ensuring that anyone, anywhere can access their money with nothing but their hand.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="flex flex-col sm:flex-row justify-center gap-6"
        >
          <div className="px-8 py-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md">
            <h4 className="text-4xl font-extrabold text-white mb-2">99.9%</h4>
            <p className="text-slate-400">Uptime Reliability</p>
          </div>
          <div className="px-8 py-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md">
            <h4 className="text-4xl font-extrabold text-white mb-2">&lt;0.5s</h4>
            <p className="text-slate-400">Scan to Payment</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
