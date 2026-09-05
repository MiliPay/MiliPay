import { Suspense } from "react";
import { Fingerprint, ArrowRight, ShieldCheck, Zap, Lock } from 'lucide-react';
import { Canvas } from '@react-three/fiber';
import { MiliPay3DScene } from '../components/MiliPay3DCore';
import { motion } from 'framer-motion';

import { Customers } from './Customers';
import { Merchants } from './Merchants';
import { Agents } from './Agents';
import { About } from './About';

export function Home() {
  return (
    <div className="bg-[#020617] text-white overflow-hidden">
      
      {/* 3D Hero Section */}
      <section className="relative w-full min-h-screen flex flex-col">
        {/* 3D Background */}
        <div className="absolute inset-0 z-0">
          <Canvas camera={{ position: [0, 0, 8], fov: 45 }}>
            <Suspense fallback={null}>
              <MiliPay3DScene />
            </Suspense>
          </Canvas>
          {/* Gradient fade into the rest of the dark site */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#020617]/50 to-[#020617] pointer-events-none" />
        </div>

        {/* UI Overlay */}
        <div className="relative z-10 flex flex-col flex-1">
          {/* Transparent Header */}
          

          {/* Hero Content */}
          <main className="flex-1 flex items-center justify-center px-4 pt-20 pb-32">
            <div className="max-w-4xl mx-auto text-center">
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-8"
              >
                <Zap size={16} className="text-emerald-400" />
                <span className="text-emerald-400 font-semibold text-sm tracking-wide uppercase">The Future of Identity</span>
              </motion.div>

              <motion.h1 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.1 }}
                className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6"
              >
                Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Palm</span> is your Wallet.
              </motion.h1>

              <motion.p 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="text-xl md:text-2xl text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed"
              >
                Experience seamless, ultra-secure biometric payments. No cards. No phones. Just you.
              </motion.p>

              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="flex flex-col sm:flex-row items-center justify-center gap-4"
              >
                <button className="flex items-center gap-2 px-8 py-4 bg-emerald-500 hover:bg-emerald-600 rounded-full font-bold text-lg transition-all shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:shadow-[0_0_40px_rgba(16,185,129,0.6)]">
                  Start Scanning
                  <ArrowRight size={20} />
                </button>
                <button className="flex items-center gap-2 px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full font-bold text-lg transition-all">
                  <ShieldCheck size={20} className="text-emerald-400" />
                  View Security
                </button>
              </motion.div>
            </div>
          </main>

          {/* Floating Features */}
          <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-6 px-4 hidden md:flex">
            {[
              { title: "Bank Grade", desc: "Military level encryption", icon: Lock },
              { title: "Lightning Fast", desc: "<0.5s processing time", icon: Zap },
              { title: "Palm Vein Tech", desc: "Impossible to spoof", icon: Fingerprint }
            ].map((feat, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.6 + (i * 0.1) }}
                className="flex items-center gap-4 px-6 py-4 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10"
              >
                <div className="p-3 bg-emerald-500/20 rounded-xl">
                  <feat.icon className="text-emerald-400" size={24} />
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-white">{feat.title}</h3>
                  <p className="text-sm text-slate-400">{feat.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Render the rest of the existing page components with a dark wrapper so they don't break visually */}
      <div className="relative z-10 bg-[#020617]">
        <Customers />
        <Merchants />
        <Agents />
        <About />
      </div>
      
    </div>
  );
}
